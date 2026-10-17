// node tools/check-post.mjs [--publish] [--now <ISO instant>] <post.md> [<post.md> ...]
// The post validator: the reader (PF-2, PF-3) and the rules of every field and of the body (PF-1, PF-4 to PF-12, PF-14),
// for each file given. Every failure is reported, not the first, as `FAIL <rule> <file>:<line>: <what>`. No output and exit 0
// when the files are good; exit 1 when any FAIL; exit 2 for a wrong command line. --publish adds the rules of a publish
// build (no future date in Europe/Berlin, no invented source host, no example: true); --now injects the clock.
import fs from 'node:fs';
import path from 'node:path';
import { parseArguments, parseInstant } from '../src/lib/cli.mjs';
import { exitCodeOf, fail, format } from '../src/lib/findings.mjs';
import { checkPostText } from '../src/lib/post-file.mjs';
import { isFixtureTree, safeImageReader } from '../src/lib/tree.mjs';

const USAGE = 'Usage: node tools/check-post.mjs [--publish] [--now <YYYY-MM-DDTHH:MM:SSZ>] <post.md> [<post.md> ...]';
const parsed = parseArguments(process.argv.slice(2), { flags: ['--publish'], options: ['--now'] });
const now = parsed.values['--now'] === undefined ? new Date() : parseInstant(parsed.values['--now']);
if (parsed.error || parsed.positional.length === 0 || now === null) {
  console.error(`${parsed.error || (now === null ? '--now must be an ISO instant such as 2026-10-09T22:30:00Z' : 'no post file given')}\n${USAGE}`);
  process.exit(2);
}

const findings = [];
for (const file of parsed.positional) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    findings.push(fail('PF-2', file, `cannot read the file (${error.code || error.message})`));
    continue;
  }
  const folder = path.dirname(path.resolve(file));
  findings.push(...checkPostText(text, { file, publish: parsed.flags.has('--publish'), now, fixture: isFixtureTree(folder), readImage: safeImageReader(folder) }).findings);
}
for (const finding of findings) console.log(format(finding));
process.exitCode = exitCodeOf(findings);
