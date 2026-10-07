import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gzipSync } from 'node:zlib';
import { ROOT } from '../lib.mjs';
// Unchanged German baseline main 821a9d5; the source-file gzip sum is a conservative footprint proxy, not a server transfer measurement.
const read=p=>fs.readFileSync(ROOT+'/site/'+p);
test('shipped runtime, manifest, shell and new styles stay within the approved budgets',()=>{
 assert.ok(read('i18n.js').length<=20480);assert.ok(read('i18n/index.js').length<=4096);assert.ok(read('shell.js').length<=44473);
 const styles=[...read('index.html').toString().matchAll(/<style>([\s\S]*?)<\/style>/g)].reduce((n,m)=>n+Buffer.byteLength(m[1]),0);assert.ok(styles-5587<=3072,'new styles '+(styles-5587));
 const gzip=['index.html','shell.js','i18n.js','i18n/index.js','i18n/de.js'].reduce((n,p)=>n+gzipSync(read(p),{level:1}).length,0);
 assert.ok(gzip-19566<=12288,'German source gzip increase '+(gzip-19566));
});
