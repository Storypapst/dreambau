/*! dreambau.com language mechanism: classic scripts, system fonts, text-only DOM updates. */
(() => {
'use strict';
const D=window.Dream=window.Dream||{},S=D.state=D.state||{},I=D.i18n={},reg={},waiting={},failures={},listeners=[];
S.lang='de';S.langSource='fallback';S.langFallback='';
I.fam='"Inter","SF Pro Display","Segoe UI",Roboto,"Helvetica Neue",Arial,"Liberation Sans","DejaVu Sans",system-ui,sans-serif';
let manifest=null,applied=false,booted=false,switching=false,bootFailure=null;
const deadline=Date.now()+3000;
const root=document.documentElement,Q=new URLSearchParams(location.search),base=document.currentScript&&document.currentScript.src?document.currentScript.src.replace(/[^/]*$/,''):'';
I.registered=()=>Object.keys(reg);
I.canonical=tag=>{
 if(typeof tag!=='string'||!tag.trim())return null;
 const parts=tag.trim().replace(/_/g,'-').split('-');let code=parts.shift().toLowerCase();
 if(!/^[a-z]{2,3}$/.test(code))return null;
 code=({iw:'he',in:'id',mo:'ro'})[code]||code;
 let script='',region='';for(const p of parts){if(p.length===1)break;if(!script&&/^[a-z]{4}$/i.test(p))script=p.toLowerCase();else if(!region&&/^([a-z]{2}|\d{3})$/i.test(p))region=p.toUpperCase();}
 if(code==='zh')return script?(script==='hans'?'zh-Hans':null):['TW','HK','MO'].includes(region)?null:'zh-Hans';
 if(code==='pa')return script?(script==='arab'?'pa-Arab':null):region==='PK'?'pa-Arab':null;
 if(code==='sr')return 'sr-Latn';if(['no','nb','nn'].includes(code))return 'nb';if(code==='pt')return 'pt-BR';
 return !manifest||manifest.langs.some(l=>l.c===code)?code:null;
};
I.choose=({offered,query,languages})=>{
 let c;if(typeof query==='string'&&/^[A-Za-z0-9_-]{1,16}$/.test(query)&&(c=I.canonical(query))&&offered.includes(c))return {code:c,source:'url'};
 for(const tag of Array.isArray(languages)?languages:[]){c=I.canonical(tag);if(c&&offered.includes(c))return {code:c,source:'browser'};}
 return {code:'de',source:'fallback'};
};
const row=code=>manifest&&manifest.langs.find(l=>l.c===code);
const offered=()=>manifest?manifest.langs.filter(l=>l.c==='de'||l.o===undefined||l.o===1||(manifest.dev&&Q.get('draft')==='1')):[];
let resolveReady;I.ready=new Promise(r=>{resolveReady=r;});
D.lang=(code,texts)=>{reg[code]=texts;if(waiting[code]){waiting[code](true);delete waiting[code];}if(code==='de'&&applied&&S.lang==='de')apply();};
function load(code){
 if(reg[code])return Promise.resolve(true);
 if(waiting[code])return waiting[code].promise;
 let settle;const promise=new Promise(r=>{settle=r;});let done=false;const finish=(ok,why="load")=>{if(done)return;done=true;clearTimeout(timer);if(!ok){failures[code]=why;if(bootFailure)bootFailure(why);}delete waiting[code];settle(ok);};
 const timer=setTimeout(()=>finish(false,"timeout"),applied?3000:Math.max(0,deadline-Date.now()));waiting[code]=finish;finish.promise=promise;
 const script=document.createElement('script');script.src=base+'i18n/'+code+'.js';
 script.addEventListener('error',()=>finish(false),{once:true});script.addEventListener('load',()=>{if(!reg[code])finish(false);},{once:true});document.head.appendChild(script);return promise;
}
const glyphCache=new Map();
I.missing=text=>{
 const chars=[...new Set([...String(text)].filter(c=>!/[\s\p{Cc}\p{Cf}\p{Zs}\p{Zl}\p{Zp}]/u.test(c)))],fresh=chars.filter(c=>!glyphCache.has(c));
 if(fresh.length){
  const refs=['\uFFFF','\uFDD0','\u{10FFFF}','\u{10FFFE}'],all=refs.concat(fresh),cv=document.createElement('canvas');cv.width=1280;cv.height=Math.ceil(all.length/32)*40;
  const x=cv.getContext('2d',{willReadFrequently:true});if(!x)return [];
  x.fillStyle='#fff';x.font='800 28px '+I.fam;x.textAlign='center';x.textBaseline='middle';
  all.forEach((c,i)=>{const a=(i%32)*40,b=Math.floor(i/32)*40;x.save();x.beginPath();x.rect(a,b,40,40);x.clip();x.fillText((/\p{M}/u.test(c)?'\u25CC':'')+c,a+20,b+20);x.restore();});
  const px=x.getImageData(0,0,cv.width,cv.height).data;
  const cells=all.map((_,i)=>{let n=0,h=2166136261,minX=40,maxX=-1,minY=40,maxY=-1;const a=i%32*40,b=Math.floor(i/32)*40;for(let y=0;y<40;y++)for(let z=0;z<40;z++){const v=px[((b+y)*1280+a+z)*4+3];h=Math.imul(h^v,16777619);if(v){n++;minX=Math.min(minX,z);maxX=Math.max(maxX,z);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}return {n,h,w:maxX-minX+1,t:maxY-minY+1};});
  const uniform=cells[0].n===cells[1].n&&cells[0].h===cells[1].h&&cells[2].n===cells[3].n&&cells[2].h===cells[3].h;
  fresh.forEach((c,i)=>{const p=cells[i+4],r=cells[c.codePointAt(0)>65535?2:0];glyphCache.set(c,!p.n||(uniform?p.n===r.n&&p.h===r.h:p.w===r.w&&p.t===r.t&&Math.abs(p.n-r.n)<=r.n*.35));});
 }
 return chars.filter(c=>glyphCache.get(c)).map(c=>'U+'+c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0'));
};
const visible=['tag.1','tag.2','cta.words','snd.on_label','skip.label','play.label','lang.title','lang.close','lang.error'];
I.available=()=>offered().filter(l=>l.c==='de'||l.c===S.lang||!I.missing(l.n).length).map(({c,n,d,s})=>({c,n,d,s}));
I.format=(n,options)=>{try{return new Intl.NumberFormat(S.lang,{...options,numberingSystem:'latn'}).format(n);}catch{return new Intl.NumberFormat('de',{...options,numberingSystem:'latn'}).format(n);}};
D.t=(key,vars)=>{
 const words=reg[S.lang]||{},de=reg.de||{},r=row(S.lang),value=typeof words[key]==='string'?words[key]:typeof de[key]==='string'?de[key]:'';
 const v={tag1:words['tag.1']||de['tag.1']||'',tag2:words['tag.2']||de['tag.2']||'',brand:r&&r.d==='rtl'?'\u2066dreambau.com\u2069':'dreambau.com',name:r?r.n:'Deutsch',code:r?r.s:'DE',count:I.available().length,...vars};
 return value.replace(/\{([^{}]+)\}/g,(all,k)=>k in v?String(v[k]):all);
};
function apply(){
 root.lang=S.lang;root.dir=(row(S.lang)||{}).d||'ltr';
 for(const el of document.querySelectorAll('[data-i18n]')){const key=el.dataset.i18n.replace('{anim}',S.id||''),value=D.t(key);if(value){el.textContent=value;el.lang=reg[S.lang]&&typeof reg[S.lang][key]==='string'?S.lang:'de';}}
 for(const el of document.querySelectorAll('[data-i18n-attr]')){const [attr,key]=el.dataset.i18nAttr.split(':');const value=D.t(key);if(value){el.setAttribute(attr,value);el.lang=reg[S.lang]&&typeof reg[S.lang][key]==='string'?S.lang:'de';}}
 const tag=document.querySelector('#tag'),a=D.t('tag.1'),b=D.t('tag.2');if(tag&&a&&b){tag.dataset.lines=[a,b,'dreambau.com'].join('|');tag.querySelectorAll('span').forEach((el,i)=>{el.textContent=[a,b,'dreambau.com'][i]||'';});}
 const code=document.querySelector('#lang .code');if(code)code.textContent=(row(S.lang)||{s:'DE'}).s;
 const sw=document.querySelector('.sw');if(sw)sw.hidden=I.available().length<2;
 for(const el of document.querySelectorAll('[data-i18n-keep]')){const url=new URL(el.getAttribute('href'),location.href);if(url.origin===location.origin&&S.langSource==='url'){url.searchParams.set('lang',S.lang);el.href=url.href;}}
 const snd=document.querySelector('#snd');if(snd){const hint=D.t(S.muted?'snd.hint_on':'snd.hint_off');if(hint)snd.title=hint;}
}
I.apply=apply;
function notify(){applied=true;for(const fn of listeners)fn({lang:S.lang,dir:root.dir});}
D.onLang=fn=>{listeners.push(fn);if(applied)fn({lang:S.lang,dir:root.dir});};
async function startup(){
 if(booted||!manifest)return;booted=true;
 const chosen=I.choose({offered:offered().map(l=>l.c),query:Q.get('lang'),languages:Array.isArray(navigator.languages)?navigator.languages:[navigator.language]});
 let rejectBoot;const failed=new Promise(r=>{rejectBoot=r;});bootFailure=why=>rejectBoot({failure:why});
 const result=await Promise.race([Promise.all([load('de'),chosen.code==='de'?Promise.resolve(true):load(chosen.code)]).then(loaded=>({loaded})),failed]);bootFailure=null;
 let code=chosen.code;const words=reg[code];
 if(result.failure){code='de';S.langFallback=result.failure;}
 else if(!result.loaded[1]||!words){code='de';S.langFallback=failures[chosen.code]||'load';}
 else if(!words['tag.1']||!words['tag.2']){code='de';S.langFallback='keys';}
 else if(code!=='de'&&I.missing(visible.map(k=>words[k]||'').join('')).length){code='de';S.langFallback='glyphs';}
 S.lang=code;S.langSource=S.langFallback?'fallback':chosen.source;
 apply();notify();resolveReady();
}
I.manifest=m=>{
 const seen=new Set();if(!m||m.v!==1||typeof m.dev!=='boolean'||!Array.isArray(m.langs)||!m.langs.length||m.langs.some(l=>!l||['c','n','s'].some(k=>typeof l[k]!=='string'||!l[k])||!['ltr','rtl'].includes(l.d)||seen.has(l.c)||!(seen.add(l.c))||('o'in l?!m.dev||![0,1].includes(l.o):m.dev))||!seen.has('de')){S.langFallback='manifest';resolveReady();return;}
 manifest=m;startup();
};
document.addEventListener('error',e=>{if(!applied&&e.target&&e.target.src===base+'i18n/index.js'){booted=true;S.langFallback='manifest';resolveReady();}},true);
setTimeout(()=>{if(!booted){booted=true;S.langFallback='manifest';resolveReady();}},3000);
D.setLang=async code=>{
 if(switching||!offered().some(l=>l.c===code))return false;if(code===S.lang)return true;switching=true;
 const dip=document.querySelector('#dip'),fade=dip&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const options=document.querySelectorAll('#langsheet [role=option]');for(const el of options)el.setAttribute('aria-disabled','true');
 try{
  if(!await load(code))return false;
  const words=reg[code];if(!words||!words['tag.1']||!words['tag.2']||I.missing(visible.map(k=>words[k]||'').join('')).length)return false;
  if(fade){dip.classList.add('on');await new Promise(r=>setTimeout(r,260));}
  if(I.redraw&&!I.redraw([words['tag.1'],words['tag.2'],'dreambau.com'],code,(row(code)||{}).d))return false;
  S.lang=code;S.langSource='url';S.langFallback='';apply();
  const url=new URL(location.href);url.searchParams.set('lang',code);history.replaceState(null,'',url);notify();return true;
 }catch{return false;}finally{if(fade)dip.classList.remove('on');for(const el of options)el.removeAttribute('aria-disabled');switching=false;}
};
function wireSheet(){
 const trigger=document.querySelector('#lang'),sheet=document.querySelector('#langsheet');if(!trigger||!sheet)return;
 const backdrop=document.querySelector('#langback');
 const list=sheet.querySelector('.lang-list'),close=sheet.querySelector('.lang-close'),error=sheet.querySelector('.lang-error');let previous=[];
 const hide=()=>{sheet.hidden=true;if(backdrop)backdrop.hidden=true;trigger.setAttribute('aria-expanded','false');for(const [el,value]of previous)el.inert=value;previous=[];trigger.focus();};
 trigger.addEventListener('click',()=>{
  list.replaceChildren();for(const entry of I.available()){
   const btn=document.createElement('button');btn.type='button';btn.textContent=entry.n;btn.lang=entry.c;btn.dir=entry.d;btn.setAttribute('role','option');btn.setAttribute('aria-selected',String(entry.c===S.lang));if(entry.c===S.lang)btn.setAttribute('aria-current','true');
   btn.addEventListener('click',async()=>{if(switching)return;sheet.setAttribute('aria-busy','true');if(await D.setLang(entry.c))hide();else{error.textContent=D.t('lang.error');error.hidden=false;}sheet.removeAttribute('aria-busy');});list.appendChild(btn);
  }
  sheet.hidden=false;if(backdrop)backdrop.hidden=false;error.hidden=true;sheet.querySelector('.lang-title').textContent=D.t('lang.title');close.textContent=D.t('lang.close');trigger.setAttribute('aria-expanded','true');
  for(const el of document.body.children)if(el!==sheet&&el!==backdrop&&el.tagName!=='SCRIPT'){previous.push([el,el.inert]);el.inert=true;}
  const current=list.querySelector('[aria-selected="true"]');if(current){current.focus();current.scrollIntoView({block:'nearest'});}
 });
 close.addEventListener('click',hide);
 sheet.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();hide();return;}
  const buttons=[...sheet.querySelectorAll('button')],at=buttons.indexOf(document.activeElement);
  if(e.key==='Tab'){e.preventDefault();buttons[(at+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}
  if(['ArrowDown','ArrowRight','ArrowUp','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();const options=[...list.children],i=options.indexOf(document.activeElement);const n=e.key==='Home'?0:e.key==='End'?options.length-1:(i+(['ArrowUp','ArrowLeft'].includes(e.key)?-1:1)+options.length)%options.length;options[n].focus();}
 });
 document.addEventListener('pointerdown',e=>{if(!sheet.hidden&&!sheet.contains(e.target)&&!trigger.contains(e.target))hide();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{apply();wireSheet();},{once:true});else{apply();wireSheet();}
})();
