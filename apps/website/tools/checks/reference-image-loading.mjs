// A slow screenshot must reserve its real aspect ratio instead of moving the story.
export async function run({browser,base,ok}){
 for(const [id,file,ratio] of [['eeloy','eeloy-01.webp',1439/900],['wespro','wespro-08.webp',989/900]]){
  const context=await browser.newContext({viewport:{width:820,height:1180},reducedMotion:'reduce'});
  let release;const pending=new Promise(resolve=>release=resolve);
  try{
   await context.route('**/reference-portfolio/**',async route=>{await pending;await route.continue().catch(()=>{});});
   const page=await context.newPage();
   await page.goto(base+'/referenzen/#'+id,{waitUntil:'domcontentloaded'});
   const image=page.locator('#cs .case-study img[src$="'+file+'"]');
   await image.waitFor({state:'attached'});
   await image.evaluate(n=>{n.loading='eager';n.scrollIntoView({block:'center'});});
   const before=await image.boundingBox();
   ok('stories: '+file+' reserves its source aspect ratio before loading',before.height>100&&Math.abs(before.width/before.height-ratio)<.01);
   release();await image.evaluate(n=>n.decode());
   const after=await image.boundingBox();
   ok('stories: '+file+' loading does not change image dimensions',Math.abs(before.height-after.height)<1&&Math.abs(before.width-after.width)<1);
  }finally{release();await context.close();}
 }
}
