import type Database from "better-sqlite3";
import { createHash,createPublicKey,verify } from "node:crypto";
import { z } from "zod";
import { safeUrlSchema,WorkStateError,type RepoScope } from "./model.js";
export interface ReceiptPolicy{producer:string;publicKey:string;repositoryIds:string[];environments:string[]}
export function validateReceiptPolicies(input:ReceiptPolicy[]){
 const values=z.array(z.object({producer:z.string().min(1).max(100),publicKey:z.string().min(1).max(10000),repositoryIds:z.array(z.string().min(1).max(200)).max(500),environments:z.array(z.enum(["dev","staging"])).max(2)}).strict()).max(100).parse(input);
 const seen=new Set<string>();for(const value of values){const key=createPublicKey(value.publicKey);if(key.asymmetricKeyType!=="ed25519"||seen.has(value.producer))throw new Error("invalid_receipt_policy");seen.add(value.producer);}return values;
}
const fingerprint=(pem:string)=>createHash("sha256").update(createPublicKey(pem).export({format:"der",type:"spki"})).digest("hex");
export interface ReceiptFeedState{coverage:"complete"|"partial"|"unknown";lastAttemptAt:number|null;lastSuccessAt:number|null;errorCode:string|null}

export function canonicalReceipt(value:unknown):string{
 if(Array.isArray(value))return `[${value.map(canonicalReceipt).join(",")}]`;
 if(value&&typeof value==="object")return `{${Object.keys(value).sort().filter(k=>(value as Record<string,unknown>)[k]!==undefined).map(k=>`${JSON.stringify(k)}:${canonicalReceipt((value as Record<string,unknown>)[k])}`).join(",")}}`;
 return JSON.stringify(value);
}
const priority=z.enum(["P0","P1","P2","P3"]).nullable();
const boardSchema=z.object({status:z.string().max(100).nullable(),priority,url:safeUrlSchema,observedAt:z.iso.datetime(),coverage:z.literal("complete")}).strict();
export type BoardObservation=z.infer<typeof boardSchema>;
const common={receiptId:z.string().min(1).max(200),producer:z.string().min(1).max(100),repositoryId:z.string().min(1).max(200),pullNumber:z.number().int().positive(),environment:z.enum(["dev","staging"]),targetHeadSha:z.string().regex(/^[a-f0-9]{40}$/),sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),imageDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/),observedAt:z.iso.datetime(),evidenceLinks:z.array(safeUrlSchema).min(1).max(10)};
const receiptSchema=z.discriminatedUnion("kind",[
 z.object({...common,kind:z.literal("deployment"),ready:z.boolean()}).strict(),
 z.object({...common,kind:z.literal("acceptance"),result:z.enum(["PASS","FAIL"]),criterion:z.string().min(1).max(200)}).strict()
]);
export type DeliveryReceipt=z.infer<typeof receiptSchema>;
const envelopeSchema=z.object({payload:receiptSchema,signature:z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(200)}).strict();
export type DeploymentState="not_recorded"|"ready"|"not_ready"|"stale"|"revision_mismatch";
export type AcceptanceState="not_recorded"|"passed"|"failed"|"stale"|"revision_mismatch"|"deployment_unverified";
export interface SourceFacts{feed:ReceiptFeedState;verification:{deployment:boolean;acceptance:boolean};board:Array<Omit<BoardObservation,"coverage">&{repositoryId:string;issueNumber:number;coverage:"complete"|"partial"|"unknown";errorCode:string|null;lastAttemptAt:string;stale:boolean}>;deployment:DeploymentState;acceptance:AcceptanceState;deploymentReceipt:DeliveryReceipt|null;acceptanceReceipt:DeliveryReceipt|null}
export function createWorkStateSources(db:Database.Database,assert:(scope:RepoScope,ids:string[])=>unknown,itemAllowed:(scope:RepoScope,id:string)=>boolean){
 db.exec(`CREATE TABLE IF NOT EXISTS work_state_board(repository_id TEXT NOT NULL REFERENCES repositories(id),issue_number INTEGER NOT NULL,payload TEXT,last_attempt_at TEXT NOT NULL,error_code TEXT,PRIMARY KEY(repository_id,issue_number));
 CREATE TABLE IF NOT EXISTS work_state_receipt_policies(producer TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS work_state_adapter_progress(name TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS work_state_receipts(receipt_id TEXT PRIMARY KEY,hash TEXT NOT NULL,repository_id TEXT NOT NULL REFERENCES repositories(id),pull_number INTEGER NOT NULL,kind TEXT NOT NULL,observed_at TEXT NOT NULL,payload TEXT NOT NULL);
 INSERT OR IGNORE INTO work_state_migrations VALUES(7,strftime('%Y-%m-%dT%H:%M:%fZ','now'));`);
 const columns=db.prepare("PRAGMA table_info(work_state_receipts)").all() as {name:string}[];
 for(const [name,type]of [["verified_key","TEXT"],["signature","TEXT"],["environment","TEXT"],["observed_epoch","INTEGER"]])if(!columns.some(c=>c.name===name))db.exec(`ALTER TABLE work_state_receipts ADD COLUMN ${name} ${type}`);
 db.prepare("INSERT OR IGNORE INTO work_state_migrations VALUES(8,?)").run(new Date().toISOString());
 db.exec("CREATE INDEX IF NOT EXISTS work_state_receipts_time ON work_state_receipts(repository_id,pull_number,kind,environment,observed_epoch DESC)");
 const policyFor=(producer:string)=>{const row=db.prepare("SELECT payload FROM work_state_receipt_policies WHERE producer=?").get(producer) as {payload:string}|undefined;return row?JSON.parse(row.payload) as ReceiptPolicy:undefined;};
 return {
  configureReceiptPolicies(input:ReceiptPolicy[]){const values=validateReceiptPolicies(input);db.transaction(()=>{db.prepare("DELETE FROM work_state_receipt_policies").run();for(const value of values)db.prepare("INSERT INTO work_state_receipt_policies VALUES(?,?)").run(value.producer,JSON.stringify(value));}).immediate();},
  receiptFeedState(now=Date.now()):ReceiptFeedState{const state=this.adapterProgress("receipts"),worker=this.adapterProgress("sources"),error=state.error??worker.error??null;return {coverage:error?"partial":state.lastSuccess&&now-state.lastSuccess<=75*60000?"complete":"unknown",lastAttemptAt:state.lastAttemptAt??null,lastSuccessAt:state.lastSuccess??null,errorCode:error};},
  adapterProgress(name:string){const row=db.prepare("SELECT payload FROM work_state_adapter_progress WHERE name=?").get(name) as {payload:string}|undefined;return row?JSON.parse(row.payload) as {offset?:number;lastComplete?:number;lastSuccess?:number;lastAttemptAt?:number;after?:string;error?:string|null;cycleError?:string|null}:{};},
  saveAdapterProgress(name:string,value:unknown){db.prepare("INSERT INTO work_state_adapter_progress VALUES(?,?) ON CONFLICT(name) DO UPDATE SET payload=excluded.payload").run(name,JSON.stringify(value));},
  collectorIssueLinks(){return db.prepare(`SELECT DISTINCT l.repository_id AS repositoryId,l.number,r.full_name AS fullName FROM work_item_links l JOIN repositories r ON r.id=l.repository_id WHERE l.kind='issue' AND r.active=1 ORDER BY l.repository_id,l.number`).all() as {repositoryId:string;number:number;fullName:string}[];},
  recordBoard(repositoryId:string,number:number,input:unknown){const value=boardSchema.parse(input);db.prepare("INSERT INTO work_state_board VALUES(?,?,?,?,NULL) ON CONFLICT(repository_id,issue_number) DO UPDATE SET payload=excluded.payload,last_attempt_at=excluded.last_attempt_at,error_code=NULL WHERE julianday(excluded.last_attempt_at)>=julianday(work_state_board.last_attempt_at)").run(repositoryId,number,JSON.stringify(value),value.observedAt);},
  recordBoardFailure(repositoryId:string,number:number,code:string,at:string){if(!/^[a-z_]{1,100}$/.test(code))throw new Error("invalid_source_error");db.prepare("INSERT INTO work_state_board VALUES(?,?,NULL,?,?) ON CONFLICT(repository_id,issue_number) DO UPDATE SET last_attempt_at=excluded.last_attempt_at,error_code=excluded.error_code WHERE julianday(excluded.last_attempt_at)>=julianday(work_state_board.last_attempt_at)").run(repositoryId,number,at,code);},
  ingestReceipt(input:unknown,_policies:ReceiptPolicy[],now=Date.now()){
   const parsed=envelopeSchema.safeParse(input);if(!parsed.success)throw new Error("invalid_receipt");const {payload,signature}=parsed.data,policy=policyFor(payload.producer);
   if(!policy)throw new Error("invalid_receipt");
   try{const key=createPublicKey(policy.publicKey);if(key.asymmetricKeyType!=="ed25519"||!verify(null,Buffer.from(canonicalReceipt(payload)),key,Buffer.from(signature,"base64")))throw new Error();}catch{throw new Error("invalid_receipt");}
   if(!policy.repositoryIds.includes(payload.repositoryId)||!policy.environments.includes(payload.environment)||!db.prepare("SELECT 1 FROM repositories WHERE id=? AND active=1").get(payload.repositoryId))throw new Error("receipt_scope_denied");
   if(Date.parse(payload.observedAt)>now+60000)throw new Error("invalid_receipt_time");
   const hash=createHash("sha256").update(canonicalReceipt(payload)).digest("hex");
   const old=db.prepare("SELECT hash FROM work_state_receipts WHERE receipt_id=?").get(payload.receiptId) as {hash:string}|undefined;
   if(old&&old.hash!==hash)throw new Error("receipt_id_conflict");
   db.prepare("INSERT INTO work_state_receipts(receipt_id,hash,repository_id,pull_number,kind,observed_at,payload,verified_key,signature,environment,observed_epoch) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(receipt_id) DO UPDATE SET verified_key=excluded.verified_key,signature=excluded.signature,environment=excluded.environment,observed_epoch=excluded.observed_epoch").run(payload.receiptId,hash,payload.repositoryId,payload.pullNumber,payload.kind,payload.observedAt,JSON.stringify(payload),fingerprint(policy.publicKey),signature,payload.environment,Date.parse(payload.observedAt));return {receiptId:payload.receiptId,duplicate:!!old};
  },
  sourceFacts(scope:RepoScope,repositoryId:string,number:number,headSha:string,now=Date.now()):SourceFacts{
   assert(scope,[repositoryId]);
   const links=db.prepare(`SELECT DISTINCT p.item_id,i.repository_id,i.number FROM work_item_links p JOIN work_item_links i ON i.item_id=p.item_id WHERE p.repository_id=? AND p.kind='pull' AND p.number=? AND i.kind='issue'`).all(repositoryId,number) as {item_id:string;repository_id:string;number:number}[];
   const board:SourceFacts["board"]=[],seen=new Set<string>();
   for(const link of links){if(!itemAllowed(scope,link.item_id))continue;const key=`${link.repository_id}/${link.number}`;if(seen.has(key))continue;seen.add(key);
    const row=db.prepare("SELECT * FROM work_state_board WHERE repository_id=? AND issue_number=?").get(link.repository_id,link.number) as {payload:string|null;last_attempt_at:string;error_code:string|null}|undefined;
    if(!row)continue;const value=row.payload?boardSchema.parse(JSON.parse(row.payload)):null;
    board.push({repositoryId:link.repository_id,issueNumber:link.number,status:value?.status??null,priority:value?.priority??null,url:value?.url??`https://github.com/${(db.prepare("SELECT full_name FROM repositories WHERE id=?").get(link.repository_id) as {full_name:string}).full_name}/issues/${link.number}`,observedAt:value?.observedAt??row.last_attempt_at,coverage:row.error_code?(value?"partial":"unknown"):"complete",errorCode:row.error_code,lastAttemptAt:row.last_attempt_at,stale:!value||now-Date.parse(value.observedAt)>75*60000});
   }
   const latest=(kind:string)=>{const row=db.prepare("SELECT payload,verified_key,signature FROM work_state_receipts WHERE repository_id=? AND pull_number=? AND kind=? AND environment='dev' ORDER BY observed_epoch DESC,receipt_id DESC LIMIT 1").get(repositoryId,number,kind) as {payload:string;verified_key:string|null;signature:string|null}|undefined;
    if(!row)return {receipt:null,trusted:false};const receipt=receiptSchema.parse(JSON.parse(row.payload)),policy=policyFor(receipt.producer);
    const trusted=!!policy&&policy.repositoryIds.includes(repositoryId)&&policy.environments.includes(receipt.environment)&&row.verified_key===fingerprint(policy.publicKey)&&!!row.signature&&verify(null,Buffer.from(canonicalReceipt(receipt)),createPublicKey(policy.publicKey),Buffer.from(row.signature,"base64"));return {receipt,trusted};};
   const deploymentRecord=latest("deployment"),acceptanceRecord=latest("acceptance"),deployed=deploymentRecord.trusted?deploymentRecord.receipt:null,accepted=acceptanceRecord.trusted?acceptanceRecord.receipt:null;
   const state=(r:DeliveryReceipt|null)=>!r?"not_recorded":r.targetHeadSha!==headSha?"revision_mismatch":now-Date.parse(r.observedAt)>75*60000?"stale":null;
   const deployment:DeploymentState=state(deployed)??(deployed?.kind==="deployment"&&deployed.ready?"ready":"not_ready");
   const acceptance:AcceptanceState=state(accepted)??(deployment!=="ready"||deployed?.sourceCommit!==accepted?.sourceCommit||deployed?.imageDigest!==accepted?.imageDigest?"deployment_unverified":accepted?.kind==="acceptance"&&accepted.result==="PASS"?"passed":"failed");
   return {board,deployment,acceptance,deploymentReceipt:deploymentRecord.receipt,acceptanceReceipt:acceptanceRecord.receipt,verification:{deployment:deploymentRecord.trusted,acceptance:acceptanceRecord.trusted},feed:this.receiptFeedState(now)};
  }
 };
}
