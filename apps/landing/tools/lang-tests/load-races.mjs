import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ROOT } from '../lib.mjs';
const runtime=fs.readFileSync(ROOT+'/site/i18n.js','utf8');
function fixture({search='?lang=en',languages=['en'],language='en'}={}){
 const scripts=[],window={},blind={dataset:{i18n:'blind.{anim}'},textContent:''},document={currentScript:{src:'https://example.test/i18n.js'},readyState:'loading',documentElement:{},head:{appendChild:s=>scripts.push(s)},querySelector:()=>null,querySelectorAll:selector=>selector==='[data-i18n]'?[blind]:[],addEventListener(){},createElement(){const events={};return {addEventListener:(name,fn)=>events[name]=fn,fire:name=>events[name]?.(),getContext:()=>null};}};
 vm.runInNewContext(runtime,{window,document,URLSearchParams,location:{search},navigator:{languages,language},setTimeout:()=>0,clearTimeout(){},Intl});
 const D=window.Dream;D.i18n.manifest({v:1,dev:false,langs:[{c:'de',n:'Deutsch',s:'DE',d:'ltr'},{c:'en',n:'English',s:'EN',d:'ltr'}]});D.state.id='4k';return {D,scripts,blind};
}
const ready=async D=>{await Promise.race([D.i18n.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('failure waited for other file')),30))]);};
test('a selected-language error resolves ready immediately while German is pending',async()=>{const {D,scripts}=fixture();scripts.find(s=>s.src.endsWith('/en.js')).fire('error');await ready(D);assert.equal(D.state.lang,'de');assert.equal(D.state.langFallback,'load');assert.equal(D.state.langSource,'fallback');D.lang('de',{'tag.1':'German','tag.2':'source'});assert.equal(D.state.lang,'de');});
test('German error forces German markup fallback even when English registered successfully',async()=>{const {D,scripts}=fixture();D.lang('en',{'tag.1':'English','tag.2':'text'});scripts.find(s=>s.src.endsWith('/de.js')).fire('error');await ready(D);assert.equal(D.state.lang,'de');assert.equal(D.state.langFallback,'load');assert.equal(D.t('tag.1'),'');});

test('late German registration refreshes the fallback description without selecting a late language',async()=>{const {D,scripts,blind}=fixture();scripts.find(s=>s.src.endsWith('/en.js')).fire('error');await ready(D);assert.equal(blind.textContent,'');D.lang('de',{'tag.1':'German','tag.2':'source','blind.4k':'German description'});assert.equal(blind.textContent,'German description');D.lang('en',{'tag.1':'Late','tag.2':'English','blind.4k':'English description'});assert.equal(D.state.lang,'de');assert.equal(blind.textContent,'German description');});

test('an empty browser language list uses navigator.language, as startup CHO-1 requires',async()=>{const {D,scripts}=fixture({search:'',languages:[],language:'en'});assert.deepEqual(scripts.map(s=>s.src),['https://example.test/i18n/de.js','https://example.test/i18n/en.js']);D.lang('de',{'tag.1':'German','tag.2':'source'});D.lang('en',{'tag.1':'English','tag.2':'text'});await ready(D);assert.equal(D.state.lang,'en');assert.equal(D.state.langSource,'browser');});
