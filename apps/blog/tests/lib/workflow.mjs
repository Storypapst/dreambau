// What the Blog workflow (.github/workflows/blog.yml) must be (spec 5.12 BD-8, pull-request part; the push part comes
// with slice S8). `workflowProblems` reads the workflow as a structure (tests/lib/miniyaml.mjs) and returns a list of
// sentences; an empty list means the workflow keeps every rule. It cannot say whether GitHub runs the workflow: its
// first real run is the pull request that carries it.
import { parseYaml } from './miniyaml.mjs';

export const BLOG_PATHS = ['apps/blog/**', '.github/workflows/blog.yml'];
export const LOCKFILE = 'apps/blog/package-lock.json';
const PINNED = /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/;

const asList = (value) => (Array.isArray(value) ? value : []);
const sameSet = (a, b) => a.length === b.length && [...a].sort().every((item, index) => item === [...b].sort()[index]);

export function stepsOf(workflow) {
  return Object.values(workflow.jobs || {}).flatMap((job) => asList(job && job.steps));
}

// The `uses` values of a workflow text, by action name: { 'actions/checkout': 'actions/checkout@<sha>', ... }.
export function usesOf(text) {
  const found = {};
  for (const step of stepsOf(parseYaml(text))) if (step && typeof step.uses === 'string') found[step.uses.split('@')[0]] = step.uses;
  return found;
}

// text: the workflow; modelText: teamwork.yml, whose pinned actions it must reuse; image: the nginx image the page
// server starts by default; lockfileExists: whether apps/blog/package-lock.json exists.
export function workflowProblems(text, modelText, { image, lockfileExists }) {
  const problems = [];
  let workflow;
  let model;
  try {
    workflow = parseYaml(text);
    model = parseYaml(modelText);
  } catch (error) {
    return [`a workflow file cannot be read: ${error.message}`];
  }
  if (!workflow || typeof workflow !== 'object') return ['the workflow file is empty'];

  // Triggers: pull requests only (the push part comes with slice S8), limited to the Blog paths.
  const on = workflow.on || {};
  if (!sameSet(Object.keys(on), ['pull_request'])) problems.push(`the triggers are ${JSON.stringify(Object.keys(on))}, expected pull_request only`);
  const pull = on.pull_request || {};
  if (!sameSet(asList(pull.paths), BLOG_PATHS)) problems.push(`pull_request is limited to the paths ${JSON.stringify(pull.paths)}, expected ${JSON.stringify(BLOG_PATHS)}`);
  if ('paths-ignore' in pull || 'branches-ignore' in pull) problems.push('pull_request must not use paths-ignore or branches-ignore');

  // Safety: read-only token, no secrets, no trigger that runs pull-request code with secrets.
  if (JSON.stringify(workflow.permissions) !== JSON.stringify({ contents: 'read' })) problems.push(`permissions are ${JSON.stringify(workflow.permissions)}, expected {"contents":"read"}`);
  if (/\bsecrets\./.test(text) || /\bsecrets:\s*inherit/.test(text)) problems.push('the workflow uses secrets');
  if (/pull_request_target/.test(text)) problems.push('the workflow uses pull_request_target');

  // Its own concurrency group: with another workflow's group the two workflows of one branch would cancel each other.
  const group = workflow.concurrency && workflow.concurrency.group;
  const modelGroup = model.concurrency && model.concurrency.group;
  if (typeof group !== 'string' || !group.includes('github.ref') || group === modelGroup) problems.push(`the concurrency group ${JSON.stringify(group)} must be its own and name github.ref (the model's is ${JSON.stringify(modelGroup)})`);

  // The jobs: Linux, a time limit of 30 minutes at most, working in the Blog folder.
  const jobs = Object.entries(workflow.jobs || {});
  if (jobs.length === 0) problems.push('the workflow has no job');
  for (const [name, job] of jobs) {
    if (job['runs-on'] !== 'ubuntu-latest') problems.push(`job ${name} runs on ${JSON.stringify(job['runs-on'])}, expected ubuntu-latest`);
    const limit = job['timeout-minutes'];
    if (!Number.isInteger(limit) || limit < 1 || limit > 30) problems.push(`job ${name} has the time limit ${JSON.stringify(limit)} minutes, expected 1 to 30`);
    const inFolder = (step) => (step['working-directory'] || (job.defaults && job.defaults.run && job.defaults.run['working-directory'])) === 'apps/blog';
    for (const step of asList(job.steps)) if (typeof step.run === 'string' && !inFolder(step)) problems.push(`the step ${JSON.stringify(step.name || step.run.slice(0, 30))} does not run in apps/blog`);
  }

  // The actions: the same pinned commits as the model workflow (teamwork.yml).
  const modelUses = new Set(Object.values(usesOf(modelText)));
  const steps = stepsOf(workflow);
  for (const step of steps) {
    if (typeof step.uses !== 'string') continue;
    if (!PINNED.test(step.uses)) problems.push(`${step.uses} is not pinned to a commit`);
    else if (!modelUses.has(step.uses)) problems.push(`${step.uses} is not one of the pinned actions of teamwork.yml`);
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

  // The commands, in order: install, image, then the checks.
  const commands = steps.filter((step) => typeof step.run === 'string').map((step) => step.run.trim());
  const at = (command) => commands.findIndex((run) => run === command);
  const order = ['npm ci', `docker pull ${image}`, 'npm run check'];
  for (const command of order) if (at(command) === -1) problems.push(`there is no step that runs "${command}"`);
  if (order.every((command) => at(command) !== -1) && !order.every((command, index) => index === 0 || at(order[index - 1]) < at(command))) problems.push(`the steps run in the wrong order, expected ${order.join(', ')}`);
  return problems;
}
