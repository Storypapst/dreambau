import { createWorkStateStore } from "./store.js";
import { GitHubReader } from "./github.js";
import { createWorkStateWorker } from "./worker.js";
import { repositorySchema, type RepositoryInput } from "./model.js";
import { createInstallationTokenProvider } from "./installation-token.js";
import { readFileSync, realpathSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createSourceWorker } from "./source-worker.js";
import {validateReceiptPolicies,type ReceiptPolicy } from "./sources.js";
import { z } from "zod";
function canonical(path:string){return existsSync(path)?realpathSync(path):resolve(path);}
export function createWorkStateRuntime(options:{databasePath:string;accountDatabasePath:string;repositories:RepositoryInput[];token:(signal?:AbortSignal)=>Promise<string>;apiUrl?:string;mode?:"normal"|"polling_pilot";sources?:{board:boolean;receiptDirectory?:string;policies:ReceiptPolicy[]}}){
 if(canonical(options.databasePath)===canonical(options.accountDatabasePath)||options.databasePath===":memory:")throw new Error("separate_work_state_database_required");
 validateReceiptPolicies(options.sources?.policies??[]);
 const repositories=z.array(repositorySchema).min(1).max(500).parse(options.repositories);
 new GitHubReader({repositories,token:options.token,apiUrl:options.apiUrl});
 const store=createWorkStateStore(options.databasePath);
 try{
  store.configureRegistry(repositories);
  if(!options.sources)store.configureReceiptPolicies([]);
  const worker=createWorkStateWorker({store,token:options.token,apiUrl:options.apiUrl,reconciliationMs:options.mode==="polling_pilot"?300000:3600000});
  const sources=options.sources?createSourceWorker({store,token:options.token,...options.sources}):undefined;
  let stopping:Promise<void>|undefined;
  return {store,start(){if(!stopping){worker.start();sources?.start();}},stop(){return stopping??=(async()=>{await Promise.all([worker.stop(),sources?.stop()]);store.close();})();}};
 }catch(error){store.close();throw error;}
}
const configSchema=z.object({appId:z.string().regex(/^\d+$/),installationId:z.string().regex(/^\d+$/),databasePath:z.string().min(1),privateKeyFile:z.string().min(1),webhookSecretFile:z.string().min(1),mode:z.enum(["normal","polling_pilot"]).default("normal"),sources:z.object({board:z.boolean().default(false),receiptDirectory:z.string().min(1).optional(),policies:z.array(z.object({producer:z.string().min(1),publicKey:z.string().min(1),repositoryIds:z.array(z.string()),environments:z.array(z.string())}).strict()).default([])}).strict().optional(),repositories:z.array(repositorySchema).min(1).max(500)}).strict();
/** The operator supplies a protected configuration file; merely creating Express never starts timers. */
export function loadWorkStateRuntime(path:string|undefined,accountDatabasePath:string){
 if(!path)return undefined;
 const config=configSchema.parse(JSON.parse(readFileSync(path,"utf8"))),repositories=config.repositories.filter(r=>r.active);
 const owners=new Set(repositories.map(r=>r.fullName.split("/")[0].toLowerCase()));
 if(owners.size!==1||owners.values().next().value!=="openresilienceinitiative")throw new Error("oriso_installation_scope_required");
 const webhookSecret=readFileSync(config.webhookSecretFile,"utf8").trim();if(webhookSecret.length<32)throw new Error("webhook_secret_required");
 const token=createInstallationTokenProvider({...config,board:config.sources?.board,privateKey:readFileSync(config.privateKeyFile,"utf8"),repositories:repositories.map(r=>r.fullName.split("/")[1])});
 const runtime=createWorkStateRuntime({...config,accountDatabasePath,token});return {...runtime,mode:config.mode,webhookSecret};
}
