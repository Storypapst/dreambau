(() => {
'use strict';
const menu=document.getElementById('site-menu'), close=menu.querySelector('.menu-close'), entry=document.getElementById('source-entry');
const standalone=!document.currentScript.src;
const base=standalone?new URL('.',location.href).href:new URL('.',document.currentScript.src).href;
const panel=menu.querySelector('nav'),summary=menu.querySelector('summary'),grip=menu.querySelector('.menu-grip');
const phone=matchMedia('(max-width:600px),(pointer:coarse) and (max-height:520px)'),calm=matchMedia('(prefers-reduced-motion:reduce)');
let motion=null,closing=false,drag=null,ignoreClick=false;
close.hidden=false;grip.hidden=false;
function stopMotion(){motion?.cancel();motion=null;}
function slide(from,to,done){
 stopMotion();if(calm.matches||!phone.matches){done?.();return;}
 motion=panel.animate([{transform:'translateY('+from+'px)'},{transform:'translateY('+to+'px)'}],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)',fill:'both'});
 motion.finished.then(()=>{stopMotion();done?.();},()=>{});
}
function finishClose(){menu.open=false;closing=false;stopMotion();summary.focus({preventScroll:true});}
function shut(from=0){if(!menu.open||closing)return;closing=true;drag=null;slide(from,panel.getBoundingClientRect().height+32,finishClose);}
summary.addEventListener('click',e=>{if(menu.open){e.preventDefault();shut();}});
menu.addEventListener('toggle',()=>{if(menu.open&&!closing){slide(panel.getBoundingClientRect().height+32,0);if(phone.matches)grip.focus({preventScroll:true});}else if(!menu.open){closing=false;stopMotion();drag=null;}});
close.addEventListener('click',()=>shut());
menu.querySelector('.menu-backdrop').addEventListener('click',()=>shut());
window.addEventListener('keydown',e=>{
 if(!menu.open)return;
 if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();shut();}
 if(e.key==='Tab'&&phone.matches){const controls=[...panel.querySelectorAll('a[href],button:not([hidden])')];const first=controls[0],last=controls.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===summary)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
},true);
document.addEventListener('click',e=>{if(menu.open&&!menu.contains(e.target))shut();});
grip.addEventListener('pointerdown',e=>{
 if(e.button!==0||!phone.matches||closing)return;stopMotion();drag={id:e.pointerId,y:e.clientY,t:performance.now(),dy:0};ignoreClick=false;grip.setPointerCapture(e.pointerId);
 motion=panel.animate([{transform:'translateY(0)'},{transform:'translateY('+innerHeight+'px)'}],{duration:innerHeight,fill:'both'});motion.pause();
});
grip.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;drag.dy=Math.max(0,e.clientY-drag.y);motion.currentTime=drag.dy;});
function endDrag(e,cancelled){
 if(!drag||e.pointerId!==drag.id)return;const {dy,t}=drag;drag=null;ignoreClick=dy>8||cancelled;const dismiss=!cancelled&&(dy>=72||dy>24&&dy/Math.max(1,performance.now()-t)>.7);stopMotion();if(dismiss)shut(dy);else slide(dy,0);
}
grip.addEventListener('pointerup',e=>endDrag(e,false));grip.addEventListener('pointercancel',e=>endDrag(e,true));grip.addEventListener('lostpointercapture',e=>endDrag(e,true));
grip.addEventListener('click',()=>{if(ignoreClick){ignoreClick=false;return;}shut();});
window.addEventListener('resize',()=>{if(drag){drag=null;ignoreClick=true;}if(closing)finishClose();else stopMotion();});
let loaded=null,failed=false,opening=false;
if(standalone)return; // Single-file animation export keeps the native links, without network-loaded source tools.
entry.hidden=false;
const entryLabels={"ar":"كود المصدر","be":"Зыходны код","bg":"Изходен код","bs":"Izvorni kod","ca":"Codi font","cs":"Zdrojový kód","da":"Kildekode","de":"Quelltext","el":"Πηγαίος κώδικας","en":"Source code","es":"código fuente","et":"Lähtekood","fa":"کد منبع","fi":"Lähdekoodi","fr":"Code source","ga":"Cód foinse","he":"קוד מקור","hi":"सोर्स कोड","hr":"Izvorni kod","hu":"Forráskód","id":"Kode sumber","is":"Upprunakóði","it":"Codice sorgente","ja":"ソースコード","ko":"소스 코드","lb":"Source Code","lt":"Šaltinio kodas","lv":"Avota kods","mk":"Изворниот код","mt":"Kodiċi tas-sors","nb":"Kildekode","nl":"Broncode","pa-Arab":"اصل کوڈ","pl":"Kod źródłowy","pt-BR":"Código fonte","ro":"Cod sursă","ru":"Исходный код","sk":"Zdrojový kód","sl":"Izvorna koda","sq":"Kodi burimor","sr-Latn":"Izvorni kod","sv":"Källkod","tr":"Kaynak kodu","uk":"Вихідний код","ur":"سورس کوڈ","vi":"Mã nguồn","zh-Hans":"源代码"};
const status=document.createElement('span');status.className='blind';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.lang='de';status.dir='ltr';document.body.append(status);
window.Dream.onLang?.(({lang,dir})=>{if(!failed){entry.lang=lang;entry.dir=dir;entry.querySelector('.source-entry-label').textContent=entryLabels[lang]||entryLabels.de;}updateSize();});
function updateSize(){entry.hidden=document.documentElement.classList.contains('static');if(entry.hidden){const view=document.querySelector('.code-view');if(view?.open)view.close();return;}const id=window.Dream?.state?.id;if(!id)return;const timing=performance.getEntriesByName(base+'p/'+id+'.js').find(e=>e.entryType==='resource');if(timing?.decodedBodySize>0)entry.querySelector('#source-entry-size').textContent=new Intl.NumberFormat(window.Dream.state.lang||'de',{maximumFractionDigits:1,numberingSystem:'latn'}).format(timing.decodedBodySize/1000)+' KB';}
const observer=new MutationObserver(updateSize);observer.observe(document.documentElement,{attributes:true,attributeFilter:['class','data-anim']});updateSize();
entry.addEventListener('click',async()=>{
 if(opening)return;opening=true;menu.open=false;failed=false;status.textContent='';entry.removeAttribute('title');const lang=window.Dream.state.lang||'de';entry.lang=lang;entry.dir=document.documentElement.dir||'ltr';entry.querySelector('.source-entry-label').textContent=entryLabels[lang]||entryLabels.de;entry.setAttribute('aria-busy','true');
 try{
  loaded=loaded||new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=base+'source-view.js';script.onload=resolve;script.onerror=()=>{script.remove();loaded=null;reject(new Error('Quelltext-Ansicht konnte nicht geladen werden.'));};document.head.append(script);});
  await loaded;await window.Dream.openSourceView(base);
 }catch(error){failed=true;entry.lang='de';entry.dir='ltr';entry.querySelector('.source-entry-label').textContent='Erneut versuchen';status.textContent='Quelltext konnte nicht geladen werden. Erneut versuchen.';}
 finally{opening=false;entry.removeAttribute('aria-busy');}
});
})();
