import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROOT } from '../lib.mjs';
import { openPage, started, problems } from './_helpers.mjs';
export const rows=['VER-14','VER-25'];export const byDefault=false;
export default async function(ctx){
 const out=ROOT+'/dist/lang-sheet/rtl';fs.mkdirSync(out,{recursive:true});
 for(const id of ['4k','16k','64k']){
  const t=await openPage(ctx.browser,{w:320,h:180});
  try{
   await t.page.goto(ctx.base+'/?lang=ar&anim='+id+'&test=1&px=40000');await started(t.page);assert.equal(await t.page.evaluate(()=>Dream.state.lang),'ar',JSON.stringify(await t.page.evaluate(()=>Dream.state))); 
   const links=[];for(let time=38;time<=53.5;time+=.5){await t.page.evaluate(time=>Dream.test.seek(time),time);const name=id+'-'+time.toFixed(1)+'.png';await t.page.screenshot({path:out+'/'+name});links.push('<figure><img src="'+name+'"><figcaption>'+time.toFixed(1)+'s</figcaption></figure>');}
   fs.writeFileSync(out+'/'+id+'.html','<!doctype html><html lang="en"><meta charset="utf-8"><title>'+id+' Arabic frames</title><style>body{background:#06080d;color:#fff;font:14px system-ui;display:grid;grid-template-columns:repeat(4,320px);gap:8px}figure{margin:0}img{width:320px;height:180px}</style>'+links.join(''));
   assert.deepEqual(await problems(t),[]);ctx.info(id+':32 Arabic frames exported; joining quality requires visual inspection');
  }finally{await t.close();}
 }
}
