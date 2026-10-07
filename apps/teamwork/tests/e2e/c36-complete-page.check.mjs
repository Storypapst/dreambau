// Independent DOM measurements, real nginx, and browser state changes. Synthetic catalogue only.
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { launchBrowser, openObserved, storedByThePage } from '../lib/browser.mjs';
import { startPageServer } from '../lib/page-server.mjs';
import { EXAMPLE_LIST } from '../lib/paths.mjs';
import { publicCatalogue, publicJson, publicStatus, nowUtc } from '../lib/catalogue.mjs';
import { publicAcceptance } from '../public-acceptance.mjs';
const list = JSON.parse(fs.readFileSync(EXAMPLE_LIST, 'utf8'));
const publicList = publicCatalogue(list);
const screenshot = async (page, name) => {
  if (!process.env.TEAMWORK_EVIDENCE_DIR) return;
  const previous = page.viewportSize();
  for (const [width,height] of [[1280,720],[390,844],[820,1180],[1440,900]]) { await page.setViewportSize({width,height}); await new Promise((r)=>setTimeout(r,180)); await page.screenshot({path:path.join(process.env.TEAMWORK_EVIDENCE_DIR,name+'-'+width+'.png'),fullPage:true}); }
  await page.setViewportSize(previous); await new Promise((r)=>setTimeout(r,180));
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser, server;
try {
  await run(async () => {
    browser = await launchBrowser(); server = await startPageServer();
    const replaceFile = async (name, content) => {
      server.replaceFile(name, content);
      // C24: Docker Desktop may transiently return 404 after a host rename.
      if (process.platform === 'darwin') await pause(600);
      const until = Date.now() + 2000;
      while (true) { const result = await fetch(server.url + name); if (result.status === 200 && await result.text() === content) break; if (Date.now() >= until) throw new Error('C24 replacement not visible'); await pause(100); }
    };
    const { context, page, seen, violations } = await openObserved(browser);
    await page.goto(server.url); await page.locator('.tile').first().waitFor(); await pause(200);
    const modes = [];
    for (const [width, height] of [[1280,720],[1440,900],[1920,1080],[1180,720],[960,540],[900,500],[899,600],[800,600],[640,360],[600,800],[500,800],[390,844],[360,640],[320,568],[844,390]]) {
      await page.setViewportSize({width,height}); await pause(180);
      const geometry = await page.evaluate(() => {
        const rect = (node) => { const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
        const map=rect(document.getElementById('map'));
        const tiles=[...document.querySelectorAll('.tile')].map(rect);
        return { layout:document.getElementById('page').dataset.layout, map, tiles, overflow:document.documentElement.scrollWidth>innerWidth };
      });
      modes.push([width,geometry.layout]);
      if(width===1280)await screenshot(page,'normal');
      check('C36 C38 C46 viewport '+width+'x'+height+' has visible 44px targets and no horizontal overflow', !geometry.overflow && geometry.tiles.length===21 && geometry.tiles.every((r)=>r.width>=44&&r.height>=44));
      if ([1280,1440,1920].includes(width)) same('C36 M9 required desktop remains constellation '+width,geometry.layout,'constellation');
      if (geometry.layout==='constellation') {
        check('C36 tile boxes remain within map '+width,geometry.tiles.every((r)=>r.left>=geometry.map.left-.1&&r.right<=geometry.map.right+.1&&r.top>=geometry.map.top-.1&&r.bottom<=geometry.map.bottom+.1));
        check('C36 independently measured tile boxes clear each other by 2px '+width,geometry.tiles.every((r,i)=>geometry.tiles.slice(i+1).every((q)=>Math.hypot(Math.max(r.left-q.right,q.left-r.right,0),Math.max(r.top-q.bottom,q.top-r.bottom,0))>=1.95)));
      }
    }
    await page.setViewportSize({width:1280,height:720}); await pause(180);
    await page.locator('.tile').first().focus(); const focused = await page.locator('.tile').first().getAttribute('data-id');
    await page.setViewportSize({width:390,height:844}); await pause(200);
    check('C39 rotation keeps focus',await page.evaluate((id)=>document.activeElement.dataset.id===id,focused));
    check('C38 phone purposes remain visible',await page.locator('.ds').first().isVisible());
    const nav=await page.locator('#navigation').boundingBox(); check('C38 phone navigation is fixed at bottom',Math.abs(nav.y+nav.height-844)<1);
    await page.setViewportSize({width:844,height:390});await pause(200);
    same('C38 short landscape navigation is static',await page.locator('#navigation').evaluate((n)=>getComputedStyle(n).position),'static');
    await page.setViewportSize({width:1280,height:720});await pause(180);
    await page.emulateMedia({reducedMotion:'reduce'});await pause(150);
    const calm1=await page.screenshot();await pause(900);const calm2=await page.screenshot();
    check('C42 reduced motion screenshots 900ms apart are byte identical',calm1.equals(calm2));
    check('C42 reduced motion note is visible',await page.locator('#rmnote').isVisible());
    await page.emulateMedia({reducedMotion:'no-preference'});await pause(150);
    const moving1=await page.screenshot();await pause(900);const moving2=await page.screenshot();check('C42 normal motion changes the screenshot',!moving1.equals(moving2));
    await page.locator('[data-id="aurora"]').hover();await pause(650);
    check('C41 hover shows full detail and final label',await page.locator('#detail').textContent().then((t)=>t.includes('Aurora')&&t.includes('Zeigt Beispielzahlen')&&t.includes('aurora.example.test'))&&await page.locator('[data-id="aurora"] .nm').textContent()==='Aurora');
    const order=await page.locator('a').evaluateAll((nodes)=>nodes.filter((n)=>n.getClientRects().length).map((n)=>n.id||n.dataset.id));
    same('C40 actual link order is back, outer then inner, privacy',order,['back',...list.zones.flatMap((zone)=>list.programs.filter((p)=>p.zone===zone.id).map((p)=>p.id)),'privacy']);
    await page.locator('#back').focus();for(let i=0;i<22;i++)await page.keyboard.press('Tab');same('C40 Tab reaches privacy without a trap',await page.evaluate(()=>document.activeElement.id),'privacy');
    const partial=list.programs.slice(0,17).map((p)=>p.id);await replaceFile('data/status.json',publicJson(publicStatus(partial,nowUtc())));await page.reload();await page.locator('.tile').first().waitFor();same('C27 partial status renders 17 tiles',await page.locator('.tile').count(),17);await screenshot(page,'partial');
    await replaceFile('data/status.json',publicJson(publicStatus(list.programs.filter((p)=>p.zone!=='nord').map((p)=>p.id),nowUtc())));await page.reload();await page.locator('.tile').first().waitFor();check('C33 empty zone has zero count, a resting box, and ruht in legend',await page.locator('[data-zone="nord"] .zc').textContent()==='0'&&await page.locator('[data-zone="nord"] .resting').isVisible()&&await page.locator('#legend li').first().textContent().then((t)=>t.includes('ruht')));await screenshot(page,'empty-zone');
    for(const [name,status] of [['missing',null],['malformed','not json'],['wrong-format',JSON.stringify({format:2})],['stale',publicJson(publicStatus([],new Date(Date.now()-10801000).toISOString().replace(/\.\d{3}Z$/,'Z')))],['future',publicJson(publicStatus([],new Date(Date.now()+600000).toISOString().replace(/\.\d{3}Z$/,'Z')))]]) {
      await replaceFile('data/status.json',status??'null');await page.reload();await page.locator('.tile').first().waitFor();
      check('C29 '+name+' shows all marked tiles and banner',await page.locator('.tile').count()===21&&await page.locator('.unknown').count()===21&&await page.locator('#banner').isVisible());
      same('C29 '+name+' unknown age',await page.locator('#stand').textContent(),'Stand: unbekannt');if(name==='stale')await screenshot(page,'unknown');
    }
    const malicious={...publicList,programs:[{...publicList.programs[0],name:'<svg onload=alert(1)>',purpose:'literal'},...publicList.programs.slice(1)]};
    await replaceFile('data/programs.json',publicJson(malicious));await page.reload();await page.waitForFunction(()=>document.getElementById('loading').hidden);
    check('C35 hostile name remains literal text',await page.locator('.nm').first().textContent()==='<svg onload=alert(1)>'&&await page.locator('.tile svg').count()===0);
    await replaceFile('data/programs.json','{}');await page.reload();await page.locator('#retry').waitFor();
    await screenshot(page,'unavailable');
    check('C31 invalid catalogue shows approved message and retry',await page.locator('#message-text').textContent()==='Die Programmliste ist gerade nicht erreichbar.'&&await page.locator('.tile').count()===0);
    await replaceFile('data/programs.json',publicJson(publicList));await replaceFile('data/status.json',publicJson(publicStatus([],nowUtc())));await page.locator('#retry').click();await page.waitForFunction(()=>document.querySelectorAll('.zone').length===5);
    await screenshot(page,'none-reachable');
    check('C32 C33 no reachable programs keeps five resting zones, no unknown banner',await page.locator('.tile').count()===0&&await page.locator('.zone').count()===5&&!await page.locator('#banner').isVisible());
    const empty={format:1,zones:[{id:'verwaltung',name:'Verwaltung',color:'lime',ring:'inner'}],programs:[]};
    await replaceFile('data/programs.json',publicJson(empty));await page.reload();await page.locator('#message').waitFor();same('C32 empty catalogue approved text',await page.locator('#message-text').textContent(),'Noch keine Programme eingetragen.');
    await screenshot(page,'empty');
    check('C51 privacy remains reachable in empty state',await page.locator('#privacy').isVisible());
    // Acceptance uses actual local nginx and actual state, without route substitution.
    const acceptance=await publicAcceptance(server.origin);check('C52 C53 C54 C55 public acceptance on real nginx and empty catalogue',acceptance.ok&&acceptance.catalogue==='empty');
    same('C44 no console errors',seen.console.filter((m)=>m.type==='error').map((m)=>m.text),[]);same('C44 no uncaught errors',seen.pageErrors,[]);same('C44 no CSP violations',await violations(),[]);
    same('C44 no storage',await storedByThePage(context,page),{cookies:[],documentCookie:'',localStorage:0,sessionStorage:0,indexedDB:[],caches:[]});
    await context.close();
    const noJs=await browser.newContext({javaScriptEnabled:false});const simple=await noJs.newPage();await simple.goto(server.url);check('C47 no JavaScript keeps message and back link',await simple.locator('noscript').isVisible()&&await simple.getByRole('link',{name:'Startseite'}).isVisible());await screenshot(simple,'no-javascript');await noJs.close();
    if(process.env.TEAMWORK_EVIDENCE_DIR) check('C57 all eight states have four verified viewport screenshots', ['normal','partial','empty-zone','none-reachable','unknown','unavailable','empty','no-javascript'].every((state)=>[1280,390,820,1440].every((width)=>fs.existsSync(path.join(process.env.TEAMWORK_EVIDENCE_DIR,state+'-'+width+'.png')))));
  });
} finally { if(browser)await browser.close();if(server)await server.stop(); }
