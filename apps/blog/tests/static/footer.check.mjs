// NV-1, NV-2 (file and rendering), LG-7, V41 (the static part): footer.json holds the two items Impressum and
// Datenschutz, each null while the page does not exist or a root-relative address once it does. The footer lists the
// items of the footer of the live /referenzen/ in their order, with Referenzen added at its place; a null item is the
// same non-link span that Referenzen shows and is listed in footerPending of blog.json. The live footer is read from
// apps/website/site/referenzen/index.html, which is byte for byte the page that dreambau.com serves (checked by hand
// on 2026-10-09 with curl and diff; the monorepo file is the page's source).
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { FIXTURES, REPO, ROOT } from '../lib/paths.mjs';
import { withScratch } from '../lib/scratch.mjs';
import { footerProblems, loadFooter, pendingKeys } from '../../src/lib/footer.mjs';
import { buildBlog } from '../../src/generate.mjs';

const lines = (value) => footerProblems(value).map((problem) => `${problem.rule} ${problem.where}`);

// The items of a footer nav as a plain list: { span: text } for a pending span, { sep } for a separator, { a: text, href }.
function itemsOf(navHtml) {
  const items = [];
  for (const match of navHtml.matchAll(/<span\b[^>]*class="pending"[^>]*>([^<]*)<\/span>|<i\b[^>]*>([^<]*)<\/i>|<a\b[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)) {
    if (match[1] !== undefined) items.push({ span: match[1] });
    else if (match[2] !== undefined) items.push({ sep: match[2] });
    else items.push({ a: match[4], href: match[3] });
  }
  return items;
}
const footNav = (html) => /<nav\b[^>]*class="foot"[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1];

await run(async () => {
  // ---- the file ----
  const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'footer.json'), 'utf8'));
  same('NV-2 footer.json has the two items impressum and datenschutz, both null', file, { impressum: null, datenschutz: null });
  same('NV-2 loadFooter() reads it and pendingKeys() lists both, in this order', [loadFooter(), pendingKeys(file)], [file, ['impressum', 'datenschutz']]);
  same('NV-2 a real address in one item leaves only the other pending', pendingKeys({ impressum: '/impressum.html', datenschutz: null }), ['datenschutz']);
  same('NV-2 two real addresses leave nothing pending', pendingKeys({ impressum: '/impressum.html', datenschutz: '/datenschutz.html' }), []);
  same('NV-2 the good shapes pass', [lines({ impressum: null, datenschutz: null }), lines({ impressum: '/impressum.html', datenschutz: '/datenschutz/' })], [[], []]);
  same('NV-2 a missing item fails', lines({ impressum: null }), ['NV-2 datenschutz']);
  same('NV-2 an extra item fails', lines({ impressum: null, datenschutz: null, kontakt: null }), ['NV-2 kontakt']);
  same('NV-2 an address that is not root-relative fails (https, protocol-relative, relative, javascript, empty, with a space)', [
    lines({ impressum: `https://${'dreambau'}.com/impressum.html`, datenschutz: null }), lines({ impressum: '//host/x', datenschutz: null }), lines({ impressum: 'impressum.html', datenschutz: null }),
    lines({ impressum: 'javascript:alert(1)', datenschutz: null }), lines({ impressum: '', datenschutz: null }), lines({ impressum: '/a b', datenschutz: null })],
  [['NV-2 impressum'], ['NV-2 impressum'], ['NV-2 impressum'], ['NV-2 impressum'], ['NV-2 impressum'], ['NV-2 impressum']]);
  same('NV-2 a value that is neither null nor a string fails', lines({ impressum: false, datenschutz: 3 }), ['NV-2 impressum', 'NV-2 datenschutz']);
  same('NV-2 a file that is no object fails', lines([]), ['NV-2 footer.json']);

  // ---- the live footer of /referenzen/ ----
  const live = itemsOf(footNav(fs.readFileSync(path.join(REPO, 'apps', 'website', 'site', 'referenzen', 'index.html'), 'utf8')));
  same('NV-1 the live footer has these items (read from the page): two spans, a separator, four links', live, [
    { span: 'Impressum · Angaben noch offen' }, { sep: '·' }, { span: 'Datenschutz · Freigabe noch offen' },
    { a: 'Startseite', href: '/' }, { a: 'Teamwork', href: '/teamwork/' }, { a: 'Glossar', href: '/glossar/' }, { a: 'Kontakt', href: 'mailto:info@dreambau.com' }]);
  const expected = [...live.slice(0, 4), { a: 'Referenzen', href: '/referenzen/' }, ...live.slice(4)];

  // ---- the rendering, from the real footer.json ----
  withScratch('footer', (dir) => {
    const manifest = buildBlog({ postsDir: FIXTURES, outDir: path.join(dir, 'out'), mode: 'preview' });
    same('NV-2 blog.json lists the two pending items in footerPending', manifest.footerPending, ['impressum', 'datenschutz']);
    for (const name of ['index.html', `${manifest.posts[0].address}/index.html`]) {
      const html = fs.readFileSync(path.join(dir, 'out', 'public', name), 'utf8');
      same(`NV-1 ${name}: the footer items are the live ones with Referenzen after Startseite, in this order`, itemsOf(footNav(html)), expected);
      check(`NV-1 ${name}: a footer landmark holds a nav named Website (blog.nav.label)`, /<footer\b[^>]*>\s*<nav\b[^>]*class="foot"[^>]*aria-label="Website"/.test(html));
      check(`LG-7 ${name}: the pending spans carry lang de and dir ltr as on /referenzen/`, /<span class="pending" lang="de" dir="ltr">Impressum · Angaben noch offen<\/span>/.test(html));
    }
  });

  // ---- with real addresses ----
  withScratch('footer-real', (dir) => {
    const footerFile = path.join(dir, 'footer.json');
    fs.writeFileSync(footerFile, '{"impressum":"/impressum.html","datenschutz":"/datenschutz.html"}\n');
    const manifest = buildBlog({ postsDir: FIXTURES, outDir: path.join(dir, 'out'), mode: 'preview', footerFile });
    same('NV-2 with two real addresses footerPending is empty', manifest.footerPending, []);
    const html = fs.readFileSync(path.join(dir, 'out', 'public', 'index.html'), 'utf8');
    same('NV-2 ... and the first two items are links to those addresses', itemsOf(footNav(html)).slice(0, 3), [{ a: 'Impressum', href: '/impressum.html' }, { sep: '·' }, { a: 'Datenschutz', href: '/datenschutz.html' }]);
    same('NV-2 ... the rest is unchanged', itemsOf(footNav(html)).slice(3), expected.slice(3));
  });
  withScratch('footer-bad', (dir) => {
    const footerFile = path.join(dir, 'footer.json');
    fs.writeFileSync(footerFile, '{"impressum":"https://other.example.test/","datenschutz":null}\n');
    let message = '';
    try { buildBlog({ postsDir: FIXTURES, outDir: path.join(dir, 'out'), mode: 'preview', footerFile }); } catch (error) { message = error.message; }
    check('NV-2 the build refuses a bad footer.json with a FAIL NV-2 line and writes nothing', /^FAIL NV-2 footer\.json:impressum: /.test(message) && !fs.existsSync(path.join(dir, 'out')), message);
  });
});
