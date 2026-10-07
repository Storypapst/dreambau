// Shared real-nginx browser seam. Page modules exercise the built public UI.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const root=path.resolve(import.meta.dirname,'..');
const dist=path.resolve(root,'../landing/dist/apex');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'design-check-'));
const name='design-check-'+process.pid;
const external=process.env.BASE_URL;
export const policy="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'";
let browser,base=external,checks=0;
const artifact=path.join(root,'test-results',external?'design-live':'design-local');
fs.mkdirSync(artifact,{recursive:true});
const ok=(label,value)=>{assert(value,label);checks++;console.log('PASS '+label);};
try{
  if(!external){
    const conf=path.join(scratch,'default.conf');
    fs.writeFileSync(conf,`server{listen 80;root /site;access_log off;include /etc/nginx/mime.types;add_header Content-Security-Policy "${policy}" always;add_header Cache-Control no-store always;add_header X-Content-Type-Options nosniff always;location = /{try_files /index.html =404;}location /homepage-assets/{alias /site/;}location = /referenzen{return 308 /referenzen/;}location = /glossar{return 308 /glossar/;}location ~ ^/(?:referenzen|glossar|website-assets)/(?:.*/)?\\.{return 404;}location /referenzen/{try_files $uri $uri/ =404;autoindex off;}location /glossar/{try_files $uri $uri/ =404;autoindex off;}location /website-assets/{try_files $uri =404;autoindex off;}location /{return 404;}}`);
    execFileSync('docker',['run','-d','--rm','--name',name,'-p','127.0.0.1::80','--mount',`type=bind,source=${dist},target=/site,readonly`,'--mount',`type=bind,source=${conf},target=/etc/nginx/conf.d/default.conf,readonly`,'nginx:1.27-alpine'],{stdio:'pipe'});
    base='http://127.0.0.1:'+execFileSync('docker',['port',name,'80/tcp'],{encoding:'utf8'}).trim().split(':').pop();
  }
  let ready=false;
  for(let n=0;n<50;n++){
    try{if((await fetch(base+'/')).status===200){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  assert(ready,'nginx serves the built candidate');
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
  const modules=process.argv.slice(2);
  for(const name of modules.length?modules:['regressions','glossary','references','source','source-languages','raster']){
    assert(/^[a-z-]+$/.test(name),'bounded check module');
    const {run}=await import('./checks/'+name+'.mjs');
    await run({browser,base,artifact,ok,root,dist,policy});
  }
  fs.writeFileSync(path.join(artifact,'result.json'),JSON.stringify({result:'PASS',checks,base,modules},null,2)+'\n');
  console.log(checks+' design checks passed.');
}finally{
  await browser?.close();
  if(!external){try{execFileSync('docker',['rm','-f',name],{stdio:'ignore'});}catch{}}
  fs.rmSync(scratch,{recursive:true,force:true});
}
