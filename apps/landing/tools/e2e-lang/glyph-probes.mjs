// VER-11: the approved fixed probe lines and cell-clipping regression, in Chromium.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROOT } from '../lib.mjs';
import { openPage } from './_helpers.mjs';
export const rows=['VER-11'];
export default async function(ctx){
 const probes=fs.readFileSync(ROOT+'/tools/fixtures/glyph-probes.txt','utf8').trim().split('\n').map(line=>{const i=line.indexOf(' ');return {code:line.slice(0,i),text:line.slice(i+1)};});
 assert.equal(probes.length,14);
 const ranges=[[0x20,0x24f],[0x370,0x3ff],[0x400,0x52f],[0x590,0x5ff],[0x600,0x6ff],[0x750,0x77f],[0xfb50,0xfdff],[0xfe70,0xfeff],[0x900,0x97f],[0x1e00,0x1eff],[0x3040,0x30ff],[0xac00,0xae00],[0x4e00,0x4f00]];
 const chars=ranges.flatMap(([lo,hi])=>Array.from({length:hi-lo+1},(_,i)=>String.fromCodePoint(lo+i))).filter(c=>!/[\s\p{Cc}\p{Cf}\p{Zs}\p{Zl}\p{Zp}]/u.test(c));
 assert.equal(chars.length,3557);
 const unassigned=chars.filter(c=>/\p{Cn}/u.test(c)).map(c=>'U+'+c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0'));
 const t=await openPage(ctx.browser,{contextOptions:{reducedMotion:'reduce'}});
 try{
  await t.page.goto(ctx.base+'/?lang=de&anim=4k');await t.page.waitForFunction(()=>Dream.state.mode==='still'||Dream.state.error);
  const results=await t.page.evaluate(probes=>probes.map(p=>{const start=performance.now(),missing=Dream.i18n.missing(p.text);return {code:p.code,missing,ms:performance.now()-start};}),probes);
  for(const [i,r] of results.entries()){assert.deepEqual(r.missing,[],r.code+' probe false positive');assert.ok(r.ms<(i===0?250:50),r.code+' probe took '+r.ms+'ms');}
  assert.deepEqual(await t.page.evaluate(()=>Dream.i18n.missing('\uE000\uFDD1\u{10FFFE}')),['U+E000','U+FDD1','U+10FFFE']);
  const flagged=await t.page.evaluate(text=>Dream.i18n.missing(text),chars.join(''));
  const missed=unassigned.filter(cp=>!flagged.includes(cp));assert.deepEqual(missed,[],'cell clip hid unassigned code points');
  await t.page.evaluate(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='2d'?null:get.call(this,kind,...args);};});
  assert.deepEqual(await t.page.evaluate(()=>Dream.i18n.missing('\u{10FFFF}Z')),[],'missing 2D context must fail open');
  ctx.info('14 fixed probes, 3 controls, '+chars.length+' code points / '+unassigned.length+' unassigned detected');
 }finally{await t.close();}
}
