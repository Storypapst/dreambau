// AC-1, V56: the colour tokens are declared once, in src/tokens.css, with the values of /referenzen/ (references.css);
// blog.css types no colour by hand. `npm run check:tokens` prints one PASS line per property and, for a broken copy,
// the exact FAIL AC-1 lines. Every broken copy is built from the real files and run through the real command.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, same, run } from '../lib/check.mjs';
import { REPO, ROOT } from '../lib/paths.mjs';
import { withScratch } from '../lib/scratch.mjs';
import { colourLines, customProperties } from '../../src/lib/tokens.mjs';

const TOKENS = path.join(ROOT, 'src', 'tokens.css');
const BLOG = path.join(ROOT, 'src', 'blog.css');
const REFERENCE = path.join(REPO, 'apps', 'website', 'site', 'website-assets', 'references.css');
const tool = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'tools', 'check-tokens.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' });
const fails = (result) => result.stdout.split('\n').filter((line) => line.startsWith('FAIL'));
const withCopy = (body) => withScratch('tokens', (dir) => {
  const copy = { tokens: path.join(dir, 'tokens.css'), css: path.join(dir, 'blog.css'), reference: path.join(dir, 'references.css') };
  fs.copyFileSync(TOKENS, copy.tokens);
  fs.copyFileSync(BLOG, copy.css);
  fs.copyFileSync(REFERENCE, copy.reference);
  const args = () => ['--tokens', copy.tokens, '--css', copy.css, '--reference', copy.reference];
  return body(copy, args);
});

await run(async () => {
  // ---- the helpers prove themselves on made-up CSS ----
  same('AC-1 the reader finds the custom properties of :root, comments and spaces aside', customProperties(':root{ --a : 1,2 ; /* x */ --b:#fff}\np{--c:3}'), { '--a': '1,2', '--b': '#fff' });
  same('AC-1 a colour typed by hand is found by line: hex, rgb, rgba, hsl, a name', colourLines([
    'a{color:#fff}', 'b{color:rgba(1,2,3,.5)}', 'c{color:rgb(var(--fg))}', 'd{border:1px solid red}', 'e{background:hsl(10 20% 30%)}', 'f{color:rgba(var(--fg),.5)}', 'g{color:transparent;outline:0}',
  ].join('\n')), [1, 2, 4, 5]);
  same('AC-1 a colour in a comment, in a string or in content is no colour', colourLines('/* #fff */\na{content:"red #fff";background:var(--bg)}\n.x{font-family:system-ui,Menlo}'), []);

  // ---- the real tree ----
  const real = tool();
  same('V56 npm run check:tokens on the real tree exits 0', real.status, 0);
  check('V56 ... prints no FAIL line, and PASS lines that start with AC-1', fails(real).length === 0 && /^PASS AC-1 /m.test(real.stdout), real.stdout.slice(0, 200));
  const tokens = customProperties(fs.readFileSync(TOKENS, 'utf8'));
  const reference = customProperties(fs.readFileSync(REFERENCE, 'utf8'));
  same('V56 the only properties of tokens.css that references.css lacks are --bd-control and --ring', Object.keys(tokens).filter((name) => !(name in reference)).sort(), ['--bd-control', '--ring']);
  same('AC-1 the four values of the spec: --bg, --fg, --cream, --cur', [tokens['--bg'], tokens['--fg'], tokens['--cream'], tokens['--cur']], ['#06080d', '233,237,245', '255,238,210', '255,190,100']);
  same('AC-2 the two additions have the values of the spec', [tokens['--bd-control'], tokens['--ring']], ['rgba(var(--fg),.45)', '#fff']);
  same('AC-1 blog.css types no colour: colourLines of the real file is empty', colourLines(fs.readFileSync(BLOG, 'utf8')), []);
  same('AC-1 blog.css redeclares no token (the tokens are declared once)', Object.keys(customProperties(fs.readFileSync(BLOG, 'utf8'), { everywhere: true })).filter((name) => name in tokens), []);

  // ---- negative controls ----
  withCopy((copy, args) => {
    fs.writeFileSync(copy.tokens, fs.readFileSync(copy.tokens, 'utf8').replace('--bg:#06080d', '--bg:#06080e'));
    const result = tool(...args());
    same('V56 --bg changed by one digit: exit 1 and the exact line', [result.status, fails(result)], [1, ['FAIL AC-1 --bg: tokens.css declares #06080e, references.css declares #06080d']]);
  });
  withCopy((copy, args) => {
    fs.writeFileSync(copy.tokens, fs.readFileSync(copy.tokens, 'utf8').replace(':root{', ':root{--invented:1,2,3;'));
    const result = tool(...args());
    same('V56 a property that references.css lacks: exit 1 and the exact line', [result.status, fails(result)], [1, ['FAIL AC-1 --invented: not found in references.css']]);
  });
  withCopy((copy, args) => {
    const lines = fs.readFileSync(copy.css, 'utf8').split('\n');
    lines.unshift('.hand{color:#ff0000}');
    fs.writeFileSync(copy.css, lines.join('\n'));
    const result = tool(...args());
    same('V56 a hand-typed colour in blog.css: exit 1 and the exact line with its line number', [result.status, fails(result)], [1, ['FAIL AC-1 blog.css:1: colour typed by hand (.hand{color:#ff0000})']]);
  });
  withCopy((copy, args) => {
    fs.appendFileSync(copy.css, '\n.again{--bg:red}\n');
    const result = tool(...args());
    check('AC-1 a token declared again in blog.css fails', result.status === 1 && fails(result).some((line) => /^FAIL AC-1 blog\.css:\d+: --bg is declared again/.test(line)), result.stdout);
  });
  withCopy((copy, args) => {
    fs.rmSync(copy.reference);
    const result = tool(...args());
    same('AC-1 references.css that cannot be found: exit 1 and a line', [result.status, fails(result)], [1, [`FAIL AC-1 references.css: not found at ${copy.reference}`]]);
  });
  withCopy((copy, args) => {
    fs.rmSync(copy.tokens);
    const result = tool(...args());
    same('AC-1 tokens.css that cannot be found: exit 1 and a line', [result.status, fails(result)], [1, [`FAIL AC-1 tokens.css: not found at ${copy.tokens}`]]);
  });
  withCopy((copy, args) => {
    fs.writeFileSync(copy.tokens, '/* nothing */\n');
    const result = tool(...args());
    same('AC-1 a tokens.css without a :root block: exit 1 and a line', [result.status, fails(result)], [1, ['FAIL AC-1 tokens.css: no custom property found in a :root block']]);
  });
  const usage = tool('--nope');
  check('AC-1 a wrong command line exits 2 and prints the usage', usage.status === 2 && /Usage/.test(usage.stderr), `${usage.status} ${usage.stderr}`);
});
