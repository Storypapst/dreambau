import path from 'node:path';
import fs from 'node:fs';
export async function run({browser,base,artifact,ok,root}) {
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}), page=await context.newPage(); const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 try {await page.goto(base+'/referenzen/'); await page.waitForTimeout(250);
 ok('A22: unpublished legal pages remain pending text, never dead links',await page.locator('.foot a[href="/impressum.html"],.foot a[href="/datenschutz.html"]').count()===0 && (await page.locator('.foot').innerText()).includes('Impressum · Angaben noch offen') && (await page.locator('.foot').innerText()).includes('Datenschutz · Freigabe noch offen'));
 ok('A01: all twelve entries form the selected Zeitstrahl',await page.locator('.c-stage .node').count()===12);
 await page.screenshot({path:path.join(artifact,'references-desktop-default.png')});
 await page.locator('.nd[data-id="sf-care"]').click(); await page.waitForTimeout(150);
 ok('A01: selecting a reference opens one project beside its timeline',await page.locator('.c-side .pv').isVisible());
 ok('A02: selected SF Care shows its ten available genuine portfolio screenshots',await page.locator('.c-side .pv-gal img,.c-side .pv-sl img').count()===10);
 await page.screenshot({path:path.join(artifact,'references-desktop-selected.png')});
 ok('A01: the wide selected panel has the approved 440 px width',Math.abs((await page.locator('.c-side').boundingBox()).width-440)<1);
 await page.reload();await page.waitForTimeout(150);
 ok('A02: reloading a shared address keeps the selected project',await page.locator('.c-side .pv-title').textContent()==='SF Care');
 await page.keyboard.press('Escape');await page.waitForTimeout(150);
 ok('A02: closing returns focus to the selected entry',await page.locator('.nd[data-id="sf-care"]').evaluate(n=>n===document.activeElement));
 await page.locator('#q').fill('Eeloy');
 ok('A05: project search reports one of twelve entries',await page.locator('#fres').textContent()==='1 von 12 Einträgen');
 await page.locator('#q').fill('absent-reference-xyz');
 ok('A05: unsuccessful search explains how to reset',await page.getByRole('heading',{name:/Keine Treffer/}).isVisible());
 await page.locator('.empty [data-act="reset"]').click();
 ok('A05: reset restores the twelve-entry result',await page.locator('#fres').textContent()==='12 von 12 Einträgen');
 await page.locator('[data-sec="old"]').click();
 ok('A05: the older filter preserves all seven originals',await page.locator('#fres').textContent()==='7 von 12 Einträgen');
 await page.locator('[data-act="reset"]').first().click();
 await page.setViewportSize({width:1279,height:900});await page.waitForTimeout(150);await page.locator('.nd[data-id="eeloy"]').click();await page.waitForTimeout(150);
 ok('A01: below 1280 px the selected project is a bottom sheet',await page.locator('#cs.on .pv-title').isVisible());
 await page.keyboard.press('Escape');await page.waitForTimeout(150);
 await page.setViewportSize({width:900,height:900});await page.waitForTimeout(150);
 ok('A03: the 900 px boundary retains the horizontal timeline',await page.locator('.c-band').isVisible());
 await page.setViewportSize({width:899,height:900});await page.locator('.sh').first().waitFor({state:'visible'});
 ok('A03: below 900 px the timeline uses continuous vertical year groups',await page.locator('.sh').count()===6 && !await page.locator('.c-band').isVisible());
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
 await page.screenshot({path:path.join(artifact,'references-phone-default.png')});
 ok('A03: phone labels are 16 px and orbs are 40 px',await page.locator('.node.cur .nm').first().evaluate(n=>getComputedStyle(n).fontSize==='16px')&&(await page.locator('.orb').first().boundingBox()).width===40);
 const dock=await page.locator('.filter').boundingBox();ok('A05: phone search and filters sit in the lower dock',dock.y+dock.height>=843);
 await page.locator('#fbtn').click();await page.waitForTimeout(150);await page.locator('#fsheet [data-sec="old"]').click();
 ok('A05: phone filter sheet retains seven older originals',await page.locator('#fsshow').textContent()==='7 Einträge anzeigen');
 await page.locator('#fsshow').click();await page.waitForTimeout(150);
 await page.locator('.nd[data-id="sf-care"]').click();await page.waitForTimeout(150);
 await page.screenshot({path:path.join(artifact,'references-phone-selected.png')});
 ok('A02: narrow project headers release the desktop minimum height',await page.locator('#cs .pv-hd').evaluate(n=>getComputedStyle(n).minHeight==='0px'));
 const controls=page.locator('#cs.on button');for(const box of await controls.evaluateAll(ns=>ns.filter(n=>n.getClientRects().length).map(n=>({h:n.getBoundingClientRect().height,w:n.getBoundingClientRect().width}))))ok('A11: sheet actions meet the 44 px tap target',box.h>=44&&box.w>=44);
 await page.keyboard.press('Escape');await page.waitForTimeout(150);
 await page.locator('#fbtn').click();await page.waitForTimeout(100);await page.locator('#fsreset').click();await page.locator('#fsshow').click();await page.waitForTimeout(100);
 await page.locator('.nd[data-id="oriso"]').click();await page.waitForTimeout(150);
 ok('A02: pending current projects also release the narrow header minimum',await page.locator('#cs .pv-hd').evaluate(n=>getComputedStyle(n).minHeight==='0px'));
 await page.keyboard.press('Escape');await page.waitForTimeout(150);
 await page.setViewportSize({width:320,height:844});await page.waitForTimeout(150);
 ok('A11: 320 px phone has no horizontal page overflow',await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
 ok('A22: the rendered page contains no inline styles or handlers',await page.locator('[style]:not([style=""]),[onclick],[oninput]').count()===0);
 ok('A11: reduced motion disables every animated element',await page.evaluate(()=>[...document.querySelectorAll('*')].every(n=>getComputedStyle(n).animationName==='none')));
 ok('A11: the real nginx browser path has no runtime or CSP errors',errors.length===0);
 for(const [device,width,height] of [['desktop',1440,900],['tablet',820,1180],['phone',390,844]]){await page.setViewportSize({width,height});await page.goto(base+'/referenzen/#getme');await page.waitForTimeout(200);await page.screenshot({path:path.join(artifact,'references-'+device+'-getme.png')});}
 await page.goto(base+'/referenzen/?lang=ar#getme');await page.waitForTimeout(200);ok('A11: RTL surroundings keep the English original in its own direction',await page.locator('.pv-title').last().evaluate(n=>n.dir==='ltr'&&document.documentElement.dir==='rtl'));
 await page.screenshot({path:path.join(artifact,'references-phone-rtl.png')});
 } finally {await context.close();}
 const fast=await browser.newContext({viewport:{width:820,height:1180},reducedMotion:'reduce'}), burst=await fast.newPage();
 try{
  await burst.goto(base+'/');await burst.locator('#site-menu summary').click();await burst.locator('#site-menu a[href="/referenzen/"]').click();await burst.locator('.nd[data-id="oriso"]').click();
  // Several keyboard close events arrive before asynchronous history traversal completes.
  await burst.evaluate(()=>{for(let n=0;n<8;n++)document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});await burst.waitForTimeout(350);
  ok('A05: rapid keyboard closes traverse history once and keep the references page',new URL(burst.url()).pathname==='/referenzen/'&&new URL(burst.url()).hash==='');
  ok('A05: rapid close restores the project opener focus',await burst.locator('.nd[data-id="oriso"]').evaluate(n=>n===document.activeElement));
 }finally{await fast.close();}
 const moving=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'}), motion=await moving.newPage();
 try{
  await motion.goto(base+'/referenzen/#oriso');
  await motion.waitForTimeout(9500);
  const visibleCanvases=()=>motion.locator('canvas').evaluateAll(cs=>cs.filter(c=>c.getClientRects().length&&c.offsetParent).map(c=>c.toDataURL()));
  const settled=await visibleCanvases();await motion.waitForTimeout(700);
  ok('A11: ordinary reference background, orbs and artwork settle into a calm end',JSON.stringify(settled)===JSON.stringify(await visibleCanvases()));
  await motion.screenshot({path:path.join(artifact,'references-calm-desktop.png')});
  await motion.keyboard.press('Escape');await motion.locator('#q').fill('ORISO');await motion.waitForTimeout(200);
  const filtered=await visibleCanvases();await motion.waitForTimeout(700);
  ok('A11: filtering after the end repaints a stable character world',JSON.stringify(filtered)===JSON.stringify(await visibleCanvases()));
  await motion.locator('#q').fill('');await motion.setViewportSize({width:390,height:844});await motion.locator('.nd[data-id="oriso"]').click();await motion.waitForTimeout(200);
  const resized=await visibleCanvases();await motion.waitForTimeout(700);
  ok('A11: opening and resizing after the end retain still background and artwork',JSON.stringify(resized)===JSON.stringify(await visibleCanvases()));
 }finally{await moving.close();}
 const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}), fallback=await nojs.newPage();
 try {await fallback.goto(base+'/referenzen/');
 const catalogue=JSON.parse(fs.readFileSync(path.join(root,'content.json'),'utf8')).references;
 for(const project of [...catalogue.current_projects,...catalogue.older_references]){const labels=project.links?.map(l=>l.label)||project.displayed_original_addresses;const article=fallback.locator('article[id="'+project.id+'"]');for(const label of labels)ok('A04: no-JS reference retains offered address '+label,(await article.innerText()).includes(label));for(const link of project.links||[])ok('A04: no-JS unverified addresses stay inert: '+link.label,link.reachability_verified||(await article.getByRole('link',{name:link.label,exact:true}).count())===0);}
 ok('A22: no-JS footer retains honest pending legal text',(await fallback.locator('.foot').innerText()).includes('Impressum · Angaben noch offen')&&(await fallback.locator('.foot').innerText()).includes('Datenschutz · Freigabe noch offen'));
 ok('A01: without JavaScript every genuine entry remains readable',await fallback.locator('article').count()===12);ok('A02: English original content remains readable without JavaScript',(await fallback.locator('article#eeloy').textContent()).includes('Redesign the 8 Years old Direct Mailing solution'));}finally{await nojs.close();}
}
