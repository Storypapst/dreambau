import path from 'node:path';
export async function run({browser,base,artifact,ok}) {
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage();
 try {
 await page.goto(base+'/?lang=de&anim=4k');await page.locator('#lang').waitFor({state:'visible'});await page.locator('#lang').click();await page.locator('#langsheet').waitFor({state:'visible'});
 const g=await page.locator('#langsheet').evaluate(e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return {radius:c.borderTopLeftRadius,x:r.x,y:r.y,w:r.width,h:r.height,title:getComputedStyle(e.querySelector('h2')).fontSize};});
 ok('Raster A desktop compact geometry',g.radius==='14px'&&g.title==='17px'&&g.w===720&&Math.abs(g.y-108)<1&&g.h<=440);
 const selected=page.getByRole('option',{name:'Deutsch',exact:true});
 ok('All47 language names remain offered',await page.getByRole('option').count()===47);
 ok('Selected language has cream10px entry and3px marker',await selected.evaluate(e=>{const c=getComputedStyle(e);return c.borderRadius==='10px'&&c.color==='rgb(255, 238, 210)'&&c.backgroundColor==='rgba(255, 238, 210, 0.13)'&&c.boxShadow.includes('3px');}));
 ok('Opening focuses current language',await selected.evaluate(e=>e===document.activeElement));
 const columns=await page.locator('.lang-list').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);ok('Desktop raster retains four columns',columns===4);
 ok('Overflowing names fade at lower edge',await page.locator('.lang-list').evaluate(e=>getComputedStyle(e).maskImage.includes('linear-gradient')));
 await page.mouse.move(0,0);await page.screenshot({path:path.join(artifact,'desktop-raster.png')});
 await page.locator('.lang-close').focus();await page.keyboard.press('Shift+Tab');ok('Desktop backward Tab wraps to last name',await page.getByRole('option').last().evaluate(e=>e===document.activeElement));await page.keyboard.press('Tab');ok('Desktop Tab wraps to close in heading',await page.locator('.lang-close').evaluate(e=>e===document.activeElement));await page.keyboard.press('Escape');ok('Escape closes sheet and returns trigger focus',!await page.locator('#langsheet').isVisible()&&await page.locator('#lang').evaluate(e=>e===document.activeElement));
 await page.locator('#lang').click();await page.getByRole('option').filter({hasText:'العربية'}).click();await page.waitForFunction(()=>document.documentElement.lang==='ar');await page.locator('#lang').click();
 ok('RTL current name mirrors marker',await page.locator('.lang-list [aria-selected=true]').evaluate(e=>getComputedStyle(e).boxShadow.includes('-3px')));
 ok('Language selection preserves running animation query',new URL(page.url()).searchParams.get('anim')==='4k');await page.mouse.move(0,0);await page.screenshot({path:path.join(artifact,'desktop-raster-ar.png')});await page.keyboard.press('Escape');
 }finally{await context.close();}
 const phone=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',isMobile:true,hasTouch:true}),p=await phone.newPage();
 try {
 await p.goto(base+'/?lang=de&anim=4k');await p.locator('#lang').waitFor({state:'visible'});await p.locator('#lang').click();
 const geometry=await p.locator('#langsheet').evaluate(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e),close=e.querySelector('.lang-close'),b=close.getBoundingClientRect();return{radius:c.borderTopLeftRadius,x:r.x,w:r.width,h:r.height,bottom:r.bottom,close:b.height,font:getComputedStyle(close).fontSize,lower:b.bottom>e.querySelector('.lang-list').getBoundingClientRect().bottom,grip:getComputedStyle(e.querySelector('.lang-grab')).display,back:getComputedStyle(document.querySelector('#langback')).backgroundColor};});
 ok('Raster A phone bottom sheet and lower close action',geometry.radius==='18px'&&geometry.x===0&&geometry.w===390&&geometry.bottom===844&&geometry.h<=844*.7+1&&geometry.close===52&&geometry.font==='16px'&&geometry.lower&&geometry.grip!=='none'&&geometry.back==='rgba(2, 4, 8, 0.74)');
 ok('Phone current name remains focused',await p.getByRole('option',{name:'Deutsch',exact:true}).evaluate(e=>e===document.activeElement));
 await p.mouse.move(0,0);await p.screenshot({path:path.join(artifact,'phone-raster.png')});await p.locator('.lang-close').focus();await p.keyboard.press('Tab');ok('Phone lower close wraps to first name',await p.getByRole('option').first().evaluate(e=>e===document.activeElement));await p.keyboard.press('Shift+Tab');ok('Phone backward Tab returns to lower close',await p.locator('.lang-close').evaluate(e=>e===document.activeElement));
 await p.setViewportSize({width:820,height:1180});await p.locator('.lang-head .lang-close').waitFor();ok('Resize moves close into desktop heading and retains focus',await p.locator('.lang-head .lang-close').count()===1&&await p.locator('.lang-close').evaluate(e=>e===document.activeElement));
 await p.setViewportSize({width:820,height:390});await p.waitForTimeout(100);const landscape=await p.locator('#langsheet').boundingBox();ok('Landscape touch sheet retains86percent limit and44px close',landscape.height<=390*.86+1&&await p.locator('.lang-close').evaluate(e=>e.getBoundingClientRect().height)===44);
 await p.setViewportSize({width:320,height:740});ok('320px sheet has no horizontal overflow',await p.locator('#langsheet').evaluate(e=>e.scrollWidth<=e.clientWidth+1)&&await p.locator('.lang-list').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 await p.keyboard.press('Escape');ok('Phone Escape restores trigger',await p.locator('#lang').evaluate(e=>e===document.activeElement));
 }finally{await phone.close();}
}

