// C5 (D4, X10): the scan of apps/teamwork for names and secrets, in the reading that gap G3 and G4 fix:
// - in programs.example.json every host ends in .example.test or is 127.0.0.1;
// - in the rest of the folder dreambau.com (exactly, not its subdomains) and localhost are allowed as well;
// - the only e-mail address anywhere is info@dreambau.com;
// - no run of 32 or more characters of [A-Za-z0-9+/=] that holds a digit, an upper-case and a lower-case letter.
// The scan skips package-lock.json and installed packages (integrity strings and package-server hosts).
// It first proves itself on made-up input, which this file puts together from fragments so that the scan of this
// very file does not find it: a made-up key must be flagged, a 39-character server path must not.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { EXAMPLE_LIST, ROOT } from '../lib/paths.mjs';
import { filesBelow, secretProblems, teamworkFiles } from '../lib/scans.mjs';

const LIST = 'programs.example.json';
const REAL_HOST = ['https:', '', 'umfrage.dreambau', '.com/start'].join('/');   // a subdomain of dreambau.com
const OTHER_HOST = ['http:', '', 'build-server.corp.net:8080/x'].join('/');
const USER_ADDRESS = `https:/${'/'}user:secret${'@'}a.example.test/x`;   // an address with a user name and a password
const MADE_UP_EMAIL = ['max.mustermann', 'real-company.org'].join('@');
const MADE_UP_KEY = ['Zq3Rt9', 'Xw2Vb7', 'Nm4Lk8', 'Jh5Gf1', 'Ds6Pa0', 'Yc2Uo9', 'Ie3'].join('');   // 39 characters
const SERVER_PATH = '/srv/dreambau/teamwork/private/programs';   // 39 characters, no digit and no capital

const flaggedRules = (name, text) => secretProblems([{ name, text, binary: false }]).map((problem) => problem.rule);

const made = [];
try {
  await run(async () => {
    // ---- the scan proves itself ----
    check('C5 the made-up key is 39 characters and the server path is 39 characters', MADE_UP_KEY.length === 39 && SERVER_PATH.length === 39, `${MADE_UP_KEY.length} and ${SERVER_PATH.length}`);
    same('C5 a made-up key string is flagged', flaggedRules('a.txt', `key = ${MADE_UP_KEY}`), ['key']);
    same('C5 a 39-character server path is not flagged', flaggedRules('a.txt', `path = ${SERVER_PATH}`), []);
    same('C5 a base64 string that ends in = signs is flagged', flaggedRules('a.txt', `${MADE_UP_KEY.slice(0, 33)}==`), ['key']);
    same('C5 31 characters are not flagged, 32 are', [flaggedRules('a.txt', MADE_UP_KEY.slice(0, 31)), flaggedRules('a.txt', MADE_UP_KEY.slice(0, 32))], [[], ['key']]);
    same('C5 a run without a capital letter (a git commit or a sha256 in hex) is not flagged', flaggedRules('a.txt', `${'0123456789abcdef'.repeat(4)} ${'fedcba9876'.repeat(4)}`), []);
    same('C5 a made-up e-mail address is flagged, the address of the notice and a version pin are not',
      [flaggedRules('a.txt', MADE_UP_EMAIL), flaggedRules('a.txt', 'info@dreambau.com'), flaggedRules('a.txt', 'playwright@1.56.1 and actions/checkout@0123456789abcdef0123456789abcdef01234567')], [['email'], [], []]);
    same('C5 hosts in the example list: the invented ones pass, dreambau.com and other hosts are flagged',
      [flaggedRules(LIST, '"https://aurora.example.test/x" "http://127.0.0.1:18081"'), flaggedRules(LIST, '"https://dreambau.com/"'), flaggedRules(LIST, `"${REAL_HOST}"`), flaggedRules(LIST, `"${OTHER_HOST}"`)],
      [[], ['host'], ['host'], ['host']]);
    same('C5 hosts elsewhere: dreambau.com, localhost, the invented hosts pass; a subdomain of dreambau.com and other hosts are flagged',
      [flaggedRules('a.conf', 'https://dreambau.com/x http://localhost:8080/ https://a.example.test/ http://127.0.0.1:1/ https://example.test/'), flaggedRules('a.conf', REAL_HOST), flaggedRules('a.conf', OTHER_HOST)],
      [[], ['host'], ['host']]);
    same('C5 a template placeholder is no host, and a port is not part of one',
      [flaggedRules('a.mjs', 'http://${address}/x and http://${host}:${port}/'), flaggedRules('a.mjs', 'https://a.example.test:8443/x')], [[], []]);
    same('C5 a user name in an address is flagged (it looks like an e-mail address and may be a password)', flaggedRules('a.mjs', USER_ADDRESS), ['email']);

    // the walk skips the lock file and installed packages, and nothing else
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'teamwork-c05-'));
    made.push(tree);
    fs.mkdirSync(path.join(tree, 'node_modules', 'pkg'), { recursive: true });
    fs.mkdirSync(path.join(tree, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(tree, 'package-lock.json'), `{"integrity": "${MADE_UP_KEY}", "resolved": "${OTHER_HOST}"}`);
    fs.writeFileSync(path.join(tree, 'node_modules', 'pkg', 'index.js'), `// ${MADE_UP_KEY}\n`);
    fs.writeFileSync(path.join(tree, 'tests', 'c.mjs'), `const key = '${MADE_UP_KEY}';\n`);
    fs.writeFileSync(path.join(tree, 'image.png'), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(MADE_UP_KEY)]));
    const walked = filesBelow(tree, { skipFolders: ['node_modules', '.git'], skipFiles: ['package-lock.json'] });
    same('C5 the walk skips package-lock.json and node_modules, and reads the rest', walked.map((file) => file.name), ['image.png', 'tests/c.mjs']);
    same('C5 the scan finds the key in the readable file and ignores the binary one', secretProblems(walked).map((problem) => [problem.name, problem.rule]), [['tests/c.mjs', 'key']]);
    check('C5 the flagged value is shortened, never printed in full', secretProblems(walked).every((problem) => !problem.value.includes(MADE_UP_KEY)), secretProblems(walked)[0]?.value);

    // ---- the real folder ----
    const files = teamworkFiles();
    const names = files.map((file) => file.name);
    check('C5 D4 X10 the scan reads the example list, the README and the package file, and skips the lock file and installed packages',
      [LIST, 'README.md', 'package.json'].every((name) => names.includes(name)) && !names.includes('package-lock.json') && !names.some((name) => name.startsWith('node_modules/')), `${names.length} files`);
    const lock = fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8');
    check('C5 the lock file holds what the scan would flag (integrity strings, package-server hosts), so that skipping it is needed',
      secretProblems([{ name: 'package-lock.json', text: lock, binary: false }]).length > 0);

    const list = JSON.parse(fs.readFileSync(EXAMPLE_LIST, 'utf8'));
    const addresses = list.programs.flatMap((program) => [program.url, program.probe]).filter((address) => address !== undefined);
    const hosts = addresses.map((address) => new URL(address).hostname);
    check('C5 D4 programs.example.json: every host of every url and probe (read as JSON) ends in .example.test or is 127.0.0.1',
      addresses.length === 23 && hosts.every((host) => host.endsWith('.example.test') || host === '127.0.0.1'), `${addresses.length} addresses; not allowed: ${hosts.filter((host) => !host.endsWith('.example.test') && host !== '127.0.0.1').join(', ') || 'none'}`);

    const problems = secretProblems(files);
    same('C5 D4 every host in programs.example.json ends in .example.test or is 127.0.0.1', problems.filter((problem) => problem.rule === 'host' && problem.name === LIST), []);
    same('C5 D4 X10 elsewhere in apps/teamwork every host is an invented one, dreambau.com or localhost', problems.filter((problem) => problem.rule === 'host' && problem.name !== LIST), []);
    same('C5 X10 the only e-mail address anywhere in apps/teamwork is info@dreambau.com', problems.filter((problem) => problem.rule === 'email'), []);
    same('C5 X10 no run of 32 or more base64 characters anywhere in apps/teamwork', problems.filter((problem) => problem.rule === 'key'), []);
  });
} finally {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
}
