#!/usr/bin/env node
// Device-font proof in the installed engines. Browser contexts are isolated and closed by this tool.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { ROOT, playwright } from './lib.mjs';
import { parseLangFile } from './lib-languages.mjs';
const rows=JSON.parse(fs.readFileSync(ROOT+'/src/i18n/languages.json','utf8')).languages;
const runtime=fs.readFileSync(ROOT+'/site/i18n.js','utf8'),de=parseLangFile(fs.readFileSync(ROOT+'/site/i18n/de.js','utf8')).texts;
const visible=['tag.1','tag.2','cta.words','snd.on_label','skip.label','play.label','lang.title','lang.close','lang.error'];
const words=rows.map(r=>({code:r.code,text:visible.map(k=>parseLangFile(fs.readFileSync(ROOT+'/site/i18n/'+r.code+'.js','utf8')).texts[k]).join('')})),report={generated:new Date().toISOString(),engines:[]};
for(const name of (process.env.GLYPH_ENGINES||'chromium,firefox,webkit').split(',')){
 const executablePath=process.env['GLYPH_'+name.toUpperCase()+'_EXECUTABLE'];
 const browser=await playwright()[name].launch({headless:true,...(executablePath?{executablePath}:{})});
 try{
  const page=await browser.newPage();await page.goto('about:blank');await page.addScriptTag({content:runtime});await page.evaluate(de=>Dream.lang('de',de),de);await page.evaluate(()=>Dream.i18n.manifest({v:1,dev:false,langs:[{c:'de',n:'Deutsch',s:'DE',d:'ltr'}]}));await page.evaluate(()=>Dream.i18n.ready);
  const results=await page.evaluate(words=>words.map(r=>{const start=performance.now(),missing=Dream.i18n.missing(r.text),ms=performance.now()-start;return {...r,text:undefined,missing,ms};}),words);
  for(const r of results){assert.deepEqual(r.missing,[],name+' '+r.code+': '+r.missing.join(','));assert.ok(r.ms<(r===results[0]?250:50),name+' '+r.code+' glyph check took '+r.ms+'ms');}
  const negative=await page.evaluate(()=>Dream.i18n.missing('A\uE000\uFDD1\u{10FFFE}\u{10FFFE}'));assert.deepEqual(negative,['U+E000','U+FDD1','U+10FFFE'],name+' negative controls');
  report.engines.push({name,version:browser.version(),results,negative});console.log('PASS glyphs '+name+' all47 +3 negative controls');await page.close();
 }finally{await browser.close();}
}
fs.mkdirSync(ROOT+'/dist/lang-sheet',{recursive:true});fs.writeFileSync(ROOT+'/dist/lang-sheet/glyph-engines.json',JSON.stringify(report,null,2)+'\n');
