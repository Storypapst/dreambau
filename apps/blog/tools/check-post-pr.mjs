// node tools/check-post-pr.mjs [--posts <dir>] [--base <dir> | --base-ref <ref>] [--publish] [--now <ISO instant>]
// The checks of a pull request that changes posts: the file rules for every post of the tree (as tools/check-post.mjs),
// and, against a copy of origin/main, PF-13 (a new post is named by the slug of its title), PF-5 (a new post sorts after
// the newest on origin/main), AD-6 (the address of a published post does not change) and AD-7 (a removed address is never
// reused). Slice S7 adds the text-equality check IN-4 to this tool.
// --posts: the tree to check (default posts/ of this app). The base is by default the ref refs/remotes/origin/main of this
// repository (run `git fetch origin main` first); --base takes a directory that holds a copy of posts/.
// Output and exit codes as tools/check-post.mjs: FAIL/WARN lines, exit 0 (WARN only), 1, or 2 for a wrong command line.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArguments, parseInstant } from '../src/lib/cli.mjs';
import { exitCodeOf, format } from '../src/lib/findings.mjs';
import { checkTree, loadOriginMain, loadTreeFromDir } from '../src/lib/tree.mjs';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'Usage: node tools/check-post-pr.mjs [--posts <dir>] [--base <dir> | --base-ref <ref>] [--publish] [--now <YYYY-MM-DDTHH:MM:SSZ>]';
const parsed = parseArguments(process.argv.slice(2), { flags: ['--publish'], options: ['--posts', '--base', '--base-ref', '--now'] });
const now = parsed.values['--now'] === undefined ? new Date() : parseInstant(parsed.values['--now']);
const postsDir = parsed.values['--posts'] || path.join(APP_ROOT, 'posts');
const problem = parsed.error
  || (parsed.positional.length > 0 ? 'no file arguments; use --posts <dir>' : '')
  || (now === null ? '--now must be an ISO instant such as 2026-10-09T22:30:00Z' : '')
  || (parsed.values['--base'] !== undefined && parsed.values['--base-ref'] !== undefined ? 'use --base or --base-ref, not both' : '')
  || (!fs.existsSync(postsDir) || !fs.statSync(postsDir).isDirectory() ? `the posts folder ${postsDir} does not exist` : '');
if (problem) {
  console.error(`${problem}\n${USAGE}`);
  process.exit(2);
}

let base;
try {
  base = parsed.values['--base'] !== undefined ? loadTreeFromDir(parsed.values['--base']) : loadOriginMain(APP_ROOT, parsed.values['--base-ref']);
} catch (error) {
  console.error(`${error.message}\n${USAGE}`);
  process.exit(2);
}
const displayDir = postsDir.replace(/[\\/]+$/, '');
const findings = checkTree({ head: loadTreeFromDir(postsDir), base, headDir: postsDir, displayDir, publish: parsed.flags.has('--publish'), now });
for (const finding of findings) console.log(format(finding));
process.exitCode = exitCodeOf(findings);
