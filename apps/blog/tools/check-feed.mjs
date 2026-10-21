// node tools/check-feed.mjs [--labels <labels.de.json>] <feed.xml> [<feed.xml> ...]
// The offline feed validator (spec 5.1 FD-1 to FD-5, AD-3): strict XML 1.0, then the rules of Atom 1.0 as the Blog writes
// it. It reads no network and needs no dependency. Every failure of every file is reported, not the first, as
// `FAIL <rule> <file>:<line>: <what>`. No output and exit 0 when the files are good; exit 1 when any FAIL; exit 2 for a
// wrong command line. The title and subtitle are compared with labels.de.json (blog.title, blog.sub).
import fs from 'node:fs';
import { parseArguments } from '../src/lib/cli.mjs';
import { checkFeed } from '../src/lib/feed-check.mjs';
import { exitCodeOf, fail, format } from '../src/lib/findings.mjs';
import { LABELS_FILE, loadLabels } from '../src/lib/labels.mjs';

const USAGE = 'Usage: node tools/check-feed.mjs [--labels <labels.de.json>] <feed.xml> [<feed.xml> ...]';
const parsed = parseArguments(process.argv.slice(2), { options: ['--labels'] });
if (parsed.error || parsed.positional.length === 0) {
  console.error(`${parsed.error || 'no feed file given'}\n${USAGE}`);
  process.exit(2);
}
let labels;
try {
  labels = loadLabels(parsed.values['--labels'] || LABELS_FILE);
} catch (error) {
  console.error(`cannot read the labels: ${error.message}\n${USAGE}`);
  process.exit(2);
}

const findings = [];
for (const file of parsed.positional) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    findings.push(fail('FD-1', file, `cannot read the file (${error.code || error.message})`));
    continue;
  }
  findings.push(...checkFeed(text, { labels, file }));
}
for (const finding of findings) console.log(format(finding));
process.exitCode = exitCodeOf(findings);
