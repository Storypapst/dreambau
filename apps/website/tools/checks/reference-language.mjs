import path from 'node:path';

// The chosen language survives the way from the homepage menu to References and back,
// and "Ausgewählte Arbeiten" opens the matching project story.
export async function run({browser,base,artifact,ok}) {
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 try {
  await page.goto(base+'/?lang=en');
  await page.waitForFunction(()=>document.querySelector('#site-menu a[href="/referenzen/?lang=en"]'));
  ok('language: the homepage menu carries English to References and Glossary',await page.locator('#site-menu a[href="/glossar/?lang=en"]').count()===1&&await page.locator('#site-menu a[href="/?lang=en"]').count()===1);
  await page.locator('#site-menu summary').click();
  await page.locator('#site-menu a[href="/referenzen/?lang=en"]').click();
  await page.waitForURL(u=>u.pathname==='/referenzen/');await page.locator('#stage:not(.enhancing)').waitFor();
  ok('language: References opens in English from the English menu',await page.evaluate(()=>document.documentElement.lang)==='en'&&(await page.locator('#ttl').textContent())==='References');
  ok('language: the References back link keeps English',await page.locator('.top a.back').getAttribute('href')==='/?lang=en'&&(await page.locator('.top a.back').innerText()).includes('Home'));
  ok('language: the References footer keeps English on the Glossary link',await page.locator('.foot a[href="/glossar/?lang=en"]').count()===1);
  ok('language: English labels replace the German filter text',await page.locator('#q').getAttribute('placeholder')==='Name, year or keyword'&&!(await page.locator('.filter').innerText()).includes('Filter zurücksetzen'));
  ok('featured: English visitors see "Selected work" with four English cards',(await page.locator('.featured-work h2').textContent())==='Selected work'&&await page.locator('.featured-card').count()===4&&(await page.locator('.featured-card').first().innerText()).includes('aid organisation'));
  await page.screenshot({path:path.join(artifact,'references-desktop-en-featured.png')});
  await page.goto(base+'/referenzen/');await page.locator('#stage:not(.enhancing)').waitFor();
  ok('featured: German visitors see "Ausgewählte Arbeiten" with four picture cards',(await page.locator('.featured-work h2').textContent())==='Ausgewählte Arbeiten'&&await page.locator('.featured-card').count()===4&&await page.locator('.featured-card img').count()===8);
  ok('language: German References keeps the plain back link',await page.locator('.top a.back').getAttribute('href')==='/');
  ok('featured: the cards sit above the Zeitstrahl',(await page.locator('.featured-work').boundingBox()).y<(await page.locator('.c-stage').boundingBox()).y);
  await page.locator('.featured-card[data-featured="wespro"]').click();await page.waitForTimeout(150);
  ok('featured: a card opens its project story',new URL(page.url()).hash==='#wespro'&&(await page.locator('.c-side .pv-title').textContent())==='Werbespitze / Wespro');
  await page.locator('#q').fill('Eeloy');await page.waitForTimeout(100);
  ok('featured: the cards step aside while a search is active',!await page.locator('.featured-work').isVisible());
  await page.locator('#q').fill('');await page.waitForTimeout(100);
  ok('featured: the cards return when the search is cleared',await page.locator('.featured-work').isVisible());
  ok('language: no runtime or CSP errors on the way',errors.length===0);
 } finally {await context.close();}
 const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),fallback=await nojs.newPage();
 try {
  await fallback.goto(base+'/referenzen/');
  ok('featured: without JavaScript the four cards link to the readable stories',await fallback.locator('.featured-card').count()===4&&await fallback.locator('.featured-card[href="#getme"]').count()===1);
 } finally {await nojs.close();}
}
