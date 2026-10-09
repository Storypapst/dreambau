import path from 'node:path';

async function pull(page,dy,{dx=0,duration=240}={}) {
 const grip=await page.locator('#cs .grab').boundingBox(),x=grip.x+grip.width/2,y=grip.y+grip.height/2;
 await page.mouse.move(x,y);await page.mouse.down();
 for(let step=1;step<=6;step++){await page.mouse.move(x+dx*step/6,y+dy*step/6);if(duration)await page.waitForTimeout(duration/6);}
 await page.mouse.up();await page.waitForTimeout(300);
}

export async function run({browser,base,artifact,ok}) {
 const failed=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 try {
  // A browser API failure after mounting has begun must not discard readable HTML.
  await failed.addInitScript(()=>{window.ResizeObserver=class {constructor(){throw new Error('Injected browser initialization failure');}};});
  const page=await failed.newPage();
  await page.goto(base+'/referenzen/');
  ok('155: failed enhancement preserves all twelve readable projects',await page.locator('.nojs article').count()===12&&await page.locator('.nojs').isVisible());
  ok('155: failed enhancement leaves the original English text and navigation usable',(await page.locator('.nojs #eeloy').innerText()).includes('Redesign the 8 Years old Direct Mailing solution')&&await page.locator('.nojs a[href="/"]').first().isVisible());
  ok('155: partial enhancement does not obscure the readable fallback',await page.locator('#stage').count()===0&&await page.evaluate(()=>!!document.elementFromPoint(30,35)?.closest('.nojs')));
  await page.screenshot({path:path.join(artifact,'references-failed-enhancement-phone.png')});
 } finally {await failed.close();}
 const phone=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 try {
  const page=await phone.newPage();await page.goto(base+'/referenzen/');
  await page.locator('.nd[data-id="ori"]').click();
  const handle=await page.locator('#cs .grab').boundingBox(),sheet=page.locator('#cs .msheet'),before=await sheet.boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2+84,{steps:6});
  ok('155: the project sheet follows a downward grip pull',(await sheet.boundingBox()).y>=before.y+80);
  await page.mouse.up();await page.waitForTimeout(100);
  ok('155: a full downward pull closes the project and restores focus',!await page.locator('#cs').isVisible()&&await page.locator('.nd[data-id="ori"]').evaluate(n=>n===document.activeElement));
  await page.locator('.nd[data-id="ori"]').click();const rest=(await sheet.boundingBox()).y;
  await pull(page,60);
  ok('155: a short slow pull snaps back without closing',await page.locator('#cs').isVisible()&&Math.abs((await sheet.boundingBox()).y-rest)<1);
  await pull(page,-80);
  ok('155: an upward pull does not dismiss the sheet',await page.locator('#cs').isVisible()&&Math.abs((await sheet.boundingBox()).y-rest)<1);
  await pull(page,84,{dx:160});
  ok('155: a mostly horizontal pull does not dismiss the sheet',await page.locator('#cs').isVisible()&&Math.abs((await sheet.boundingBox()).y-rest)<1);
  await page.locator('#cs .grab').focus();await page.keyboard.press('Shift+Tab');
  ok('155: backward Tab stays within the sheet at its last action',await page.locator('#cs .mf [data-closeview]').evaluate(n=>n===document.activeElement));
  await page.keyboard.press('Tab');
  ok('155: forward Tab wraps back to the accessible grip',await page.locator('#cs .grab').evaluate(n=>n===document.activeElement));
  await page.locator('#cs .grab').focus();await page.keyboard.press('Enter');await page.waitForTimeout(100);
  ok('155: the grip is a keyboard close action with focus return',!await page.locator('#cs').isVisible()&&await page.locator('.nd[data-id="ori"]').evaluate(n=>n===document.activeElement));
  await page.locator('.nd[data-id="ori"]').click();await page.keyboard.press('Escape');await page.waitForTimeout(100);
  ok('155: Escape still closes and restores the project opener',!await page.locator('#cs').isVisible()&&await page.locator('.nd[data-id="ori"]').evaluate(n=>n===document.activeElement));
  await page.locator('.nd[data-id="ori"]').click();await page.locator('#cs .mf [data-closeview]').click();await page.waitForTimeout(100);
  ok('155: the existing close button remains usable',!await page.locator('#cs').isVisible());
  await page.locator('#fbtn').click();await page.locator('#fsheet .grab').focus();await page.keyboard.press('Enter');
  ok('155: the filter grip also closes its sheet and restores focus',!await page.locator('#fsheet').isVisible()&&await page.locator('#fbtn').evaluate(n=>n===document.activeElement));
  await page.locator('.nd[data-id="ori"]').click();
  const rotateGrip=await page.locator('#cs .grab').boundingBox(),rx=rotateGrip.x+rotateGrip.width/2,ry=rotateGrip.y+rotateGrip.height/2;
  await page.mouse.move(rx,ry);await page.mouse.down();await page.mouse.move(rx,ry+40);
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(100);await page.mouse.up();
  ok('155: rotating during a pull cancels it and retains a usable sheet',await page.locator('#cs').isVisible()&&await sheet.evaluate(panel=>getComputedStyle(panel).transform==='matrix(1, 0, 0, 1, 0, 0)')&&await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
 } finally {await phone.close();}
 const loads=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 try {
  const page=await loads.newPage(),fallbackImages=[];
  page.on('request',request=>{if(request.url().includes('/website-assets/portfolio/'))fallbackImages.push(request.url());});
  await page.route('**/references.js',async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.continue();});
  await page.goto(base+'/referenzen/');await page.waitForTimeout(150);
  ok('155: successful enhancement does not download unused fallback portfolio images',fallbackImages.length===0);
  for(const [device,width,height] of [['phone',390,844],['tablet',820,1180],['desktop',1440,900]]) {
   await page.setViewportSize({width,height});
   for(let visit=0;visit<2;visit++) {
    await page.goto(base+'/referenzen/');
    ok('155: '+device+' load '+(visit+1)+' retains twelve entries without duplicate fallback',await page.locator('.c-stage .node').count()===12&&await page.locator('.nojs').count()===0);
    ok('155: '+device+' load '+(visit+1)+' stays inside the viewport',await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
   }
   await page.locator('.nd[data-id="ori"]').click();await page.waitForTimeout(100);
   await page.screenshot({path:path.join(artifact,'references-repaired-'+device+'.png')});
  }
 } finally {await loads.close();}
 const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'no-preference',recordVideo:{dir:artifact,size:{width:390,height:844}}});
 try {
  const page=await touch.newPage(),client=await touch.newCDPSession(page);
  await page.goto(base+'/referenzen/');await page.locator('.nd[data-id="ori"]').click();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#cs .msheet')).transform==='matrix(1, 0, 0, 1, 0, 0)');
  const grip=await page.locator('#cs .grab').boundingBox(),x=grip.x+grip.width/2,y=grip.y+grip.height/2,rest=(await page.locator('#cs .msheet').boundingBox()).y;
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+90}]});
  ok('155: a browser touch pull actually moves the sheet before cancellation',(await page.locator('#cs .msheet').boundingBox()).y>=rest+85);
  await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#cs .msheet')).transform==='matrix(1, 0, 0, 1, 0, 0)');
  ok('155: OS touch cancellation snaps back even beyond the dismiss threshold',await page.locator('#cs').isVisible()&&await page.locator('#cs .msheet').evaluate(panel=>getComputedStyle(panel).transform==='matrix(1, 0, 0, 1, 0, 0)'&&Math.abs(panel.getBoundingClientRect().bottom-innerHeight)<1));
  const currentGrip=await page.locator('#cs .grab').boundingBox(),touchX=currentGrip.x+currentGrip.width/2,touchY=currentGrip.y+currentGrip.height/2;
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchX,y:touchY}]});
  for(let step=1;step<=6;step++){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchX,y:touchY+100*step/6}]});await page.waitForTimeout(60);}
  await page.screenshot({path:path.join(artifact,'references-drag-in-progress-phone.png')});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.locator('#cs').waitFor({state:'hidden'});
  ok('155: a native browser touch gesture dismisses with focus return',!await page.locator('#cs').isVisible()&&await page.locator('.nd[data-id="ori"]').evaluate(n=>n===document.activeElement));
 } finally {await touch.close();}
 const plain=await browser.newContext({viewport:{width:390,height:844},javaScriptEnabled:false});
 try {
  const page=await plain.newPage();await page.goto(base+'/referenzen/');
  ok('155: without JavaScript all twelve original entries remain readable',await page.locator('.nojs article').count()===12);
  await page.locator('#eeloy summary').click();
  await page.locator('#eeloy img').evaluate(image=>image.decode());
  ok('155: no-JavaScript visitors can open the original portfolio image',await page.locator('#eeloy img').isVisible()&&await page.locator('#eeloy img').evaluate(image=>image.naturalWidth>0));
 } finally {await plain.close();}
}
