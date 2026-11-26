const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// The same scroll strip the project views use: swipe, scroll, arrow keys or the two buttons.
// A click on a picture opens the image dialog; without JavaScript the link shows the picture itself.
function strip(entry,study,indices,label){
 const n=indices.length;
 const figures=indices.map((index,i)=>{
  const media=entry.images[index],caption=study.captions[index];
  if(!media||!caption)throw new Error('Missing reference image or caption: '+entry.id+'/'+index);
  return `<figure><a class="pv-zoom" tabindex="-1" href="${esc(media.src)}" data-reference-image title="Bild groß öffnen"><img loading="lazy" width="${esc(media.width)}" height="${esc(media.height)}" src="${esc(media.src)}" alt="${esc(caption)}"></a><figcaption><b>${i+1}/${n}</b> ${esc(caption)}</figcaption></figure>`;
 }).join('');
 const nav=n>1?`<div class="pv-nav"><button type="button" class="pill" data-strip="-1" aria-label="Vorheriges Bild"><span class="flip" aria-hidden="true">‹</span></button><button type="button" class="pill" data-strip="1" aria-label="Nächstes Bild"><span class="flip" aria-hidden="true">›</span></button></div>`:'';
 return `<div class="pv-strip-w"><div class="pv-strip" tabindex="0" role="group" aria-label="${esc(label)} · ${n}">${figures}</div>${nav}</div>`;
}

// One build-time body serves the enhanced project view and the readable fallback.
export function renderReferenceStory(entry,study){
 const indices=study.sections.flatMap(s=>s.images);
 if(indices.length!==entry.images.length||new Set(indices).size!==entry.images.length)throw new Error('Reference story must include each source image once: '+entry.id);
 const videos=(entry.videos||[]).length?`<section class="pv-sec"><h3>Videos (nicht eingebettet)</h3><ul class="pv-vl">${entry.videos.map(x=>`<li><span class="vk" lang="en" dir="ltr">${esc(x.label)}</span><a class="lk" href="${esc(x.href)}" rel="noopener" lang="en" dir="ltr">${esc(x.title)}</a></li>`).join('')}</ul></section>`:'';
 return `<div class="pv case-study" lang="de" dir="ltr">
<div class="pv-meta"><span class="y">${esc(entry.year)}</span><span class="c">${esc(entry.client)}</span></div>
<header class="pv-hd"><p class="case-eyebrow">${esc(study.what)}</p><h2 class="pv-title" id="pvt-${esc(entry.id)}">${esc(study.title)}</h2><p class="case-lead">${esc(study.summary)}</p></header>
<dl class="case-facts"><div><dt>Meine Rolle</dt><dd>${esc(study.role)}</dd></div><div><dt>Weitere Aufgaben</dt><dd>${esc(study.tasks)}</dd></div></dl>
${study.sections.map(section=>`<section class="pv-sec"><h3>${esc(section.heading)}</h3>${section.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}${strip(entry,study,section.images,section.heading)}</section>`).join('')}
${videos}<section class="pv-sec case-tools"><h3>Werkzeuge und Technologien</h3><p>${esc(study.tools)}</p></section>
<div class="lks">${entry.links.map(link=>link.href?`<a class="lk" href="${esc(link.href)}"${/^https?:/.test(link.href)?' rel="noopener"':''}>${esc(link.u)}</a>`:`<span class="lk none">${esc(link.u)} · nicht geprüft</span>`).join('')}</div>
<details class="pv-sec case-original"><summary class="pill">Originaltext · EN</summary><p lang="en" dir="ltr">${esc(entry.year)} · ${esc(entry.client)} · ${esc(entry.scope)}</p><p class="original" lang="en" dir="ltr">${esc(entry.original)}</p></details>
${entry.media?`<details class="pv-sec case-original"><summary class="pill">Originalansicht aus dem Portfolio</summary><a href="${esc(entry.media)}"><img loading="lazy" src="${esc(entry.media)}" alt="${esc(entry.client)} · Originalansicht aus dem Portfolio"></a></details>`:''}
</div>`;
}
