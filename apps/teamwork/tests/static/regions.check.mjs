// regions: the banner-delimited regions of site/teamwork.js and site/teamwork.css (ticket 1, point 4).
// Every banner once and in the order named by the ticket; one comment line that names the slice at the top of each
// region and one empty line before its closing banner; the boot region calls one function per later region, in order.
// The rule first proves itself on made-up texts: a text that keeps it must pass, and each way of breaking it must be
// reported. Then it runs on the real files.
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { SITE } from '../lib/paths.mjs';
import { BOOT_CALLS, SCRIPT_REGIONS, STYLE_REGIONS, regionProblems, sampleText } from '../lib/regions.mjs';

const lines = (text) => text.split('\n');
const join = (list) => list.join('\n');
const replaceLine = (text, from, to) => join(lines(text).map((line) => (line === from ? to : line)));
const dropLine = (text, drop) => join(lines(text).filter((line) => line !== drop));

// How each text is spoiled; each entry returns a text that breaks the rule in one way.
function spoilers(kind) {
  const names = kind === 'script' ? SCRIPT_REGIONS : STYLE_REGIONS;
  const open = (name) => (kind === 'script' ? `// ==== region: ${name} ====` : `/* ==== region: ${name} ==== */`);
  const close = (name) => (kind === 'script' ? `// ==== end region: ${name} ====` : `/* ==== end region: ${name} ==== */`);
  const base = sampleText(kind);
  const block = (name) => {
    const all = lines(base);
    return all.slice(all.indexOf(open(name)), all.indexOf(close(name)) + 1);
  };
  const [first, second] = [names[0], names[1]];
  const spoiled = [
    ['a missing opening banner', dropLine(base, open(names[3]))],
    ['a missing closing banner', dropLine(base, close(names[4]))],
    ['a duplicated region', join([...lines(base), ...block(names[2])])],
    ['two regions swapped', join(lines(base).map((line) => (line === open(first) ? open(second) : line === open(second) ? open(first) : line === close(first) ? close(second) : line === close(second) ? close(first) : line)))],
    ['a banner with an extra blank', replaceLine(base, open(names[5]), open(names[5]).replace('region:', 'region:  '))],
    ['a banner in the wrong case', replaceLine(base, open(names[5]), open(names[5]).replace('region', 'Region'))],
    ['a closing banner for another region', replaceLine(base, close(names[2]), close(names[2]).replace(names[2], names[6]))],
    ['a region without its comment line', dropLine(base, kind === 'script' ? `// Slice 1 fills ${names[2]}.` : `/* Slice 1 fills ${names[2]}. */`)],
    ['a comment line that names no slice', replaceLine(base, kind === 'script' ? `// Slice 1 fills ${names[2]}.` : `/* Slice 1 fills ${names[2]}. */`, kind === 'script' ? '// fills it.' : '/* fills it. */')],
    ['no empty line before a closing banner', join(lines(base).filter((line, index, all) => !(line === '' && all[index + 1] === close(names[3]))))],
    ['two empty lines before a closing banner', join(lines(base).flatMap((line) => (line === close(names[3]) ? ['', line] : [line])))],
  ];
  if (kind === 'script') {
    spoiled.push(
      ['a boot region without one call', dropLine(base, '  initMotion(page);')],
      ['a boot region that calls one function twice', replaceLine(base, '  initMotion(page);', '  initMotion(page);\n  initMotion(page);')],
      ['a boot region that calls the functions out of order', join(lines(base).map((line) => (line === '  initState(page);' ? '  initContract(page);' : line === '  initContract(page);' ? '  initState(page);' : line)))],
      ['an init function that is not defined', dropLine(base, 'function initPlace(page) {}')],
      ['an init function in the wrong region', join(lines(dropLine(base, 'function initPlace(page) {}')).flatMap((line) => (line === close('canvas') ? ['function initPlace(page) {}', '', line] : [line])))],
    );
  }
  return spoiled;
}

await run(async () => {
  for (const [kind, label] of [['script', 'script'], ['style', 'style sheet']]) {
    same(`regions a text that keeps the rule passes (${label})`, regionProblems(sampleText(kind), kind), []);
    for (const [what, text] of spoilers(kind)) {
      const found = regionProblems(text, kind);
      check(`regions the rule reports ${what} (${label})`, found.length > 0 && text !== sampleText(kind), found.length > 0 ? `reported: ${found[0].slice(0, 90)}` : 'nothing reported');
    }
  }
  same('regions the boot calls are the nine named by the ticket, one per later region',
    BOOT_CALLS.map(([fn]) => fn), ['initContract', 'initState', 'initRender', 'initLayout', 'initPlace', 'initCanvas', 'initMotion', 'initInteract', 'initRefresh']);
  same('regions the script regions are the eleven named by the ticket, in order', SCRIPT_REGIONS, ['texts', 'contract', 'state', 'render', 'layout', 'place', 'canvas', 'motion', 'interact', 'refresh', 'boot']);
  same('regions the style sheet regions are the eleven named by the ticket, in order', STYLE_REGIONS, ['tokens', 'page', 'tiles', 'states', 'phone', 'constellation', 'canvas', 'motion', 'interact', 'refresh', 'notice']);

  for (const [file, kind] of [['teamwork.js', 'script'], ['teamwork.css', 'style']]) {
    const full = path.join(SITE, file);
    const exists = fs.existsSync(full);
    check(`regions site/${file} exists`, exists);
    if (exists) same(`regions site/${file} keeps the region rule (every banner once and in order, comment line, empty line${kind === 'script' ? ', boot calls' : ''})`, regionProblems(fs.readFileSync(full, 'utf8'), kind), []);
  }
});
