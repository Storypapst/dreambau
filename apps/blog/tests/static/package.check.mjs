// BD-1 and BD-11: apps/blog is a package of its own with no runtime dependency, the commands that exist so far, an
// ignore file for the two output directories, a lock file for `npm ci`, and no check that can be skipped. The only
// development dependency is Playwright, pinned exactly at 1.56.1 as in the other apps (slice S2: the first checks that
// need a browser).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, same, run } from '../lib/check.mjs';
import { ROOT, REPO } from '../lib/paths.mjs';
import { filesBelow, skipLines } from '../lib/scans.mjs';

const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

await run(async () => {
  const pkg = JSON.parse(read('package.json'));
  // The literal command of the ticket.
  const printed = spawnSync(process.execPath, ['-e', "console.log(Object.keys(require('./package.json').dependencies||{}).length)"], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  same('BD-1 node -e "...dependencies...length" prints 0', printed, '0');
  same('BD-1 the package is private, an ES module, and named dreambau-blog', [pkg.private, pkg.type, pkg.name], [true, 'module', 'dreambau-blog']);
  same('BD-1 the commands that exist so far: build, build:demo, check, check:browser, check:server, check:tokens, serve', Object.keys(pkg.scripts).sort(), ['build', 'build:demo', 'check', 'check:browser', 'check:server', 'check:tokens', 'serve']);
  same('BD-1 the one development dependency is playwright, pinned exactly at 1.56.1 (no ^, no ~, as in the other apps)', pkg.devDependencies, { playwright: '1.56.1' });
  const others = ['teamwork', 'landing'].map((app) => JSON.parse(fs.readFileSync(path.join(REPO, 'apps', app, 'package.json'), 'utf8')).devDependencies.playwright);
  same('BD-1 the other apps pin the same version', others, ['1.56.1', '1.56.1']);
  check('BD-1 the lock file exists, so that npm ci works', fs.existsSync(path.join(ROOT, 'package-lock.json')));

  same('BD-1 check:server runs the checks of tests/server/ (the nginx container) and nothing else', pkg.scripts['check:server'], 'node tests/run.mjs server/');
  const lock = JSON.parse(read('package-lock.json'));
  same('BD-1 the lock file agrees: it lists the package, playwright, playwright-core and the optional fsevents of playwright, and nothing else', Object.keys(lock.packages).sort(), ['', 'node_modules/fsevents', 'node_modules/playwright', 'node_modules/playwright-core']);
  same('BD-1 the lock file has no runtime dependency: every package below the root is a development dependency', Object.entries(lock.packages).filter(([name, entry]) => name !== '' && !entry.dev).map(([name]) => name), []);
  same('BD-1 the lock file pins playwright and playwright-core at 1.56.1', [lock.packages['node_modules/playwright'].version, lock.packages['node_modules/playwright-core'].version], ['1.56.1', '1.56.1']);

  const ignored = read('.gitignore').split('\n').map((line) => line.trim());
  check('BD-11 .gitignore lists dist/ and dist-demo/', ignored.includes('dist/') && ignored.includes('dist-demo/'), JSON.stringify(ignored));
  // Git itself has the last word, also for the paths that do not exist yet.
  for (const name of ['dist/blog.json', 'dist-demo/blog.json', 'dist-demo/public/index.html']) {
    const status = spawnSync('git', ['check-ignore', '-q', `apps/blog/${name}`], { cwd: REPO }).status;
    same(`BD-11 git ignores apps/blog/${name}`, status, 0);
  }

  const readme = read('README.md');
  check('BD-1 README.md names how to install, serve and check', /npm ci/.test(readme) && /npm run serve/.test(readme) && /npm run check/.test(readme));

  // The root test runner picks up *.test.* and *.spec.* files anywhere in the monorepo; no such file may exist here.
  const everything = filesBelow(ROOT, { skipFolders: ['node_modules', 'dist', 'dist-demo'] });
  same('BD-1 no *.test.* or *.spec.* file in the folder (the root runner would pick it up)', everything.filter((file) => /\.(test|spec)\.[a-z]+$/i.test(file.name)).map((file) => file.name), []);
  same('BD-1 no check can be switched off (the grep of the ticket finds nothing in tests/)', skipLines(filesBelow(path.join(ROOT, 'tests'))), []);
  // The scan proves itself.
  same('BD-9 the skip scan finds a skipped test', skipLines([{ name: 'x.mjs', text: 'a\nit' + '.sk' + 'ip(1)\n' }]), ['x.mjs:2']);
  same('BD-9 the skip scan finds nothing in a clean text', skipLines([{ name: 'x.mjs', text: 'check("a", true)\n' }]), []);
});
