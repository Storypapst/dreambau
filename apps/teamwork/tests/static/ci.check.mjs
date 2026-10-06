// ci: the workflow of the Teamwork folder (.github/workflows/teamwork.yml). It is limited to the paths of the folder,
// uses the same pinned action commits as the root workflow, and runs `npm ci`, the Playwright Chromium install, the
// image pull and `npm run check` within 30 minutes. The workflow is read as a structure by a small YAML reader
// (tests/lib/miniyaml.mjs); both the reader and the rules prove themselves on made-up text first.
// Not checked here, and not checkable locally: that GitHub runs the file. Its first real run is the draft pull request.
import fs from 'node:fs';
import { check, same, run } from '../lib/check.mjs';
import { ROOT, ROOT_WORKFLOW, WORKFLOW } from '../lib/paths.mjs';
import { parseYaml } from '../lib/miniyaml.mjs';
import { nginxImage } from '../lib/page-server.mjs';
import { LOCKFILE, usesOf, workflowProblems } from '../lib/workflow.mjs';

const rootText = fs.readFileSync(ROOT_WORKFLOW, 'utf8');
const uses = usesOf(rootText);
const image = 'nginx:1.27-alpine';
const environment = { image, lockfileExists: true };

// A workflow that keeps every rule, built from the root's own pinned actions; each way of breaking a rule is a replacement in it.
const GOOD = `name: Teamwork

# A comment line
on:
  push:
    branches: [main]
    paths:
      - 'apps/teamwork/**'
      - '.github/workflows/teamwork.yml'
  pull_request:
    paths:
      - 'apps/teamwork/**'
      - '.github/workflows/teamwork.yml'

permissions:
  contents: read

concurrency:
  group: teamwork-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    name: Teamwork checks
    runs-on: ubuntu-latest
    timeout-minutes: 30
    defaults:
      run:
        working-directory: apps/teamwork
    steps:
      - uses: ${uses['actions/checkout']} # v7.0.1
        with:
          persist-credentials: false
      - uses: ${uses['actions/setup-node']} # v7.0.0
        with:
          node-version-file: .nvmrc
          cache: npm
          cache-dependency-path: ${LOCKFILE}
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium
      - name: Pull the nginx image
        run: docker pull ${image}
      - name: Run the checks
        run: npm run check
`;

const MUTATIONS = [
  ['a push to every branch', "    branches: [main]\n", '    branches: [main, dev]\n'],
  ['no path filter on push', "    branches: [main]\n    paths:\n      - 'apps/teamwork/**'\n      - '.github/workflows/teamwork.yml'\n", '    branches: [main]\n'],
  ['a path filter that misses the workflow file', "  pull_request:\n    paths:\n      - 'apps/teamwork/**'\n      - '.github/workflows/teamwork.yml'\n", "  pull_request:\n    paths:\n      - 'apps/teamwork/**'\n"],
  ['a path filter on another folder', "  pull_request:\n    paths:\n      - 'apps/teamwork/**'", "  pull_request:\n    paths:\n      - 'apps/**'"],
  ['paths-ignore', "  pull_request:\n    paths:", "  pull_request:\n    paths-ignore: ['docs/**']\n    paths:"],
  ['pull_request_target', '  pull_request:\n', '  pull_request_target:\n'],
  ['a write permission', 'contents: read', 'contents: write'],
  ['the root concurrency group', 'group: teamwork-${{ github.ref }}', 'group: ci-${{ github.ref }}'],
  ['no time limit', '    timeout-minutes: 30\n', ''],
  ['a time limit of 60 minutes', 'timeout-minutes: 30', 'timeout-minutes: 60'],
  ['another operating system', 'runs-on: ubuntu-latest', 'runs-on: macos-latest'],
  ['an action pinned to a tag', `uses: ${uses['actions/checkout']}`, 'uses: actions/checkout@v4'],
  ['an action pinned to another commit', `uses: ${uses['actions/setup-node']}`, `uses: actions/setup-node@${'0123456789abcdef'.repeat(3).slice(0, 40)}`],
  ['persisting credentials', 'persist-credentials: false', 'persist-credentials: true'],
  ['no cache path for npm', `          cache-dependency-path: ${LOCKFILE}\n`, ''],
  ['the Node version from nowhere', 'node-version-file: .nvmrc', 'node-version: 18'],
  ['no install of the packages', '      - name: Install dependencies\n        run: npm ci\n', ''],
  ['no browser install', '      - name: Install Playwright Chromium\n        run: npx playwright install --with-deps chromium\n', ''],
  ['no image pull', `      - name: Pull the nginx image\n        run: docker pull ${image}\n`, ''],
  ['another image than the page server starts', `docker pull ${image}`, 'docker pull nginx:latest'],
  ['no run of the checks', '      - name: Run the checks\n        run: npm run check\n', ''],
  ['the checks before the install', '      - name: Run the checks\n        run: npm run check\n', ''],
  ['commands outside the folder', '    defaults:\n      run:\n        working-directory: apps/teamwork\n', ''],
  ['a secret', '        run: npm run check\n', '        run: npm run check\n        env:\n          TOKEN: ${{ secrets.TOKEN }}\n'],
];

await run(async () => {
  // ---- the reader proves itself ----
  same('ci the YAML reader reads mappings, lists, flow lists, quotes, numbers, booleans and comments', parseYaml(`# top
a: 1
b: true # trailing comment
c: 'it''s # not a comment'
d: [x, "y z", 3]
e:
  - one
  - two: 2
    three: 3
  -
    four: 4
f:
  g:
    h: ~
i: |
  line 1
  # kept: part of the text
  line 3
j: >-
  folded
  text
k: "a \\"quoted\\" word"
`), { a: 1, b: true, c: "it's # not a comment", d: ['x', 'y z', 3], e: ['one', { two: 2, three: 3 }, { four: 4 }], f: { g: { h: null } }, i: 'line 1\n# kept: part of the text\nline 3\n', j: 'folded text', k: 'a "quoted" word' });
  for (const [what, text] of [['a tab', 'a:\n\tb: 1\n'], ['an anchor', 'a: &x 1\nb: *x\n'], ['a key twice', 'a: 1\na: 2\n'], ['an unclosed quote', 'a: "open\n'], ['a flow mapping', 'a: {b: 1}\n']]) {
    let message = '';
    try {
      parseYaml(text);
    } catch (error) {
      message = error.message;
    }
    check(`ci the YAML reader refuses ${what} and names the line`, /^YAML line \d+/.test(message), message || 'no error');
  }
  same('ci the YAML reader reads the root workflow: its jobs and its pinned actions', [Object.keys(parseYaml(rootText).jobs), Object.keys(uses).sort()], [['verify', 'tag-cli'], ['actions/checkout', 'actions/setup-node']]);

  // ---- the rules prove themselves ----
  same('ci a workflow that keeps every rule passes', workflowProblems(GOOD, rootText, environment), []);
  for (const [what, from, to] of MUTATIONS) {
    let text = GOOD.includes(from) ? GOOD.replace(from, to) : GOOD;
    if (what === 'the checks before the install') text = GOOD.replace('      - name: Run the checks\n        run: npm run check\n', '').replace('      - name: Install dependencies\n', '      - name: Run the checks\n        run: npm run check\n      - name: Install dependencies\n');
    const problems = workflowProblems(text, rootText, environment);
    check(`ci the rules report ${what}`, text !== GOOD && problems.length > 0, text === GOOD ? 'the replacement changed nothing' : problems.length > 0 ? `reported: ${problems[0].slice(0, 80)}` : 'nothing reported');
  }
  check('ci the rules report an npm cache without the lock file on disk', workflowProblems(GOOD, rootText, { image, lockfileExists: false }).length > 0);

  // ---- the real workflow ----
  check('ci .github/workflows/teamwork.yml exists', fs.existsSync(WORKFLOW));
  check(`ci ${LOCKFILE} exists (the npm cache of the workflow reads it)`, fs.existsSync(`${ROOT}/package-lock.json`));
  if (fs.existsSync(WORKFLOW)) {
    same('ci the workflow is limited to the paths of the Teamwork folder, uses the pinned actions of the root workflow, and runs npm ci, the Playwright install, the image pull and npm run check in 30 minutes',
      workflowProblems(fs.readFileSync(WORKFLOW, 'utf8'), rootText, { image: nginxImage(), lockfileExists: fs.existsSync(`${ROOT}/package-lock.json`) }), []);
  }
});
