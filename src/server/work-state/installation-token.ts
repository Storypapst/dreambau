import { createPrivateKey, sign } from "node:crypto";
/** Installation tokens stay in memory; no personal token fallback or response-body logging. */
export function createInstallationTokenProvider(options:{appId:string;installationId:string;privateKey:string;repositories:string[];now?:()=>number;transport?:typeof fetch;timeoutMs?:number;board?:boolean}){
 if(!/^\d+$/.test(options.appId)||!/^\d+$/.test(options.installationId)||!options.repositories.length||options.repositories.length>500||options.repositories.some(name=>! /^[A-Za-z0-9_.-]+$/.test(name)))throw new Error("invalid_installation_configuration");
 const key=createPrivateKey(options.privateKey);if(key.asymmetricKeyType!=="rsa")throw new Error("rsa_private_key_required");
 const now=options.now??Date.now;let cached:{token:string;expires:number}|undefined;
 return async(signal?:AbortSignal)=>{
  if(signal?.aborted)throw new Error("installation_token_failed");
  if(cached&&cached.expires-now()>60000)return cached.token;
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener("abort",abort,{once:true});
  const timer=setTimeout(abort,options.timeoutMs??15000);let rejectAbort:()=>void=()=>{};
  const cancelled=new Promise<never>((_resolve,reject)=>{rejectAbort=()=>reject(new Error("installation_token_failed"));controller.signal.addEventListener("abort",rejectAbort,{once:true});});
  try{
   const exchange=(async()=>{
    const header=Buffer.from(JSON.stringify({alg:"RS256",typ:"JWT"})).toString("base64url");
    const payload=Buffer.from(JSON.stringify({iss:options.appId,iat:Math.floor(now()/1000)-60,exp:Math.floor(now()/1000)+540})).toString("base64url");
    const unsigned=`${header}.${payload}`,jwt=`${unsigned}.${sign("RSA-SHA256",Buffer.from(unsigned),key).toString("base64url")}`;
    const response=await (options.transport??fetch)(`https://api.github.com/app/installations/${options.installationId}/access_tokens`,{method:"POST",redirect:"error",signal:controller.signal,headers:{Accept:"application/vnd.github+json",Authorization:`Bearer ${jwt}`,"X-GitHub-Api-Version":"2026-03-10","Content-Type":"application/json"},body:JSON.stringify({repositories:options.repositories,permissions:{metadata:"read",pull_requests:"read",checks:"read",statuses:"read",...(options.board?{issues:"read",organization_projects:"read"}:{})}})});
    if(!response.ok)throw new Error("installation_token_failed");
    const data=await response.json() as {token?:unknown;expires_at?:unknown},expires=typeof data.expires_at==="string"?Date.parse(data.expires_at):NaN;
    if(typeof data.token!=="string"||!data.token||!Number.isFinite(expires)||expires-now()<=60000)throw new Error("installation_token_failed");
    if(controller.signal.aborted)throw new Error("installation_token_failed");
    return {token:data.token,expires};
   })();
   cached=await Promise.race([exchange,cancelled]);return cached.token;
  }catch{throw new Error("installation_token_failed");}
  finally{clearTimeout(timer);signal?.removeEventListener("abort",abort);controller.signal.removeEventListener("abort",rejectAbort);}
 };
}
