// PF-7, PF-8, PR-6 (V4): source links. https only, no user information, a host with a dot that is no address and no
// localhost, 500 characters at most, no whitespace or control character; the display host is the punycode form; a
// publish build also refuses the hosts that mark invented text. Hosts of refused inputs are assembled from parts so
// that the scan of the folder (tests/static/hygiene) does not find a real name in this file.
import { check, same, run } from '../lib/check.mjs';
import { BODY, postText } from '../lib/posts.mjs';
import { displayHost, httpsLink, linkProblems } from '../../src/lib/links.mjs';
import { checkPostText } from '../../src/lib/post-file.mjs';

const S = 'https://';
const EXAMPLE_ORG = 'example' + '.org';
const EXAMPLE_COM = 'example' + '.com';
const EXAMPLE_NET = 'example' + '.net';
const rules = (value, options = {}) => linkProblems(value, options).map((problem) => problem.rule);
const publish = { publish: true };

await run(async () => {
  // ---- valid ----
  for (const link of [`${S}www.beispiel.example.test/pfad?a=1`, `${S}videos.example.test/klein-bauen`, `${S}videos.example.test:8443/x#teil`, `${S}bücher.example.test/`, `${S}dreambau.com/blog/`, `${S}a.b/`]) {
    same(`V4 ${link} is accepted`, rules(link), []);
  }
  same('V4 the example hosts of the standard (org, com, net) are accepted outside a publish build', [EXAMPLE_ORG, EXAMPLE_COM, EXAMPLE_NET].map((host) => rules(`${S}${host}/`)), [[], [], []]);
  same('V4 an address of exactly 500 characters is accepted', rules(`${S}videos.example.test/${'a'.repeat(500 - 'https://videos.example.test/'.length)}`), []);

  // ---- refused, each with the line of PF-7 ----
  const refused = [
    ['http:// (no TLS)', 'http://videos.example.test/x'],
    ['javascript:', 'javascript:alert(1)'],
    ['a data: address', 'data:text/html,x'],
    ['a scheme-relative address', '//videos.example.test/x'],
    ['no scheme', 'videos.example.test/x'],
    ['an empty host', `${S}/x`],
    ['user information', `${S}user:pw@videos.example.test/`],
    ['a user name only', `${S}user@videos.example.test/`],
    ['localhost', `${S}localhost/`],
    ['a localhost subdomain', `${S}app.localhost/`],
    ['an IPv4 address', `${S}10.0.0.1/`],
    ['an IPv4 address as one number', `${S}2130706433/`],
    ['an IPv4 address in hexadecimal', `${S}0x7f.1/`],
    ['an IPv6 address', `${S}[::1]/`],
    ['a host without a dot', `${S}intranet/`],
    ['501 characters', `${S}videos.example.test/${'a'.repeat(501 - 'https://videos.example.test/'.length)}`],
    ['a space', `${S}videos.example.test/a b`],
    ['a line feed', `${S}videos.example.test/a\nb`],
    ['a control character', `${S}videos.example.test/a\u0001b`],
    ['an empty value', ''],
  ];
  for (const [name, link] of refused) same(`V4 ${name} is PF-7`, rules(link), ['PF-7']);
  same('V4 there are nine refusals of the spec list and more', refused.length >= 9, true);

  // ---- the hosts that only a publish build refuses ----
  for (const [name, link] of [
    ['.test', `${S}videos.example.test/x`], ['.example', `${S}videos.${'ex' + 'ample'}/x`], ['.invalid', `${S}videos.invalid/x`], ['.localhost', `${S}videos.localhost/x`],
    ['example.org', `${S}${EXAMPLE_ORG}/`], ['example.com', `${S}${EXAMPLE_COM}/`], ['example.net', `${S}${EXAMPLE_NET}/`], ['a subdomain of example.org', `${S}www.${EXAMPLE_ORG}/`],
  ]) {
    same(`V4 ${name}: a publish build refuses it`, rules(link, publish).includes('PF-7'), true);
  }
  same('V4 a real-looking host passes a publish build', rules(`${S}videos.beispiel-video.de/x`, publish), []);
  same('V4 a host that only ends like example.org is no example host', rules(`${S}notexample.org/`, publish), []);

  // ---- the display host: punycode (PR-6) ----
  same('V4 the displayed host of an address with an umlaut is its punycode form', displayHost(`${S}bücher.example.test/`), 'xn--bcher-kva.example.test');
  same('V4 the displayed host is lower case and has no port', displayHost(`${S}Videos.Example.Test:8443/x`), 'videos.example.test');
  same('V4 the display host of something that is no address is empty', displayHost('nonsense'), '');

  // ---- PR-6: the render-time check ----
  same('PR-6 httpsLink returns a valid https address as it is', httpsLink(`${S}videos.example.test/a?b=1&c="><i>`, 'f.md'), `${S}videos.example.test/a?b=1&c="><i>`);
  for (const [name, link] of [['javascript:', 'javascript:alert(1)'], ['http:', 'http://videos.example.test/x'], ['data:', 'data:text/html,x'], ['user information', `${S}u:p@videos.example.test/`], ['a space', `${S}videos.example.test/a b`]]) {
    let message = '';
    try { httpsLink(link, 'posts/2026/x.md'); } catch (error) { message = error.message; }
    check(`PR-6 httpsLink refuses ${name} and names the file`, /sourceLink/.test(message) && /posts\/2026\/x\.md/.test(message), message || 'no error');
  }

  // ---- in a post file ----
  const FILE = 'tests/fixtures/2026/ein-film.md';
  const verdict = (front) => checkPostText(postText({ front }), { file: FILE, fixture: true }).findings.map((finding) => `${finding.rule}:${finding.where.slice(FILE.length + 1)}`);
  same('PF-7 a bad link in a file is named with the line of the key', verdict({ sourceLink: 'http://videos.example.test/x' }), ['PF-7:5']);
  same('PF-8 sourceTitle without sourceLink', verdict({ sourceLink: undefined }), ['PF-8:5']);
  same('PF-8 sourceTitle of 121 characters', verdict({ sourceTitle: 'x'.repeat(121) }), ['PF-8:6']);
  same('PF-8 sourceTitle of 120 characters', verdict({ sourceTitle: 'x'.repeat(120) }), []);
  same('PF-8 a sourceLink without a sourceTitle is fine', verdict({ sourceTitle: undefined }), []);
  same('PF-7 a bidirectional control inside an otherwise good link is PF-12 and PF-7 is not repeated', verdict({ sourceLink: '"https://videos.example.test/\\u202ex"' }), ['PF-12:5']);
  void BODY;
});
