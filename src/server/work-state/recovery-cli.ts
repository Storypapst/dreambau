import { resolve } from "node:path";
import { createWorkStateStore } from "./store.js";
import { backupExistingWorkState,restoreWorkState,rcloneTransport } from "./recovery.js";
const required=(key:string)=>{const value=process.env[key];if(!value)throw new Error("missing_operator_configuration");return value;};
try{
 const path=required("WORK_STATE_DATABASE_PATH"),remote=required("WORK_STATE_BACKUP_REMOTE"),command=process.argv[2];
 if(command==="backup"){
  console.log(JSON.stringify(await backupExistingWorkState({databasePath:path,remoteDirectory:remote,recipient:required("WORK_STATE_BACKUP_RECIPIENT"),transport:rcloneTransport})));
 }else if(command==="restore-check"){
  const target=required("WORK_STATE_RESTORE_TARGET");if(resolve(target)===resolve(path))throw new Error("isolated_restore_target_required");
  const receipt=await restoreWorkState({remote:required("WORK_STATE_BACKUP_OBJECT"),transport:rcloneTransport,identityFile:required("WORK_STATE_BACKUP_IDENTITY_FILE"),target,expectedSha256:required("WORK_STATE_BACKUP_SHA256")});
  const restored=createWorkStateStore(target);try{restored.recordMaintenance("restore",receipt.at,receipt.durationMs);}finally{restored.close();}
  console.log(JSON.stringify(receipt));
 }else throw new Error("unknown_recovery_command");
}catch{console.error(JSON.stringify({error:"work_state_recovery_failed"}));process.exitCode=1;}
