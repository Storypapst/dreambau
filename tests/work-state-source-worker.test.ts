import { expect,it } from "vitest";
import { mkdtemp,rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createWorkStateStore } from "../src/server/work-state/store.js";
import { createSourceWorker } from "../src/server/work-state/source-worker.js";
it("collects only explicit linked issues with persisted progress and stops its network request",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"ws-source-worker-")),path=join(dir,"work.sqlite");let store=createWorkStateStore(path);
 const scope={project:"oriso" as const,actorId:"alice"};store.configureRepository({id:"1",project:"oriso",fullName:"OpenResilienceInitiative/repo1",integrationBranch:"dev"});store.setRepositoryGrant({...scope,repositoryId:"1",allowed:true});store.createWorkItem(scope,{goal:"Linked",links:[{repositoryId:"1",kind:"issue",number:9}]});
 let calls=0;const worker=createSourceWorker({store,board:true,token:async()=>"test-only",transport:async(_u,init)=>{calls++;return new Response(JSON.stringify({data:{repository:{issue:{url:"https://github.com/OpenResilienceInitiative/repo1/issues/9",issueFieldValues:{nodes:[],pageInfo:{hasNextPage:false,endCursor:null}},projectItems:{nodes:[],pageInfo:{hasNextPage:false,endCursor:null}}}}}}));}});
 try{await worker.tick();expect(calls).toBe(1);await worker.stop();store.close();store=createWorkStateStore(path);const restarted=createSourceWorker({store,board:true,token:async()=>"unused",transport:async()=>{calls++;throw new Error("should-not-refetch");}});await restarted.tick();expect(calls).toBe(1);await restarted.stop();}finally{await worker.stop();store.close();await rm(dir,{recursive:true,force:true});}
});
it("imports a signed receipt from a protected input directory and persists it across worker ticks",async()=>{
 const {generateKeyPairSync,sign}=await import("node:crypto"),{writeFile}=await import("node:fs/promises"),{canonicalReceipt}=await import("../src/server/work-state/sources.js");
 const dir=await mkdtemp(join(tmpdir(),"ws-feed-")),store=createWorkStateStore(join(dir,"state.sqlite")),{privateKey,publicKey}=generateKeyPairSync("ed25519"),scope={project:"oriso" as const,actorId:"alice"};
 store.configureRepository({id:"1",project:"oriso",fullName:"OpenResilienceInitiative/repo",integrationBranch:"dev"});store.setRepositoryGrant({...scope,repositoryId:"1",allowed:true});
 const payload={receiptId:"one",producer:"qa",repositoryId:"1",pullNumber:7,kind:"deployment",environment:"dev",targetHeadSha:"a".repeat(40),sourceCommit:"b".repeat(40),imageDigest:"sha256:"+"c".repeat(64),ready:true,observedAt:new Date().toISOString(),evidenceLinks:["https://evidence.dreambau.com/one"]};
 await writeFile(join(dir,"one.json"),JSON.stringify({payload,signature:sign(null,Buffer.from(canonicalReceipt(payload)),privateKey).toString("base64")}));
 const worker=createSourceWorker({store,board:false,token:async()=>"unused",receiptDirectory:dir,policies:[{producer:"qa",publicKey:publicKey.export({format:"pem",type:"spki"}).toString(),repositoryIds:["1"],environments:["dev"]}]});
 try{await worker.tick();expect(store.sourceFacts(scope,"1",7,payload.targetHeadSha).deployment).toBe("ready");await worker.tick();expect(store.sourceFacts(scope,"1",7,payload.targetHeadSha).deploymentReceipt?.receiptId).toBe("one");}finally{await worker.stop();store.close();await rm(dir,{recursive:true,force:true});}
});
it("retains a receipt scan failure across batches until a complete clean recovery scan",async()=>{
 const {generateKeyPairSync,sign}=await import("node:crypto"),{writeFile,unlink}=await import("node:fs/promises"),{canonicalReceipt}=await import("../src/server/work-state/sources.js");
 const dir=await mkdtemp(join(tmpdir(),"ws-batch-")),store=createWorkStateStore(join(dir,"state.sqlite")),{privateKey,publicKey}=generateKeyPairSync("ed25519"),scope={project:"oriso" as const,actorId:"alice"};let clock=Date.now();
 store.configureRepository({id:"1",project:"oriso",fullName:"OpenResilienceInitiative/repo",integrationBranch:"dev"});store.setRepositoryGrant({...scope,repositoryId:"1",allowed:true});
 const payload={receiptId:"one",producer:"qa",repositoryId:"1",pullNumber:7,kind:"deployment",environment:"dev",targetHeadSha:"a".repeat(40),sourceCommit:"b".repeat(40),imageDigest:"sha256:"+"c".repeat(64),ready:true,observedAt:new Date(clock).toISOString(),evidenceLinks:["https://evidence.dreambau.com/one"]},value=JSON.stringify({payload,signature:sign(null,Buffer.from(canonicalReceipt(payload)),privateKey).toString("base64")});
 await writeFile(join(dir,"000-invalid.json"),"invalid");for(let i=1;i<52;i++)await writeFile(join(dir,`${String(i).padStart(3,"0")}.json`),value);
 const worker=createSourceWorker({store,board:false,token:async()=>"unused",now:()=>clock,receiptDirectory:dir,policies:[{producer:"qa",publicKey:publicKey.export({format:"pem",type:"spki"}).toString(),repositoryIds:["1"],environments:["dev"]}]});
 try{await worker.tick();await worker.tick();expect(store.adapterProgress("receipts").error).toBe("receipt_feed_invalid");expect(store.sourceFacts(scope,"1",7,payload.targetHeadSha,clock).feed.coverage).toBe("partial");await unlink(join(dir,"000-invalid.json"));clock+=30001;await worker.tick();await worker.tick();expect(store.adapterProgress("receipts").error).toBeNull();}
 finally{await worker.stop();store.close();await rm(dir,{recursive:true,force:true});}
});
