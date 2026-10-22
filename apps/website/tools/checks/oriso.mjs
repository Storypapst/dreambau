import path from 'node:path';
export async function run({browser,base,artifact,ok}) {
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 try {
  const page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text());});
  page.on('request',r=>{if(!r.url().startsWith(base+'/')&&!r.url().startsWith('data:'))external.push(r.url());});
  const bare=await fetch(base+'/oriso',{redirect:'manual'});
  ok('/oriso redirects to /oriso/',bare.status===308&&new URL(bare.headers.get('location')||'',base).pathname==='/oriso/');
  await page.goto(base+'/oriso/');
  ok('ORISO page renders the old and the new square with tiles',await page.locator('#sqOld .tile, #sqOld > *').count()>0 && await page.locator('#sqNew .tile').count()>10);
  ok('Key figures render with bars sized through the stylesheet object model',await page.locator('#kpis .bar i').count()>0 && await page.locator('#kpis .bar i').first().evaluate(e=>e.getBoundingClientRect().width>0));
  ok('Building-block list is built',await page.locator('#listBody').evaluate(e=>e.textContent.length>200));
  await page.screenshot({path:path.join(artifact,'oriso-desktop-de.png')});
  ok('German is shown first',await page.locator('html').getAttribute('data-lang')==='de'&&await page.getByRole('heading',{name:'Wie stark ORISO gewachsen ist'}).isVisible());
  await page.locator('[data-setlang="en"]').click();
  ok('English toggle switches the page',await page.getByRole('heading',{name:'How much ORISO has grown'}).isVisible());
  await page.reload();
  ok('Language choice survives reload',await page.locator('html').getAttribute('data-lang')==='en');
  await page.screenshot({path:path.join(artifact,'oriso-desktop-en.png')});
  await page.locator('[data-setlang="de"]').click();
  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/oriso/');
  ok('Phone has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(artifact,'oriso-phone.png')});
  ok('ORISO page stays within strict same-origin CSP (no violation, no console error, no foreign request)',errors.length===0&&external.length===0);
  const fallback=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
  try{
   const plain=await fallback.newPage();await plain.goto(base+'/oriso/');
   ok('Without JavaScript the headings, notice and links remain readable',await plain.getByRole('heading',{name:'Wie stark ORISO gewachsen ist'}).isVisible()&&await plain.getByText('Die Grafik und die Zahlen brauchen JavaScript.').isVisible());
  }finally{await fallback.close();}
 } finally {await context.close();}
}
