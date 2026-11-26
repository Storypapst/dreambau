// Repack the same recordings used by the web prototype for both native projects.
import { readFile, writeFile } from 'node:fs/promises';
import { TASKS } from '../words.mjs';
import { SPEECH_CLIPS } from '../speech-clips.mjs';

const catalog = JSON.parse(await readFile(new URL('catalog.json', import.meta.url), 'utf8'));
const recordings = { ...Object.fromEntries(TASKS.map(task => [task.text, task.audio])), ...SPEECH_CLIPS };
const encoded = {};
for (const { id, text } of catalog) {
  const uri = recordings[text];
  if (!uri?.startsWith('data:audio/mpeg;base64,')) throw new Error('Sprachaufnahme fehlt: ' + text);
  encoded[id] = uri.slice(uri.indexOf(',') + 1);
}
await writeFile(new URL('audio.json', import.meta.url), JSON.stringify(encoded) + '\n');
console.log(Object.keys(encoded).length + ' native Sprachaufnahmen');
