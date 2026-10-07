(() => {
'use strict';
const menu=document.getElementById('site-menu'), close=menu.querySelector('.menu-close'), entry=document.getElementById('source-entry');
const standalone=!document.currentScript.src;
const base=standalone?new URL('.',location.href).href:new URL('.',document.currentScript.src).href;
close.hidden=false;
function shut(){menu.open=false;menu.querySelector('summary').focus();}
close.addEventListener('click',shut);
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.open){e.preventDefault();e.stopImmediatePropagation();shut();}},true);
document.addEventListener('click',e=>{if(menu.open&&!menu.contains(e.target))menu.open=false;});
let loaded=null;
if(standalone)return; // Single-file animation export keeps the native links, without network-loaded source tools.
entry.hidden=false;
function updateSize(){const id=window.Dream?.state?.id;if(!id)return;const timing=performance.getEntriesByName(base+'p/'+id+'.js').find(e=>e.entryType==='resource');if(timing?.decodedBodySize>0)entry.textContent='Quelltext '+new Intl.NumberFormat('de-DE',{maximumFractionDigits:1}).format(timing.decodedBodySize/1000)+' KB';}
const observer=new MutationObserver(updateSize);observer.observe(document.documentElement,{attributes:true,attributeFilter:['class','data-anim']});updateSize();
entry.addEventListener('click',async()=>{
 menu.open=false;
 try{
  loaded=loaded||new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=base+'source-view.js';script.onload=resolve;script.onerror=()=>{script.remove();loaded=null;reject(new Error('Quelltext-Ansicht konnte nicht geladen werden.'));};document.head.append(script);});
  await loaded;await window.Dream.openSourceView(base);
 }catch(error){entry.textContent='Quelltext · erneut versuchen';entry.title=error.message;}
});
})();
