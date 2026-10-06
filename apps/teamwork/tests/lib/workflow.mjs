// What the Teamwork workflow (.github/workflows/teamwork.yml) must be (ticket 1, point 9 and its acceptance line "ci").
// `workflowProblems` reads the workflow as a structure (tests/lib/miniyaml.mjs) and returns a list of sentences; an
// empty list means the workflow keeps every rule. It cannot say whether the workflow runs: its first real run is the
// draft pull request.
import { parseYaml } from './miniyaml.mjs';

export const TEAMWORK_PATHS = ['apps/teamwork/**', '.github/workflows/teamwork.yml'];
export const LOCKFILE = 'apps/teamwork/package-lock.json';
const PINNED = /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/;

const asList = (value) => (Array.isArray(value) ? value : []);
const sameSet = (a, b) => a.length === b.length && [...a].sort().every((item, index) => item === [...b].sort()[index]);

export function stepsOf(workflow) {
  return Object.values(workflow.jobs || {}).flatMap((job) => asList(job && job.steps));
}

// The `uses` values of a workflow text, by action name: { 'actions/checkout': 'actions/checkout@<sha>', ... }.
export function usesOf(text) {
  const workflow = parseYaml(text);
  const found = {};
  for (const step of stepsOf(workflow)) if (step && typeof step.uses === 'string') found[step.uses.split('@')[0]] = step.uses;
  return found;
}

// image: the nginx image the page server starts by default; lockfileExists: whether apps/teamwork/package-lock.json exists.
export function workflowProblems(text, rootText, { image, lockfileExists }) {
  const problems = [];
  let workflow;
  let root;
  try {
    workflow = parseYaml(text);
    root = parseYaml(rootText);
  } catch (error) {
    return [`a workflow file cannot be read: ${error.message}`];
  }
  if (!workflow || typeof workflow !== 'object') return ['the workflow file is empty'];

  // Triggers: a push to the default branch and pull requests, both limited to the Teamwork paths.
  const on = workflow.on || {};
  if (!sameSet(Object.keys(on), ['push', 'pull_request'])) problems.push(`the triggers are ${JSON.stringify(Object.keys(on))}, expected push and pull_request only`);
  const push = on.push || {};
  const pull = on.pull_request || {};
  if (!sameSet(asList(push.branches), ['main'])) problems.push(`push runs on the branches ${JSON.stringify(push.branches)}, expected ["main"]`);
  for (const [name, trigger] of [['push', push], ['pull_request', pull]]) {
    if (!sameSet(asList(trigger.paths), TEAMWORK_PATHS)) problems.push(`${name} is limited to the paths ${JSON.stringify(trigger.paths)}, expected ${JSON.stringify(TEAMWORK_PATHS)}`);
    if ('paths-ignore' in trigger || 'branches-ignore' in trigger) problems.push(`${name} must not use paths-ignore or branches-ignore`);
  }

  // Safety: read-only token, no secrets, no trigger that runs pull-request code with secrets.
  if (JSON.stringify(workflow.permissions) !== JSON.stringify({ contents: 'read' })) problems.push(`permissions are ${JSON.stringify(workflow.permissions)}, expected {"contents":"read"}`);
  if (/\bsecrets\./.test(text) || /pull_request_target/.test(text)) problems.push('the workflow uses secrets or pull_request_target');

  // Its own concurrency group: with the root's group the two workflows of one branch would cancel each other.
  const group = workflow.concurrency && workflow.concurrency.group;
  const rootGroup = root.concurrency && root.concurrency.group;
  if (typeof group !== 'string' || !group.includes('github.ref') || group === rootGroup) problems.push(`the concurrency group ${JSON.stringify(group)} must be its own and name github.ref (the root's is ${JSON.stringify(rootGroup)})`);

  // The jobs: Linux, 30 minutes at most, working in the Teamwork folder.
  const jobs = Object.entries(workflow.jobs || {});
  if (jobs.length === 0) problems.push('the workflow has no job');
  for (const [name, job] of jobs) {
    if (job['runs-on'] !== 'ubuntu-latest') problems.push(`job ${name} runs on ${JSON.stringify(job['runs-on'])}, expected ubuntu-latest`);
    if (job['timeout-minutes'] !== 30) problems.push(`job ${name} has the time limit ${JSON.stringify(job['timeout-minutes'])} minutes, expected 30`);
    const inFolder = (step) => (step['working-directory'] || (job.defaults && job.defaults.run && job.defaults.run['working-directory'])) === 'apps/teamwork';
    for (const step of asList(job.steps)) if (typeof step.run === 'string' && !inFolder(step)) problems.push(`the step ${JSON.stringify(step.name || step.run.slice(0, 30))} does not run in apps/teamwork`);
  }

  // The actions: the same pinned commits as the root workflow.
  const rootUses = new Set(Object.values(usesOf(rootText)));
  const steps = stepsOf(workflow);
  for (const step of steps) {
    if (typeof step.uses !== 'string') continue;
    if (!PINNED.test(step.uses)) problems.push(`${step.uses} is not pinned to a commit`);
    else if (!rootUses.has(step.uses)) problems.push(`${step.uses} is not one of the pinned actions of the root workflow`);
  }
  const checkout = steps.find((step) => typeof step.uses === 'string' && step.uses.startsWith('actions/checkout@'));
  if (!checkout) problems.push('there is no checkout step');
  else if (!checkout.with || checkout.with['persist-credentials'] !== false) problems.push('checkout must set persist-credentials to false');
  const node = steps.find((step) => typeof step.uses === 'string' && step.uses.startsWith('actions/setup-node@'));
  if (!node) problems.push('there is no setup-node step');
  else {
    const settings = node.with || {};
    if (settings['node-version-file'] !== '.nvmrc') problems.push(`setup-node reads the Node version from ${JSON.stringify(settings['node-version-file'])}, expected .nvmrc`);
    if (settings.cache === 'npm' && (settings['cache-dependency-path'] !== LOCKFILE || !lockfileExists)) problems.push(`the npm cache needs cache-dependency-path ${LOCKFILE} and that file`);
  }

  // The commands, in order: install, browser, image, then the checks.
  const commands = steps.filter((step) => typeof step.run === 'string').map((step) => step.run.trim());
  const at = (command) => commands.findIndex((run) => run === command);
  const order = ['npm ci', 'npx playwright install --with-deps chromium', `docker pull ${image}`, 'npm run check'];
  for (const command of order) if (at(command) === -1) problems.push(`there is no step that runs "${command}"`);
  if (order.every((command) => at(command) !== -1) && !order.every((command, index) => index === 0 || at(order[index - 1]) < at(command))) problems.push(`the steps run in the wrong order, expected ${order.join(', ')}`);
  return problems;
}
