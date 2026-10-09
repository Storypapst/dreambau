#!/usr/bin/env node
// Public-page regressions under real nginx; browser GPU calls measure work, not private runtime functions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ROOT,launch} from './lib.mjs';
import {serveNginx} from './lib-nginx.mjs';
const server=await serveNginx(ROOT+'/dist/apex'),browser=await launch({autoplay:false}),results=[];
let failed=0;
const check=(name,fn)=>{try{fn();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}};
try {
 for(const id of ['4k','16k','64k']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  try{
   const page=await context.newPage();await page.addInitScript(()=>{window.gpuDraws=0;const p=WebGL2RenderingContext.prototype;for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){const original=p[name];p[name]=function(...args){window.gpuDraws++;return original.apply(this,args);};}});
   await page.goto(server.base+'/?anim='+id+'&ctx=1&px=1000&lang=de');await page.waitForFunction(()=>window.Dream?.state.mode==='play');
   const sample=()=>page.evaluate(()=>({draws:window.gpuDraws,T:window.Dream.state.T}));
   await page.locator('#site-menu summary').click();await page.waitForTimeout(100);const menuStart=await sample();await page.waitForTimeout(500);const menuEnd=await sample();
   check(id+' menu pauses background picture',()=>assert.equal(menuEnd.draws,menuStart.draws));
   await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('site-menu').open);await page.waitForFunction(n=>window.gpuDraws>n,menuEnd.draws);const resumed=await sample();check(id+' closing menu resumes picture',()=>assert.ok(resumed.draws>menuEnd.draws));
   // Visibility is a browser/system boundary; simulate its event, without replacing application collaborators.
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
   const hiddenStart=await sample();await page.waitForTimeout(300);const hiddenEnd=await sample();
   check(id+' hidden page stops GPU work and clock',()=>assert.deepEqual(hiddenEnd,hiddenStart));
   await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
   await page.waitForTimeout(200);const visible=await sample();check(id+' visible page resumes at its paused time',()=>assert.ok(visible.draws>hiddenEnd.draws && visible.T-hiddenEnd.T<.5));
   await page.keyboard.press('Escape');await page.waitForTimeout(700);const skipped=await sample();await page.waitForTimeout(500);const settled=await sample();
   check(id+' skip retains final frame without repeated GPU work',()=>assert.equal(settled.draws,skipped.draws));
   check(id+' final text and contact remain available',()=>assert.ok(settled.T>=53));
   await page.setViewportSize({width:844,height:390});await page.waitForTimeout(100);const rotated=await sample();check(id+' rotation redraws settled picture',()=>assert.ok(rotated.draws>settled.draws));await page.waitForTimeout(300);const afterRotate=await sample();check(id+' rotation does not restart loop',()=>assert.equal(afterRotate.draws,rotated.draws));
   results.push({id,menuDraws:menuEnd.draws-menuStart.draws,resumedDraws:resumed.draws-menuEnd.draws,settledDraws:settled.draws-skipped.draws,settledTime:settled.T});
   // Browser time is a system boundary: accelerate normal autoplay-blocked playback, not the manual seek API.
   await page.addInitScript(()=>{localStorage.setItem('dreambau.sound','off');window.AudioContext=undefined;window.webkitAudioContext=undefined;});
   await page.reload();await page.waitForFunction(()=>window.Dream?.state.mode==='play');
   await page.clock.install();
   for(let step=0;step<100;step++){await page.clock.fastForward(2000);await page.clock.runFor(20);if((await sample()).T===62.5)break;}
   const end=await sample();await page.clock.fastForward(2000);const quiet=await sample();
   check(id+' natural ending keeps full show and music tail',()=>assert.equal(end.T,62.5));
   check(id+' natural ending stops repeated GPU work',()=>assert.equal(quiet.draws,end.draws));
   results[results.length-1].naturalTime=end.T;results[results.length-1].naturalIdleDraws=quiet.draws-end.draws;

  }finally{await context.close();}
 }
 // Source view dependencies cross the browser HTTP boundary and are independent of each other.
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 try{
  const page=await context.newPage(),requests=[];const dependency=/\/(?:p\/(?:4k|16k|64k)\.src\.js|source-facts\.js|comparisons\.js|source-locales\.js|source-view\.css)$/;
  await page.addInitScript(()=>{window.previewCopies=0;const original=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.id==='cv-preview')window.previewCopies++;return original.apply(this,args);};});
  page.on('request',r=>{if(dependency.test(new URL(r.url()).pathname))requests.push({file:new URL(r.url()).pathname,start:Date.now()});});
  await page.route('**/homepage-assets/**',async route=>{if(dependency.test(new URL(route.request().url()).pathname))await new Promise(r=>setTimeout(r,100));await route.continue();});
  await page.goto(server.base+'/?anim=4k&ctx=1&px=1000&lang=de');await page.waitForFunction(()=>window.Dream?.state.mode==='play');
  await page.locator('#source-entry').click();await page.locator('.code-view[open]').waitFor();
  const spread=Math.max(...requests.map(r=>r.start))-Math.min(...requests.map(r=>r.start));
  check('Source opens with all seven independent dependencies concurrently',()=>assert.ok(requests.length===7&&spread<100,'requests='+requests.length+',spread='+spread+'ms'));
  await page.locator('#cv-scale-tab').click();await page.waitForTimeout(100);const hiddenCopies=await page.evaluate(()=>window.previewCopies),progress=await page.locator('.cv-progress').evaluate(el=>el.value);await page.waitForTimeout(300);const afterScale=await page.evaluate(()=>window.previewCopies);
  check('Scale view does not copy the hidden picture',()=>assert.equal(afterScale,hiddenCopies));
  const afterProgress=await page.locator('.cv-progress').evaluate(el=>el.value);check('Scale view keeps source progress live',()=>assert.ok(afterProgress>progress));
  await page.locator('#cv-picture-tab').click();await page.waitForTimeout(200);const restored=await page.evaluate(()=>window.previewCopies);check('Picture tab restores live preview',()=>assert.ok(restored>afterScale));
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);const phoneCopies=await page.evaluate(()=>window.previewCopies);await page.waitForTimeout(300);const phoneEnd=await page.evaluate(()=>window.previewCopies);check('Phone source text does not copy its hidden picture',()=>assert.equal(phoneEnd,phoneCopies));
  results.push({sourceDependencies:requests.map(r=>({file:r.file,startMs:r.start-requests[0].start})),spreadMs:spread,hiddenPreviewCopies:afterScale-hiddenCopies,phoneHiddenCopies:phoneEnd-phoneCopies});
 }finally{await context.close();}
}finally{await browser.close();server.stop();if(process.env.PERFORMANCE_RESULT)fs.writeFileSync(process.env.PERFORMANCE_RESULT,JSON.stringify({rendering:'Chromium SwiftShader,390x844,1000-pixel draw budget;500ms samples',results},null,2));}
process.exitCode=failed?1:0;
