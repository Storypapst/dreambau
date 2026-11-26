// The folder is in a public repository: the only real names in it are dreambau.com and info@dreambau.com. Every
// invented host ends in example.test (spec 6 and the rules for every slice). The fixture is the invented example of
// spec 7.1 and says so (`example: true`, PF-14).
import fs from 'node:fs';
import { check, same, run } from '../lib/check.mjs';
import { FIXTURE_POST, ROOT } from '../lib/paths.mjs';
import { emailsOf, filesBelow, foreignNames, hostsOf } from '../lib/scans.mjs';

await run(async () => {
  // ---- the scan proves itself on made-up text (the strings are assembled so that this file does not trip the scan) ----
  const scheme = 'https://';
  same('hygiene the scan reads hosts, also behind user information, and lower-cases them', hostsOf(`a ${scheme}Videos.Example.Test/x ${scheme}user:pw@${'other'}.org:8080/y http://127.0.0.1:80/blog/`), ['videos.example.test', 'other.org', '127.0.0.1']);
  same('hygiene the scan stops a host at a semicolon (a policy line: frame-src <host>; base-uri)', hostsOf(`frame-src ${scheme}umfrage.example.test; base-uri 'none'`), ['umfrage.example.test']);
  same('hygiene the scan reads e-mail addresses', emailsOf(`write to ${'a.b'}@${'other'}.org or info@dreambau.com`), [`a.b@${'other'}.org`, 'info@dreambau.com']);
  same('hygiene the scan reports a foreign host and a foreign address and accepts the allowed ones', foreignNames([
    { name: 'bad.md', text: `${scheme}${'other'}.org/ and ${'someone'}@${'other'}.org` },
    { name: 'good.md', text: `${scheme}dreambau.com/blog/ ${scheme}a.example.test/ ${scheme}127.0.0.1:8080/blog/ info@dreambau.com` },
    { name: 'near.md', text: `${scheme}${'dreambau'}.com.${'other'}.org/ ${scheme}${'notdreambau'}.com/ ${scheme}${'www'}.dreambau.com/` },
  ]), ['bad.md: host other.org', `bad.md: address someone@${'other'}.org`, 'near.md: host dreambau.com.other.org', 'near.md: host notdreambau.com', 'near.md: host www.dreambau.com']);

  // ---- the real folder ----
  // posts/ holds real posts, and a real post names its real source (a video, an article): their hosts are checked by the
  // post rules (sourceLink), not by this scan. dist-proto/ is the built map prototype (not in Git).
  const files = filesBelow(ROOT, { skipFolders: ['node_modules', 'dist', 'dist-demo', 'dist-proto', 'posts'] });
  check('hygiene the scan covered the folder (more than ten files)', files.length > 10, `${files.length} files`);
  const lock = files.find((file) => file.name === 'package-lock.json');
  // One exception, asked for by the owner: the map's dummy posts are about six real videos that he chose, so the files of
  // prototypes/navigieren/dummy/ may name www.youtube.com, and nothing else besides the allowed names.
  const DUMMY = 'prototypes/navigieren/dummy/';
  const dummyVideo = (finding) => finding.startsWith(DUMMY) && finding.endsWith(': host www.youtube.com');
  const found = foreignNames(files.filter((file) => file.name !== 'package-lock.json'));
  same('hygiene no host and no address but dreambau.com, info@dreambau.com, *.example.test and the local test addresses (the lock file aside; the videos of the map\'s dummy posts aside)', found.filter((finding) => !dummyVideo(finding)), []);
  check('hygiene the dummy posts of the map name www.youtube.com and no other foreign host', found.some(dummyVideo) && found.filter((finding) => finding.startsWith(DUMMY)).every(dummyVideo), JSON.stringify(found.filter((finding) => finding.startsWith(DUMMY)).slice(0, 3)));
  same('hygiene the lock file names the npm registry and no other host', [...new Set(hostsOf(lock.text))], ['registry.npmjs.org']);

  // ---- the fixture ----
  const fixture = fs.readFileSync(FIXTURE_POST, 'utf8');
  check('PF-14 the fixture is marked as invented: example: true', /^example: true$/m.test(fixture));
  same('hygiene every host in the fixture ends in example.test', hostsOf(fixture).filter((host) => !host.endsWith('.example.test')), []);
  check('hygiene the fixture is UTF-8 with line feeds only and no byte order mark', !fixture.includes('\r') && fixture.charCodeAt(0) !== 0xfeff);
});
