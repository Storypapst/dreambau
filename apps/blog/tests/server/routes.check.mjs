// V19 to V23 and the file-replacement half of V25, against the real nginx (the pinned image) with the Teamwork test text
// plus the additions of spec 7.4 (ops/nginx-blog-test.conf), serving a build of the generator as a mounted directory.
// Needs Docker. The site is a small invented one (tests/lib/nginx.mjs); the 404 page it serves is the one the generator
// wrote, so the check proves the pair: the page and the rule that sends it.
//
// Expected values are typed here by hand from the spec (section 4 for the policy, 7.4 and V19 to V25 for the answers); the
// served bytes are compared with the files of the build only to prove that the right file was sent.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { ask, buildSite, containerExists, ensureFeed, modesInContainer, setServerModes, SITE } from '../lib/nginx.mjs';
import { startPageServer } from '../lib/page-server.mjs';
import { withScratch } from '../lib/scratch.mjs';

const POLICY = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const ERROR_TITLE = 'Diesen Beitrag gibt es nicht'; // blog.error.title
const NGINX_404 = '<center><h1>404 Not Found</h1></center>';
const h1Of = (html) => (/<h1\b[^>]*>([^<]*)<\/h1>/.exec(html) || [])[1];
const isNginxPage = (answer) => answer.text.includes(NGINX_404) && /<center>nginx(?:\/[\d.]+)?<\/center>/.test(answer.text) && !answer.text.includes('<h1 class=');
const isStyledPage = (answer, expected) => answer.bytes.equals(expected) && h1Of(answer.text) === ERROR_TITLE;

await run(async () => {
  await withScratch('server-routes', async (dir) => {
    const { publicDir } = buildSite(dir, path.join(dir, 'out'));
    const feed = ensureFeed(publicDir);
    if (feed.standIn) console.log('  NOTE  the build writes no feed yet (slice S3): the check put a minimal invented Atom file at feed.xml');
    setServerModes(publicDir);
    const errorPage = fs.readFileSync(path.join(publicDir, '404.html'));
    const read = (...parts) => fs.readFileSync(path.join(publicDir, ...parts));

    const server = await startPageServer({ publicDir });
    let name = server.name;
    try {
      const get = (p, options) => ask(server.origin, p, options);
      // The answer right after a rename(2). On Linux the replacement is visible to the next request. Docker Desktop for Mac
      // (virtiofs) shows the name as missing for a few milliseconds (measured 2026-10-09: the first request after the
      // rename answered 404 in 4 of 4 rounds; the new file was served after 4 to 14 ms), so there the check polls for up
      // to 2 s and says how long it took.
      const servedAfterRename = async (address, expected) => {
        const strict = process.platform === 'linux';
        const started = Date.now();
        let answer = await get(address);
        let requests = 1;
        while (!strict && !(answer.status === 200 && answer.bytes.equals(expected)) && Date.now() - started < 2000) {
          answer = await get(address);
          requests += 1;
        }
        return { ok: answer.status === 200 && answer.bytes.equals(expected), when: strict ? 'by the very next request' : 'within 2 s', detail: `status ${answer.status}, ${requests} request(s), ${Date.now() - started} ms` };
      };
      const post = `/blog/${SITE.imagePost}/`;

      // ---- V19: the two redirects ----
      const bare = await get('/blog', { method: 'HEAD' });
      same('V19 /blog answers 308 to https://dreambau.com/blog/', [bare.status, bare.headers.location], [308, 'https://dreambau.com/blog/']);
      const noSlash = await get(post.slice(0, -1), { method: 'HEAD' });
      same('V19 a post address without the slash answers 301 with a relative Location (no scheme, no host, no port)', [noSlash.status, noSlash.headers.location], [301, post]);

      // ---- V20: what answers 200, with its type ----
      const ok = [
        ['/blog/', /^text\/html\b/, read('index.html')],
        ['/blog/index.html', /^text\/html\b/, read('index.html')],
        [post, /^text\/html\b/, read(SITE.imagePost, 'index.html')],
        [`${post}index.html`, /^text\/html\b/, read(SITE.imagePost, 'index.html')],
        [`${post}image.webp`, /^image\/webp$/, read(SITE.imagePost, 'image.webp')],
        ['/blog/blog.css', /^text\/css\b/, read('blog.css')],
        ['/blog/blog.js', /^(?:application|text)\/javascript\b/, read('blog.js')],
        ['/blog/feed.xml', /^application\/atom\+xml\b/, read('feed.xml')],
        [`/blog/${SITE.oldPost}/`, /^text\/html\b/, read(SITE.oldPost, 'index.html')],
      ];
      for (const [address, type, expected] of ok) {
        const answer = await get(address);
        check(`V20 ${address} answers 200 with the type ${type.source.replace(/\\/g, '')} and the file of the build`, answer.status === 200 && type.test(answer.headers['content-type'] || '') && answer.bytes.equals(expected), `${answer.status} ${answer.headers['content-type']}`);
      }
      const feedHead = await get('/blog/feed.xml', { method: 'HEAD' });
      same('V20 HEAD /blog/feed.xml: the exact type is application/atom+xml (types { } clears the table, default_type wins)', feedHead.headers['content-type'], 'application/atom+xml');

      // ---- V21: everything else is the styled 404 ----
      for (const address of ['/blog/nope', '/blog/2026/', '/blog/2026/nope/', '/blog/2025/', '/blog/2026/mit-bild/nope.webp', '/blog/index.html/x']) {
        const answer = await get(address);
        check(`V21 ${address} answers 404 with the styled page (its <h1> is blog.error.title)`, answer.status === 404 && isStyledPage(answer, errorPage) && /^text\/html\b/.test(answer.headers['content-type'] || ''), `${answer.status} h1=${h1Of(answer.text)}`);
      }
      const direct = await get('/blog/404.html');
      check('V21 /blog/404.html answers 404 with nginx\'s own page, not the styled one', direct.status === 404 && isNginxPage(direct), `${direct.status}`);
      const year = await get('/blog/2026', { method: 'HEAD' });
      same('V21 /blog/2026 answers the 301 of AD-4 to the slash form', [year.status, year.headers.location], [301, '/blog/2026/']);
      const forbidden = await get('/blog/2026/');
      check('V21 a folder without an index never answers 403 and never lists its files', forbidden.status === 404 && !/Index of|mit-bild|ohne-bild/.test(forbidden.text.replace(errorPage.toString('utf8'), '')));

      // ---- V22: hidden paths and the methods ----
      for (const address of ['/blog/.git/config', '/blog/2026/.x', '/blog/.hidden', '/blog/2026/mit-bild/.env', '/blog/%2egit/config', '/blog/.index.html.tmp']) {
        const answer = await get(address);
        check(`V22 ${address} answers 404 with nginx's own page`, answer.status === 404 && isNginxPage(answer), `${answer.status}`);
      }
      same('V22 POST /blog/ answers 405', (await get('/blog/', { method: 'POST', body: 'x=1' })).status, 405);
      same('V22 POST /blog/feed.xml answers 405', (await get('/blog/feed.xml', { method: 'POST', body: 'x=1' })).status, 405);
      same('V22 POST /blog/nope answers 404 (no rule claims it)', (await get('/blog/nope', { method: 'POST', body: 'x=1' })).status, 404);

      // ---- V23: the headers, on a page, a post, the stylesheet, the feed, the 404 and the redirects ----
      const headerCases = [['/blog/', 200], [post, 200], [`${post}image.webp`, 200], ['/blog/blog.css', 200], ['/blog/blog.js', 200], ['/blog/feed.xml', 200],
        ['/blog/nope', 404], ['/blog/2026/', 404], ['/blog/404.html', 404], ['/blog/.git/config', 404], ['/blog', 308], [post.slice(0, -1), 301]];
      for (const [address, status] of headerCases) {
        const { headers, status: got } = await get(address, { method: 'HEAD' });
        const seen = {
          csp: headers['content-security-policy'], cache: headers['cache-control'], sniff: headers['x-content-type-options'], referrer: headers['referrer-policy'],
          robots: headers['x-robots-tag'], cookie: headers['set-cookie'],
        };
        check(`V23 ${address} (${status}): the policy of section 4 with form-action 'none', no-store, nosniff, the referrer policy; no X-Robots-Tag, no Set-Cookie`,
          got === status && seen.csp === POLICY && seen.cache === 'no-store' && seen.sniff === 'nosniff' && seen.referrer === 'strict-origin-when-cross-origin' && seen.robots === undefined && seen.cookie === undefined, JSON.stringify({ got, ...seen }));
      }

      // ---- DL-2: what the container user sees ----
      const directories = modesInContainer(name, '/blog', 'd');
      const files = modesInContainer(name, '/blog', 'f');
      same('DL-2 inside the container every directory below /blog is 755 (and there are directories)', [directories.length > 0, directories.filter((line) => !line.startsWith('755 '))], [true, []]);
      same('DL-2 inside the container every file below /blog is 644 (and there are files)', [files.length > 0, files.filter((line) => !line.startsWith('644 '))], [true, []]);

      // ---- V25: a file replaced by mv is served at once (a directory mount follows the rename) ----
      const replacement = Buffer.from(`${read('index.html').toString('utf8')}<!-- replaced by rename -->\n`);
      const temporary = path.join(publicDir, '.index.html.tmp');
      fs.writeFileSync(temporary, replacement, { mode: 0o644 });
      const whileTemporary = await get('/blog/.index.html.tmp');
      check('V25 the dot-named temporary file is not served while it exists (DL-4)', whileTemporary.status === 404 && isNginxPage(whileTemporary), `${whileTemporary.status}`);
      execFileSync('mv', [temporary, path.join(publicDir, 'index.html')]); // the command of the ticket: mv, which is rename(2)
      const replaced = await servedAfterRename('/blog/', replacement);
      check(`V25 after rename(2) the new content of /blog/ is served ${replaced.when}`, replaced.ok, replaced.detail);
      const newPost = path.join(publicDir, SITE.plainPost, 'index.html');
      const newBytes = Buffer.from(`${read(SITE.plainPost, 'index.html').toString('utf8')}<!-- second -->\n`);
      fs.writeFileSync(`${newPost}.tmp`, newBytes, { mode: 0o644 });
      execFileSync('mv', [`${newPost}.tmp`, newPost]);
      const second = await servedAfterRename(`/blog/${SITE.plainPost}/`, newBytes);
      check(`V25 the same for a post page two folders down, ${second.when}`, second.ok, second.detail);
    } finally {
      await server.stop();
    }
    check('no container is left: the one this check started is gone', !containerExists(name), name);
  });
});
