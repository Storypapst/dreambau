import { readdir,lstat,readFile } from "node:fs/promises";
import { join } from "node:path";
import type { WorkStateStore } from "./store.js";
import { readIssueBoard } from "./board.js";
import type { ReceiptPolicy } from "./sources.js";
export function createSourceWorker(options:{store:WorkStateStore;board:boolean;token:(signal?:AbortSignal)=>Promise<string>;transport?:typeof fetch;receiptDirectory?:string;policies?:ReceiptPolicy[];now?:()=>number}){
 options.store.configureReceiptPolicies(options.policies??[]);
 const now=options.now??Date.now;let running:Promise<void>|undefined,timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined,stopped=true;
 async function perform(){
  controller=new AbortController();const abortTimer=setTimeout(()=>controller?.abort(),60000);
  try{
   const state=options.store.adapterProgress("board"),issues=options.store.collectorIssueLinks();
   if(options.board&&(!state.lastComplete||now()-state.lastComplete>=3600000)){
    let offset=state.offset??0;
    for(const issue of issues.slice(offset,offset+20)){
     if(controller.signal.aborted)break;
     try{options.store.recordBoard(issue.repositoryId,issue.number,await readIssueBoard({...options,...issue,signal:controller.signal}));}catch{options.store.recordBoardFailure(issue.repositoryId,issue.number,"board_source_incomplete",new Date(now()).toISOString());}
     offset++;options.store.saveAdapterProgress("board",{offset});
    }
    if(offset>=issues.length)options.store.saveAdapterProgress("board",{offset:0,lastComplete:now()});
   }
   if(options.receiptDirectory){
    const state=options.store.adapterProgress("receipts");if(state.lastComplete&&now()-state.lastComplete<30000)return;
    const files=(await readdir(options.receiptDirectory,{withFileTypes:true})).filter(f=>f.isFile()&&f.name.endsWith(".json")).map(f=>f.name).sort();
    const pending=files.filter(name=>!state.after||name>state.after).slice(0,50);let error:string|null=state.after?(state.cycleError??null):null;
    for(const file of pending){
     if(controller.signal.aborted)break;
     try{const path=join(options.receiptDirectory,file),stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw new Error();options.store.ingestReceipt(JSON.parse(await readFile(path,"utf8")),options.policies??[],now());}catch{error="receipt_feed_invalid";}
     options.store.saveAdapterProgress("receipts",{...state,after:file,cycleError:error,error:state.error??error,lastAttemptAt:now()});
    }
    if(pending.length<50&&!controller.signal.aborted)options.store.saveAdapterProgress("receipts",{after:"",cycleError:null,lastComplete:now(),lastAttemptAt:now(),lastSuccess:error?(state.lastSuccess??null):now(),error});
   }
  }finally{clearTimeout(abortTimer);}
 }
 async function tick(){return running??=(async()=>{try{await perform();options.store.saveAdapterProgress("sources",{error:null});}catch{options.store.saveAdapterProgress("sources",{error:"source_worker_failed"});throw new Error("source_worker_failed");}finally{running=undefined;}})();}
 async function loop(){try{await tick();}catch{options.store.saveAdapterProgress("sources",{error:"source_worker_failed"});}finally{if(!stopped)timer=setTimeout(()=>{void loop();},1000);}}
 return {tick,start(){if(stopped){stopped=false;void loop();}},async stop(){stopped=true;if(timer)clearTimeout(timer);controller?.abort();try{await running;}catch{ /* sanitized state is persisted by loop */ }}};
}
