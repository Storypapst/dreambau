// The pages (spec 5.1): form, thanks, error. German text in the markup with data-i18n keys (L1, L2). No inline style or script (X5).
import fs from 'node:fs';

export const T = JSON.parse(fs.readFileSync(new URL('./texts.de.json', import.meta.url), 'utf8'));

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = key => `<span data-i18n="${key}">${esc(T[key])}</span>`;

function head(title) {
  return `<!doctype html>
<html lang="de" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} · dreambau.com</title>
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#06080d">
<link rel="icon" href="data:,">
<link rel="stylesheet" href="/kontakt/kontakt.css">
</head>`;
}

const scripts = cfg => cfg.i18n ? '\n<script src="/homepage-assets/i18n.js"></script>\n<script src="/homepage-assets/i18n/index.js"></script>' : '';

function footer(cfg) {
  return `<footer class="foot"><p>${t('contact.alt')} <a href="mailto:info@dreambau.com" dir="ltr">info@dreambau.com</a></p>
<p class="legal"><a href="${esc(cfg.links.imprint)}" data-i18n="legal.imprint">${esc(T['legal.imprint'])}</a><i aria-hidden="true">·</i><a href="${esc(cfg.links.privacy)}" data-i18n="legal.privacy">${esc(T['legal.privacy'])}</a></p></footer>`;
}

const intro = (title = 'contact.title') => `<header class="intro"><a class="brand" href="/" dir="ltr" data-i18n-keep>dreambau.com</a>
<h1 data-i18n="${title}">${esc(T[title])}</h1>`;

// opts: { values, errors, notice, token, lang }
export function formPage(cfg, opts) {
  const v = opts.values || {}, errs = opts.errors || {};
  const order = ['name', 'email', 'message'];
  const first = order.find(f => errs[f]);
  const field = (name) => {
    const err = errs[name];
    const attrs = err ? ` aria-invalid="true" aria-describedby="e-${name}"${first === name ? ' autofocus' : ''}` : '';
    const msg = err ? `\n<p class="fielderr" id="e-${name}" data-i18n="${err}">${esc(T[err])}</p>` : '';
    return { attrs, msg };
  };
  const n = field('name'), e = field('email'), m = field('message');
  const action = '/kontakt/' + (opts.lang ? `?lang=${encodeURIComponent(opts.lang)}` : '');
  const notices = [opts.notice && `<p class="notice" role="alert" data-i18n="${opts.notice}">${esc(T[opts.notice])}</p>`,
    first && `<p class="notice" role="alert" data-i18n="contact.err.title">${esc(T['contact.err.title'])}</p>`].filter(Boolean).join('\n');
  return `${head(T['contact.title'])}
<body>
<main>
${intro()}
<p class="lead">${t('contact.lead')} ${t('contact.promise')}</p></header>
<div class="formcol">
${notices}
<form method="post" action="${esc(action)}" accept-charset="utf-8">
<label for="f-name" data-i18n="contact.name.label">${esc(T['contact.name.label'])}</label>
<input id="f-name" name="name" type="text" maxlength="80" autocomplete="name" dir="auto" value="${esc(v.name)}"${n.attrs}>${n.msg}
<label for="f-email" data-i18n="contact.email.label">${esc(T['contact.email.label'])}</label>
<input id="f-email" name="email" type="email" required maxlength="254" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" dir="ltr" value="${esc(v.email)}"${e.attrs}>${e.msg}
<label for="f-message" data-i18n="contact.message.label">${esc(T['contact.message.label'])}</label>
<textarea id="f-message" name="message" required maxlength="4000" rows="6" dir="auto"${m.attrs}>${esc(v.message)}</textarea>${m.msg}
<div class="hp" aria-hidden="true" inert><label for="f-web">Website</label><input id="f-web" name="website" type="text" tabindex="-1" autocomplete="off" value=""></div>
<input type="hidden" name="t" value="${esc(opts.token)}">
<p class="note"><span data-i18n="contact.privacy_note">${esc(T['contact.privacy_note'])}</span> <a href="${esc(cfg.links.privacy)}" data-i18n="legal.privacy">${esc(T['legal.privacy'])}</a></p>
<button type="submit" data-i18n="contact.send">${esc(T['contact.send'])}</button>
</form>
</div>
${footer(cfg)}
</main>${scripts(cfg)}
</body>
</html>
`;
}

export function thanksPage(cfg, confirmed, lang) {
  const q = lang ? `?lang=${encodeURIComponent(lang)}` : '';
  const body = confirmed
    ? `${intro('contact.thanks.title')}</header>
<div class="formcol"><p>${t('contact.thanks.text')} ${t('contact.promise')}</p>
<p><a class="pill" href="/${q}" data-i18n="contact.thanks.back" data-i18n-keep>${esc(T['contact.thanks.back'])}</a></p></div>`
    : `${intro()}</header>
<div class="formcol"><p>${t('contact.thanks.none')}</p>
<p><a class="pill" href="/kontakt/${q}" data-i18n="contact.thanks.form" data-i18n-keep>${esc(T['contact.thanks.form'])}</a></p></div>`;
  return `${head(confirmed ? T['contact.thanks.title'] : T['contact.title'])}
<body>
<main>
${body}
${footer(cfg)}
</main>${scripts(cfg)}
</body>
</html>
`;
}

export function errorPage(cfg) {
  return `${head(T['contact.title'])}
<body>
<main>
${intro()}</header>
<div class="formcol"><p>${t('contact.err.generic')}</p>
<p><a class="pill" href="/kontakt/" data-i18n="contact.thanks.form" data-i18n-keep>${esc(T['contact.thanks.form'])}</a></p></div>
${footer(cfg)}
</main>
</body>
</html>
`;
}
