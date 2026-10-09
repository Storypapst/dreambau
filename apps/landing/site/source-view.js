/* Quelltext B. The presentation never changes the shipped animation text. */
(() => {
'use strict';
const D=window.Dream,doc=document,entry=doc.getElementById('source-entry');
let statusTimer,viewCssReady,view,comparison,data,stopDraw,source='',shown=0,rows=[],following=true,lastScroll=0,lastFrame=0,previousPick='',classes,tab='picture',picture=false,comparisonOpener;
const bytes=s=>new TextEncoder().encode(s).length,fmt=(n,d=1)=>D.i18n?.format?D.i18n.format(n,{maximumFractionDigits:d}):new Intl.NumberFormat('de',{maximumFractionDigits:d}).format(n),node=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const de={title:'Wie klein ist das?',close:'Schließen',copy:'Kopieren',copied:'Quelltext kopiert.',copyError:'Kopieren nicht verfügbar. Quelltext markieren und kopieren.',follow:'Mitlesen',compare:'Vergleich',picture:'Bild',text:'Text',pictureTab:'Bild dazu',scale:'Maßstab',animation:'Die Animation',page:'Startseite + Animation',runtime:'Laufzeit',load:'Ladezeit',exact:'Byte · so ausgeliefert',uncompressed:'unkomprimiert',unavailable:'nicht verfügbar',caption:'Das Bild, das dieser Code gerade zeichnet.',description:'Was zu sehen und zu hören ist',all:'Alle drei Animationen',area:'Fläche = Größe. KB = 1.000 Byte, MB = 1.000.000 Byte.',comparisonTitle:'Größenvergleich',sources:'Quellen',measured:'gemessen',documented:'dokumentiert',estimate:'Schätzung',calculation:'Rechnung',about:'etwa',rounding:'Die Faktoren sind gerundet. Bei Schätzungen ist auch der Vergleichswert geschätzt.',origin:'Quellenangaben im deutschen Original',smaller:'Die Animation ist {factor}× kleiner.',larger:'Die Animation ist {factor}× größer.',same:'Die Größen sind gleich.',ownSize:'Animation: {size} KB',legend:'Animation · Vergleich. Jede Zeichnung hat ihren eigenen Maßstab.',source:'Quelltext',actions:'Aktionen',view:'Ansicht',calm:'Bewegung reduziert: Hier steht die fertige Animation.',dot:'Die kleinere Fläche ist als Punkt vergrößert, damit sie sichtbar bleibt.',external:'Fremdangabe'};
const tr=(key,vars={})=>{let s=D.sourceLocales?.[D.state.lang||'de']?.[key]||de[key]||key;for(const [k,v]of Object.entries(vars))s=s.replaceAll('{'+k+'}',String(v));return s;};
function loadScript(url){return new Promise((resolve,reject)=>{const s=doc.createElement('script');s.src=url;s.onload=resolve;s.onerror=()=>{s.remove();reject(new Error('Source view asset could not be loaded.'));};doc.head.append(s);});}
const icon=path=>'<svg class="cv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
function button(id,key,shape){return '<button type="button" id="'+id+'">'+(shape?icon(shape):'')+'<span data-cv="'+key+'"></span></button>';}
function loadViewCSS(base){
 const css=node('link');css.rel='stylesheet';css.href=base+'source-view.css';viewCssReady=new Promise((resolve,reject)=>{css.onload=resolve;css.onerror=()=>{css.remove();viewCssReady=null;reject(new Error('Source view stylesheet could not be loaded.'));};});doc.head.append(css);return viewCssReady;
}
function makeView(){
 view=node('dialog',null,'code-view');view.setAttribute('aria-labelledby','cv-title');
 view.innerHTML='<header class="cv-head"><h2 id="cv-title" data-cv="title"></h2><span class="cv-chip" id="cv-identity"></span><span class="cv-grow"></span>'+button('cv-copy','copy','<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H4v13h4"/>')+'<button type="button" id="cv-close" aria-label=""><kbd>Esc</kbd><span aria-hidden="true">✕</span></button></header><div class="cv-split"><section class="cv-source"><div class="cv-file"><span id="cv-file"></span><span id="cv-file-info"></span>'+button('cv-follow','follow','<path d="M12 4v11M7.5 11.5L12 16l4.5-4.5M5 20h14"/>')+'</div><div class="cv-code" dir="ltr" tabindex="0"></div><progress class="cv-progress" max="1" value="0"></progress></section><aside class="cv-data"><dl class="cv-nums"><div class="cv-big"><dt data-cv="animation"></dt><dd><button type="button" class="cv-size" id="cv-size" aria-haspopup="dialog"><span id="cv-anim-size"></span><span class="cv-unit">KB</span>'+icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7" r=".5"/>')+'</button></dd><span class="cv-exact" id="cv-exact"></span></div><div><dt data-cv="page"></dt><dd id="cv-page-size"></dd></div><div><dt data-cv="runtime"></dt><dd id="cv-runtime"></dd></div><div><dt data-cv="load"></dt><dd id="cv-load"></dd></div></dl><div class="cv-tabs" role="group"><button type="button" id="cv-picture-tab" data-cv="pictureTab" aria-pressed="true"></button><button type="button" id="cv-scale-tab" data-cv="scale" aria-pressed="false"></button></div><div class="cv-pane" id="cv-picture-pane"><canvas id="cv-preview" aria-hidden="true" width="640" height="360"></canvas><p class="cv-caption" data-cv="caption"></p><h4 data-cv="description"></h4><p class="cv-description"></p></div><div class="cv-pane" id="cv-scale-pane" hidden><label class="cv-all"><input id="cv-all" type="checkbox" checked><span data-cv="all"></span></label><p class="cv-caption" data-cv="area"></p><div id="cv-scale-figure"></div><div id="cv-animations"></div></div></aside><div class="cv-actions" role="group">'+button('cv-compare','compare','<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><rect x="3.5" y="11.5" width="9" height="9" rx="1"/><rect x="3.5" y="16.5" width="4" height="4"/>')+button('cv-picture','picture','<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10.5" r="1.7"/><path d="M4.5 17.5l4.7-4.7 3.6 3.6 2.7-2.7 4 4"/>')+'</div></div><footer class="cv-close-footer"><button type="button" id="cv-close-bottom" data-cv="close"></button></footer><p class="cv-status" role="status"></p>';
 doc.body.append(view);for(const close of view.querySelectorAll('#cv-close,#cv-close-bottom'))close.addEventListener('click',()=>view.close());
 view.addEventListener('close',()=>{if(comparison?.open)comparison.close();stopDraw?.();stopDraw=null;entry.focus();});
 view.querySelector('#cv-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(source);view.querySelector('.cv-status').textContent=tr('copied');}catch{view.querySelector('.cv-status').textContent=tr('copyError');}clearTimeout(statusTimer);statusTimer=setTimeout(()=>{view.querySelector('.cv-status').textContent='';},1800);});
 view.querySelector('#cv-follow').addEventListener('click',()=>{following=!following;view.querySelector('#cv-follow').setAttribute('aria-pressed',String(following));if(following)D.redraw();});
 view.querySelector('#cv-picture').addEventListener('click',()=>{picture=!picture;view.classList.toggle('picture-mode',picture);view.querySelector('#cv-picture').setAttribute('aria-pressed',String(picture));view.querySelector('#cv-picture span').textContent=tr(picture?'text':'picture');D.redraw();});
 for(const id of ['cv-size','cv-compare'])view.querySelector('#'+id).addEventListener('click',e=>openComparison(e.currentTarget));
 view.querySelector('#cv-picture-tab').addEventListener('click',()=>setTab('picture'));
 view.querySelector('#cv-scale-tab').addEventListener('click',()=>setTab('scale'));
 view.querySelector('#cv-all').addEventListener('change',buildScale);
 view.querySelector('.cv-code').addEventListener('scroll',()=>{if(Math.abs(view.querySelector('.cv-code').scrollTop-lastScroll)>3){following=false;view.querySelector('#cv-follow').setAttribute('aria-pressed','false');}});
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&view.open){e.preventDefault();e.stopImmediatePropagation();comparison?.open?comparison.close():view.close();}},true);
 window.addEventListener('resize',()=>{if(view.open){layout();buildRows();D.redraw();}});
 D.onLang?.(()=>{if(view){localise();buildScale();if(comparison?.open)renderComparison();}});
}
function localise(){
 const lang=D.state.lang||'de';view.lang=lang;view.dir=doc.documentElement.dir||'ltr';
 for(const el of view.querySelectorAll('[data-cv]'))el.textContent=tr(el.dataset.cv);
 view.querySelector('#cv-close-bottom').textContent=lang==='de'?de.close:tr('close');view.querySelector('#cv-close').ariaLabel=tr('close');view.querySelector('.cv-source').ariaLabel=tr('source');view.querySelector('.cv-code').ariaLabel=tr('source');view.querySelector('.cv-tabs').ariaLabel=tr('view');view.querySelector('.cv-actions').ariaLabel=tr('actions');
 view.querySelector('#cv-identity').textContent=({ '4k':'Rohbau','16k':'Traumhaus','64k':'Skyline'}[D.state.id])+' · '+D.state.id;
 view.querySelector('#cv-anim-size').textContent=fmt(bytes(source)/1000);view.querySelector('#cv-exact').textContent='= '+fmt(bytes(source),0)+' '+tr('exact');
 view.querySelector('.cv-description').textContent=D.t?.('blind.'+D.state.id)||doc.getElementById('blind')?.textContent||tr('unavailable');
 view.querySelector('#cv-picture span').textContent=tr(picture?'text':'picture');
}
function layout(){
 const stack=innerHeight>=innerWidth||innerWidth<760;view.classList.toggle('cv-stack',stack);view.classList.toggle('cv-tight',!stack&&innerWidth<1100);
 const follow=view.querySelector('#cv-follow'),copy=view.querySelector('#cv-copy'),bar=view.querySelector('.cv-actions'),held=doc.activeElement;
 if(stack){bar.prepend(copy);bar.prepend(follow);}else{view.querySelector('.cv-file').append(follow);view.querySelector('.cv-head').insertBefore(copy,view.querySelector('#cv-close'));}
 if(held===follow||held===copy)held.focus({preventScroll:true});
 comparison?.classList.toggle('cv-stack',stack);comparison?.classList.toggle('cv-tight',!stack&&innerWidth<1100);
}
function setTab(mode){tab=mode;view.querySelector('#cv-picture-tab').setAttribute('aria-pressed',String(mode==='picture'));view.querySelector('#cv-scale-tab').setAttribute('aria-pressed',String(mode==='scale'));view.querySelector('#cv-picture-pane').hidden=mode!=='picture';view.querySelector('#cv-scale-pane').hidden=mode!=='scale';if(mode==='scale')buildScale();else D.redraw();}
function classify(src){
 const cls=new Uint8Array(src.length);let st=0,prevId=false;
 for(let i=0;i<src.length;i++){const c=src.charCodeAt(i),isL=c>=65&&c<=90||c>=97&&c<=122||c===95||c===36,isD=c>=48&&c<=57,base=isL?1:isD?(prevId?1:2):0;prevId=isL||isD&&prevId;if(!st){cls[i]=base;if(c===96){st=1;cls[i]=4;}else if(c===34){st=2;cls[i]=4;}else if(c===39){st=3;cls[i]=4;}}else{cls[i]=4+base;if(c===92&&i+1<src.length){cls[++i]=4;continue;}if(st===1&&c===96||st===2&&c===34||st===3&&c===39){st=0;cls[i]=4;}}}return cls;
}
function paint(text,a,end){const frag=doc.createDocumentFragment();for(let i=a;i<end;){const kind=classes[i];let j=i+1;while(j<end&&classes[j]===kind)j++;frag.append(node('span',source.slice(i,j),'cv-token c'+kind));i=j;}text.replaceChildren(frag);}
function buildRows(){
 const code=view.querySelector('.cv-code'),ctx=doc.createElement('canvas').getContext('2d'),style=getComputedStyle(code);ctx.font=style.font;
 const cpl=Math.max(24,Math.floor((code.clientWidth-(view.classList.contains('cv-stack')?36:50)-18)/ctx.measureText('M').width));code.replaceChildren();rows=[];
 for(let a=0;a<source.length;){let end=Math.min(a+cpl,source.length),nl=source.indexOf('\n',a);if(nl>=a&&nl<end)end=nl+1;const row=node('div',null,'cv-row'),num=node('span',String(rows.length+1),'cv-num'),text=node('span','','cv-text');num.setAttribute('aria-hidden','true');row.append(num,text);code.append(row);rows.push({a,end,row,text,count:-1});a=end;}
 view.querySelector('#cv-file-info').textContent=matchMedia('(prefers-reduced-motion: reduce)').matches?tr('calm'):fmt(bytes(source),0)+' Byte';
}
function draw(t){
 if(!view?.open)return;if(doc.documentElement.classList.contains('static')){view.close();return;}
 const fin=D.prods[D.state.id].fin,calm=matchMedia('(prefers-reduced-motion: reduce)').matches||t>=fin,target=calm?source.length:Math.floor(source.length*Math.max(0,Math.min(1,t/(fin-1.5))));
 const now=performance.now(),dt=lastFrame?Math.min(.1,(now-lastFrame)/1000):1/60;lastFrame=now;shown=calm?target:target-shown>14?shown+(target-shown)*(1-Math.exp(-6.5*dt)):target;const count=Math.floor(shown);let active;
 for(const r of rows){const n=Math.max(0,Math.min(r.end-r.a,count-r.a)),current=!calm&&count>=r.a&&count<r.end;if(n!==r.count||r.current!==current){paint(r.text,r.a,r.a+n);if(current){const caret=node('span','','cv-caret');caret.setAttribute('aria-hidden','true');r.text.append(caret);}r.count=n;r.current=current;}r.row.classList.toggle('cur',current);if(current)active=r;}
 const code=view.querySelector('.cv-code');if(following&&active){const line=parseFloat(getComputedStyle(code).lineHeight);code.scrollTop=Math.max(0,rows.indexOf(active)*line+8-.68*code.clientHeight);lastScroll=code.scrollTop;}
 view.querySelector('.cv-progress').value=calm?1:Math.min(1,t/fin);const follow=view.querySelector('#cv-follow');follow.disabled=calm||picture&&view.classList.contains('cv-stack');follow.setAttribute('aria-pressed',String(following));
 const canvas=view.querySelector('#cv-preview');if(tab==='picture'&&(!view.classList.contains('cv-stack')||picture))canvas.getContext('2d').drawImage(doc.getElementById('c'),0,0,canvas.width,canvas.height);
}
function buildScale(){
 if(!D.sourceTexts)return;const all=view.querySelector('#cv-all').checked,ids=all?['4k','16k','64k']:[D.state.id],values=ids.map(id=>({id,n:bytes(D.sourceTexts[id]),label:({'4k':'Rohbau','16k':'Traumhaus','64k':'Skyline'}[id])})),maximum=Math.max(...values.map(v=>v.n));
 const fig=view.querySelector('#cv-scale-figure');fig.replaceChildren();const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 530 280');svg.setAttribute('role','img');svg.setAttribute('aria-label',values.map(v=>v.label+' '+fmt(v.n,0)+' Byte').join(', '));
 values.slice().reverse().forEach((v,i)=>{const edge=250*Math.sqrt(v.n/maximum),rect=doc.createElementNS(svg.namespaceURI,'rect');for(const[k,n]of Object.entries({x:8,y:270-edge,width:edge,height:edge,fill:'none',stroke:v.id===D.state.id?'#ffbe64':'#e9edf5','stroke-width':2}))rect.setAttribute(k,String(n));svg.append(rect);const label=doc.createElementNS(svg.namespaceURI,'text');label.setAttribute('x','280');label.setAttribute('y',String(50+i*55));label.setAttribute('fill',v.id===D.state.id?'#ffbe64':'#e9edf5');label.textContent=v.label+' · '+fmt(v.n/1000)+' KB';svg.append(label);});fig.append(svg);
 const list=view.querySelector('#cv-animations');list.replaceChildren();for(const v of values){const item=node('section',null,'cv-animation');item.append(node('h4',v.label+' · '+fmt(v.n,0)+' Byte'),node('p',D.t?.('blind.'+v.id)||tr('unavailable')));list.append(item);}
}
let picks=[];
function openComparison(opener){
 if(!data?.length)return;comparisonOpener=opener;
 if(!comparison){comparison=node('dialog',null,'code-comparison');comparison.setAttribute('aria-labelledby','cc-title');doc.body.append(comparison);comparison.addEventListener('click',e=>{if(e.target===comparison)comparison.close();});comparison.addEventListener('close',()=>comparisonOpener?.focus());}
 for(let attempt=0;attempt<50;attempt++){picks=['small','middle','big'].map(band=>{const pool=data.filter(e=>e.band===band);return pool[Math.floor(Math.random()*pool.length)];});if(picks.map(e=>e.id).join()!==previousPick)break;}previousPick=picks.map(e=>e.id).join();renderComparison();layout();comparison.showModal();
}
function referenceText(reference,key){return D.sourceLocales?.[D.state.lang||'de']?.references?.[reference.id]?.[key]||reference[key];}
function renderComparison(){
 comparison.lang=D.state.lang||'de';comparison.dir=doc.documentElement.dir||'ltr';comparison.replaceChildren();const head=node('header',null,'cc-head'),title=node('h3',tr('comparisonTitle'));title.id='cc-title';const close=node('button','✕');close.type='button';close.ariaLabel=tr('close');close.addEventListener('click',()=>comparison.close());head.append(title,close);comparison.append(node('span',null,'cc-grip'),head);
 const body=node('div',null,'cc-body'),own=bytes(source);body.append(node('p',tr('ownSize',{size:fmt(own/1000)}),'cc-intro'),node('p',tr('legend'),'cc-key'));const cards=node('div',null,'cc-cards'),sources=node('details',null,'cc-sources');sources.append(node('summary',tr('sources')));
 for(const r of picks){const card=node('section',null,'comparison-row'),label=referenceText(r,'label'),svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 160 160');svg.setAttribute('role','img');svg.setAttribute('aria-label',tr('animation')+' '+fmt(own,0)+' Byte; '+label+' '+fmt(r.bytes,0)+' Byte');const maximum=Math.max(own,r.bytes),edge=n=>150*Math.sqrt(n/maximum);
 for(const[size,color,cls]of[[r.bytes,'#e9edf5','cc-reference'],[own,'#ffbe64','cc-own']].sort((a,b)=>b[0]-a[0])){const rect=doc.createElementNS(svg.namespaceURI,'rect');for(const[k,n]of Object.entries({x:5,y:155-Math.max(2.6,edge(size)),width:Math.max(2.6,edge(size)),height:Math.max(2.6,edge(size)),fill:cls==='cc-own'?color:'#e9edf512',stroke:color}))rect.setAttribute(k,String(n));svg.append(rect);}card.append(svg);
 const info=node('div',null,'cc-info');info.append(node('h4',label));const size=node('p',(r.estimate?tr('about')+' ':'')+fmt(r.bytes/(r.bytes>=1e6?1e6:1000))+(r.bytes>=1e6?' MB':' KB'),'cc-size');size.append(node('span',tr(r.estimate?'estimate':r.kind==='gemessen'?'measured':'documented'),'cc-kind'));info.append(size,node('p',referenceText(r,'range')||'','cc-range'));card.append(info);
 const ratio=Math.max(own,r.bytes)/Math.min(own,r.bytes);card.append(node('p',tr(own===r.bytes?'same':own<r.bytes?'smaller':'larger',{factor:fmt(ratio)}),'cc-sentence'),node('p',fmt(Math.max(own,r.bytes),0)+' ÷ '+fmt(Math.min(own,r.bytes),0)+' = '+fmt(ratio),'cc-calculation'),node('p',referenceText(r,'sourceText'),'cc-source'));if(edge(Math.min(own,r.bytes))<2.6)card.querySelector('.cc-source').append(node('span',tr('dot'),'cc-dot'));cards.append(card);
 const section=node('section');section.append(node('h4',label));const translated=D.sourceLocales?.[D.state.lang||'de']?.references?.[r.id]?.records;for(let i=0;i<r.references.length;i++){const rec=r.references[i],record=node('section');record.append(node('p',rec.title+' · '+tr(rec.classification==='gemessen'?'measured':rec.classification==='Schätzung'?'estimate':rec.classification==='Rechnung'?'calculation':rec.classification==='Fremdangabe'?'external':'documented')));const description=node('p',translated?.[i]||rec.description);if(!translated&&(D.state.lang||'de')!=='de')description.lang='de';record.append(description);for(const url of rec.urls){const link=node('a',url);link.href=url;link.rel='noreferrer';record.append(link);}section.append(record);}if(r.unavailable){const missing=node('p',referenceText(r,'unavailable')||r.unavailable);section.append(missing);}sources.append(section);
 }
 body.append(cards,node('p',tr('rounding'),'cc-rounding'));if((D.state.lang||'de')!=='de')body.append(node('p',tr('origin'),'cc-original'));body.append(sources);comparison.append(body);
}
D.openSourceView=async base=>{
 const visitResources=performance.getEntriesByType('resource').map(e=>e.name),id=D.state.id;if(!id||!D.prods[id])throw new Error('Animation is still loading.');
 const loads=[];
 for(const animation of ['4k','16k','64k'])if(!D.sourceTexts?.[animation])loads.push(loadScript(base+'p/'+animation+'.src.js'));
 if(!D.sourceFacts)loads.push(loadScript(base+'source-facts.js'));
 if(!D.codeComparisons)loads.push(loadScript(base+'comparisons.js'));
 if(!D.sourceLocales)loads.push(loadScript(base+'source-locales.js'));
 loads.push(viewCssReady||loadViewCSS(base));
 // Wait for every independent request before reporting failure, so retry cannot duplicate pending loads.
 const settled=await Promise.allSettled(loads),failure=settled.find(result=>result.status==='rejected');
 if(failure)throw failure.reason;
 data=D.codeComparisons;source=D.sourceTexts[id];classes=classify(source);if(!view)makeView();view.querySelector('#cv-file').textContent='p/'+id+'.js';localise();
 const initial=new Set(visitResources.filter(url=>url.startsWith(base)).map(url=>url.slice(base.length))),pageBytes=D.sourceFacts.files['index.html']+[...initial].reduce((sum,name)=>sum+(D.sourceFacts.files[name]||0),0);
 view.querySelector('#cv-page-size').textContent=fmt(pageBytes/1000)+' KB';view.querySelector('#cv-page-size').title=tr('uncompressed');view.querySelector('#cv-runtime').textContent=fmt(D.sourceFacts.runtimeBytes/1000)+' KB';const timing=performance.getEntriesByName(new URL('p/'+id+'.js',base).href).find(e=>e.entryType==='resource');view.querySelector('#cv-load').textContent=timing?fmt(timing.duration)+' ms':tr('unavailable');
 view.querySelector('.cv-status').textContent='';picture=false;view.classList.remove('picture-mode');shown=0;lastFrame=0;following=true;view.showModal();layout();setTab('picture');buildRows();stopDraw?.();stopDraw=D.onDraw(draw);draw(D.state.T);D.redraw();
};
})();
