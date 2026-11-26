import path from 'node:path';
import {run as runImageLoading} from './reference-image-loading.mjs';

// Catches missing narrative content in either rendering path, lost source images,
// a strip that leaves screenshots unreadable on a phone, and an image dialog that traps the visitor.
const narrative=s=>s.replace(/[‹›]/g,'').replace(/\s+/g,' ').trim(); // strip buttons only work with JavaScript
export async function run({browser,base,artifact,ok}) {
 const ids=[['sf-care',10],['eeloy',9],['wespro',8],['getme',6]];
 const enhanced=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:'reduce'});
 const plain=await browser.newContext({viewport:{width:390,height:844},javaScriptEnabled:false});
 try {
  const page=await enhanced.newPage(),fallback=await plain.newPage();
  await fallback.goto(base+'/referenzen/');
  for(const [id,count] of ids){
   await page.goto(base+'/referenzen/#'+id);
   await page.locator('#cs.on').waitFor();
   const story=page.locator('#cs .case-study'),staticStory=fallback.locator('#'+id+' .case-study');
   ok('stories: '+id+' opens a complete German project story',await story.count()===1 && await story.getAttribute('lang')==='de');
   ok('stories: '+id+' does not label a German project as English',await page.locator('.nd[data-id="'+id+'"] .en').count()===0);
   ok('stories: '+id+' preserves source and has a clear brief, role and implementation',await story.locator('h3').count()>=3 && (await story.innerText()).includes('Originaltext · EN'));
   ok('stories: '+id+' has the same narrative without JavaScript',narrative(await story.innerText())===narrative(await staticStory.innerText()));
   ok('stories: '+id+' retains every distinct screenshot in the scroll strips',await story.locator('.pv-strip img').count()===count && await staticStory.locator('.pv-strip img').count()===count);
   const sizes=await story.locator('.pv-strip figure').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().width));
   ok('stories: '+id+' uses readable image widths on a phone',sizes.length===count&&sizes.every(w=>w>=280));
   ok('stories: '+id+' captions every screenshot',await story.locator('.pv-strip figcaption').count()===count);
   ok('stories: '+id+' images carry their real width and height',await story.locator('.pv-strip img').evaluateAll(ns=>ns.every(n=>+n.getAttribute('width')>0&&+n.getAttribute('height')>0)));
   await story.locator('.pv-strip img').evaluateAll(async ns=>{ns.forEach(n=>n.loading='eager');await Promise.all(ns.map(n=>n.decode()));});
   ok('stories: '+id+' images all load without cropping',await story.locator('.pv-strip img').evaluateAll(ns=>ns.every(n=>n.naturalWidth>0&&n.naturalWidth===+n.getAttribute('width')&&getComputedStyle(n).objectFit==='contain')));
   await story.locator('.case-tools').scrollIntoViewIfNeeded();
   ok('stories: '+id+' last section is reachable',await story.locator('.case-tools').isVisible()&&await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
  }
  ok('stories: Getme keeps its four linked videos',await page.locator('#cs .case-study .pv-vl a').count()===4);
  await page.screenshot({path:path.join(artifact,'reference-story-phone-end.png')});
  const strip=page.locator('#cs .case-study .pv-strip').first();
  await strip.scrollIntoViewIfNeeded();
  await page.locator('#cs .case-study .pv-strip-w').first().locator('[data-strip="1"]').click();
  await page.waitForTimeout(150);
  ok('stories: the strip buttons move to the next screenshot',await strip.evaluate(n=>Math.abs(n.scrollLeft)>100));
  await strip.evaluate(n=>{n.scrollLeft=0;});
  await page.locator('#cs .pv-zoom').first().click();
  ok('stories: a screenshot opens an image dialog instead of leaving the project',await page.locator('dialog#reference-image[open]').count()===1&&new URL(page.url()).pathname==='/referenzen/');
  ok('stories: the image dialog repeats the caption',(await page.locator('#reference-image-caption').innerText()).length>10);
  await page.locator('#reference-image img').evaluate(n=>n.decode());
  await page.screenshot({path:path.join(artifact,'reference-image-dialog-phone.png')});
  await page.getByRole('button',{name:'Originalgröße'}).click();
  ok('stories: original-size screenshots can be inspected beyond the phone width',await page.locator('#reference-image img').evaluate(n=>n.getBoundingClientRect().width>n.parentElement.clientWidth));
  await page.keyboard.press('Escape');
  ok('stories: Escape closes the image first and restores its opener',await page.locator('#cs.on').isVisible()&&!await page.locator('#reference-image').isVisible()&&await page.locator('#cs .pv-zoom').first().evaluate(n=>n===document.activeElement));
  await page.keyboard.press('Escape');
  await page.locator('#cs').waitFor({state:'hidden'});
  ok('stories: a second Escape closes the project',new URL(page.url()).hash==='');
 }finally{await enhanced.close();await plain.close();}
 await runImageLoading({browser,base,ok});
}
