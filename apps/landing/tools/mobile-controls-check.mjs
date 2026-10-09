#!/usr/bin/env node
// Issue153: public behaviour through the approved real-nginx/browser seam.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launch } from './lib.mjs';
import { serveNginx } from './lib-nginx.mjs';
const fixture=await serveNginx(ROOT+'/dist/apex');
let browser;
const output=process.env.EVIDENCE_DIR;
const capture=async(page,name)=>{if(output)await page.screenshot({path:path.join(output,name+'.png')});};
if(output)fs.mkdirSync(output,{recursive:true});
async function home(viewport, options={},query=""){
 const context=await browser.newContext({viewport,locale:'de-DE',...options});const page=await context.newPage();page.setDefaultTimeout(5000);
 await page.goto(fixture.base+'/?anim=4k&sound=off'+query,{waitUntil:'load'});
 if(options.javaScriptEnabled!==false)await page.waitForFunction(()=>document.documentElement.classList.contains('ready'));
 return {context,page};
}
try{
 browser=await launch();
 const {context,page}=await home({width:390,height:844},{reducedMotion:'reduce',hasTouch:true});
 const boxes=await page.locator('#site-menu summary,#source-entry,#snd').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {y:r.y,bottom:r.bottom,w:r.width,h:r.height};}));
 assert(boxes.every(r=>r.y>740&&r.bottom<=828&&r.w>=44&&r.h>=44),'153: all phone controls occupy the bottom capsule');
 console.log('PASS153 phone bottom capsule');
 const footer=await page.locator('#cta').boundingBox();assert(footer.y+footer.height<boxes[0].y,'153 contact footer stays above capsule');
 await capture(page,'phone-controls-390x844');
 await page.locator('#site-menu summary').click();
 const menu=page.locator('#site-menu nav');const box=await menu.boundingBox();
 assert.equal(box.x,16,'153 menu left margin');assert.equal(box.width,358,'153 menu right margin');assert.equal(box.height,556,'153 approved sheet footprint');assert.equal(box.y+box.height,828,'153 menu bottom margin');
 const first=await page.getByRole('link',{name:'Startseite',exact:true}).evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);return {x:r.getBoundingClientRect().x};});assert(first.x>=64,'153 B2 text has 32px row inset');
 console.log('PASS153 approved B2 sheet geometry');
 await capture(page,'phone-menu-390x844');
 await page.locator('.menu-links .pending').last().scrollIntoViewIfNeeded();
 const reach=await page.locator('#site-menu nav').evaluate(nav=>{const last=nav.querySelector('.menu-links').lastElementChild.getBoundingClientRect(),list=nav.querySelector('.menu-links').getBoundingClientRect(),footer=nav.querySelector('.menu-close').getBoundingClientRect();return {last:{top:last.top,bottom:last.bottom},list:{top:list.top,bottom:list.bottom},footer:{top:footer.top,bottom:footer.bottom}};});
 assert(reach.last.top>=reach.list.top&&reach.last.bottom<=reach.list.bottom&&reach.last.bottom<reach.footer.top,'153 last menu row scrolls fully above the close footer');
 if(output)fs.writeFileSync(path.join(output,'last-row-reachability.json'),JSON.stringify(reach,null,2)+'\n');
 await capture(page,'phone-menu-scrolled-390x844');
 const grip=page.getByRole('button',{name:'Menü herunterziehen oder schließen'});const handle=await grip.boundingBox();
 await page.mouse.move(handle.x+handle.width/2,handle.y+22);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2,handle.y+122,{steps:6});await page.mouse.up();
 await page.waitForFunction(()=>!document.getElementById('site-menu').open,null,{timeout:2000});
 assert(await page.locator('#site-menu summary').evaluate(el=>el===document.activeElement),'153 drag restores opener focus');
 console.log('PASS153 grip drag dismisses');
 await page.locator('#source-entry').click();
 await page.getByRole('dialog',{name:'Wie klein ist das?'}).waitFor();
 const sourceClose=page.getByRole('button',{name:'Schließen',exact:true});
 assert.equal(await sourceClose.innerText(),'Schließen','153 source close is labelled, not a tiny cross');
 const sourceBox=await sourceClose.boundingBox();assert(sourceBox.y>740&&sourceBox.height>=44,'153 source close lives at bottom with44px target');
 await capture(page,'phone-source-390x844');
 assert.equal(await page.locator('#cv-close').isVisible(),false,'153 tiny source cross is absent on phone');
 for(const viewport of [{width:844,height:390},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  await page.waitForFunction(()=>document.querySelector('.code-view').classList.contains('cv-stack')===(innerHeight>=innerWidth||innerWidth<760));
  assert.equal(await page.locator('#cv-close').isVisible(),false,'153 phone rotation keeps the tiny source cross absent');
  assert(await sourceClose.isVisible(),'153 phone rotation retains the labelled bottom close');
  const rotatedClose=await sourceClose.boundingBox();assert(rotatedClose.height>=44&&rotatedClose.y+rotatedClose.height<=viewport.height,'153 rotated source close remains reachable with44px target');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'153 rotated source view has no horizontal overflow');
  await capture(page,'phone-source-rotated-'+viewport.width+'x'+viewport.height);
 }
 console.log('PASS153 source close survives portrait-landscape-portrait rotation');
 await sourceClose.click();await page.waitForFunction(()=>!document.querySelector('.code-view').open);
 assert(await page.locator('#source-entry').evaluate(el=>el===document.activeElement),'153 source close restores opener focus');
 console.log('PASS153 labelled source close');
 await context.close();
 // Normal-motion gestures use real browser input, including a cancelled touch.
 const moving=await home({width:390,height:844},{hasTouch:true,...(output?{recordVideo:{dir:path.join(output,'gesture-video'),size:{width:390,height:844}}}:{})});
 const m=moving.page;await m.locator('#site-menu summary').click();await m.waitForTimeout(300);await m.waitForFunction(()=>Math.abs(document.querySelector('#site-menu nav').getBoundingClientRect().y-272)<1);
 const mg=m.locator('.menu-grip');const mb=await mg.boundingBox(),x=mb.x+mb.width/2,y=mb.y+22;
 const cdp=await moving.context.newCDPSession(m);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+100}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await m.waitForTimeout(280);await m.waitForFunction(()=>Math.abs(document.querySelector('#site-menu nav').getBoundingClientRect().y-272)<1);
 assert(await m.locator('#site-menu').evaluate(el=>el.open),'153 cancelled touch keeps menu open');
 assert.equal(Math.round((await m.locator('#site-menu nav').boundingBox()).y),272,'153 cancelled touch returns to original position');
 await m.mouse.move(x,y);await m.mouse.down();await m.mouse.move(x,y+12,{steps:4});await m.mouse.up();await m.waitForTimeout(280);await m.waitForFunction(()=>Math.abs(document.querySelector('#site-menu nav').getBoundingClientRect().y-272)<1);
 assert(await m.locator('#site-menu').evaluate(el=>el.open),'153 small drag snaps back');
 await mg.focus();await m.keyboard.press('Shift+Tab');assert(await m.locator('.menu-close').evaluate(el=>el===document.activeElement),'153 reverse Tab stays in menu');
 await m.keyboard.press('Tab');assert(await mg.evaluate(el=>el===document.activeElement),'153 Tab returns to grip');
 await m.keyboard.press('Escape');await m.waitForFunction(()=>!document.getElementById('site-menu').open);
 assert(await m.locator('#site-menu summary').evaluate(el=>el===document.activeElement),'153 Escape returns focus');
 await m.locator('#site-menu summary').click();await m.waitForTimeout(300);await m.waitForFunction(()=>Math.abs(document.querySelector('#site-menu nav').getBoundingClientRect().y-272)<1);
 await m.mouse.move(x,y);await m.mouse.down();await m.mouse.move(x,y+120,{steps:8});await m.mouse.up();
 await m.waitForFunction(()=>!document.getElementById('site-menu').open);
 await m.locator('#site-menu summary').click();await m.waitForTimeout(300);await m.waitForFunction(()=>Math.abs(document.querySelector('#site-menu nav').getBoundingClientRect().y-272)<1);await mg.click();await m.waitForFunction(()=>!document.getElementById('site-menu').open);
 console.log('PASS153 normal-motion drag, cancel, small pull, grip tap, keyboard and Escape');
 await cdp.detach();await moving.context.close();
 // Actual long/RTL languages at a narrow width, and rotation while the sheet is open.
 for(const language of ['is','ar']){
  const narrow=await home({width:320,height:740},{reducedMotion:'reduce',hasTouch:true},'&lang='+language);
  const n=narrow.page;await n.waitForFunction(lang=>document.documentElement.lang===lang,language);
  const fits=await n.locator('#site-menu summary,#source-entry,#snd').evaluateAll(els=>els.every(e=>{const r=e.getBoundingClientRect();return r.x>=16&&r.right<=innerWidth-16&&r.height>=44&&r.width>=44;}));
  assert(fits,'153 '+language+' controls fit narrow phone');assert(await n.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'153 no horizontal overflow');
  await n.locator('#site-menu summary').click();await n.setViewportSize({width:740,height:320});
  const r=await n.locator('#site-menu nav').boundingBox();assert(r.x>=16&&r.y>=16&&r.x+r.width<=724&&r.y+r.height<=304,'153 rotated sheet stays inside16px edges');
  await narrow.context.close();
 }
 console.log('PASS153 long/RTL narrow controls and rotation');
 for(const viewport of [{width:820,height:1180},{width:1440,height:900}]){
  const wide=await home(viewport,{reducedMotion:'reduce'});const w=wide.page;
  const tops=await w.locator('#site-menu summary,#source-entry,#snd').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().top));assert(tops.every(t=>t===12),'153 desktop/tablet control positions unchanged');
  await w.locator('#site-menu summary').click();const wb=await w.locator('#site-menu nav').boundingBox();assert.equal(wb.width,340,'153 wide menu width unchanged');await capture(w,'menu-'+viewport.width+'x'+viewport.height);await w.keyboard.press('Escape');
  if(viewport.width===1440){await w.locator('#source-entry').click();await w.getByRole('dialog',{name:'Wie klein ist das?'}).waitFor();assert(await w.locator('#cv-close').isVisible(),'153 desktop source header close remains visible');assert.equal(await w.locator('#cv-close-bottom').isVisible(),false,'153 desktop source close policy remains unchanged');await w.locator('#cv-close').click();}
  await wide.context.close();
 }
 console.log('PASS153 tablet/desktop unchanged');
 const plain=await home({width:390,height:844},{javaScriptEnabled:false});await plain.page.locator('#site-menu summary').click();
 assert(await plain.page.getByRole('link',{name:'Referenzen',exact:true}).isVisible(),'153 no-JS menu links remain available');assert.equal(await plain.page.locator('.menu-close').isVisible(),false,'153 no-JS hides the script-only close action');await plain.context.close();
 console.log('PASS153 no-JS native navigation');
}finally{await browser?.close();fixture.stop();}
