#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib.mjs';
import { serveNginx } from './lib-nginx.mjs';
const server=await serveNginx(ROOT+'/dist/apex');
try{
 const run=spawnSync(process.execPath,['tools/apex-check.mjs'],{cwd:ROOT,env:{...process.env,BASE_URL:server.base},encoding:'utf8',timeout:600000});
 process.stdout.write(run.stdout||'');process.stderr.write(run.stderr||'');process.exitCode=run.status??1;
}finally{server.stop();}
