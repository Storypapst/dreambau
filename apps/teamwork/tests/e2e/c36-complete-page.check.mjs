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
const desktopSizes = [[1920,1080],[1440,900],[1280,720]];
const outerPrograms = publicList.programs.filter((program) => program.zone !== 'verwaltung');
const innerZone = publicList.zones.find((zone) => zone.ring === 'inner');
const shapedLists = [
  { name:'one-outer-twelve', zones:[publicList.zones[0]], programs:publicList.programs.slice(0,12).map((program)=>({...program,zone:publicList.zones[0].id})) },
  { name:'six-outer-two-each', zones:['cyan','amber','pink','violet','lime','slate'].map((color,index)=>({id:'shape-zone-'+index,name:'Prüfzone '+(index+1),color})), programs:publicList.programs.slice(0,12).map((program,index)=>({...program,zone:'shape-zone-'+Math.floor(index/2)})) },
  { name:'inner-six', zones:publicList.zones, programs:[...outerPrograms,...Array.from({length:6},(_,index)=>({id:'shape-inner-'+index,name:'Prüfung '+(index+1),purpose:'Erfundenes Verwaltungsprogramm',url:'https://shape-inner.example.test/'+index,zone:innerZone.id}))] },
  { name:'inner-zero', zones:publicList.zones, programs:outerPrograms },
  { name:'one-outer-one', zones:[publicList.zones[0]], programs:[publicList.programs[0]] },
].map((shape)=>({...shape,format:1}));
const boxGap = (a,b) => Math.hypot(Math.max(a.left-b.right,b.left-a.right,0),Math.max(a.top-b.bottom,b.top-a.bottom,0));
const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function convexHull(points) {
  const sorted = [...points].sort((a,b)=>a.x-b.x||a.y-b.y);
  if (sorted.length < 3) return sorted;
  const half = (values) => { const hull=[];for(const point of values){while(hull.length>1&&cross(hull.at(-2),hull.at(-1),point)<=0)hull.pop();hull.push(point);}return hull; };
  const lower=half(sorted),upper=half([...sorted].reverse());return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
function hullsIntersect(a,b) {
  if (!a.length || !b.length) return false;
  const onSegment = (point,start,end) => Math.abs(cross(start,end,point))<.001&&point.x>=Math.min(start.x,end.x)-.001&&point.x<=Math.max(start.x,end.x)+.001&&point.y>=Math.min(start.y,end.y)-.001&&point.y<=Math.max(start.y,end.y)+.001;
  const contains = (hull,point) => hull.length===1?Math.hypot(hull[0].x-point.x,hull[0].y-point.y)<.001:hull.length===2?onSegment(point,...hull):hull.every((start,index)=>cross(start,hull[(index+1)%hull.length],point)>=-.001);
  if (a.some((point)=>contains(b,point))||b.some((point)=>contains(a,point))) return true;
  for(const [i,start] of a.entries())for(const [j,other] of b.entries()){
    const end=a[(i+1)%a.length],otherEnd=b[(j+1)%b.length];
    if(cross(start,end,other)*cross(start,end,otherEnd)<0&&cross(other,otherEnd,start)*cross(other,otherEnd,end)<0)return true;
  }
  return false;
}
const measureLayout = (page) => page.evaluate(() => {
  const rect = (node) => { const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
  const map=document.getElementById('map');
  return {layout:document.getElementById('page').dataset.layout,viewportWidth:innerWidth,map:rect(map),hub:rect(document.querySelector('.hub')),side:rect(document.getElementById('side')),overflow:document.documentElement.scrollWidth>innerWidth,mapOverflow:getComputedStyle(map).overflow,
    tiles:[...document.querySelectorAll('.tile')].map((tile)=>({id:tile.dataset.id,zone:tile.closest('[data-zone]').dataset.zone,...rect(tile),orb:rect(tile.querySelector('.orb'))})),
    grids:[...document.querySelectorAll('.zone ul')].map((grid)=>getComputedStyle(grid).gridTemplateColumns.split(' ').length)};
});
function checkShapedLayout(label,shape,geometry) {
  const {tiles,map,hub,layout}=geometry;
  check('C36 '+label+' renders every shaped-list program without horizontal overflow',tiles.length===shape.programs.length&&!geometry.overflow);
  check('C36 M5b '+label+' contains every tile inside the map',tiles.every((tile)=>tile.left>=map.left-.01&&tile.right<=map.right+.01&&tile.top>=map.top-.01&&tile.bottom<=map.bottom+.01));
  check('C36 M5f '+label+' retains 44px targets',tiles.every((tile)=>tile.width>=44&&tile.height>=44));
  check('C36 '+label+' has no intersecting tile boxes',tiles.every((tile,index)=>tiles.slice(index+1).every((other)=>boxGap(tile,other)>0)));
  if(layout==='cluster'){
    check('C36 P2 '+label+' has 58px tiles and three columns',tiles.every((tile)=>tile.height>=58)&&geometry.grids.every((columns)=>columns===3));
    check('C36 M8 '+label+' keeps the fallback centered and at most 900px wide',map.width<=900&&Math.abs(map.left+map.width/2-geometry.viewportWidth/2)<1,JSON.stringify({mapWidth:map.width,centre:map.left+map.width/2,viewportWidth:geometry.viewportWidth}));
    return;
  }
  same('C36 '+label+' uses the permitted constellation mode',layout,'constellation');
  check('C36 M3 M4 '+label+' has the right-hand 296px side and an unnested map at least 470px high',Math.abs(geometry.side.width-296)<.1&&geometry.side.left>=map.right+17.9&&map.height>=470&&!['auto','scroll'].includes(geometry.mapOverflow));
  check('C36 M5a '+label+' clears other tile boxes by 2px',tiles.every((tile,index)=>tiles.slice(index+1).every((other)=>boxGap(tile,other)>=1.95)));
  const centre={x:hub.left+hub.width/2,y:hub.top+hub.height/2};
  const orbCentre=(tile)=>({x:tile.orb.left+tile.orb.width/2,y:tile.orb.top+tile.orb.height/2});
  check('C36 M5c '+label+' keeps every orb 12px from the hub',tiles.every((tile)=>{const point=orbCentre(tile);return Math.hypot(point.x-centre.x,point.y-centre.y)-tile.orb.width/2-hub.width/2>=11.95;}));
  const outerHulls=shape.zones.filter((zone)=>zone.ring!=='inner').map((zone)=>convexHull(tiles.filter((tile)=>tile.zone===zone.id).map(orbCentre)));
  check('C36 M5d '+label+' keeps outer zone convex hulls separate',outerHulls.every((hull,index)=>outerHulls.slice(index+1).every((other)=>!hullsIntersect(hull,other))));
  const clockwise=shape.zones.every((zone)=>{
    const angles=shape.programs.filter((program)=>program.zone===zone.id).map((program)=>{const point=orbCentre(tiles.find((tile)=>tile.id===program.id));return Math.atan2((point.y-centre.y)/(map.height/2),(point.x-centre.x)/(map.width/2));});
    return angles.slice(1).every((angle,index)=>{let delta=angle-angles[index];if(delta < -Math.PI)delta+=2*Math.PI;if(delta > Math.PI)delta-=2*Math.PI;return delta>=-2*Math.PI/180;});
  });
  check('C36 M5e '+label+' advances clockwise in file order within 2 degrees',clockwise);
}
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
      if ([1280,1440,1920].includes(width)) checkShapedLayout('example '+width+'x'+height,publicList,await measureLayout(page));
      if (geometry.layout==='constellation') {
        check('C36 tile boxes remain within map '+width,geometry.tiles.every((r)=>r.left>=geometry.map.left-.1&&r.right<=geometry.map.right+.1&&r.top>=geometry.map.top-.1&&r.bottom<=geometry.map.bottom+.1));
        check('C36 independently measured tile boxes clear each other by 2px '+width,geometry.tiles.every((r,i)=>geometry.tiles.slice(i+1).every((q)=>Math.hypot(Math.max(r.left-q.right,q.left-r.right,0),Math.max(r.top-q.bottom,q.top-r.bottom,0))>=1.95)));
      }
    }
    for (const shape of shapedLists) {
      await replaceFile('data/programs.json',publicJson({format:shape.format,zones:shape.zones,programs:shape.programs}));
      await replaceFile('data/status.json',publicJson(publicStatus(shape.programs.map((program)=>program.id),nowUtc())));
      for(const [width,height] of desktopSizes){
        const label=shape.name+' '+width+'x'+height;
        await page.setViewportSize({width,height});await page.reload();await page.locator('.tile').first().waitFor();await pause(180);
        const geometry=await measureLayout(page);checkShapedLayout(label,shape,geometry);
        await page.reload();await page.locator('.tile').first().waitFor();await pause(180);
        same('C36 M6 '+label+' repeats measured positions on a fresh load',(await measureLayout(page)).tiles,geometry.tiles);
        same('C36 '+label+' has no console errors',seen.console.filter((message)=>message.type==='error'),[]);
        same('C36 '+label+' has no uncaught page errors',seen.pageErrors,[]);
      }
    }
    await replaceFile('data/programs.json',publicJson(publicList));await replaceFile('data/status.json',publicJson(publicStatus(list.programs.map((program)=>program.id),nowUtc())));
    await page.reload();await page.locator('.tile').first().waitFor();await pause(180);
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
