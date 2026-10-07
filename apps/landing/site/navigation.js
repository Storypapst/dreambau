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
