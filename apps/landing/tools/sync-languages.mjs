#!/usr/bin/env node
// The owner-approved list controls publication. Reader status is informational, never fabricated.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, parseArgs } from './lib.mjs';
import { manifestText } from './build-languages.mjs';
const a=parseArgs(process.argv.slice(2)),root=path.resolve(a.root||ROOT),file=path.join(root,'src/i18n/languages.json');
try{
 const mirror=JSON.parse(fs.readFileSync(file,'utf8'));
 if(a.table){
  const prior=new Map(mirror.languages.map(l=>[l.code,l]));const rows=[];
  for(const line of fs.readFileSync(path.resolve(root,a.table),'utf8').split('\n')){
   if(!line.startsWith('|'))continue;const f=line.split('|').slice(1,-1).map(s=>s.trim());if(f.length!==13||!['LTR','RTL'].includes(f[4]))continue;
   const code=f[2];if(!/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(code)||rows.some(r=>r.code===code)||f.slice(9).some(v=>!['source','yes','no'].includes(v))||(code==='de'?f.slice(9).some(v=>v!=='source'):f.slice(9).includes('source')))throw new Error('invalid table code or flags: '+code);
   const old=prior.get(code);rows.push({...old,code,name:f[1],short:old?.short||code.split('-')[0].toUpperCase(),direction:f[4].toLowerCase(),script:f[3],group:f[5],offered:old?.offered||code==='de',reviewed:old?.reviewed||code==='de',sha256:old?.sha256||null});
  }
  if(!rows.some(r=>r.code==='de'))throw new Error('German source missing');mirror.languages=rows;
 }
 if(a.pin){for(const l of mirror.languages){const p=path.join(root,'site/i18n',l.code+'.js');if(l.code!=='de'&&fs.existsSync(p))l.sha256=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}}
 const json=JSON.stringify(mirror,null,2)+'\n',manifest=manifestText(mirror),mf=path.join(root,'site/i18n/index.js');
 const changed=json!==fs.readFileSync(file,'utf8')||manifest!==fs.readFileSync(mf,'utf8');
 if(a.check){console.log(changed?'FAIL sync:languages stale':'PASS sync:languages unchanged');process.exitCode=changed?1:0;}
 else{fs.writeFileSync(file,json);fs.writeFileSync(mf,manifest);console.log('PASS sync:languages '+mirror.languages.length+' sanitized rows'+(a.pin?' hashes pinned':''));}
}catch(e){console.error('FAIL sync:languages '+e.message);process.exitCode=2;}
