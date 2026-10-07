import fs from 'node:fs';
import path from 'node:path';
export async function run({browser,base,artifact,ok,dist}) {
 for(const [name,width,height] of [['desktop',1440,900],['tablet',820,1180],['phone',390,844]]){
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
 await page.goto(base+'/?lang=de&anim=4k');await page.locator('#source-entry').waitFor({state:'visible'});await page.locator('#source-entry').click();await page.locator('.code-view[open]').waitFor();
 ok(name+' selected B compact title',await page.getByRole('heading',{name:'Wie klein ist das?'}).isVisible());
 const source=await page.locator('.cv-source').boundingBox(),data=await page.locator('.cv-nums').boundingBox(),header=await page.locator('.cv-head').boundingBox();
 ok(name+' selected header height',header.height===(name==='desktop'?52:48));
 if(name==='desktop')ok('Desktop proportional source/data split',Math.abs(source.width/(width-source.width)-1.3)<.03);else ok(name+' measurements above listing',data.y+data.height<=source.y+2);
 const sourceText=fs.readFileSync(path.join(dist,'p/4k.js'),'utf8');
 ok(name+' reduced-motion full listing preserves shipped code',await page.locator('.cv-text').allTextContents().then(rows=>rows.join(''))===sourceText);
 await page.getByRole('button',{name:'Kopieren',exact:true}).click();ok(name+' clipboard copies exact shipped bytes',await page.evaluate(()=>navigator.clipboard.readText())===sourceText);
 if(name==='desktop'){
 await page.getByRole('button',{name:'Maßstab',exact:true}).click();ok('Desktop scale tab visibly replaces picture',await page.locator('#cv-scale-pane').isVisible()&&!await page.locator('#cv-picture-pane').isVisible());
 ok('All three measured animations have descriptions',await page.locator('.cv-animation').count()===3&&await page.locator('.cv-animation p').allTextContents().then(v=>v.every(s=>s.length>20)));
 await page.getByLabel('Alle drei Animationen').uncheck();ok('Scale selection changes from three to running animation',await page.locator('.cv-animation').count()===1);await page.getByLabel('Alle drei Animationen').check();
 await page.screenshot({path:path.join(artifact,name+'-source-scale.png')});await page.getByRole('button',{name:'Bild dazu',exact:true}).click();
 }else{
 ok(name+' four lower actions within reach',await page.locator('.cv-actions button').count()===4&&await page.locator('.cv-actions button').evaluateAll(els=>els.every(e=>e.getBoundingClientRect().height>=44)));
 await page.getByRole('button',{name:'Bild',exact:true}).click();ok(name+' picture action replaces listing',await page.locator('#cv-picture-pane').isVisible()&&!await page.locator('.cv-source').isVisible());await page.getByRole('button',{name:'Text',exact:true}).click();
 }
 ok(name+' picture retains a drawn animation frame after tab/action change',await page.locator('#cv-preview').evaluate(c=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let lit=0;for(let i=0;i<p.length;i+=4)if(p[i]+p[i+1]+p[i+2]>40)lit++;return lit>1000;}));
 await page.screenshot({path:path.join(artifact,name+'-source.png')});await page.locator('#cv-size').click();await page.locator('.code-comparison[open]').waitFor();
 const cards=await page.locator('.comparison-row').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width};}));ok(name+' three illustrated comparisons',cards.length===3&&await page.locator('.comparison-row svg').count()===3);
 ok(name+' comparison arrangement from B',name==='desktop'?Math.max(...cards.map(c=>c.y))-Math.min(...cards.map(c=>c.y))<2:cards[0].y<cards[1].y&&cards[1].y<cards[2].y);
 ok(name+' shared folded sources',await page.locator('.cc-sources').count()===1&&!await page.locator('.cc-sources').getAttribute('open'));
 await page.screenshot({path:path.join(artifact,name+'-source-comparison.png')});await page.keyboard.press('Escape');ok(name+' Escape closes top comparison and restores opener',!await page.locator('.code-comparison').isVisible()&&await page.locator('#cv-size').evaluate(e=>e===document.activeElement));
 await page.keyboard.press('Escape');ok(name+' Escape closes source and restores entry',!await page.locator('.code-view').isVisible()&&await page.locator('#source-entry').evaluate(e=>e===document.activeElement));ok(name+' source flow has no script errors',errors.length===0);
 }finally{await context.close();}
 }
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
 try{
 await page.goto(base+'/?lang=de&anim=4k&test=1');await page.waitForFunction(()=>!!window.Dream?.test);
 await page.evaluate(()=>window.Dream.test.seek(22));await page.locator('#source-entry').click();await page.locator('.code-view[open]').waitFor();
 await page.evaluate(()=>window.Dream.test.seek(28));ok('Running animation has current row and writing caret',await page.locator('.cv-row.cur').count()===1&&await page.locator('.cv-caret').count()===1);
 await page.getByRole('button',{name:'Mitlesen',exact:true}).click();ok('Mitlesen pause state is visible',await page.getByRole('button',{name:'Mitlesen',exact:true}).getAttribute('aria-pressed')==='false');
 await page.locator('.cv-code').evaluate(e=>{e.scrollTop=0;});const scroll=await page.locator('.cv-code').evaluate(e=>e.scrollTop);await page.evaluate(()=>window.Dream.test.seek(39));ok('Paused Mitlesen preserves user scroll while animation advances',Math.abs(await page.locator('.cv-code').evaluate(e=>e.scrollTop)-scroll)<2);
 await page.evaluate(()=>window.Dream.test.seek(54));const shipped=fs.readFileSync(path.join(dist,'p/4k.js'),'utf8');ok('Completed animation exposes entire exact listing without moving caret',await page.locator('.cv-text').allTextContents().then(rows=>rows.join(''))===shipped&&await page.locator('.cv-caret').count()===0);
 }finally{await context.close();}
 for(const id of ['16k','64k']){const context=await browser.newContext({viewport:{width:320,height:740},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']}),page=await context.newPage();try{
 await page.goto(base+'/?lang=de&anim='+id);await page.locator('#source-entry').waitFor({state:'visible'});await page.locator('#source-entry').click();await page.locator('.code-view[open]').waitFor();const shipped=fs.readFileSync(path.join(dist,'p/'+id+'.js'),'utf8');await page.getByRole('button',{name:'Kopieren',exact:true}).click();ok(id+' clipboard remains byte-exact on 320px screen',await page.evaluate(()=>navigator.clipboard.readText())===shipped);ok(id+' no horizontal page or source overflow',await page.locator('.code-view').evaluate(e=>e.scrollWidth<=e.clientWidth+1)&&await page.locator('.cv-code').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 }finally{await context.close();}}
 // Transient lazy-asset failures are public network-boundary fixtures.
 for(const asset of ['source-view.js','source-view.css','source-facts.js']){
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();let failed=false;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.route('**/'+asset,route=>{if(!failed){failed=true;return route.fulfill({status:404,body:'missing fixture asset'});}return route.continue();});
   await page.goto(base+'/?lang=en&anim=4k');await page.locator('#source-entry').click();
   await page.getByRole('button',{name:/Erneut versuchen/}).waitFor({state:'visible',timeout:3000});
   ok(asset+' load failure exposes a visible retry action and accessible status',await page.getByRole('button',{name:/Erneut versuchen/}).isVisible()&&(await page.getByRole('status').innerText()).includes('Quelltext konnte nicht geladen werden'));
   await page.getByRole('button',{name:/Erneut versuchen/}).click();await page.locator('.code-view[open]').waitFor();
   await page.keyboard.press('Escape');
   ok(asset+' successful retry restores the exact language label and clears stale failure',await page.getByRole('button',{name:/Source code/}).isVisible()&&await page.getByRole('status').innerText()===''&&!await page.locator('#source-entry').getAttribute('title'));
   ok(asset+' retry remains free of application errors',errors.length===0);
  }finally{await context.close();}
 }

}
