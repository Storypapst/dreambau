import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, chmod, rm, link, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { WorkStateStore } from "./store.js";
const run=promisify(execFile);
export interface BackupTransport {upload(path:string,remote:string):Promise<void>;download(remote:string,path:string):Promise<void>}
function assertRemote(remote:string){if(!/^[A-Za-z][A-Za-z0-9_-]*:[^\r\n]+\.age$/.test(remote)||remote.includes("..")||remote.includes("@"))throw new Error("off_server_remote_required");}
export const rcloneTransport:BackupTransport={
 async upload(path,remote){assertRemote(remote);try{await run("rclone",["copyto","--",path,remote],{timeout:300000});}catch{throw new Error("backup_upload_failed");}},
 async download(remote,path){assertRemote(remote);try{await run("rclone",["copyto","--",remote,path],{timeout:300000});}catch{throw new Error("backup_download_failed");}}
};
async function sha(path:string){return createHash("sha256").update(await readFile(path)).digest("hex");}
export async function backupWorkState(options:{store:Pick<WorkStateStore,"backupTo"|"recordMaintenance">;recipient:string;remote:string;transport:BackupTransport}){
 assertRemote(options.remote);if(!/^age1[0-9a-z]+$/.test(options.recipient))throw new Error("age_recipient_required");
 const started=Date.now(),dir=await mkdtemp(join(tmpdir(),"work-state-backup-"));
 try{
  const snapshot=join(dir,"snapshot.sqlite"),encrypted=join(dir,"snapshot.age"),readback=join(dir,"readback.age");
  await options.store.backupTo(snapshot);await chmod(snapshot,0o600);
  try{await run("age",["-r",options.recipient,"-o",encrypted,snapshot],{timeout:120000});}catch{throw new Error("backup_encryption_failed");}
  await options.transport.upload(encrypted,options.remote);await options.transport.download(options.remote,readback);
  const hash=await sha(encrypted);if(hash!==await sha(readback))throw new Error("backup_readback_mismatch");
  const at=new Date().toISOString(),durationMs=Date.now()-started;options.store.recordMaintenance("backup",at,durationMs);
  return {verified:true as const,sha256:hash,at,durationMs};
 }finally{await rm(dir,{recursive:true,force:true});}
}
export async function restoreWorkState(options:{remote:string;transport:BackupTransport;identityFile:string;target:string;expectedSha256:string}){
 assertRemote(options.remote);if(!/^[0-9a-f]{64}$/.test(options.expectedSha256))throw new Error("backup_hash_required");
 try{await lstat(options.target);throw new Error("restore_target_exists");}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
 const started=Date.now(),dir=await mkdtemp(join(dirname(options.target),".work-state-restore-"));
 try{
  const encrypted=join(dir,"snapshot.age"),snapshot=join(dir,"restore.sqlite");
  await options.transport.download(options.remote,encrypted);if(await sha(encrypted)!==options.expectedSha256)throw new Error("backup_readback_mismatch");
  try{await run("age",["-d","-i",options.identityFile,"-o",snapshot,encrypted],{timeout:120000});}catch{throw new Error("restore_decryption_failed");}
  await chmod(snapshot,0o600);const db=new Database(snapshot,{readonly:true});
  try{
   if(db.pragma("quick_check",{simple:true})!=="ok"||(db.pragma("foreign_key_check") as unknown[]).length)throw new Error("restore_integrity_failed");
   for(const table of ["work_state_migrations","work_items","checkpoints","sync_jobs"]){if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))throw new Error("restore_wrong_database");}
  }finally{db.close();}
  // Atomic no-replace publication: even a target created during download stays untouched.
  await link(snapshot,options.target);
  return {integrity:"ok",durationMs:Date.now()-started,at:new Date().toISOString()};
 }finally{await rm(dir,{recursive:true,force:true});}
}
/** Existing sources are inspected read-only; backup never runs schema migrations. */
export async function backupExistingWorkState(options:{databasePath:string;recipient:string;remoteDirectory:string;transport:BackupTransport}){
 if(!/^age1[0-9a-z]+$/.test(options.recipient))throw new Error("age_recipient_required");
 const directory=options.remoteDirectory.replace(/\/$/,"");
 if(!/^[A-Za-z][A-Za-z0-9_-]*:[^\r\n]*$/.test(directory)||directory.includes("..")||directory.endsWith(".age")||directory.includes("@"))throw new Error("off_server_directory_required");
 const remote=`${directory}/work-state-${new Date().toISOString().replace(/[:.]/g,"-")}-${randomUUID()}.sqlite.age`;
 const db=new Database(options.databasePath,{readonly:true,fileMustExist:true});
 try{
  const tables=new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(row=>row.name));
  if(["accounts","account_metadata","human_users","machine_identity_usage"].some(table=>tables.has(table))||!["work_state_migrations","repositories","work_items","checkpoints","sync_jobs"].every(table=>tables.has(table)))throw new Error("work_state_database_required");
  const result=await backupWorkState({...options,remote,store:{backupTo:async path=>{await db.backup(path);},recordMaintenance:(kind,at,durationMs)=>{
   if(!tables.has("work_state_maintenance"))return;
   const writer=new Database(options.databasePath,{fileMustExist:true});try{writer.prepare("INSERT INTO work_state_maintenance VALUES(?,?,?) ON CONFLICT(kind) DO UPDATE SET at=excluded.at,duration_ms=excluded.duration_ms").run(kind,at,durationMs);}finally{writer.close();}
  }}});
  return {...result,remote};
 }finally{db.close();}
}
