#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROOT, parseArgs } from './lib.mjs';
import { parseLangFile, parseManifest } from './lib-languages.mjs';
import { manifestText } from './build-languages.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const placeholders=t=>[...new Set([...t.matchAll(/\{([^{}]+)\}/g)].map(m=>m[1]))].sort().join(',');
export function checkLanguages(root=ROOT,{release=false,complete=false,buildDir=null}={}){
 const problems=[],notes=[],pass=new Set(),bad=(id,file,msg)=>problems.push(`FAIL ${id} ${file}: ${msg}`),check=(id,ok,file,msg)=>{pass.add(id);if(!ok)bad(id,file,msg);};
 let mirror,de;try{mirror=JSON.parse(fs.readFileSync(path.join(root,'src/i18n/languages.json'),'utf8'));de=parseLangFile(fs.readFileSync(path.join(root,'site/i18n/de.js'),'utf8')).texts;}catch(e){return {problems:['FAIL C1 inputs: '+e.message],notes,pass:[]};}
 const rows=mirror.languages,known=new Map(rows.map(r=>[r.code,r]));check('C1',known.size===rows.length&&known.has('de'),'languages.json','unique rows and German required');
 const keys=Object.keys(de),animations=Object.keys(de).filter(k=>k.startsWith('blind.')).map(k=>k.slice(6)),dir=path.join(root,'site/i18n');
 for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.js')&&f!=='index.js')){
  const code=file.slice(0,-3),r=known.get(code),buf=fs.readFileSync(path.join(dir,file)),text=buf.toString('utf8');check('C1',!!r,file,'code absent from list');let obj;
  try{const parsed=parseLangFile(text);obj=parsed.texts;check('C2',parsed.code===code&&Object.keys(obj).every(k=>/^[a-z0-9_.]{1,40}$/.test(k))&&Object.values(obj).every(v=>typeof v==='string'),file,'one strict text-only registration with valid keys');}catch(e){bad('C2',file,e.message);continue;}
  check('C3',!text.startsWith('\uFEFF')&&!text.includes('\r')&&text===text.normalize('NFC')&&Buffer.from(text).equals(buf)&&Object.values(obj).every(v=>!/[<>\u0000-\u001F\u007F]|:\/\//u.test(v)),file,'UTF8/NFC/text safety');
  check('C4',JSON.stringify(Object.keys(obj))===JSON.stringify(keys),file,'key set/order differs from German');
  check('C5',animations.every(id=>['tag1','tag2','brand'].every(p=>de['blind.'+id].includes('{'+p+'}')))&&keys.every(k=>typeof obj[k]==='string'&&placeholders(obj[k])===placeholders(de[k])),file,'placeholder set differs');
  check('C6',buf.length<=32768,file,'larger than32768 bytes');check('C7',['tag.1','tag.2'].every(k=>obj[k]&&!/[|\r\n]/.test(obj[k])),file,'empty or multiline Tagline');
  const limits={'cta.words':30,'play.label':30,'snd.on_label':/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(obj['snd.on_label']||'')?13:16,'lang.title':40,'lang.close':40,'skip.label':40,'lang.error':80};
  check('C8',Object.entries(limits).every(([k,n])=>typeof obj[k]==='string'&&[...obj[k]].length<=n)&&obj['lang.aria']?.startsWith('{code}'),file,'visible label limit or language aria prefix');
  for(const k of keys){if(/\d/.test(obj[k]||'')&&!/\d/.test(de[k])){const digits=(obj[k]||'').match(/\d+/g)||[];if(digits.includes(String(rows.length)))bad('C9',file,'literal language count');else notes.push('WARN C9 '+file+': digit in '+k);}}pass.add('C9');
 }
 const html=fs.readFileSync(path.join(root,'site/index.html'),'utf8'),shell=fs.readFileSync(path.join(root,'site/shell.js'),'utf8'),runtime=fs.readFileSync(path.join(root,'site/i18n.js'),'utf8');
 check('C10',html.includes('data-lines="'+de['tag.1']+'|'+de['tag.2']+'|dreambau.com"'),'index.html','German Tagline markup changed');
 const decode=t=>t.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
 for(const m of html.matchAll(/<([a-z0-9]+)\b([^>]*\bdata-i18n="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/gi))if(!m[3].includes('{'))check('C10',decode(m[4].replace(/<[^>]+>/g,''))===de[m[3]],'index.html','German text binding differs: '+m[3]);
 for(const m of html.matchAll(/<[^>]+data-i18n-attr="([^:"]+):([^"]+)"[^>]*>/g)){
  const expected=(de[m[2]]||'').replace(/\{code\}/g,'DE').replace(/\{name\}/g,'Deutsch'),value=new RegExp('(?:^|\\s)'+m[1]+'="([^"]*)"').exec(m[0])?.[1];
  check('C10',decode(value||'')===expected,'index.html','German attribute binding differs: '+m[2]);
 }
 const literal=s=>/fam\s*=\s*'([^']+)'/.exec(s)?.[1];check('C11',!!literal(runtime)&&literal(runtime)===literal(shell),'i18n.js','font lists differ');
 const scriptOrder=h=>{const tags=[...h.matchAll(/<script([^>]+)>/g)].filter(m=>/src=/.test(m[1])).map(m=>m[1]);return tags.length===3&&tags[0].includes('i18n.js')&&tags[1].includes('i18n/index.js')&&tags[2].includes('shell.js')&&tags.every(t=>!/\b(async|defer|type)\b/.test(t));};check('C12',scriptOrder(html),'index.html','classic script order');
 if(complete){for(const r of rows)check('K1',fs.existsSync(path.join(dir,r.code+'.js')),r.code,'missing complete file');}
 if(release){
  check('R1',rows.every(r=>r.offered===true&&typeof r.reviewed==='boolean'),'languages.json','approved47 availability; reviewed informational');
  for(const r of rows.filter(r=>r.offered&&r.code!=='de')){const p=path.join(dir,r.code+'.js');check('R2',fs.existsSync(p)&&hash(fs.readFileSync(p))===r.sha256,r.code+'.js','hash pin mismatch');}
  check('R3',fs.readFileSync(path.join(dir,'index.js'),'utf8')===manifestText(mirror),'index.js','manifest stale');
  const ids=/D.ids\s*=\s*\[([^\]]+)\]/.exec(shell)?.[1].match(/['"][^'"]+['"]/g)?.map(v=>v.slice(1,-1))||[];check('R4',ids.length>0&&ids.every(id=>animations.includes(id)),'shell.js','animation lacks a complete description');
  const built=buildDir||path.join(root,'dist/apex');if(fs.existsSync(built)){
   const m=parseManifest(fs.readFileSync(path.join(built,'i18n/index.js'),'utf8')),codes=rows.filter(r=>r.offered).map(r=>r.code),expected=['index.js',...codes.map(c=>c+'.js')].sort();
   check('R5',!m.dev&&JSON.stringify(m.langs.map(l=>l.c))===JSON.stringify(codes)&&JSON.stringify(fs.readdirSync(path.join(built,'i18n')).sort())===JSON.stringify(expected),'dist/apex','published set differs; rebuild apex');
   check('C12',scriptOrder(fs.readFileSync(path.join(built,'index.html'),'utf8')),'dist/apex/index.html','classic script order');
  }else notes.push('SKIP R5 (no dist/apex)');
  check('R6',rows.filter(r=>r.offered).every(r=>{try{const texts=parseLangFile(fs.readFileSync(path.join(dir,r.code+'.js'),'utf8')).texts;return animations.every(id=>typeof texts['blind.'+id]==='string'&&texts['blind.'+id].trim().length>0);}catch{return false;}}),'languages','complete animation descriptions required, not reader flags');
 }
 return {problems,notes,pass:[...pass]};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=parseArgs(process.argv.slice(2)),result=checkLanguages(path.resolve(a.root||ROOT),{release:!!a.release,complete:!!a.complete});for(const l of result.notes)console.log(l);for(const id of result.pass)if(!result.problems.some(p=>p.startsWith('FAIL '+id+' ')))console.log('PASS '+id);for(const l of result.problems)console.log(l);process.exitCode=result.problems.length?1:0;
}
