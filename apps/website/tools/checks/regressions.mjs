import fs from 'node:fs';
import path from 'node:path';

export async function run({browser,base,artifact,ok,root,dist,policy}){
  for(const route of ['/referenzen/','/glossar/']){
    const response=await fetch(base+route);
    ok(route+' serves the reviewed page',response.status===200);
    ok(route+' preserves own-origin CSP',response.headers.get('content-security-policy')===policy);
    const html=await response.text();
    ok(route+' has no inline executable content',!/<style|\sstyle=|\son[a-z]+=|<script(?![^>]*src=)/i.test(html));
  }
  for(const route of ['/referenzen/missing','/glossar/.hidden','/website-assets/missing.js']){
    ok(route+' stays unavailable',(await fetch(base+route)).status===404);
  }
  for(const route of ['/referenzen','/glossar']){
    ok(route+' redirects canonically',(await fetch(base+route,{redirect:'manual'})).status===308);
  }
  for(const [device,width,height] of [['desktop',1440,900],['tablet',820,1180],['phone',390,844]]){
    const context=await browser.newContext({viewport:{width,height},locale:'de-DE',reducedMotion:'reduce',hasTouch:device!=='desktop'});
    const page=await context.newPage(),errors=[],foreign=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{const url=new URL(r.url());if(url.protocol.startsWith('http')&&url.origin!==new URL(base).origin)foreign.push(r.url());});
    await page.goto(base+'/?anim=4k&lang=de');
    await page.waitForFunction(()=>document.documentElement.classList.contains('ready'));
    await page.locator('#site-menu summary').click();
    for(const route of ['/referenzen/','/glossar/','/teamwork/','/bildungshaus/']){
      ok(device+' menu keeps '+route,await page.locator('#site-menu a[href="'+route+'"]').isVisible());
    }
    await page.screenshot({path:path.join(artifact,device+'-menu.png')});
    await page.keyboard.press('Escape');
    ok(device+' menu closes and returns focus',await page.locator('#site-menu').evaluate(e=>!e.open&&document.activeElement===e.querySelector('summary')));
    ok(device+' homepage fits viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    ok(device+' no script errors',errors.length===0);
    ok(device+' no foreign runtime requests',foreign.length===0);
    await context.close();
  }
  const fallback=await browser.newContext();
  const fp=await fallback.newPage();
  await fp.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'||type==='webgl2'?null:get.call(this,type,...args);};});
  await fp.goto(base+'/');
  await fp.waitForFunction(()=>document.documentElement.classList.contains('static'));
  ok('WebGL fallback hides unusable source entry',!await fp.locator('#source-entry').isVisible());
  await fp.locator('#site-menu summary').click();
  ok('WebGL fallback retains website navigation',await fp.locator('#site-menu a[href="/referenzen/"]').isVisible());
  await fallback.close();

  const data=JSON.parse(fs.readFileSync(path.join(root,'content.json'),'utf8'));
  const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),page=await nojs.newPage();
  const normal=s=>s.replace(/\s+/g,' ').trim();
  await page.goto(base+'/referenzen/');
  let text=normal(await page.locator('body').innerText());
  for(const entry of data.references.older_references){
    ok('no-JS original remains readable: '+entry.client,text.includes(normal(entry.scope)));
    // Disclosure content is available without JavaScript through native details.
    if(entry.detail_text){
      const disclosure=page.locator('details').filter({hasText:entry.detail_text.slice(0,35)});
      if(await disclosure.count())await disclosure.locator('summary').click();
      text=normal(await page.locator('body').innerText());
      ok('no-JS English detail remains readable: '+entry.client,text.includes(normal(entry.detail_text)));
    }
  }
  for(const entry of data.references.current_projects)ok('no-JS current name '+entry.name,text.includes(entry.name));
  await page.goto(base+'/glossar/');text=normal(await page.locator('body').innerText());
  for(const term of data.glossary.terms)ok('no-JS settled word '+term.name,text.includes(normal(term.definition)));
  await page.goto(base+'/');ok('no-JS homepage title',await page.locator('h1').isVisible());
  await page.locator('#site-menu summary').click();ok('no-JS website links',await page.locator('#site-menu a[href="/glossar/"]').isVisible());
  await nojs.close();

  // Controlled isolated frame fixture; never labelled as live motion.
  const current=fs.readFileSync(path.join(dist,'p/4k.js'),'utf8');
  const original=current.replace('dot(b*clamp(.5-','dot(clamp(.5-');
  const frames=[];
  for(const before of [true,false]){
    const page=await browser.newPage({viewport:{width:640,height:360}});
    if(before)await page.route('**/p/4k.js',r=>r.fulfill({status:200,contentType:'application/javascript',body:original}));
    await page.goto(base+'/?anim=4k&test=1');await page.waitForFunction(()=>window.Dream?.test);await page.evaluate(()=>Dream.test.ready);
    const shots={};for(const time of [10,25,40,53])shots[time]=await page.evaluate(t=>Dream.test.thumb(t,128,72),time);
    frames.push(shots);await page.close();
  }
  for(const time of [10,25,40])ok('Rohbau cue correction retained at '+time+'s',frames[0][time].some((v,i)=>Math.abs(v-frames[1][time][i])>.01));
  ok('Rohbau final picture retained at 53s',frames[0][53].every((v,i)=>v===frames[1][53][i]));
}
