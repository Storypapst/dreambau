import { afterEach, expect, it } from "vitest";
import { generateKeyPairSync, verify } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { createInstallationTokenProvider } from "../src/server/work-state/installation-token.js";
import { createWorkStateRuntime } from "../src/server/work-state/runtime.js";
const dirs:string[]=[];
afterEach(()=>{for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});});
const repo={id:"1",project:"oriso" as const,fullName:"org/repo",integrationBranch:"dev"};
it("exchanges a verified RS256 JWT for a restricted read-only token and refreshes before expiry",async()=>{
 const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});let now=Date.now(),calls=0;
 const token=createInstallationTokenProvider({appId:"42",installationId:"7",privateKey:privateKey.export({type:"pkcs8",format:"pem"}).toString(),repositories:["repo"],now:()=>now,
 transport:async(url,init)=>{calls++;expect(String(url)).toBe("https://api.github.com/app/installations/7/access_tokens");
 const jwt=new Headers(init?.headers).get("Authorization")!.slice(7),parts=jwt.split(".");expect(verify("RSA-SHA256",Buffer.from(parts.slice(0,2).join(".")),publicKey,Buffer.from(parts[2],"base64url"))).toBe(true);
 expect(JSON.parse(Buffer.from(parts[1],"base64url").toString())).toMatchObject({iss:"42",iat:Math.floor(now/1000)-60});
 expect(JSON.parse(String(init?.body))).toEqual({repositories:["repo"],permissions:{metadata:"read",pull_requests:"read",checks:"read",statuses:"read"}});
 return new Response(JSON.stringify({token:`scoped-token-${calls}`,expires_at:new Date(now+3600000).toISOString()}));}});
 expect(await token()).toBe("scoped-token-1");expect(await token()).toBe("scoped-token-1");now+=3541000;expect(await token()).toBe("scoped-token-2");
});
it("sanitizes token exchange failures and cancels a hung exchange",async()=>{
 const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});const config={appId:"42",installationId:"7",privateKey:privateKey.export({type:"pkcs8",format:"pem"}).toString(),repositories:["repo"]};
 const rejected=createInstallationTokenProvider({...config,transport:async()=>new Response("private diagnostic token-secret",{status:403})});
 await expect(rejected()).rejects.toThrow(/^installation_token_failed$/);
 const hung=createInstallationTokenProvider({...config,timeoutMs:20,transport:async()=>new Promise(()=>{})});
 await expect(hung()).rejects.toThrow(/^installation_token_failed$/);
 const controller=new AbortController();controller.abort();await expect(hung(controller.signal)).rejects.toThrow(/^installation_token_failed$/);
});
it("starts the durable collector explicitly, aborts it, and keeps the saved store after shutdown",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"ws-runtime-"));dirs.push(dir);let received!:()=>void;const ready=new Promise<void>(r=>received=r);
 const server=createServer((_q,_s)=>{received();});await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 const runtime=createWorkStateRuntime({databasePath:join(dir,"work.sqlite"),accountDatabasePath:join(dir,"accounts.sqlite"),repositories:[repo],token:async()=>"test-only",apiUrl:`http://127.0.0.1:${(server.address() as any).port}`});
 try{expect(runtime.store.collectorRepositories()).toHaveLength(1);runtime.start();await ready;await runtime.stop();await runtime.stop();
 const reopened=createWorkStateRuntime({databasePath:join(dir,"work.sqlite"),accountDatabasePath:join(dir,"accounts.sqlite"),repositories:[repo],token:async()=>"test-only"});expect(reopened.store.collectorRepositories()).toHaveLength(1);await reopened.stop();
 }finally{await runtime.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
it("rejects using the account database for work state",()=>{
 expect(()=>createWorkStateRuntime({databasePath:"/tmp/accounts.sqlite",accountDatabasePath:"/tmp/accounts.sqlite",repositories:[repo],token:async()=>"unused"})).toThrow("separate_work_state_database_required");
});
it("polling pilot schedules another refresh after five minutes without rewriting a parked job",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"ws-polling-"));dirs.push(dir);
 const runtime=createWorkStateRuntime({databasePath:join(dir,"work.sqlite"),accountDatabasePath:join(dir,"accounts.sqlite"),repositories:[repo],token:async()=>"unused",mode:"polling_pilot"});
 try{runtime.store.scheduleSyncs(1000,300000);const claim=runtime.store.claimSync(1000)!;runtime.store.finishSync(claim.token,{now:1000});
 runtime.store.scheduleSyncs(301000,300000);expect(runtime.store.claimSync(301000)?.repositoryId).toBe("1");}finally{await runtime.stop();}
});
it("invalid numeric IDs or duplicate registry names leave every saved entry unchanged",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"ws-registry-"));dirs.push(dir);const path=join(dir,"work.sqlite"),config={databasePath:path,accountDatabasePath:join(dir,"accounts.sqlite"),repositories:[repo],token:async()=>"unused"};
 const original=createWorkStateRuntime(config);await original.stop();
 for(const repositories of [[{...repo,id:"invalid"}],[repo,{...repo,id:"2"}]])expect(()=>createWorkStateRuntime({...config,repositories})).toThrow();
 const {createWorkStateStore}=await import("../src/server/work-state/store.js");const saved=createWorkStateStore(path);try{expect(saved.collectorRepositories()).toEqual([{...repo,active:true}]);}finally{saved.close();}
});
