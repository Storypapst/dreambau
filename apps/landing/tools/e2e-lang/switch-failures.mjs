import assert from 'node:assert/strict';
import { openPage, problems } from './_helpers.mjs';
export const rows=['VER-9d','VER-10','VER-11','VER-14','VER-18','VER-19','VER-20','VER-23'];
export default async function(ctx){
 const t=await openPage(ctx.browser,{w:390,h:844,contextOptions:{reducedMotion:'reduce'}});
 await t.page.addInitScript(()=>{window.__textures=0;for(const [name,n]of [['createTexture',1],['deleteTexture',-1]]){const f=WebGL2RenderingContext.prototype[name];WebGL2RenderingContext.prototype[name]=function(...args){const result=f.apply(this,args);if(name==='deleteTexture'?args[0]:result)window.__textures+=n;return result;};}});
 try{
  await t.page.goto(ctx.base+'/?lang=de&anim=4k&px=40000');await t.page.waitForFunction(()=>Dream.state.mode==='still');
  const baseline=await t.page.evaluate(()=>({textures:__textures,T:Dream.state.T,muted:Dream.state.muted,audio:Dream.state.audio}));
  for(const lang of ['en','ar','ja','de','en','de'])assert.equal(await t.page.evaluate(code=>Dream.setLang(code),lang),true);
  assert.deepEqual(await t.page.evaluate(()=>({textures:__textures,T:Dream.state.T,muted:Dream.state.muted,audio:Dream.state.audio})),baseline);
  const glyph=await t.page.evaluate(()=>Dream.i18n.missing('A\u{10FFFE}\u{10FFFE} B'));assert.deepEqual(glyph,['U+10FFFE']);
  const rollback=await t.page.evaluate(async()=>{
   const before={lang:Dream.state.lang,lines:document.querySelector('#tag').dataset.lines,url:location.href,canvases:document.querySelectorAll('canvas').length,textures:__textures};
   const clear=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.lang==='ja')throw Error('injected raster error');return clear.apply(this,args);};
   let ok;try{ok=await Dream.setLang('ja');}finally{CanvasRenderingContext2D.prototype.clearRect=clear;}
   return {ok,before,after:{lang:Dream.state.lang,lines:document.querySelector('#tag').dataset.lines,url:location.href,canvases:document.querySelectorAll('canvas').length,textures:__textures}};
  });assert.equal(rollback.ok,false);assert.deepEqual(rollback.after,rollback.before);
  const texture=await t.page.evaluate(async()=>{const before={lang:Dream.state.lang,lines:document.querySelector('#tag').dataset.lines,textures:__textures},image=WebGL2RenderingContext.prototype.texImage2D;WebGL2RenderingContext.prototype.texImage2D=function(){throw Error('injected upload');};let ok;try{ok=await Dream.setLang('en');}finally{WebGL2RenderingContext.prototype.texImage2D=image;}return {ok,before,after:{lang:Dream.state.lang,lines:document.querySelector('#tag').dataset.lines,textures:__textures}};});assert.equal(texture.ok,false);assert.deepEqual(texture.after,texture.before);
  const allocation=await t.page.evaluate(async()=>{const before={lang:Dream.state.lang,textures:__textures},create=WebGL2RenderingContext.prototype.createTexture;WebGL2RenderingContext.prototype.createTexture=()=>null;let ok;try{ok=await Dream.setLang('en');}finally{WebGL2RenderingContext.prototype.createTexture=create;}return {ok,before,after:{lang:Dream.state.lang,textures:__textures}};});assert.equal(allocation.ok,false);assert.deepEqual(allocation.after,allocation.before);
  // A picker tap and M/Escape inside the modal must not unlock sound or skip the film.
  await t.page.locator('#lang').click();await t.page.keyboard.press('m');await t.page.keyboard.press('Escape');assert.equal(await t.page.locator('#lang').getAttribute('aria-expanded'),'false');assert.equal(await t.page.evaluate(()=>Dream.state.muted),baseline.muted);
  assert.deepEqual(await problems(t),[]);
 }finally{await t.close();}
 const fallback=await openPage(ctx.browser,{contextOptions:{reducedMotion:'reduce'}});
 try{await fallback.page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='webgl2'?null:get.call(this,kind,...args);};});await fallback.page.goto(ctx.base+'/?lang=de&anim=4k');await fallback.page.waitForFunction(()=>Dream.state.error);assert.equal(await fallback.page.evaluate(()=>Dream.setLang('en')),true);assert.equal(await fallback.page.locator('html').getAttribute('lang'),'en');assert.equal(await fallback.page.locator('#cta .words').textContent(),await fallback.page.evaluate(()=>Dream.t('cta.words')));}finally{await fallback.close();}
}
