import { afterEach, expect, it } from "vitest";
import { mkdtemp, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createWorkStateStore } from "../src/server/work-state/store.js";
import { backupWorkState, restoreWorkState, backupExistingWorkState, type BackupTransport } from "../src/server/work-state/recovery.js";
const dirs:string[]=[];
afterEach(async()=>{for(const d of dirs.splice(0))await rm(d,{recursive:true,force:true});});
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),"ws-recovery-"));dirs.push(dir);
 const identity=join(dir,"identity");execFileSync("age-keygen",["-o",identity],{stdio:"pipe"});
 const recipient=execFileSync("age-keygen",["-y",identity],{encoding:"utf8"}).trim();
 const path=join(dir,"source.sqlite"),store=createWorkStateStore(path),scope={project:"oriso" as const,actorId:"operator"};
 store.configureRepository({id:"r",project:"oriso",fullName:"org/repo",integrationBranch:"dev"});
 store.setRepositoryGrant({...scope,repositoryId:"r",allowed:true});
 const item=store.createWorkItem(scope,{goal:"Survive disk loss",links:[{repositoryId:"r",kind:"pull",number:7}]});
 store.writeCheckpoint(scope,item.id,{expectedVersion:1,goal:item.goal,lastVerifiedAction:"Checkpoint saved",blockers:[],nextAction:"Continue from backup",evidenceLinks:[]});
 store.enqueueSync("r",1234);
 const remote=join(dir,"remote.age");const transport:BackupTransport={upload:async p=>{await copyFile(p,remote);},download:async(_r,p)=>{await copyFile(remote,p);}};
 return {dir,identity,recipient,path,store,scope,item,remote,transport};
}
it("recovers a live WAL snapshot after source loss with checkpoint version and pending job intact",async()=>{
 const f=await fixture();let writes=0;
 const writer=setInterval(()=>{f.store.createWorkItem(f.scope,{goal:`Parallel ${++writes}`,links:[{repositoryId:"r",kind:"repository"}]});},1);
 try{
 const result=await backupWorkState({store:f.store,recipient:f.recipient,remote:"drive:approved/oriso/test.age",transport:f.transport});
 expect(result).toMatchObject({verified:true});expect(writes).toBeGreaterThan(0);
 const ciphertext=await readFile(f.remote);expect(ciphertext.toString("utf8")).not.toContain("Continue from backup");
 clearInterval(writer);f.store.close();await rm(f.path);await rm(f.path+"-wal",{force:true});await rm(f.path+"-shm",{force:true});
 const target=join(f.dir,"restore.sqlite");const restored=await restoreWorkState({remote:"drive:approved/oriso/test.age",transport:f.transport,identityFile:f.identity,target,expectedSha256:result.sha256});
 expect(restored.integrity).toBe("ok");expect(restored.durationMs).toBeLessThan(7200000);
 const store=createWorkStateStore(target);try{expect(store.getWorkItem(f.scope,f.item.id)).toMatchObject({version:2,checkpoint:{nextAction:"Continue from backup"}});expect(store.claimSync(2000)?.repositoryId).toBe("r");}finally{store.close();}
 }finally{clearInterval(writer);f.store.close();}
});
it("refuses corrupt readback and never records a successful backup",async()=>{
 const f=await fixture();try{const transport={...f.transport,download:async(_r:string,p:string)=>{await writeFile(p,"corrupt");}};
 await expect(backupWorkState({store:f.store,recipient:f.recipient,remote:"drive:approved/test.age",transport})).rejects.toThrow("backup_readback_mismatch");
 expect(f.store.operations(f.scope).backup).toBeNull();}finally{f.store.close();}
});
it("restore never overwrites an existing path or accepts a local directory as independent backup",async()=>{
 const f=await fixture();try{await expect(backupWorkState({store:f.store,recipient:f.recipient,remote:f.remote,transport:f.transport})).rejects.toThrow("off_server_remote_required");
 await expect(restoreWorkState({remote:"drive:approved/test.age",transport:f.transport,identityFile:f.identity,target:f.path,expectedSha256:"0".repeat(64)})).rejects.toThrow("restore_target_exists");
 expect(f.store.getWorkItem(f.scope,f.item.id).version).toBe(2);}finally{f.store.close();}
});
it("operations hide ungranted repositories and show an unsynced scope as incomplete",async()=>{
 const f=await fixture();try{
 f.store.configureRepository({id:"hidden",project:"oriso",fullName:"private/repo",integrationBranch:"dev"});f.store.enqueueSync("hidden",1);
 const state=f.store.operations(f.scope,2234);
 expect(state.repositories.map(r=>r.id)).toEqual(["r"]);expect(state.coverage).toEqual({configured:1,complete:0});expect(state.lastFullSync).toBeNull();expect(state.queue.oldestAgeMs).toBe(1000);
 }finally{f.store.close();}
});
it("two daily backups retain different remote objects and both restore independently",async()=>{
 const f=await fixture(),objects=new Map<string,Buffer>();try{
 const transport:BackupTransport={upload:async(p,r)=>{objects.set(r,await readFile(p));},download:async(r,p)=>{await writeFile(p,objects.get(r)!);}};
 const options={databasePath:f.path,recipient:f.recipient,remoteDirectory:"drive:approved/oriso",transport};
 const first=await backupExistingWorkState(options),second=await backupExistingWorkState(options);
 expect(first.remote).not.toBe(second.remote);expect(objects.size).toBe(2);
 for(const [i,receipt]of[first,second].entries())expect((await restoreWorkState({remote:receipt.remote,transport,identityFile:f.identity,target:join(f.dir,`restored-${i}.sqlite`),expectedSha256:receipt.sha256})).integrity).toBe("ok");
 }finally{f.store.close();}
});
it("rejects an account database without migrations or transport side effects",async()=>{
 const f=await fixture();try{
 const {default:Database}=await import("better-sqlite3");const path=join(f.dir,"accounts.sqlite"),db=new Database(path);db.exec("CREATE TABLE accounts(secret TEXT); INSERT INTO accounts VALUES('private')");db.close();
 const before=await readFile(path);let calls=0;const transport={upload:async()=>{calls++;},download:async()=>{calls++;}};
 await expect(backupExistingWorkState({databasePath:path,recipient:f.recipient,remoteDirectory:"drive:approved/oriso",transport})).rejects.toThrow("work_state_database_required");
 expect(calls).toBe(0);expect(await readFile(path)).toEqual(before);
 }finally{f.store.close();}
});
it("queue age survives parked retries and reopen while expired claims are not running",async()=>{
 const f=await fixture();let store=f.store;try{
 const job=store.claimSync(2000)!;store.finishSync(job.token,{now:2000,dueAt:62000,errorCode:"rate_limited"});store.close();store=createWorkStateStore(f.path);
 expect(store.operations(f.scope,61000).queue).toMatchObject({oldestAgeMs:59766,running:0,pending:1});
 expect(store.claimSync(62000)?.repositoryId).toBe("r");expect(store.operations(f.scope,132001).queue.running).toBe(0);
 }finally{store.close();}
});
