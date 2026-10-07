import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib.mjs';
import { parseLangFile } from '../lib-languages.mjs';
import { openPage, problems } from './_helpers.mjs';
export const rows=['VER-27'];export const byDefault=false;export const option='rotate';
export default async function(ctx){
 const measured=JSON.parse(fs.readFileSync(ROOT+'/dist/lang-sheet/report.json','utf8')).languages;
 const worst=measured.filter(r=>r.chosen===r.code).sort((a,b)=>a.F-b.F)[0].code;
 const longest=ctx.langs.map(code=>({code,n:[...parseLangFile(fs.readFileSync(path.join(ROOT,'site/i18n',code+'.js'),'utf8')).texts['cta.words']].length})).sort((a,b)=>b.n-a.n)[0].code;
 const codes=[worst,longest,'ar'];ctx.info('rotation probes: smallest measured font '+worst+', longest contact '+longest+', RTL ar');
 for(const id of ['4k','16k','64k'])for(const code of codes){
  const t=await openPage(ctx.browser,{w:390,h:844,contextOptions:{hasTouch:true}});
  try{
   await t.page.goto(ctx.base+'/?anim='+id+'&lang='+code+'&px=40000');await t.page.waitForFunction(()=>Dream.state.mode==='play'||Dream.state.error);assert.equal(await t.page.evaluate(()=>Dream.state.lang),code);
   await t.page.waitForTimeout(5000);const before=await t.page.evaluate(()=>({T:Dream.state.T,muted:Dream.state.muted}));
   const wall=Date.now();await t.page.setViewportSize({width:844,height:390});await t.page.waitForTimeout(3000);const rotated=await t.page.evaluate(()=>({T:Dream.state.T,w:innerWidth,h:innerHeight,wide:document.documentElement.scrollWidth>innerWidth}));const elapsed=(Date.now()-wall)/1000;assert.ok(rotated.T>before.T&&Math.abs(rotated.T-before.T-elapsed)<2.5,JSON.stringify({before,rotated,elapsed}));assert.equal(rotated.wide,false);
   await t.page.setViewportSize({width:390,height:844});await t.page.waitForTimeout(300);const after=await t.page.evaluate(()=>({T:Dream.state.T,muted:Dream.state.muted,error:Dream.state.error,wide:document.documentElement.scrollWidth>innerWidth}));assert.ok(after.T>=rotated.T);assert.equal(after.muted,before.muted);assert.ok(!after.error&&!after.wide);
   await t.page.screenshot({path:ROOT+'/dist/lang-sheet/'+id+'-'+code+'-rotate.png'});assert.deepEqual(await problems(t),[]);ctx.info(id+' '+code+' rotation passed');
  }finally{await t.close();}
 }
}
