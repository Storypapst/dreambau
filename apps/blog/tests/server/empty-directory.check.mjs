// V24 and the verify list of spec 3.5 (OS-8) for the day the server starts: an EMPTY directory is mounted at /blog.
// With the rules of 7.4 /blog/, /blog/feed.xml and /blog/2026/ answer 404, not 403 (nginx answers 403 for a directory
// without an index file; Teamwork's empty directory does). /blogx, /blog-x/, /health and /teamwork/ behave as today.
//
// "As today" has two witnesses. The first is typed here by hand from the Teamwork test text (what a path outside /blog gets:
// the final `location / { return 404; }`, /health 200 ok, the mounted /teamwork/ 200 with its own robots header). The second
// is a second container with the same mounts and the same text WITHOUT the Blog lines: the answers must be identical. Needs
// Docker.
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { ask, containerExists } from '../lib/nginx.mjs';
import { startPageServer, CONF_NAME } from '../lib/page-server.mjs';
import { ROOT } from '../lib/paths.mjs';
import { withScratch } from '../lib/scratch.mjs';

const POLICY = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const NGINX_404 = '<center><h1>404 Not Found</h1></center>';

// The two parts of 7.4 as they stand in the additions file (the map line; the block of rules from `location = /blog` to
// its end); the baseline text is the test text without them.
const additions = fs.readFileSync(path.join(ROOT, 'ops', 'nginx-blog.additions.conf'), 'utf8');
const mapLine = additions.split('\n').find((line) => line.startsWith('    ~^/blog'));
const rules = additions.slice(additions.indexOf('    location = /blog {')).trimEnd();
const withoutBlog = (text) => text.replace(`${mapLine}\n`, '').replace(`${rules}\n`, '');

// Paths outside /blog and their answers, compared between the two containers (status, Location, type, the headers that
// differ per path, and the body).
const OUTSIDE = ['/', '/health', '/blogx', '/blogx/', '/blog-x/', '/blog-x/feed.xml', '/blo', '/referenzen/zzz', '/teamwork', '/teamwork/', '/teamwork/nope', '/teamwork/.x', '/bildungshaus/', '/bildungshaus', '/homepage-assets/style.css'];
const essence = async (origin, address) => {
  const answer = await ask(origin, address);
  const h = answer.headers;
  return { status: answer.status, location: h.location, type: h['content-type'], csp: h['content-security-policy'], robots: h['x-robots-tag'], cache: h['cache-control'], body: answer.bytes.toString('base64') };
};

await run(async () => {
  await withScratch('server-empty', async (dir) => {
    const empty = path.join(dir, 'empty-public');
    fs.mkdirSync(empty);
    const mounts = [];
    for (const [target, file, text] of [['/site', 'index.html', 'invented start page\n'], ['/site', 'style.css', 'body{}\n'], ['/teamwork', 'index.html', 'invented teamwork page\n'], ['/bildungshaus', 'index.html', 'invented bildungshaus page\n']]) {
      const source = path.join(dir, target.slice(1));
      fs.mkdirSync(source, { recursive: true });
      fs.writeFileSync(path.join(source, file), text, { mode: 0o644 });
      fs.chmodSync(source, 0o755);
      if (!mounts.some((mount) => mount.target === target)) mounts.push({ source, target });
    }
    const baselineConf = path.join(dir, 'conf');
    fs.mkdirSync(baselineConf);
    const testText = fs.readFileSync(path.join(ROOT, 'ops', CONF_NAME), 'utf8');
    fs.writeFileSync(path.join(baselineConf, CONF_NAME), withoutBlog(testText));
    check('V24 the baseline text (the test text without the lines of 7.4) mentions no /blog address', Boolean(mapLine) && !/\/blog/.test(withoutBlog(testText).replace(/^#.*$/gm, '')));

    // Negative control (BD-9): the same text without the one line that turns 403 into 404. If the empty directory still gave
    // 404, the checks above would prove nothing about that line.
    const noRuleConf = path.join(dir, 'conf-no-403-rule');
    fs.mkdirSync(noRuleConf);
    const ruleLine = '      error_page 403 =404 /blog/404.html;\n';
    check('BD-9 the line "error_page 403 =404" is in the test text exactly once', testText.split(ruleLine).length === 2);
    fs.writeFileSync(path.join(noRuleConf, CONF_NAME), testText.replace(ruleLine, ''));

    const names = [];
    const blog = await startPageServer({ publicDir: empty, extraMounts: mounts, probe: '/health' });
    names.push(blog.name);
    let baseline;
    let noRule;
    try {
      baseline = await startPageServer({ publicDir: empty, confDirectory: baselineConf, extraMounts: mounts, probe: '/health' });
      names.push(baseline.name);
      noRule = await startPageServer({ publicDir: empty, confDirectory: noRuleConf, extraMounts: mounts, probe: '/health' });
      names.push(noRule.name);
      const get = (address, options) => ask(blog.origin, address, options);

      // ---- the empty directory: 404, never 403 ----
      for (const address of ['/blog/', '/blog/feed.xml', '/blog/2026/', '/blog/index.html', '/blog/nope', '/blog/404.html']) {
        const answer = await get(address);
        check(`V24 ${address} answers 404, not 403, with nginx's own page (no 404.html exists in an empty directory)`, answer.status === 404 && answer.text.includes(NGINX_404), `${answer.status}`);
      }
      const bare = await get('/blog', { method: 'HEAD' });
      same('V24 /blog still answers 308 to https://dreambau.com/blog/ (OS-8)', [bare.status, bare.headers.location], [308, 'https://dreambau.com/blog/']);
      const index = await get('/blog/', { method: 'HEAD' });
      same('V24 the policy of section 4 with form-action \'none\' is on /blog/ and there is no X-Robots-Tag (OS-8)', [index.headers['content-security-policy'], index.headers['x-robots-tag']], [POLICY, undefined]);
      same('V24 a POST to /blog/ in the empty directory answers 404 (nothing to refuse)', (await get('/blog/', { method: 'POST', body: 'x' })).status, 404);

      same('BD-9 without the 403 rule the empty directory answers 403 for /blog/ (a directory without its index), so the 404 above is the rule\'s doing; a folder that does not exist is 404 either way', [(await ask(noRule.origin, '/blog/')).status, (await ask(noRule.origin, '/blog/2026/')).status], [403, 404]);

      // ---- the baseline: the container without the Blog lines does not know /blog at all ----
      const without = await ask(baseline.origin, '/blog/');
      check('V24 the same paths in the container without the Blog lines are the catch-all 404 (the Blog does not exist there)', without.status === 404, `${without.status}`);

      // ---- literal expectations for the paths outside /blog ----
      const outside = {};
      for (const address of OUTSIDE) outside[address] = await essence(blog.origin, address);
      same('ER-3 /blogx and /blog-x/ fall through to `location / { return 404; }` (the Blog does not claim them)', [outside['/blogx'].status, outside['/blog-x/'].status, outside['/blogx'].body === outside['/blog-x/'].body && Buffer.from(outside['/blogx'].body, 'base64').toString().includes(NGINX_404)], [404, 404, true]);
      same('ER-3 /blogx carries no Blog policy: its Content-Security-Policy is the default one without form-action', outside['/blogx'].csp, "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'");
      same('ER-3 /health answers 200 ok', [outside['/health'].status, Buffer.from(outside['/health'].body, 'base64').toString()], [200, 'ok']);
      same('ER-3 /teamwork/ answers 200 with the robots header of Teamwork', [outside['/teamwork/'].status, outside['/teamwork/'].robots], [200, 'noindex, nofollow']);
      same('ER-3 /teamwork answers its own 308', [outside['/teamwork'].status, outside['/teamwork'].location], [308, 'https://dreambau.com/teamwork/']);

      // ---- identical answers with and without the Blog lines ----
      for (const address of OUTSIDE) {
        same(`V24 ${address} answers the same with and without the Blog lines`, outside[address], await essence(baseline.origin, address));
      }
    } finally {
      await blog.stop();
      if (baseline) await baseline.stop();
      if (noRule) await noRule.stop();
    }
    same('no container is left: the ones this check started are gone', names.filter(containerExists), []);
  });
});
