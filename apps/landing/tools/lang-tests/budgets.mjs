import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gzipSync } from 'node:zlib';
import { ROOT } from '../lib.mjs';
// Unchanged German baseline main 821a9d5; the source-file gzip sum is a conservative footprint proxy, not a server transfer measurement.
const read=p=>fs.readFileSync(ROOT+'/site/'+p);
test('shipped runtime, manifest, shell and restored styles stay within the recorded budgets',()=>{
 assert.ok(read('i18n.js').length<=20480);assert.ok(read('i18n/index.js').length<=4096);
 // Issue156 adds 593 measured source bytes over main 62d02b2 for render scheduling.
 // Bound the allowance to 600 bytes above the recorded 44473-byte shell cap.
 assert.ok(read('shell.js').length<=44473+600,'shell source bytes '+read('shell.js').length);
 // Spec97 restores selected Raster A, adding 1762 measured source CSS bytes.
 // Keep the allowance explicit; moving CSS into another file must not hide its cost.
 const styles=[...read('index.html').toString().matchAll(/<style>([\s\S]*?)<\/style>/g)].reduce((n,m)=>n+Buffer.byteLength(m[1]),0);assert.ok(styles-5587<=5120,'new styles '+(styles-5587));
 const gzip=['index.html','shell.js','i18n.js','i18n/index.js','i18n/de.js'].reduce((n,p)=>n+gzipSync(read(p),{level:1}).length,0);
 assert.ok(gzip-19566<=12288,'German source gzip increase '+(gzip-19566));
});
