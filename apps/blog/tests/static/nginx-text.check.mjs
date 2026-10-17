// 7.4, DL-1, DL-4, AD-4, AD-5, FD-1, ER-2, ER-3 and V25 (the text half): the nginx text of the Blog as a file.
//
//   ops/nginx-blog.additions.conf   what the operator applies to the LIVE text (3.5, OS-3): one map line, and the rules
//                                   of the server block.
//   ops/nginx-blog-test.conf        the Teamwork test text plus those additions, for tests and `npm run serve` only.
//
// The expected lines are typed here by hand from spec 7.4; they are not read from the file they judge. V25 asks that the
// two blocks are textually equal: every active line of the additions file stands in the test text, byte for byte, in
// the places the additions name (the map, and the server block before the closing "location /"). Nothing in this file
// starts a container; the behaviour is tests/server/.
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { ROOT } from '../lib/paths.mjs';
import { DEFAULT_IMAGE } from '../lib/image.mjs';

const read = (name) => fs.readFileSync(path.join(ROOT, 'ops', name), 'utf8');

// Spec 7.4, verbatim: part 1 is one line, part 2 is the block of rules.
const MAP_LINE = `    ~^/blog(?:/|$) "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";`;
const RULES = `    location = /blog { return 308 https://dreambau.com/blog/; }
    location ~ ^/blog/(?:.*/)?\\. { return 404; }
    location = /blog/404.html { internal; alias /blog/404.html; }
    location = /blog/feed.xml {
      alias /blog/feed.xml;
      types { }
      default_type application/atom+xml;
    }
    location /blog/ {
      alias /blog/;
      index index.html;
      autoindex off;
      absolute_redirect off;
      error_page 403 =404 /blog/404.html;
      error_page 404 /blog/404.html;
    }`;

// The lines of a text that are neither empty nor comments.
const active = (text) => text.split('\n').filter((line) => line.trim() !== '' && !line.trim().startsWith('#'));

await run(async () => {
  const names = fs.readdirSync(path.join(ROOT, 'ops')).sort();
  check('7.4 ops/ holds nginx-blog.additions.conf and nginx-blog-test.conf', names.includes('nginx-blog.additions.conf') && names.includes('nginx-blog-test.conf'), names.join(', '));
  check('3.4 the old minimal text of slice S0 is gone: the rules of 7.4 are the only text of the Blog', !names.includes('nginx-test.conf'), names.join(', '));
  if (!names.includes('nginx-blog.additions.conf') || !names.includes('nginx-blog-test.conf')) return;
  const additions = read('nginx-blog.additions.conf');
  const test = read('nginx-blog-test.conf');

  // ---- the additions file is the text of 7.4 and nothing else ----
  same('7.4 the active lines of the additions are the map line and the rules of the server block, in this order', active(additions), [MAP_LINE, ...RULES.split('\n')]);
  check('7.4 the additions name the two places in comments (the map $page_csp; the server block before the final location /)', additions.includes('$page_csp') && additions.includes('before the final "location / { return 404; }"'));
  check('DL-4 the dot rule is one line that returns 404 itself: no error_page, so the page is nginx\'s own', RULES.split('\n').filter((rule) => rule.includes('(?:.*/)?')).every((rule) => rule.endsWith('{ return 404; }')));
  check('ER-2 /blog/404.html is internal and has no error_page of its own', /location = \/blog\/404\.html \{ internal; alias \/blog\/404\.html; \}/.test(additions));
  check('ER-3 every location of the additions names /blog, so no other path is claimed', (additions.match(/^\s*location [^{]*/gm) || []).length === 5 && (additions.match(/^\s*location [^{]*/gm) || []).every((rule) => rule.includes('/blog')));
  check('7.4 no address of another site but dreambau.com', [...additions.matchAll(/https?:\/\/[^\s;"]+/g)].every((match) => match[0] === 'https://dreambau.com/blog/'), [...additions.matchAll(/https?:\/\/[^\s;"]+/g)].map((match) => match[0]).join(' '));

  // ---- V25 text half: the two blocks are textually equal ----
  const mapBlock = (/map \$uri \$page_csp \{[\s\S]*?\n  \}/.exec(test) || [''])[0];
  check('V25 the map line stands in the test text once, inside "map $uri $page_csp { ... }"', test.split(MAP_LINE).length === 2 && mapBlock.includes(MAP_LINE));
  check('V25 the block of rules stands in the test text byte for byte, once', test.split(RULES).length === 2);
  const server = /\n  server \{([\s\S]*)\n  \}\n\}\s*$/.exec(test);
  check('V25 the block stands in the server block, before the final "location / { return 404; }"', Boolean(server) && server[1].indexOf(RULES) !== -1 && server[1].indexOf(RULES) < server[1].lastIndexOf('    location / { return 404; }') && server[1].trimEnd().endsWith('location / { return 404; }'));
  same('V25 every active line of the additions is in the test text', active(additions).filter((line) => !test.includes(`${line}\n`)), []);

  // ---- the rest of the test text is the Teamwork test text: what answers today keeps answering ----
  const rest = test.replace(MAP_LINE, '').replace(RULES, '');
  check('ER-3 without the Blog lines the test text still has the routes of today: /, /homepage-assets/, /health, /bildungshaus/, /teamwork/ and the final 404', ['location = / {', 'location /homepage-assets/ {', 'location = /health { return 200 \'ok\'; }', 'location /bildungshaus/ {', 'location = /teamwork {', 'location /teamwork/ {', 'location / { return 404; }'].every((piece) => rest.includes(piece)));
  check('ER-3 without the Blog lines nothing in the test text mentions /blog', !/\/blog/.test(rest.replace(/^#.*$/gm, '')), (rest.replace(/^#.*$/gm, '').match(/.*\/blog.*/g) || []).join(' | '));
  check('3.5 the test text says what it is: for tests only, the operator applies the additions to the LIVE text', /For tests only/.test(test) && /LIVE text/.test(test));
  check('4 the headers come from the server block for every path (a location with its own add_header would drop them)', !/add_header/.test(RULES) && (test.match(/add_header/g) || []).length === 5);
  check('4 access_log is off in the test text, as on the live server (PR-4)', /access_log off;/.test(test));
  check('3.4 the test text listens on 8080 with the image\'s default user (no root-only port)', /listen 8080;/.test(test));
  check(`BD-11 the pinned image is ${DEFAULT_IMAGE}`, DEFAULT_IMAGE === 'nginx:1.27-alpine');
});
