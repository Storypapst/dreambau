(() => {
'use strict';
const D=window.Dream, doc=document, entry=doc.getElementById('source-entry');
let viewCssReady, view, comparison, data, stopDraw, source='', shown=0, rows=[], following=true, lastScroll=0, lastFrame=0, previousPick='';
const fmt=n=>new Intl.NumberFormat('de-DE',{maximumFractionDigits:1}).format(n), bytes=s=>new TextEncoder().encode(s).length;
function loadScript(url){return new Promise((resolve,reject)=>{const s=doc.createElement('script');s.src=url;s.onload=resolve;s.onerror=()=>{s.remove();reject(new Error('Quelltext konnte nicht geladen werden.'));};doc.head.append(s);});}
function node(tag,text,className){const n=doc.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;}
function makeView(base){
 const css=node('link');css.rel='stylesheet';css.href=base+'source-view.css';viewCssReady=new Promise((resolve,reject)=>{css.onload=resolve;css.onerror=()=>reject(new Error('Ansicht konnte nicht geladen werden.'));});doc.head.append(css);
 view=node('dialog',null,'code-view');view.lang='de';view.dir='ltr';view.setAttribute('aria-labelledby','cv-title');
 view.innerHTML='<header class="cv-head"><h2 id="cv-title">Quelltext</h2><button type="button" id="cv-close">Schließen <kbd>Esc</kbd></button></header><div class="cv-split"><section class="cv-source" aria-label="Quelltext der laufenden Animation"><div class="cv-file"><span id="cv-file"></span><button id="cv-follow" aria-pressed="true" type="button">Mitlesen</button></div><div class="cv-code" tabindex="0" aria-label="Quelltext"></div><progress class="cv-progress" max="1" value="0" aria-label="Fortschritt"></progress><div class="cv-actions"><button type="button" id="cv-copy">Kopieren</button><button type="button" id="cv-compare">Vergleich</button><button type="button" id="cv-picture">Bild</button></div><p class="cv-status" role="status"></p></section><aside class="cv-data" aria-label="Datenblatt"><dl><div><dt>Die Animation</dt><dd><button type="button" class="cv-size" id="cv-size"></button></dd></div><div><dt>Runtime (shell.js)</dt><dd id="cv-runtime"></dd></div><div><dt>Ladezeit dieser Animation</dt><dd id="cv-load"></dd></div></dl><canvas id="cv-preview" aria-hidden="true" width="640" height="360"></canvas><p class="cv-description"></p></aside></div>';
 doc.body.append(view);view.querySelector('#cv-close').onclick=()=>view.close();
 view.addEventListener('close',()=>{if(comparison?.open)comparison.close();stopDraw?.();stopDraw=null;entry.focus();});
 view.querySelector('#cv-copy').onclick=async()=>{try{await navigator.clipboard.writeText(source);view.querySelector('.cv-status').textContent='Quelltext kopiert.';}catch{view.querySelector('.cv-status').textContent='Kopieren nicht verfügbar. Quelltext markieren und kopieren.';}};
 view.querySelector('#cv-follow').onclick=()=>{following=!following;view.querySelector('#cv-follow').setAttribute('aria-pressed',String(following));if(following)draw(D.state.T);};
 view.querySelector('#cv-picture').onclick=()=>{const on=view.classList.toggle('picture-mode');view.querySelector('#cv-picture').textContent=on?'Text':'Bild';};
 for(const id of ['cv-size','cv-compare'])view.querySelector('#'+id).onclick=openComparison;
 view.querySelector('.cv-code').addEventListener('scroll',()=>{if(Math.abs(view.querySelector('.cv-code').scrollTop-lastScroll)>3){following=false;view.querySelector('#cv-follow').setAttribute('aria-pressed','false');}});
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&view.open){e.preventDefault();e.stopImmediatePropagation();comparison?.open?comparison.close():view.close();}},true);
 window.addEventListener('resize',()=>{if(view.open){buildRows();draw(D.state.T);}});
}
function buildRows(){
 const code=view.querySelector('.cv-code'), ctx=doc.createElement('canvas').getContext('2d'), style=getComputedStyle(code);
 ctx.font=style.font;const col=getComputedStyle(view.querySelector('.cv-num')||code).flexBasis;
 const cpl=Math.max(24,Math.floor((code.clientWidth-(parseFloat(col)||50)-18)/ctx.measureText('M').width));
 code.replaceChildren();rows=[];
 for(let a=0;a<source.length;){let end=Math.min(a+cpl,source.length),nl=source.indexOf('\n',a);if(nl>=a&&nl<end)end=nl+1;
  const row=node('div',null,'cv-row'), num=node('span',String(rows.length+1),'cv-num'),text=node('span','','cv-text');num.setAttribute('aria-hidden','true');row.dataset.a=String(a);row.append(num,text);code.append(row);rows.push({a,end,row,text});a=end;
 }
}
function draw(t){
 if(!view?.open)return;
 if(doc.documentElement.classList.contains('static')){view.close();return;}
 const target=Math.floor(source.length*Math.max(0,Math.min(1,t/(D.prods[D.state.id].fin-1.5))));
 const now=performance.now(), dt=lastFrame?Math.min(.1,(now-lastFrame)/1000):1/60;lastFrame=now;
 shown=t>=D.prods[D.state.id].fin?target:target-shown>14?shown+(target-shown)*(1-Math.exp(-6.5*dt)):target;
 const count=Math.floor(shown);let active;
 for(const r of rows){const n=Math.max(0,Math.min(r.end-r.a,count-r.a)), text=source.slice(r.a,r.a+n);if(r.text.textContent!==text)r.text.textContent=text;const current=count>=r.a&&count<r.end;r.row.classList.toggle('cur',current);if(current)active=r;}
 const code=view.querySelector('.cv-code');if(following&&active){const line=parseFloat(getComputedStyle(code).lineHeight);code.scrollTop=Math.max(0,rows.indexOf(active)*line+8-.68*code.clientHeight);lastScroll=code.scrollTop;}
 view.querySelector('.cv-progress').value=Math.min(1,t/D.prods[D.state.id].fin);
 const follow=view.querySelector('#cv-follow');follow.disabled=t>=D.prods[D.state.id].fin;follow.setAttribute('aria-pressed',String(following));
 const canvas=view.querySelector('#cv-preview');canvas.getContext('2d').drawImage(doc.getElementById('c'),0,0,canvas.width,canvas.height);
}
function openComparison(){
 if(!data?.length)return;
 if(!comparison){comparison=node('dialog',null,'code-comparison');comparison.lang='de';comparison.dir='ltr';comparison.setAttribute('aria-labelledby','cc-title');doc.body.append(comparison);comparison.addEventListener('click',e=>{if(e.target===comparison)comparison.close();});}
 let pick;for(let attempt=0;attempt<50;attempt++){pick=['small','middle','big'].map(band=>{const pool=data.filter(e=>e.band===band);return pool[Math.floor(Math.random()*pool.length)];});if(pick.map(e=>e.id).join()!==previousPick)break;}previousPick=pick.map(e=>e.id).join();
 comparison.replaceChildren();const head=node('header',null,'cv-head'), title=node('h3','Größenvergleich');title.id='cc-title';const close=node('button','Schließen');close.type='button';close.onclick=()=>comparison.close();head.append(title,close);comparison.append(head,node('p','Fläche = Größe. KB = 1.000 Byte, MB = 1.000.000 Byte.'));
 const own=bytes(source);
 for(const reference of pick){const row=node('section',null,'comparison-row');row.append(node('h4',reference.label));const maximum=Math.max(own,reference.bytes), edge=n=>150*Math.sqrt(n/maximum), svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 160 160');svg.setAttribute('role','img');svg.setAttribute('aria-label','Flächenvergleich: Animation '+own+' Byte; '+reference.label+' '+reference.bytes+' Byte.');
  for(const [size,color] of [[reference.bytes,'#e9edf5'],[own,'#ffbe64']]){const rect=doc.createElementNS(svg.namespaceURI,'rect');rect.setAttribute('x','5');rect.setAttribute('y',String(155-edge(size)));rect.setAttribute('width',String(edge(size)));rect.setAttribute('height',String(edge(size)));rect.setAttribute('fill','none');rect.setAttribute('stroke',color);svg.append(rect);}row.append(svg,node('p',(reference.estimate?'etwa ':'')+fmt(reference.bytes)+' Byte'+(reference.range?' · '+reference.range:'')),node('p',fmt(reference.bytes)+' ÷ '+fmt(own)+' = '+fmt(reference.bytes/own)));
  const sources=node('details'), summary=node('summary','Quellen · '+reference.kind);sources.append(summary,node('p',reference.sourceText));for(const r of reference.references){const section=node('section');section.append(node('p',r.title+' · '+r.classification),node('p',r.description));for(const url of r.urls){const link=node('a',url);link.href=url;link.rel='noreferrer';section.append(link,node('br'));}sources.append(section);}if(reference.unavailable)sources.append(node('p',reference.unavailable));row.append(sources);comparison.append(row);
 }
 comparison.showModal();
}
D.openSourceView=async base=>{
 const id=D.state.id;if(!id||!D.prods[id])throw new Error('Animation lädt noch.');
 if(!D.sourceTexts?.[id])await loadScript(base+'p/'+id+'.src.js');
 if(!D.sourceFacts)await loadScript(base+'source-facts.js');
 if(!D.codeComparisons)await loadScript(base+'comparisons.js');data=D.codeComparisons;
 source=D.sourceTexts[id];if(!view)makeView(base);await viewCssReady;
 view.querySelector('#cv-file').textContent='p/'+id+'.js';view.querySelector('#cv-size').textContent=fmt(bytes(source)/1000)+' KB';
 view.querySelector('#cv-runtime').textContent=fmt(D.sourceFacts.runtimeBytes/1000)+' KB';
 const timing=performance.getEntriesByName(new URL('p/'+id+'.js',base).href).find(e=>e.entryType==='resource');view.querySelector('#cv-load').textContent=timing?fmt(timing.duration)+' ms':'nicht verfügbar';
 view.querySelector('.cv-description').textContent=doc.getElementById('blind').textContent;view.querySelector('.cv-status').textContent='';view.classList.remove('picture-mode');shown=0;lastFrame=0;following=true;
 view.showModal();buildRows();stopDraw=D.onDraw(draw);D.redraw();
};
})();
