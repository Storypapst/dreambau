import fs from 'node:fs';import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { launchBrowser, openObserved } from '../lib/browser.mjs';
import { startPageServer } from '../lib/page-server.mjs';
import { EXAMPLE_LIST } from '../lib/paths.mjs';
import { publicCatalogue } from '../lib/catalogue.mjs';
const list=JSON.parse(fs.readFileSync(EXAMPLE_LIST,'utf8')), catalogue=publicCatalogue(list);
const stamp=Date.parse('2026-10-07T12:00:00Z'), iso=(time)=>new Date(time).toISOString().replace('.000Z','Z');
let browser,server;
try{await run(async()=>{
 browser=await launchBrowser();server=await startPageServer();
 const observed=await openObserved(browser,{viewport:{width:390,height:844},reducedMotion:'reduce'}),{context,page}=observed;
 let ids=list.programs.map((p)=>p.id),statusStamp=stamp,fail=false,statusFailure=false,requests=0;
 await page.clock.install({time:new Date(stamp)});
 await context.route('**/teamwork/data/*',async(route)=>{
   requests++; const url=route.request().url();
   await route.fulfill({status:fail||(statusFailure&&url.endsWith('status.json'))?503:200,contentType:'application/json',headers:{Date:new Date(stamp).toUTCString(),ETag:'synthetic'},body:JSON.stringify(url.endsWith('programs.json')?catalogue:{format:1,checkedAt:iso(statusStamp),reachable:ids})});
 });
 await page.goto(server.url);await page.locator('.tile').first().waitFor();
 await page.locator('[data-id="aurora"]').focus();
 same('C40 phone DOM order starts with back and ends with privacy',await page.locator('a').evaluateAll((nodes)=>[nodes[0].id,nodes.at(-1).id]),['back','privacy']);
 ids=ids.filter((id)=>id!=='basalt'); const before=requests;
 await page.clock.runFor(600001);await page.waitForFunction(()=>document.querySelectorAll('.tile').length===20);
 check('C48 ten-minute refresh fetches both files and preserves retained focus',requests===before+2&&await page.evaluate(()=>document.activeElement.dataset.id==='aurora'));
 ids=ids.filter((id)=>id!=='aurora');await page.clock.runFor(600001);await page.waitForFunction(()=>document.querySelectorAll('.tile').length===19);
 same('C48 removed focused tile moves focus to its zone heading',await page.evaluate(()=>document.activeElement.id),'h-nord');
 fail=true;await page.clock.runFor(600001);await new Promise((r)=>setTimeout(r,100));same('C48 failed refresh retains previous catalogue',await page.locator('.tile').count(),19);
 fail=false;statusFailure=true;await page.clock.runFor(600001);await new Promise((r)=>setTimeout(r,100));same('C48 status-only failed refresh also retains previous catalogue',await page.locator('.tile').count(),19);statusFailure=false;statusStamp=stamp-10800000+20000;await page.clock.runFor(600001);await page.waitForFunction(()=>document.getElementById('stand').textContent==='Stand: vor 2 h');await page.clock.runFor(30001);await page.waitForFunction(()=>!document.getElementById('banner').hidden);
 check('C48 crossing three hours switches all programs to unknown without reload',await page.locator('.tile').count()===21&&await page.locator('#stand').textContent()==='Stand: unbekannt');
 await context.close();
 const age=await openObserved(browser),p=age.page;
 await age.context.addInitScript(()=>{Date.now=()=>Date.parse('2026-10-09T12:00:00Z');});
 await age.context.route('**/teamwork/data/*',route=>route.fulfill({status:200,contentType:'application/json',headers:{Date:new Date(stamp).toUTCString()},body:JSON.stringify(route.request().url().endsWith('programs.json')?catalogue:{format:1,checkedAt:iso(stamp-300000),reachable:list.programs.map((p)=>p.id)})}));
 await p.goto(server.url);await p.locator('.tile').first().waitFor();same('C30 age uses server Date despite visitor clock two days away',await p.locator('#stand').textContent(),'Stand: vor 5 min');await age.context.close();
 const delayed=await openObserved(browser);const arrivals=[];
 await delayed.context.route('**/teamwork/data/*',async(route)=>{arrivals.push(Date.now());await new Promise((r)=>setTimeout(r,3000));await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(route.request().url().endsWith('programs.json')?catalogue:{format:1,checkedAt:iso(stamp),reachable:list.programs.map((p)=>p.id)})});});
 await delayed.page.goto(server.url,{waitUntil:'domcontentloaded'});await delayed.page.locator('#loading').waitFor();check('C26 pending data shows loading and hub without tiles',await delayed.page.locator('h1').isVisible()&&await delayed.page.locator('.tile').count()===0&&!await delayed.page.locator('#message').isVisible());if(process.env.TEAMWORK_EVIDENCE_DIR)for(const [width,height] of [[1280,720],[390,844],[820,1180],[1440,900]]){await delayed.page.setViewportSize({width,height});await delayed.page.screenshot({path:path.join(process.env.TEAMWORK_EVIDENCE_DIR,'loading-'+width+'.png'),fullPage:true});}await delayed.page.locator('.tile').first().waitFor();check('C26 both requests start within 100ms',arrivals.length===2&&Math.abs(arrivals[0]-arrivals[1])<100);await delayed.context.close();
 for(const blocked of ['programs.json','status.json']){
   const hanging=await openObserved(browser);await hanging.context.route('**/teamwork/data/*',async(route)=>{if(route.request().url().endsWith(blocked))return;await route.continue();});
   await hanging.page.clock.install();await hanging.page.goto(server.url,{waitUntil:'domcontentloaded'});await hanging.page.locator('#loading').waitFor();await hanging.page.clock.runFor(8100);
   if(blocked==='programs.json'){await hanging.page.locator('#retry').waitFor();check('C26 catalogue request has eight-second bound',await hanging.page.locator('#message-text').textContent()==='Die Programmliste ist gerade nicht erreichbar.');}
   else{await hanging.page.locator('.tile').first().waitFor();check('C26 status request has eight-second bound',await hanging.page.locator('.unknown').count()===21);}
   await hanging.context.close();
 }
});}finally{if(browser)await browser.close();if(server)await server.stop();}
