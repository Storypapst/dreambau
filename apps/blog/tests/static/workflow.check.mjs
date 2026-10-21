// BD-8 (pull-request part): .github/workflows/blog.yml runs only for pull requests that change apps/blog/** or the
// workflow file, has `permissions: contents: read`, uses no secret and never `pull_request_target`, uses the pinned
// action commits of teamwork.yml, installs the packages, pulls the nginx image, runs `npm run check`, and has a time
// limit. The workflow is read as a structure by a small YAML reader (tests/lib/miniyaml.mjs); both the reader and the
// rules prove themselves on made-up text first (BD-9).
// Not checked here, and not checkable locally: that GitHub runs the file. Its first real run is the pull request.
import fs from 'node:fs';
import { check, same, run } from '../lib/check.mjs';
import { ROOT, TEAMWORK_WORKFLOW, WORKFLOW } from '../lib/paths.mjs';
import { DEFAULT_IMAGE, nginxImage } from '../lib/image.mjs';
import { parseYaml } from '../lib/miniyaml.mjs';
import { LOCKFILE, usesOf, workflowProblems } from '../lib/workflow.mjs';

const modelText = fs.readFileSync(TEAMWORK_WORKFLOW, 'utf8');
const uses = usesOf(modelText);
const environment = { image: DEFAULT_IMAGE, lockfileExists: true };

// A workflow that keeps every rule, built from the model's own pinned actions; each way of breaking a rule is a replacement in it.
const GOOD = `name: Blog

on:
  pull_request:
    paths:
      - 'apps/blog/**'
      - '.github/workflows/blog.yml'

permissions:
  contents: read

concurrency:
  group: blog-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    name: Blog checks
    runs-on: ubuntu-latest
    timeout-minutes: 30
    defaults:
      run:
        working-directory: apps/blog
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
      - name: Pull the nginx image
        run: docker pull ${DEFAULT_IMAGE}
      - name: Run the checks
        run: npm run check
`;
const CHECK_STEP = '      - name: Run the checks\n        run: npm run check\n';
const PULL_STEP = `      - name: Pull the nginx image\n        run: docker pull ${DEFAULT_IMAGE}\n`;
const INSTALL_STEP = '      - name: Install dependencies\n        run: npm ci\n';

const MUTATIONS = [
  ['a push trigger', 'on:\n  pull_request:', 'on:\n  push:\n    branches: [main]\n  pull_request:'],
  ['no path filter', "    paths:\n      - 'apps/blog/**'\n      - '.github/workflows/blog.yml'\n", ''],
  ['a path filter that misses the workflow file', "      - '.github/workflows/blog.yml'\n", ''],
  ['a path filter on another folder', "'apps/blog/**'", "'apps/**'"],
  ['paths-ignore', '  pull_request:\n    paths:', "  pull_request:\n    paths-ignore: ['docs/**']\n    paths:"],
  ['pull_request_target', '  pull_request:\n', '  pull_request_target:\n'],
  ['a write permission', 'contents: read', 'contents: write'],
  ['no permissions block', 'permissions:\n  contents: read\n\n', ''],
  ['the concurrency group of another workflow', 'group: blog-${{ github.ref }}', 'group: teamwork-${{ github.ref }}'],
  ['no time limit', '    timeout-minutes: 30\n', ''],
  ['a time limit of 60 minutes', 'timeout-minutes: 30', 'timeout-minutes: 60'],
  ['another operating system', 'runs-on: ubuntu-latest', 'runs-on: macos-latest'],
  ['an action pinned to a tag', `uses: ${uses['actions/checkout']}`, 'uses: actions/checkout@v4'],
  ['an action pinned to another commit', `uses: ${uses['actions/setup-node']}`, `uses: actions/setup-node@${'0123456789abcdef'.repeat(3).slice(0, 40)}`],
  ['persisting credentials', 'persist-credentials: false', 'persist-credentials: true'],
  ['no cache path for npm', `          cache-dependency-path: ${LOCKFILE}\n`, ''],
  ['the Node version from nowhere', 'node-version-file: .nvmrc', 'node-version: 18'],
  ['no install of the packages', INSTALL_STEP, ''],
  ['no image pull', PULL_STEP, ''],
  ['another image than the page server starts', `docker pull ${DEFAULT_IMAGE}`, 'docker pull nginx:latest'],
  ['no run of the checks', CHECK_STEP, ''],
  ['commands outside the folder', '    defaults:\n      run:\n        working-directory: apps/blog\n', ''],
  ['a secret', CHECK_STEP, `${CHECK_STEP}        env:\n          TOKEN: \${{ secrets.TOKEN }}\n`],
];

await run(async () => {
  // ---- the reader proves itself ----
  same('BD-8 the YAML reader reads mappings, lists, flow lists, quotes, numbers, booleans and comments', parseYaml(`# top
a: 1
b: true # trailing comment
c: 'it''s # not a comment'
d: [x, "y z", 3]
e:
  - one
  - two: 2
    three: 3
`), { a: 1, b: true, c: "it's # not a comment", d: ['x', 'y z', 3], e: ['one', { two: 2, three: 3 }] });
  let message = '';
  try { parseYaml('a: &x 1\nb: *x\n'); } catch (error) { message = error.message; }
  check('BD-8 the YAML reader refuses what it does not know and names the line', /^YAML line \d+/.test(message), message || 'no error');
  same('BD-8 the YAML reader finds the pinned actions of teamwork.yml', Object.keys(uses).sort(), ['actions/checkout', 'actions/setup-node']);

  // ---- the rules prove themselves ----
  same('BD-9 a workflow that keeps every rule passes', workflowProblems(GOOD, modelText, environment), []);
  for (const [what, from, to] of MUTATIONS) {
    const text = GOOD.includes(from) ? GOOD.replace(from, to) : GOOD;
    const problems = workflowProblems(text, modelText, environment);
    check(`BD-9 the rules report ${what}`, text !== GOOD && problems.length > 0, text === GOOD ? 'the replacement changed nothing' : problems.length > 0 ? `reported: ${problems[0].slice(0, 80)}` : 'nothing reported');
  }
  const swapped = GOOD.replace(CHECK_STEP, '').replace(INSTALL_STEP, `${CHECK_STEP}${INSTALL_STEP}`);
  check('BD-9 the rules report the checks before the install', swapped !== GOOD && workflowProblems(swapped, modelText, environment).length > 0);
  check('BD-9 the rules report an npm cache without the lock file on disk', workflowProblems(GOOD, modelText, { ...environment, lockfileExists: false }).length > 0);

  // ---- the real workflow ----
  check('BD-8 .github/workflows/blog.yml exists', fs.existsSync(WORKFLOW));
  check(`BD-8 ${LOCKFILE} exists (the npm cache of the workflow reads it)`, fs.existsSync(`${ROOT}/package-lock.json`));
  if (fs.existsSync(WORKFLOW)) {
    same('BD-8 the workflow runs for pull requests only, for the two paths only, with permissions contents: read, no secret, no pull_request_target, the pinned actions of teamwork.yml, npm ci, the image pull, npm run check and a time limit',
      workflowProblems(fs.readFileSync(WORKFLOW, 'utf8'), modelText, { image: nginxImage(), lockfileExists: fs.existsSync(`${ROOT}/package-lock.json`) }), []);
  }
});
