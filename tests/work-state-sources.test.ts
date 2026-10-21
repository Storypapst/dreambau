import { expect,it } from "vitest";
import { generateKeyPairSync,sign } from "node:crypto";
import { createWorkStateStore } from "../src/server/work-state/store.js";
import { canonicalReceipt, type ReceiptPolicy } from "../src/server/work-state/sources.js";
import { readIssueBoard } from "../src/server/work-state/board.js";
const at="2026-10-21T10:00:00.000Z",now=Date.parse(at),head="a".repeat(40),commit="b".repeat(40),digest="sha256:"+"c".repeat(64);
const scope={actorId:"alice",project:"oriso" as const};
function setup(){const store=createWorkStateStore(":memory:");for(const id of ["1","2"])store.configureRepository({id,project:"oriso",fullName:`OpenResilienceInitiative/repo${id}`,integrationBranch:"dev"});store.setRepositoryGrant({...scope,repositoryId:"1",allowed:true});return store;}
function signer(store?:ReturnType<typeof setup>){const {privateKey,publicKey}=generateKeyPairSync("ed25519");const policy:ReceiptPolicy={producer:"dev-qa",publicKey:publicKey.export({format:"pem",type:"spki"}).toString(),repositoryIds:["1"],environments:["dev"]};if(store)store.configureReceiptPolicies([policy]);return {policy,envelope:(payload:object)=>({payload,signature:sign(null,Buffer.from(canonicalReceipt(payload)),privateKey).toString("base64")})};}
const deployment={receiptId:"deploy-1",producer:"dev-qa",repositoryId:"1",pullNumber:7,kind:"deployment",environment:"dev",targetHeadSha:head,sourceCommit:commit,imageDigest:digest,observedAt:at,ready:true,evidenceLinks:["https://evidence.dreambau.com/deploy-proof"]};
it("keeps board provenance and own task priority separate, preserving confirmed values on failure",()=>{
 const store=setup();try{
 const item=store.createWorkItem(scope,{goal:"Own task",priority:"P2",links:[{repositoryId:"1",kind:"pull",number:7},{repositoryId:"1",kind:"issue",number:9}]});
 store.recordBoard("1",9,{status:"In review",priority:"P0",url:"https://github.com/OpenResilienceInitiative/repo1/issues/9",observedAt:at,coverage:"complete"});store.recordBoardFailure("1",9,"github_unavailable",at);
 const facts=store.sourceFacts(scope,"1",7,head,now);expect(facts.board[0]).toMatchObject({priority:"P0",coverage:"partial",errorCode:"github_unavailable"});expect(store.getWorkItem(scope,item.id).priority).toBe("P2");
 store.setRepositoryGrant({...scope,repositoryId:"1",allowed:false});expect(()=>store.sourceFacts(scope,"1",7,head,now)).toThrow("scope_denied");
 }finally{store.close();}
});
it("requires an authorized signature and matching deployment before calling a Dev test passed",()=>{
 const store=setup(),s=signer(store);try{
 const acceptance={...deployment,receiptId:"accept-1",kind:"acceptance",result:"PASS",criterion:"Ask and answer",ready:undefined};delete acceptance.ready;
 const signed=s.envelope(acceptance);expect(()=>store.ingestReceipt({...signed,signature:"invalid"},[s.policy],now)).toThrow("invalid_receipt");
 store.ingestReceipt(signed,[s.policy],now);expect(store.sourceFacts(scope,"1",7,head,now).acceptance).toBe("deployment_unverified");
 store.ingestReceipt(s.envelope(deployment),[s.policy],now);expect(store.sourceFacts(scope,"1",7,head,now)).toMatchObject({deployment:"ready",acceptance:"passed"});
 expect(store.sourceFacts(scope,"1",7,"d".repeat(40),now).deployment).toBe("revision_mismatch");expect(store.sourceFacts(scope,"1",7,head,now+76*60000).acceptance).toBe("stale");
 expect(()=>store.ingestReceipt(s.envelope({...deployment,receiptId:"evil",repositoryId:"2"}),[s.policy],now)).toThrow("receipt_scope_denied");
 expect(()=>store.ingestReceipt(s.envelope({...deployment,ready:false}),[s.policy],now)).toThrow("receipt_id_conflict");
 }finally{store.close();}
});
it("paginates owning issue fields independently of board membership and ignores an empty board mirror",async()=>{
 const calls:unknown[]=[];
 const result=await readIssueBoard({fullName:"OpenResilienceInitiative/repo1",number:9,now:()=>now,transport:async(_url,init)=>{
 const body=JSON.parse(String(init?.body));calls.push(body.variables);
 const second=body.variables.fieldsAfter==="next";
 return new Response(JSON.stringify({data:{repository:{issue:{url:"https://github.com/OpenResilienceInitiative/repo1/issues/9",issueFieldValues:{nodes:second?[{__typename:"IssueFieldSingleSelectValue",name:"High",field:{id:"IFSS_kgDOAjh1Eg"}}]:[],pageInfo:{hasNextPage:!second,endCursor:second?null:"next"}},projectItems:{nodes:[{project:{id:"PVT_kwDODkeBP84BHH8p"},fieldValueByName:{name:"In review",field:{id:"PVTSSF_lADODkeBP84BHH8pzg3-C9U"}}}],pageInfo:{hasNextPage:false,endCursor:null}}}}}}));},token:async()=>"test-only"});
 expect(result).toMatchObject({priority:"P1",status:"In review",coverage:"complete"});expect(calls).toHaveLength(2);
});
it("rejects GraphQL partial errors instead of turning absent board fields into unset",async()=>{
 await expect(readIssueBoard({fullName:"OpenResilienceInitiative/repo1",number:9,now:()=>now,token:async()=>"test-only",transport:async()=>new Response(JSON.stringify({errors:[{message:"private details"}],data:{repository:null}}))})).rejects.toThrow("board_source_incomplete");
});
it("the saved attention filter finds board P0 without replacing internal P2",async()=>{
 const {workStateFixture,seedPulls,fixturePull}=await import("./helpers/work-state-fixture.js"),{createAttentionService}=await import("../src/server/work-state/attention.js");
 const f=workStateFixture();try{seedPulls(f.store,[fixturePull(1)]);const scope={project:"oriso" as const,actorId:f.user.id};
 f.store.createWorkItem(scope,{goal:"Board linked",priority:"P2",links:[{repositoryId:"A",kind:"pull",number:1},{repositoryId:"A",kind:"issue",number:9}]});
 f.store.recordBoard("A",9,{status:"In review",priority:"P0",url:"https://github.com/OpenResilienceInitiative/repoA/issues/9",observedAt:new Date().toISOString(),coverage:"complete"});
 const items=createAttentionService(f.store).listAttention(scope,{priority:"P0"}).items;expect(items).toHaveLength(1);expect(items[0].assignments.some(a=>a.priority==="P2")).toBe(true);expect(items[0].sources?.board[0].priority).toBe("P0");
 }finally{f.close();}
});
it("an older board result or failed attempt cannot downgrade a newer confirmed observation",()=>{
 const store=setup();try{
 store.createWorkItem(scope,{goal:"Linked",links:[{repositoryId:"1",kind:"pull",number:7},{repositoryId:"1",kind:"issue",number:9}]});
 const value={status:"In review",priority:"P0",url:"https://github.com/OpenResilienceInitiative/repo1/issues/9",observedAt:at,coverage:"complete"};
 store.recordBoard("1",9,value);store.recordBoard("1",9,{...value,priority:"P3",observedAt:"2026-10-21T09:00:00.000Z"});store.recordBoardFailure("1",9,"github_unavailable","2026-10-21T09:00:00.000Z");
 expect(store.sourceFacts(scope,"1",7,head,now).board[0]).toMatchObject({priority:"P0",coverage:"complete",observedAt:at});
 }finally{store.close();}
});
it("withholds saved readiness after producer revocation or key replacement",async()=>{
 const store=setup(),s=signer(),{createSourceWorker}=await import("../src/server/work-state/source-worker.js");
 try{const worker=createSourceWorker({store,board:false,token:async()=>"unused",policies:[s.policy]});store.ingestReceipt(s.envelope(deployment),[s.policy],now);await worker.stop();
 const revoked=createSourceWorker({store,board:false,token:async()=>"unused",policies:[]});expect(store.sourceFacts(scope,"1",7,head,now).deployment).toBe("not_recorded");await revoked.stop();
 const replacement=signer(),rotated=createSourceWorker({store,board:false,token:async()=>"unused",policies:[replacement.policy]});expect(store.sourceFacts(scope,"1",7,head,now).deployment).toBe("not_recorded");await rotated.stop();
 }finally{store.close();}
});
it("orders mixed ISO timestamp precision by time so later failures stay visible",()=>{
 const store=setup(),s=signer(store);try{
 store.ingestReceipt(s.envelope({...deployment,receiptId:"new",observedAt:"2026-10-21T10:00:00.500Z",ready:false}),[s.policy],now+1000);
 store.ingestReceipt(s.envelope({...deployment,receiptId:"old",observedAt:"2026-10-21T10:00:00Z",ready:true}),[s.policy],now+1000);
 expect(store.sourceFacts(scope,"1",7,head,now+1000).deployment).toBe("not_ready");
 }finally{store.close();}
});
