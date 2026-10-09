// node tools/check-output.mjs <public-dir>
// The check of an output tree (spec 7.2, AD-1, AD-3, DL-4; verification row V16): only files of the shapes of 7.2, no
// name that begins with a dot, a page for every image, the files every build has, every absolute address of a head and
// of the feed on the host dreambau.com (https); and the feed itself through the feed validator. Every failure is reported as
// `FAIL <rule> <name>[:line]: <what>`, with names relative to the directory. No output and exit 0 when the tree is good;
// exit 1 when any FAIL; exit 2 for a wrong command line.
import fs from 'node:fs';
import { parseArguments } from '../src/lib/cli.mjs';
import { checkFeed } from '../src/lib/feed-check.mjs';
import { exitCodeOf, format } from '../src/lib/findings.mjs';
import { LABELS_FILE, loadLabels } from '../src/lib/labels.mjs';
import { checkOutput, loadOutputDir } from '../src/lib/output-check.mjs';

const USAGE = 'Usage: node tools/check-output.mjs <public-dir>';
const parsed = parseArguments(process.argv.slice(2), {});
if (parsed.error || parsed.positional.length !== 1) {
  console.error(`${parsed.error || 'give exactly one directory'}\n${USAGE}`);
  process.exit(2);
}
const dir = parsed.positional[0];
if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
  console.error(`${dir} is not a directory\n${USAGE}`);
  process.exit(2);
}

const files = loadOutputDir(dir);
const findings = checkOutput(files);
const feed = files.find((entry) => entry.name === 'feed.xml' && entry.bytes !== null);
if (feed) findings.push(...checkFeed(feed.bytes.toString('utf8'), { labels: loadLabels(LABELS_FILE), file: 'feed.xml' }));
for (const finding of findings) console.log(format(finding));
process.exitCode = exitCodeOf(findings);
