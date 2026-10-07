// Real nginx fixture for the app gate; uses the same asset prefix, types and CSP as the apex contract.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { APEX_CSP } from './lib.mjs';
export async function serveNginx(dir,prefix='/homepage-assets/'){
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'landing-nginx-')),name='landing-check-'+process.pid+'-'+Date.now();
 const conf=path.join(scratch,'default.conf');
 fs.writeFileSync(conf,`server { listen 80; server_name _; root /site; access_log off;
 types { text/html html; text/css css; application/javascript js; } default_type application/octet-stream;
 add_header Content-Security-Policy "${APEX_CSP}" always;
 add_header X-Content-Type-Options nosniff always; add_header Cache-Control no-store always;
 add_header Referrer-Policy strict-origin-when-cross-origin always;
 location = / { try_files /index.html =404; } location = /health { return 200 'ok'; }
 location ${prefix} { alias /site/; } location / { return 404; }
}\n`);
 const stop=()=>{try{execFileSync('docker',['rm','-f',name],{stdio:'ignore'});}finally{fs.rmSync(scratch,{recursive:true,force:true});}};
 try{
  execFileSync('docker',['run','--detach','--rm','--name',name,'--publish','127.0.0.1::80','--mount',`type=bind,source=${path.resolve(dir)},target=/site,readonly`,'--mount',`type=bind,source=${conf},target=/etc/nginx/conf.d/default.conf,readonly`,'nginx:1.27-alpine'],{stdio:'pipe'});
  const port=execFileSync('docker',['port',name,'80/tcp'],{encoding:'utf8'}).trim().split(':').pop(),base='http://127.0.0.1:'+port;
  for(let n=0;n<50;n++){try{if((await fetch(base+'/health')).status===200)return {base,stop};}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('nginx did not become healthy');
 }catch(e){stop();throw e;}
}
