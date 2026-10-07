import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib.mjs';
import { openPage, started, problems } from './_helpers.mjs';
import { parseLangFile } from '../lib-languages.mjs';
export const rows=['VER-7','VER-8','VER-9b','VER-10','VER-11','VER-12','VER-13','VER-14','VER-15','VER-16','VER-17','VER-18','VER-19','VER-21','VER-22','VER-24','VER-25','VER-28'];
export default async function(ctx){
 let germanF;
 const de=await openPage(ctx.browser,{w:390,h:844,contextOptions:{reducedMotion:'reduce'}});
 try{await de.page.goto(ctx.base+'/?lang=de&anim=4k&test=1');await de.page.waitForFunction(()=>Dream.state.mode==='still'||Dream.state.error);germanF=await de.page.evaluate(()=>Dream.text.F);assert.ok(germanF>0);}finally{await de.close();}
 const codes=ctx.langs;
 for(const code of codes){
  const t=await openPage(ctx.browser,{w:390,h:844,contextOptions:{reducedMotion:'reduce'}});
  try{
   await t.page.goto(ctx.base+'/?lang='+code+'&anim=4k&test=1');await t.page.waitForFunction(()=>Dream.state.mode==='still'||Dream.state.error);
   const texts=parseLangFile(fs.readFileSync(path.join(ROOT,'site/i18n',code+'.js'),'utf8')).texts;
   const state=await t.page.evaluate(()=>({lang:Dream.state.lang,why:Dream.state.langFallback,F:Dream.text.F,dir:document.documentElement.dir}));
   if(state.lang!==code&&state.why==='glyphs'&&ctx.allowMissing){ctx.info('font limitation: '+code);continue;}
   assert.equal(state.lang,code,code+': '+JSON.stringify(state));assert.ok(state.F/germanF>=.8,code+': font ratio '+state.F/germanF);
   assert.equal(state.dir,['ar','he','fa','pa-Arab','ur'].includes(code)?'rtl':'ltr');
   assert.equal(await t.page.locator('#tag').getAttribute('data-lines'),texts['tag.1']+'|'+texts['tag.2']+'|dreambau.com');
   assert.equal(await t.page.locator('#blind').textContent(),await t.page.evaluate(()=>Dream.t('blind.4k')));
   assert.equal(await t.page.locator('#cta .words').textContent(),texts['cta.words']);
   assert.match(await t.page.evaluate(()=>Dream.i18n.format(24415.5)),/\d/);assert.equal(await t.page.evaluate(()=>/[٠-٩۰-۹]/.test(Dream.i18n.format(24415.5))),false);
   const ink=await t.page.evaluate(()=>{const m=Dream.text.mask,w=Dream.text.W,h=Dream.text.H;let min=999;for(let i=0;i<m.length;i++)if(m[i])min=Math.min(min,i%w,w-1-i%w,Math.floor(i/w),h-1-Math.floor(i/w));return min;});assert.ok(ink>=7,code+': ink margin '+ink);
   for(const {w,h} of ctx.sizes){await t.page.setViewportSize({width:w,height:h});await t.page.waitForTimeout(60);const layout=await t.page.evaluate(()=>{const r=document.querySelector('#cta').getBoundingClientRect();return {wide:document.documentElement.scrollWidth>innerWidth,left:r.left,right:r.right,top:r.top,height:innerHeight};});assert.equal(layout.wide,false,code+' '+w+' overflow');assert.ok(layout.left>=-1&&layout.right<=w+1,code+' contact outside '+w);assert.ok(layout.top>=h*.88-2,code+' contact above bottom12% '+w);}
   assert.equal(await t.page.evaluate(()=>document.cookie),'');assert.equal(await t.page.evaluate(()=>Object.keys(localStorage).filter(k=>k!=='dreambau.sound').length),0);
   const before=await t.page.evaluate(()=>({T:Dream.state.T,audio:Dream.state.audio,muted:Dream.state.muted}));
   await t.page.locator('#lang').click();assert.equal(await t.page.locator('#lang').getAttribute('aria-expanded'),'true');
   await t.page.locator('#langsheet [role=option][lang=de]').click();await t.page.waitForFunction(()=>Dream.state.lang==='de'&&document.querySelector('#langsheet').hidden);
   assert.equal(new URL(t.page.url()).searchParams.get('lang'),'de');
   const after=await t.page.evaluate(()=>({T:Dream.state.T,audio:Dream.state.audio,muted:Dream.state.muted}));assert.deepEqual(after,before,code+' switch changed animation/audio');
   const issues=await problems(t);assert.deepEqual(issues,[],code+': '+issues.join(';'));
  }finally{await t.close();}
 }
 // Browser list skips unsupported forms; URL preserves anim and reload restores selection.
 const t=await openPage(ctx.browser,{contextOptions:{locale:'en-GB',reducedMotion:'reduce'}});
 try{await t.page.goto(ctx.base+'/?anim=4k&test=1');await t.page.waitForFunction(()=>Dream.state.mode==='still'||Dream.state.error);assert.equal(await t.page.evaluate(()=>Dream.state.lang),'en');const switched=await t.page.evaluate(()=>Dream.setLang('ja'));if(!switched&&ctx.allowMissing){ctx.info('reload skipped: Japanese glyphs unavailable');return;}assert.equal(switched,true);await t.page.reload();await t.page.waitForFunction(()=>Dream.state.mode==='still'||Dream.state.error);assert.equal(await t.page.evaluate(()=>Dream.state.lang),'ja');assert.equal(new URL(t.page.url()).searchParams.get('anim'),'4k');}finally{await t.close();}
}
