import path from 'node:path';
export async function run({browser,base,artifact,ok}) {
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 try {
  const page=await context.newPage(),errors=[],violations=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(!r.url().startsWith(base+'/')&&!r.url().startsWith('data:'))violations.push(r.url());});
  await page.goto(base+'/glossar/');
  await page.mouse.move(0,0);await page.screenshot({path:path.join(artifact,'glossary-desktop-default.png')});
  ok('Glossar opens with one selected answer card',await page.locator('article:visible').count()===1);
  await page.getByRole('button',{name:'Wörter A–Z'}).click();
  ok('A–Z opens independently without showing every answer',await page.getByRole('heading',{name:'Alle Wörter von A bis Z'}).isVisible() && await page.locator('article:visible').count()===1);
  await page.locator('#azp').getByRole('button',{name:'Rollback',exact:true}).click();
  ok('A–Z selection replaces the selected card',await page.locator('.card').getByRole('heading',{name:'Rollback',exact:true}).isVisible() && await page.locator('article:visible').count()===1);
  await page.reload();
  ok('Chosen word survives reload',await page.locator('.card').getByRole('heading',{name:'Rollback',exact:true}).isVisible());
  await page.getByRole('button',{name:'Wörter A–Z'}).click();
  await page.keyboard.press('Escape');
  ok('Escape closes A–Z and returns focus',!(await page.locator('#azp').isVisible()) && await page.getByRole('button',{name:'Wörter A–Z'}).evaluate(el=>el===document.activeElement));
  await page.getByRole('textbox',{name:'Frage oder Wort suchen'}).fill('rollback');
  await page.locator('.opt.w').getByText('Rollback',{exact:true}).click();
  await page.getByRole('button',{name:'Release',exact:true}).click();
  ok('Related word reveals its target after a search',await page.locator('.card').getByRole('heading',{name:'Release',exact:true}).isVisible() && await page.getByRole('textbox').inputValue()==='');
  await page.getByRole('button',{name:'Ich will ein Programm öffnen',exact:true}).click();await page.mouse.move(0,0);
  await page.screenshot({path:path.join(artifact,'glossary-desktop.png')});
  await page.getByRole('textbox',{name:'Frage oder Wort suchen'}).fill('xyzdoesnotexist');
  ok('No-hit search keeps an explicit result and a way to reset',await page.getByRole('heading',{name:'Nichts gefunden'}).isVisible());
  await page.locator('.none').getByRole('button',{name:'Suche löschen'}).click();
  ok('Reset restores the grouped Wegweiser',await page.locator('.gh').count()===6);
  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/glossar/');
  ok('Phone starts with lower search controls and readable question list',await page.getByRole('button',{name:'Ich will …',exact:true}).isVisible() && await page.locator('#dock input').isVisible());
  await page.mouse.move(0,0);await page.screenshot({path:path.join(artifact,'glossary-phone-default.png')});
  await page.getByRole('button',{name:'Ich will ein Programm öffnen',exact:true}).click();
  ok('Phone selection shows the question bubble and one answer',await page.locator('.bub').textContent()==='Ich will ein Programm öffnen' && await page.locator('article:visible').count()===1);
  ok('Phone search dock retains a 48px input',await page.getByRole('textbox').evaluate(e=>e.getBoundingClientRect().height)>=48);
  ok('Phone has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(artifact,'glossary-phone.png')});
  await page.setViewportSize({width:820,height:1180});
  await page.goto(base+'/glossar/#q-programm-oeffnen');
  ok('820 portrait uses the same bottom-up selection model',await page.locator('#dock').isVisible() && await page.locator('.bub').isVisible());
  await page.screenshot({path:path.join(artifact,'glossary-portrait.png')});
  for(const [width,height,header] of [[1280,720,52],[1920,1080,60]]){
   await page.setViewportSize({width,height});await page.goto(base+'/glossar/');
   ok('Header follows the selected '+width+' density',await page.locator('header.top').evaluate(e=>e.getBoundingClientRect().height)===header);
   ok('Title keeps compact 18px typography at '+width,await page.getByRole('heading',{name:'Glossar',exact:true}).evaluate(e=>getComputedStyle(e).fontSize)==='18px');
   await page.screenshot({path:path.join(artifact,'glossary-'+width+'.png')});
  }
  await page.setViewportSize({width:320,height:720});await page.goto(base+'/glossar/#q-zuruecknehmen');
  ok('Narrow phone keeps answers and controls within the viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth) && await page.locator('.card').isVisible());
  await page.screenshot({path:path.join(artifact,'glossary-320.png')});
  const still=await page.locator('#field').screenshot();
  await page.waitForTimeout(150);
  ok('Reduced motion leaves the character field still',still.equals(await page.locator('#field').screenshot()));
  ok('Glossar stays within strict same-origin CSP',errors.length===0&&violations.length===0);
  const fallback=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
  try{
   const plain=await fallback.newPage();await plain.goto(base+'/glossar/');
   ok('Without JavaScript all settled questions and definitions remain readable',await plain.getByRole('heading',{name:'Ich will eine Animation ansehen'}).isVisible() && await plain.getByRole('heading',{name:'Rollback',exact:true}).isVisible());
   await plain.screenshot({path:path.join(artifact,'glossary-nojs.png')});
  }finally{await fallback.close();}


 } finally {await context.close();}
}
