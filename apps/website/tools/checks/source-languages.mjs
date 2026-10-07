import fs from 'node:fs';
import path from 'node:path';
export async function run({browser,base,artifact,ok,dist}){
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']}),page=await context.newPage();
 try{
  await page.goto(base+'/?lang=en&anim=4k');await page.locator('#source-entry').waitFor({state:'visible'});await page.locator('#source-entry').click();await page.locator('.code-view[open]').waitFor();
  ok('English source panel uses translated question',await page.getByRole('heading',{name:'How small is that?'}).isVisible());
  const expected=[['en','How small is that?'],['fi','Kuinka pieni se on?'],['ar','ما مدى صغر ذلك؟']];
  for(const [lang,title] of expected){
   await page.keyboard.press('Escape');await page.locator('#lang').click();await page.locator('#langsheet [role=option][lang="'+lang+'"]').click();await page.locator('#source-entry').click();await page.locator('.code-view[open]').waitFor();
   ok(lang+' source title is translated',await page.getByRole('heading',{name:title,exact:true}).isVisible());
   ok(lang+' source stays left-to-right',await page.locator('.cv-code').getAttribute('dir')==='ltr');
   await page.locator('#cv-copy').click();ok(lang+' translation preserves exact code clipboard',await page.evaluate(()=>navigator.clipboard.readText())===fs.readFileSync(path.join(dist,'p/4k.js'),'utf8'));
   await page.locator('#cv-size').click();await page.locator('.code-comparison[open]').waitFor();await page.locator('.cc-sources summary').click();
   if(lang==='en')ok('Translated sources do not claim to be German originals',await page.locator('.cc-original').textContent()==='Source information');
   ok(lang+' comparison explanation has no German fallback',await page.locator('.code-comparison').innerText().then(text=>!/(Quelle:|Eigene Rechnung|Die Animation ist|Schätzungen|Spanne etwa)/.test(text.replace(/Eigene Rechnung/g,''))));
   await page.screenshot({path:path.join(artifact,'source-'+lang+'-comparison.png')});await page.keyboard.press('Escape');
  }
  await page.keyboard.press('Escape');await page.locator('#lang').click();const offers=await page.locator('#langsheet [role=option]').evaluateAll(els=>els.map(e=>({code:e.lang,name:e.textContent})));
  ok('All 47 existing language offers remain available',offers.length===47);await page.keyboard.press('Escape');
  for(const {code} of offers){
   await page.locator('#lang').click();await page.locator('#langsheet [role=option][lang="'+code+'"]').click();
   await page.locator('#langsheet').waitFor({state:'hidden'});
   for(const width of [320,390,600]){
    await page.setViewportSize({width,height:844});
    const geometry=await page.evaluate(()=>{
     const source=document.querySelector('#source-entry'),replay=document.querySelector('#play'),a=source.getBoundingClientRect(),b=replay.getBoundingClientRect();
     const hit=n=>{const r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button,a')===n;};
     return {separate:Math.min(a.right,b.right)<=Math.max(a.left,b.left)||Math.min(a.bottom,b.bottom)<=Math.max(a.top,b.top),touch:a.height>=44&&b.height>=44&&a.width>=44&&b.width>=44,within:a.left>=0&&a.right<=innerWidth&&b.left>=0&&b.right<=innerWidth,hits:hit(source)&&hit(replay)};
    });
    ok(code+' '+width+'px source and Replay each retain their own accessible 44px tap area',geometry.separate&&geometry.touch&&geometry.within&&geometry.hits);
    if(code==='it'&&width===320)await page.screenshot({path:path.join(artifact,'source-replay-phone-it.png')});
   }
   await page.setViewportSize({width:1440,height:900});
  }
  await page.locator('#lang').click();await page.locator('#langsheet [role=option][lang="it"]').click();await page.setViewportSize({width:320,height:844});
  await page.locator('#play').click();await page.waitForTimeout(150);
  ok('Narrow-phone Replay starts the animation without opening Quelltext',!await page.locator('.code-view[open]').count()&&!await page.locator('#play').isVisible());
  await page.goto(base+'/?lang=de&anim=4k');await page.setViewportSize({width:1440,height:900});
  for(const {code} of offers){
   await page.locator('#lang').click();await page.locator('#langsheet [role=option][lang="'+code+'"]').click();await page.locator('#source-entry').click();await page.locator('.code-view[open]').waitFor();
   const labels=await page.locator('.code-view [data-cv], #cv-close').evaluateAll(els=>els.map(e=>e.dataset.cv?e.textContent:e.getAttribute('aria-label')));
   ok(code+' all source actions and explanations remain accessible',labels.every(s=>typeof s==='string'&&s.trim().length>0));
   if(code!=='de')ok(code+' source title does not fall back to German',await page.locator('#cv-title').textContent()!=='Wie klein ist das?');
   const seen=new Set();
   for(const sample of [0,.6,.99]){
    // Randomness is controlled only in this isolated comparison fixture.
    await page.evaluate(value=>{window.sourceFixtureRandom=Math.random;Math.random=()=>value;},sample);
    await page.locator('#cv-size').click();await page.locator('.code-comparison[open]').waitFor();
    await page.evaluate(()=>{Math.random=window.sourceFixtureRandom;delete window.sourceFixtureRandom;});
    await page.locator('.cc-sources summary').click();
    for(const label of await page.locator('.comparison-row h4').allTextContents())seen.add(label);
    const prose=await page.locator('.comparison-row h4,.cc-source,.cc-range,.cc-sources section section p:nth-child(2)').allTextContents();
    ok(code+' comparison explanations are nonempty',prose.every(s=>s.trim().length>0));
    if(code!=='de')ok(code+' comparison prose does not fall back to German',prose.every(s=>!/(Quelle:|Die Seite|Spanne etwa|Ein GitHub|Das Skript|Ein ProRAW|Quelle: Wikipedia|Eine Stunde YouTube|Die alte Startseite|Die Startseite nennt)/.test(s)));
    await page.keyboard.press('Escape');
   }
   ok(code+' all eight comparison labels are readable and distinct',seen.size===8);
   await page.keyboard.press('Escape');
  }
 }finally{await context.close();}
}
