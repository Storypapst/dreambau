const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// One build-time body serves the enhanced project view and the readable fallback.
export function renderReferenceStory(entry,study){
 const image=index=>{
  const media=entry.images[index],caption=study.captions[index];
  if(!media||!caption)throw new Error('Missing reference image or caption: '+entry.id+'/'+index);
  return `<figure><a class="project-image" href="${esc(media.src)}" data-reference-image aria-label="${esc(caption)} · Bild vergrößern"><img loading="lazy" width="${esc(media.width)}" height="${esc(media.height)}" src="${esc(media.src)}" alt="${esc(caption)}"><span class="image-action" aria-hidden="true">Bild vergrößern ↗</span></a><figcaption>${esc(caption)}</figcaption></figure>`;
 };
 const indices=study.sections.flatMap(s=>s.images);
 if(indices.length!==entry.images.length||new Set(indices).size!==entry.images.length)throw new Error('Reference story must include each source image once: '+entry.id);
 return `<div class="pv case-study" lang="de" dir="ltr">
<div class="pv-meta"><span class="y">${esc(entry.year)}</span><span class="c">${esc(entry.client)}</span></div>
<header class="pv-hd"><p class="case-eyebrow">${esc(study.what)}</p><h2 class="pv-title" id="pvt-${esc(entry.id)}">${esc(study.title)}</h2><p class="case-lead">${esc(study.summary)}</p></header>
<dl class="case-facts"><div><dt>Meine Rolle</dt><dd>${esc(study.role)}</dd></div><div><dt>Weitere Aufgaben</dt><dd>${esc(study.tasks)}</dd></div></dl>
${study.sections.map(section=>`<section class="pv-sec"><h3>${esc(section.heading)}</h3>${section.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}<div class="pv-gal">${section.images.map(image).join('')}</div></section>`).join('')}
<section class="pv-sec case-tools"><h3>Werkzeuge und Technologien</h3><p>${esc(study.tools)}</p></section>
<div class="lks">${entry.links.map(link=>link.href?`<a class="lk" href="${esc(link.href)}">${esc(link.u)}</a>`:`<span class="lk none">${esc(link.u)} · nicht geprüft</span>`).join('')}</div>
<details class="pv-sec case-original"><summary class="pill">Originaltext · EN</summary><p lang="en" dir="ltr">${esc(entry.year)} · ${esc(entry.client)} · ${esc(entry.scope)}</p><p class="original" lang="en" dir="ltr">${esc(entry.original)}</p></details>
<details class="pv-sec case-original"><summary class="pill">Originalansicht aus dem Portfolio</summary><a href="${esc(entry.media)}"><img loading="lazy" src="${esc(entry.media)}" alt="${esc(entry.client)} · Originalansicht aus dem Portfolio"></a></details>
</div>`;
}
