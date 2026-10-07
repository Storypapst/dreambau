// Public Quelltext entry remains usable when the optional language runtime is absent.
import {injectLangs} from '../lib.mjs';
import {checker,part,openPage,started,problems} from './_helpers.mjs';
export const rows=['VER-23'];
export default async function({base,browser}){
 const check=checker();
 for(const [name,spec,allow] of [
  ['missing language runtime',{runtime:null},[{url:'/i18n.js'},{pageError:'ReferenceError'}]],
  ['previous page without language scripts',{page:'previous'},[]]
 ])await part(check,name,async()=>{
  const t=await openPage(browser,{w:1440,h:900});
  try{
   await injectLangs(t.page,spec);await t.page.goto(base+'/?anim=4k&test=1');await started(t.page);
   await t.page.locator('#source-entry').click();
   // A failed lazy open leaves an explanatory title rather than an open dialog.
   await t.page.waitForFunction(()=>document.querySelector('.code-view')?.open||document.querySelector('#source-entry').title,null,{timeout:5000});
   const open=await t.page.locator('.code-view[open]').count();check(name+': German Quelltext opens',open===1,await t.page.locator('#source-entry').getAttribute('title'));
   if(open){
    check(name+': source heading remains German',await t.page.locator('#cv-title').textContent()==='Wie klein ist das?');
    check(name+': actual source and byte measurement remain readable',(await t.page.locator('.cv-code').innerText()).trim().length>100&&/\d/.test(await t.page.locator('#cv-anim-size').textContent()));
    await t.page.locator('#cv-scale-tab').click();check(name+': all three scale entries remain readable',await t.page.locator('.cv-animation').count()===3);
    await t.page.locator('#cv-size').click();await t.page.locator('.code-comparison[open]').waitFor();check(name+': comparison remains usable in German',await t.page.locator('#cc-title').textContent()==='Größenvergleich');
    await t.page.keyboard.press('Escape');await t.page.keyboard.press('Escape');check(name+': closing returns focus to Quelltext',await t.page.locator('#source-entry').evaluate(n=>n===document.activeElement));
   }
   for(const p of await problems(t,allow))check(name+': no application failure beyond injected browser reports',false,p);
  }finally{await t.close();}
 });
 check.done();
}
