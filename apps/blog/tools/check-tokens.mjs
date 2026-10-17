// node tools/check-tokens.mjs [--tokens <file>] [--css <file>] [--reference <file>]      (npm run check:tokens)
// AC-1 (spec 5.8): compares every custom property of src/tokens.css with the same property of references.css, the page
// that declares the colours today (apps/website/site/website-assets/references.css), and finds colours that blog.css
// types by hand. Prints one `PASS AC-1 <property>` line per property that agrees and one `FAIL AC-1 <where>: <what>`
// line per problem (BD-4). Exit 0, 1 when there is a FAIL, 2 for a wrong command line.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArguments } from '../src/lib/cli.mjs';
import { customProperties, tokenProblems } from '../src/lib/tokens.mjs';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'Usage: node tools/check-tokens.mjs [--tokens <file>] [--css <file>] [--reference <file>]';
const parsed = parseArguments(process.argv.slice(2), { options: ['--tokens', '--css', '--reference'] });
if (parsed.error || parsed.positional.length > 0) {
  console.error(`${parsed.error || `unexpected argument ${parsed.positional[0]}`}\n${USAGE}`);
  process.exit(2);
}
const tokensPath = path.resolve(parsed.values['--tokens'] || path.join(APP, 'src', 'tokens.css'));
const cssPath = path.resolve(parsed.values['--css'] || path.join(APP, 'src', 'blog.css'));
const referencePath = path.resolve(parsed.values['--reference'] || path.join(APP, '..', 'website', 'site', 'website-assets', 'references.css'));
const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);

const tokensText = read(tokensPath);
const cssText = read(cssPath);
const problems = tokenProblems({ tokensText, referenceText: read(referencePath), cssText, tokensPath, referencePath, cssPath });
if (cssText === null) problems.push({ rule: 'AC-1', where: 'blog.css', what: `not found at ${cssPath}` });
const bad = new Set(problems.map((problem) => problem.where));
if (tokensText !== null) for (const name of Object.keys(customProperties(tokensText))) if (!bad.has(name)) console.log(`PASS AC-1 ${name}`);
if (cssText !== null && !problems.some((problem) => problem.where.startsWith('blog.css:'))) console.log('PASS AC-1 blog.css: no colour typed by hand, no token declared again');
for (const problem of problems) console.log(`FAIL ${problem.rule} ${problem.where}: ${problem.what}`);
process.exit(problems.length === 0 ? 0 : 1);
