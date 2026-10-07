import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ROOT } from '../lib.mjs';
const source=fs.readFileSync(ROOT+'/site/i18n.js','utf8');
const rows=JSON.parse(fs.readFileSync(ROOT+'/src/i18n/languages.json','utf8')).languages;
const window={};const document={currentScript:null,readyState:"loading",head:{appendChild(){}},createElement(){return {addEventListener(){}}},documentElement:{},addEventListener(){},querySelectorAll(){return []},querySelector(){return null}};
vm.runInNewContext(source,{window,document,setTimeout(){},URLSearchParams,location:{search:''},navigator:{languages:[]},Intl});
const sets={'SET-E':['de','en'],'SET-A':['de','en','tr','ru','pt-BR','sr-Latn','nb','zh-Hans','pa-Arab','he','id','ar'],NONE:['de']};
window.Dream.i18n.manifest({v:1,dev:true,langs:rows.map(r=>({c:r.code,n:r.name,s:r.short,d:r.direction,o:1}))});
for(const line of fs.readFileSync(ROOT+'/src/i18n/choose-cases.txt','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))){
 const [set,query,list,expected]=line.split('|').map(s=>s.trim());
 test(line,()=>{const result=window.Dream.i18n.choose({offered:sets[set],query:query==='-'?null:query,languages:list==='(missing)'?undefined:list==='(empty)'?[]:list.split(',').map(l=>l==='""'?'':l)});assert.equal(result.code+' '+result.source,expected)});
}
