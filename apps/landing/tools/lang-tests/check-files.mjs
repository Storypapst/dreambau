import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from '../lib.mjs';
import { checkLanguages } from '../check-languages.mjs';
const scratch=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lang-check-'));for(const p of ['site','src/i18n'])fs.cpSync(path.join(ROOT,p),path.join(dir,p),{recursive:true});return dir;};
test('all47 approved language files pass complete/pinned checks without reader approval',()=>{const r=checkLanguages(ROOT,{complete:true,release:true});assert.deepEqual(r.problems,[]);});
for(const [name,change,rule]of [
 ['empty description',s=>s.replace(/"blind.4k": "[^\n]*",/, '"blind.4k": "",'),'R6'],
 ['missing key',s=>s.replace(/  "skip.label": [^\n]+\n/,''),'C4'],
 ['unsafe text',s=>s.replace('"tag.1": "','"tag.1": "<'),'C3'],
 ['changed hash',s=>s.replace('"tag.1": "','"tag.1": "X'),'R2'],
 ['placeholder loss',s=>s.replace('{brand}','brand'),'C5']
])test('rejects '+name,()=>{const dir=scratch();try{const p=path.join(dir,'site/i18n/en.js');fs.writeFileSync(p,change(fs.readFileSync(p,'utf8')));assert.ok(checkLanguages(dir,{release:true}).problems.some(p=>p.startsWith('FAIL '+rule+' ')));}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('rejects a claim whose keys are not exactly .1 and .2 (C13), even when every file has the same keys',()=>{
 const dir=scratch();try{
  for(const f of fs.readdirSync(path.join(dir,'site/i18n')).filter(f=>f.endsWith('.js')&&f!=='index.js')){const p=path.join(dir,'site/i18n',f);fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('"claim.formsache16k.2"','"claim.formsache16k.3"'));}
  assert.ok(checkLanguages(dir,{release:true}).problems.some(p=>p.startsWith('FAIL C13 ')));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
