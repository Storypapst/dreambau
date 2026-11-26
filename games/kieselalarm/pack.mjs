import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { TASKS } from './words.mjs';
import { EXTRA_TASKS } from './vocabulary.mjs';
import { taskId, taskPattern } from './learning.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const target = resolve(process.argv[2] ?? resolve(root, 'dist/index.html'));
const script = await build({
  absWorkingDir: root,
  entryPoints: ['app.mjs'],
  write: false,
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
});
const [source, css] = await Promise.all(['index.html', 'style.css'].map(file => readFile(resolve(root, file), 'utf8')));
const html = source
  .replace('<link rel="stylesheet" href="./style.css">', () => '<style>' + css + '</style>')
  .replace('<script type="module" src="./app.mjs"></script>', () => '<script type="module">' +
    script.outputFiles[0].text.replace(/<\/script/gi, '<\\/script') + '</script>');
const catalog = [...TASKS, ...EXTRA_TASKS].map(task => ({
  id: taskId(task), text: task.text, speech: task.speech ?? task.text,
  tier: task.tier ?? task.level, pattern: taskPattern(task), hint: task.hint, traps: task.traps,
}));
await mkdir(dirname(target), {recursive:true});
await writeFile(target, html);
await writeFile(resolve(root, 'mobile/catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(target + ' · ' + Buffer.byteLength(html) + ' bytes · ' + catalog.length + ' words');
