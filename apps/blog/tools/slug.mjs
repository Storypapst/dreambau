// node tools/slug.mjs "<title>" [--year <year>] [--base <dir> | --base-ref <ref>]
// Prints the slug of a title (spec 5.2 PF-13). With --year it appends -2, -3, ... against a copy of origin/main and
// posts/removed.txt: by default the ref refs/remotes/origin/main of this repository (the caller runs `git fetch origin
// main` first), or a directory that holds a copy of posts/ (--base), or another ref (--base-ref). A title that gives no
// slug (fewer than three letters or digits) exits 1 and prints nothing on stdout. Exit 2 for a wrong command line.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArguments } from '../src/lib/cli.mjs';
import { LIMITS } from '../src/lib/post-rules.mjs';
import { nextFreeSlug, slugify } from '../src/lib/slug.mjs';
import { loadOriginMain, loadTreeFromDir } from '../src/lib/tree.mjs';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'Usage: node tools/slug.mjs "<title>" [--year <year>] [--base <dir> | --base-ref <ref>]';
const parsed = parseArguments(process.argv.slice(2), { options: ['--year', '--base', '--base-ref'] });
const year = parsed.values['--year'];
const problem = parsed.error
  || (parsed.positional.length !== 1 ? 'give exactly one title' : '')
  || (year !== undefined && !/^\d{4}$/.test(year) ? '--year must be four digits' : '')
  || ((parsed.values['--base'] !== undefined && parsed.values['--base-ref'] !== undefined) ? 'use --base or --base-ref, not both' : '')
  || (year === undefined && (parsed.values['--base'] !== undefined || parsed.values['--base-ref'] !== undefined) ? '--base and --base-ref need --year' : '');
if (problem) {
  console.error(`${problem}\n${USAGE}`);
  process.exit(2);
}

const title = parsed.positional[0];
const plain = slugify(title);
if (plain === '') {
  console.error(`FAIL PF-13 title: ${JSON.stringify(title)} has no slug; it needs letters or digits`);
  process.exit(1);
}
if (plain.length < LIMITS.slug.min) {
  console.error(`FAIL PF-4 title: ${JSON.stringify(title)} gives the slug ${JSON.stringify(plain)}; it needs at least ${LIMITS.slug.min} letters or digits`);
  process.exit(1);
}
if (year === undefined) {
  console.log(plain);
} else {
  let base;
  try {
    base = parsed.values['--base'] !== undefined ? loadTreeFromDir(parsed.values['--base']) : loadOriginMain(APP_ROOT, parsed.values['--base-ref']);
  } catch (error) {
    console.error(`${error.message}\n${USAGE}`);
    process.exit(2);
  }
  console.log(nextFreeSlug(title, year, (address) => base.posts.has(address) || base.tombstones.has(address)));
}
