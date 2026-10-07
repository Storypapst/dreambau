import {check,run} from '../lib/check.mjs';import {launchBrowser,openObserved} from '../lib/browser.mjs';import {startPageServer} from '../lib/page-server.mjs';
let browser,server;
try{await run(async()=>{
 browser=await launchBrowser();server=await startPageServer();
 for(const [width,height,limit] of [[1280,720,4],[1920,1080,6]]){
  const {context,page}=await openObserved(browser,{viewport:{width,height}});
  await context.addInitScript(()=>{
   window.__redraws=[];window.__clears=0;
   const clear=CanvasRenderingContext2D.prototype.clearRect;
   CanvasRenderingContext2D.prototype.clearRect=function(...args){window.__clears++;return clear.apply(this,args);};
   const raf=window.requestAnimationFrame.bind(window);
   window.requestAnimationFrame=(callback)=>raf((time)=>{const before=window.__clears,start=performance.now();callback(time);if(window.__clears>before)window.__redraws.push(performance.now()-start);});
  });
  const start=Date.now();await page.goto(server.url);await page.locator('.tile').last().waitFor();const loadMs=Date.now()-start;
  check('C49 last tile is visible within 1500ms '+width,loadMs<=1500,String(loadMs));
  await page.waitForFunction(()=>window.__redraws.length>=40);
  const timing=await page.evaluate(()=>({mean:window.__redraws.slice(-40).reduce((a,b)=>a+b,0)/40,clears:window.__clears}));check('C49 forty measured redraws average within '+limit+'ms '+width,timing.mean<=limit,JSON.stringify(timing));
  const begin=await page.evaluate(()=>window.__clears);await new Promise((r)=>setTimeout(r,2000));const drawn=await page.evaluate(()=>window.__clears)-begin;check('C42 normal canvas draws at most forty times over two seconds '+width,drawn<=40&&drawn>0,String(drawn));
  if(width===1280){
   const brightness=[];const started=Date.now();
   for(let i=0;i<51;i++){
    await new Promise((r)=>setTimeout(r,Math.max(0,started+i*200-Date.now())));
    const encoded=(await page.screenshot()).toString('base64');
    brightness.push(await page.evaluate(async(base64)=>{
      const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));const canvas=new OffscreenCanvas(160,90),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,160,90);image.close();const data=ctx.getImageData(0,0,160,90).data;let sum=0;for(let p=0;p<data.length;p+=4)sum+=(.2126*data[p]+.7152*data[p+1]+.0722*data[p+2])/255;return sum/(160*90);
    },encoded));
   }
   const largest=Math.max(...brightness.slice(1).map((b,i)=>Math.abs(b-brightness[i])));check('C50 mean screenshot luminance changes less than 3 percent every 200ms over ten seconds',largest<.03,String(largest));
  }
  await context.close();
 }
});}finally{if(browser)await browser.close();if(server)await server.stop();}
