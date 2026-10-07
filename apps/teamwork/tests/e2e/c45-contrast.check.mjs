import {check,run} from '../lib/check.mjs';import {launchBrowser,openObserved} from '../lib/browser.mjs';import {startPageServer} from '../lib/page-server.mjs';
let browser,server;
try{await run(async()=>{
 browser=await launchBrowser();server=await startPageServer();
 for(const width of [1280,390])for(const unknown of [false,true]){
  const {context,page}=await openObserved(browser,{viewport:{width,height:844},reducedMotion:'reduce'});
  if(unknown)await context.route('**/teamwork/data/status.json',route=>route.fulfill({status:200,contentType:'application/json',body:'null'}));
  await page.goto(server.url);await page.locator('.tile').first().waitFor();await new Promise((r)=>setTimeout(r,200));
  const samples=await page.evaluate(()=>{
   const selectors='.nm,.ds,h1,h2,.kicker,#stand,#count,.hubn span,.zc,.legend li,.detail,.foot span,.privacy,#back,.banner,.resting,.unknown';
   const items=[...document.querySelectorAll(selectors)].filter((node)=>node.checkVisibility({checkVisibilityCSS:true})).map((node)=>{const r=node.getBoundingClientRect(),css=getComputedStyle(node);return {text:node.textContent.trim().slice(0,30),color:css.color,large:parseFloat(css.fontSize)>=24||(parseFloat(css.fontSize)>=18.66&&parseInt(css.fontWeight)>=700),x:r.left,y:r.top,width:r.width,height:r.height};});
   const sheet=[...document.styleSheets].find((s)=>s.href?.endsWith('teamwork.css'));sheet.insertRule(selectors+'{opacity:0!important}',sheet.cssRules.length);
   return items;
  });
  const image=(await page.screenshot({fullPage:true})).toString('base64');
  const measured=await page.evaluate(async({image,samples})=>{
   const bytes=Uint8Array.from(atob(image),c=>c.charCodeAt(0));const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'})),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
   const linear=(c)=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};const lum=(rgb)=>.2126*linear(rgb[0])+.7152*linear(rgb[1])+.0722*linear(rgb[2]);
   return samples.map((sample)=>{
    const x=Math.max(0,Math.floor(sample.x)),y=Math.max(0,Math.floor(sample.y)),w=Math.max(1,Math.min(canvas.width-x,Math.ceil(sample.width))),h=Math.max(1,Math.min(canvas.height-y,Math.ceil(sample.height)));const data=ctx.getImageData(x,y,w,h).data,pixels=[];for(let i=0;i<data.length;i+=4)pixels.push([data[i],data[i+1],data[i+2]]);pixels.sort((a,b)=>lum(b)-lum(a));const bright=pixels.slice(0,Math.max(1,Math.ceil(pixels.length*.1)));const bg=bright.reduce((sum,p)=>sum.map((v,i)=>v+p[i]/bright.length),[0,0,0]);const rgba=sample.color.match(/[\d.]+/g).map(Number),alpha=rgba[3]??1;const fg=rgba.slice(0,3).map((v,i)=>alpha*v+(1-alpha)*bg[i]);const ratio=(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05);return {text:sample.text,ratio,required:sample.large?3:4.5};
   });
  },{image,samples});
  const failed=measured.filter((s)=>s.ratio<s.required);check('C45 measured brightest-ten-percent screenshot contrast '+width+' unknown='+unknown,failed.length===0,JSON.stringify(failed));
  await context.close();
 }
});}finally{if(browser)await browser.close();if(server)await server.stop();}
