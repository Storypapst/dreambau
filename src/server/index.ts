import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { loadWorkStateRuntime } from "./work-state/runtime.js";

const config=loadConfig();
const port = Number(process.env.PORT ?? 3000);
let runtime:ReturnType<typeof loadWorkStateRuntime>;
try { runtime=loadWorkStateRuntime(process.env.WORK_STATE_CONFIG_PATH,config.databasePath); }
catch { console.error("work_state_startup_failed");process.exit(1); }
try {
 const app=createApp(runtime?{workStateStore:runtime.store,workStateMode:runtime.mode,workStateWebhookSecret:runtime.webhookSecret}:{});
 const server=app.listen(port,"0.0.0.0",()=>{runtime?.start();console.log(`testmails listening on ${port}`);});
 let stopping=false;
 const shutdown=async()=>{if(stopping)return;stopping=true;const timer=setTimeout(()=>process.exit(1),15000);timer.unref();server.close();server.closeIdleConnections();await runtime?.stop();server.closeAllConnections();clearTimeout(timer);};
 process.once("SIGTERM",()=>{void shutdown();});process.once("SIGINT",()=>{void shutdown();});
 server.once("error",()=>{void runtime?.stop().finally(()=>process.exit(1));});
} catch { await runtime?.stop();console.error("service_startup_failed");process.exit(1); }
