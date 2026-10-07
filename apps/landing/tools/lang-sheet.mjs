#!/usr/bin/env node
// Offline comparison sheets. These expose all keys and device glyphs, and never claim a native reader's approval.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ROOT, SITE, launch, parseArgs, serveBuild } from './lib.mjs';
import { parseLangFile } from './lib-languages.mjs';
const a=parseArgs(process.argv.slice(2)),mirror=JSON.parse(fs.readFileSync(ROOT+'/src/i18n/languages.json','utf8')),de=parseLangFile(fs.readFileSync(SITE+'/i18n/de.js','utf8')).texts;
let rows=mirror.languages;if(a.lang)rows=rows.filter(l=>String(a.lang).split(',').includes(l.code));else if(a['non-latin'])rows=rows.filter(l=>l.script!=='Latin');else if(!a.all)rows=rows.filter(l=>['de','en','ar','ja'].includes(l.code));
const out=path.resolve(ROOT,a.out||'dist/lang-sheet');if(!out.startsWith(ROOT+'/dist/'))throw new Error('--out must be inside dist/');fs.mkdirSync(out,{recursive:true});
const built=spawnSync(process.execPath,['tools/build-apex.mjs','--drafts','--out','dist/lang-sheet-build'],{cwd:ROOT,encoding:'utf8'});if(built.status!==0)throw new Error(built.stderr);
const server=await serveBuild({dir:ROOT+'/dist/lang-sheet-build',prefix:'/homepage-assets/'}),browser=await launch(),report={generated:new Date().toISOString(),browser:browser.version(),reviewed:false,languages:[]},pages=[];
const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const replace=(words,key,row)=>words[key].replace(/\{([^{}]+)\}/g,(m,k)=>({tag1:words['tag.1'],tag2:words['tag.2'],brand:'dreambau.com',code:row.short,name:row.name,count:mirror.languages.length}[k]||m));
try{
 for(const row of rows){
  const file=fs.readFileSync(SITE+'/i18n/'+row.code+'.js'),words=parseLangFile(file.toString()).texts,context=await browser.newContext({viewport:{width:960,height:720},locale:'de-DE',reducedMotion:'reduce'}),page=await context.newPage();
  try{
   await page.goto(server.base+'/?anim=4k&lang='+row.code);await page.waitForFunction(()=>Dream.state.mode==='still'||Dream.state.error);
   const proof=await page.evaluate(words=>({chosen:Dream.state.lang,fallback:Dream.state.langFallback,F:Dream.text.F,missing:Dream.i18n.missing(Object.values(words).join(''))}),words);
   await page.screenshot({path:path.join(out,row.code+'-frame.png')});report.languages.push({code:row.code,sha256:crypto.createHash('sha256').update(file).digest('hex'),reviewed:row.reviewed,...proof});
   const table=Object.keys(de).map(k=>'<tr><th>'+esc(k)+'</th><td lang="de">'+esc(replace(de,k,mirror.languages.find(r=>r.code==='de')))+'</td><td lang="'+row.code+'" dir="'+row.direction+'">'+esc(replace(words,k,row))+'</td></tr>').join('');
   const html='<!doctype html><html lang="en"><meta charset="utf-8"><title>'+esc(row.name)+' — language comparison</title><style>body{margin:24px;background:#06080d;color:#fff;font:16px system-ui}h1{font-size:24px}table{width:100%;table-layout:fixed;border-collapse:collapse}th{width:16%;font:13px monospace}td{width:42%;padding:12px;border-bottom:1px solid #fff4;overflow-wrap:break-word}tr:nth-child(-n+2) td{font-weight:800;font-size:28px}a{color:#ffd696}</style><h1>'+esc(row.name)+' ('+row.code+')</h1><p>Draft translation; native reader review: '+(row.reviewed?'source language':'not recorded')+'. Browser glyph check: '+esc(proof.missing.join(', ')||'no missing code points')+'.</p><table><thead><tr><th>Key</th><td>German source</td><td>'+esc(row.name)+'</td></tr></thead><tbody>'+table+'</tbody></table></html>';
   fs.writeFileSync(path.join(out,row.code+'.html'),html);await page.setContent(html);await page.screenshot({path:path.join(out,row.code+'.png'),fullPage:true});pages.push('<li><a href="'+row.code+'.html">'+esc(row.name)+'</a> · <a href="'+row.code+'.png">comparison PNG</a> · <a href="'+row.code+'-frame.png">rendered frame</a></li>');console.log('PASS sheet '+row.code+' ('+proof.chosen+(proof.fallback?', '+proof.fallback:'')+')');
  }finally{await context.close();}
 }
 fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><title>Language rendering sheets</title><h1>Language rendering sheets</h1><p>Device rendering evidence. Review markers stay unchanged.</p><ul>'+pages.join('')+'</ul></html>');fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();await new Promise(r=>server.server.close(r));}
console.log('Sheets: '+out);
