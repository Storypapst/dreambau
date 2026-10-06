// The two nginx files of ops/ (spec 7.8, gap G4):
// - nginx-teamwork.additions.conf is the code block of spec 7.8, byte for byte (the size and the sha256 are taken from
//   the spec, not from the file);
// - nginx-test.conf is the live text plus those four additions at the places the block names, with one value changed:
//   the survey host of /bildungshaus/ is the invented host umfrage.example.test. "The live text" is pinned by the size
//   and the sha256 of the live file as the plan's reference holds it, with that one value already replaced.
// The behaviour of the test file (headers, routes) is checked against the real nginx in e2e/page-server.check.mjs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { OPS } from '../lib/paths.mjs';

const ADDITIONS_BYTES = 821;
const ADDITIONS_SHA256 = '04f32cc4b27ba812b4e5046cc852e3528aec463f7f0939332c83ca2be76d5f90';
const LIVE_BYTES = 1926; // the live file has 1,926 bytes; replacing the host by one of the same length keeps the size
const LIVE_REPLACED_SHA256 = '4ac26c988584bb7a7791b11fda46d6fbfb2e3f80280a22d758f1862241e99d32';

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const read = (name) => fs.readFileSync(path.join(OPS, name), 'utf8');

// The four pieces of the additions file: the numbered comment line of each one names the place, the lines below it are the text.
function pieces(additions) {
  const parts = additions.split(/^# \d\. .*\n/m).slice(1).map((part) => part.replace(/\n+$/, '\n'));
  return parts;
}

await run(async () => {
  const additions = read('nginx-teamwork.additions.conf');
  same('ops: nginx-teamwork.additions.conf has the size of the block of spec 7.8', Buffer.byteLength(additions), ADDITIONS_BYTES);
  same('ops: nginx-teamwork.additions.conf has the sha256 of the block of spec 7.8', sha256(additions), ADDITIONS_SHA256);
  const [csp, robots, header, locations] = pieces(additions);
  check('ops: the additions file holds four pieces: the CSP entry, the robots map, the header line and the three locations',
    [csp, robots, header, locations].every((piece) => typeof piece === 'string') && csp.includes('connect-src') && robots.includes('$robots_tag') && header.includes('X-Robots-Tag') && locations.includes('absolute_redirect off'));

  const testConf = read('nginx-test.conf');
  const body = testConf.replace(/^(#.*\n)+/, '');
  const top = testConf.slice(0, testConf.length - body.length);
  check('ops: nginx-test.conf starts with a comment that says it is for tests only, names the invented host and says the operator uses the live text',
    /for tests only/i.test(top) && top.includes('umfrage.example.test') && /live text/i.test(top) && /never to this file/i.test(top), `${top.split('\n').length - 1} comment lines`);

  // each piece appears once, at its place
  const once = (piece) => body.split(piece).length === 2;
  check('ops: nginx-test.conf holds each of the four pieces exactly once', [csp, robots, header, locations].every(once));
  check('ops: piece 1 (CSP entry) follows the /bildungshaus entry of the map', /\n    ~\^\/bildungshaus\(\?:\/\|\$\) [^\n]*\n/.test(body) && body.includes(`frame-ancestors 'none'";\n${csp}  }\n`));
  check('ops: piece 2 (robots map) follows the map of the page policies', body.includes(`${csp}  }\n${robots}  server {\n`));
  check('ops: piece 3 (X-Robots-Tag) follows the existing add_header lines', body.includes(`    add_header Cache-Control no-store always;\n${header}`));
  check('ops: piece 4 (the three locations) stands before location / { return 404; }', body.includes(`${locations}    location / { return 404; }\n`));

  // taking the four pieces out leaves the live text with the invented host
  let rest = body;
  for (const piece of [csp, robots, header, locations]) rest = rest.replace(piece, '');
  same('ops: nginx-test.conf without its comment and the four pieces has the size of the live text', Buffer.byteLength(rest), LIVE_BYTES);
  same('ops: nginx-test.conf without its comment and the four pieces is the live text, with the one invented host', sha256(rest), LIVE_REPLACED_SHA256);
  same('ops: the invented host stands once in nginx-test.conf, in the policy of /bildungshaus/', body.split('umfrage.example.test').length - 1, 1);
});
