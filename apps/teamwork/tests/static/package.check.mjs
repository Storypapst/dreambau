// The Teamwork folder as a package: the three npm scripts that later slices rely on, Playwright pinned to exactly the
// number apps/landing pins (1.56.1, the literal of the ticket), a lock file that agrees, an ignore file for installed
// packages and test output, and a short README that names the three commands.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { REPO, ROOT } from '../lib/paths.mjs';

const PINNED = '1.56.1';
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const ignored = (relative) => spawnSync('git', ['check-ignore', '-q', relative], { cwd: ROOT }).status === 0;

await run(async () => {
  const pkg = readJson(path.join(ROOT, 'package.json'));
  same('package: the three scripts of the ticket, check and serve and verify',
    [pkg.scripts.check, pkg.scripts.serve, pkg.scripts.verify], ['node tests/run.mjs', 'node tests/serve.mjs', 'node tests/run.mjs --evidence']);
  same('package: verify is the same run as check with the flag --evidence', pkg.scripts.verify, `${pkg.scripts.check} --evidence`);
  check('package: private, and an ES module package (the page script is imported by Node in a check)', pkg.private === true && pkg.type === 'module', `private ${pkg.private}, type ${pkg.type}`);

  same('package: Playwright is pinned to exactly 1.56.1, with no range', pkg.devDependencies, { playwright: PINNED });
  const landing = readJson(path.join(REPO, 'apps', 'landing', 'package.json'));
  same('package: the pin is the number apps/landing pins', pkg.devDependencies.playwright, landing.devDependencies.playwright);

  const lock = readJson(path.join(ROOT, 'package-lock.json'));
  const entries = lock.packages || {};
  same('package: the lock file agrees (lock version 3, 1.56.1 for the package and for its core)',
    [lock.lockfileVersion, entries[''].devDependencies, entries['node_modules/playwright']?.version, entries['node_modules/playwright-core']?.version],
    [3, { playwright: PINNED }, PINNED, PINNED]);

  check('package: git ignores installed packages', ignored('node_modules/playwright/package.json'));
  check('package: git ignores test output', ignored('test-results/a.png') && ignored('playwright-report/index.html'));
  check('package: git does not ignore the evidence folder verification/ (its report and screenshots are committed)', !ignored('verification/report.json') && !ignored('verification/normal-1280.png'));

  const readme = fs.existsSync(path.join(ROOT, 'README.md')) ? fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8') : '';
  check('package: the README names how to install, how to start the page server and how to run the checks',
    ['npm ci', 'npm run serve', 'npm run check'].every((command) => readme.includes(command)), readme === '' ? 'README.md missing' : '');
  check('package: the README names the spec as owner/repo#number, not as an address', readme.includes('Storypapst/dreambau-docs#23'));
});
