// A slow screenshot must reserve its frame instead of moving the story, also for the one picture that is not 16:10.
export async function run({browser,base,ok}){
 for(const [id,file] of [['eeloy','eeloy-01.webp'],['wespro','wespro-08.webp']]){
  const context=await browser.newContext({viewport:{width:820,height:1180},reducedMotion:'reduce'});
  let release;const pending=new Promise(resolve=>release=resolve);
  try{
   await context.route('**/reference-portfolio/**',async route=>{await pending;await route.continue().catch(()=>{});});
   const page=await context.newPage();
   await page.goto(base+'/referenzen/#'+id,{waitUntil:'domcontentloaded'});
   const image=page.locator('#cs .case-study img[src$="'+file+'"]');
   await image.waitFor({state:'attached'});
   await image.evaluate(n=>{n.loading='eager';n.closest('figure').scrollIntoView({block:'center',inline:'center'});});
   const before=await image.boundingBox();
   ok('stories: '+file+' reserves the strip frame before loading',before.height>100&&Math.abs(before.width/before.height-1.6)<.01);
   release();await image.evaluate(n=>n.decode());
   const after=await image.boundingBox();
   ok('stories: '+file+' loading does not change image dimensions',Math.abs(before.height-after.height)<1&&Math.abs(before.width-after.width)<1);
   ok('stories: '+file+' is shown whole inside the frame',await image.evaluate(n=>getComputedStyle(n).objectFit==='contain'&&n.naturalWidth===+n.getAttribute('width')));
  }finally{release();await context.close();}
 }
}
