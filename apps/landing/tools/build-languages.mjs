#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib.mjs';
export function sourceManifest(mirror){return {v:1,dev:true,langs:mirror.languages.map(l=>({c:l.code,n:l.name,d:l.direction,s:l.short,o:l.offered?1:0}))};}
export function manifestText(mirror){return 'Dream.i18n.manifest('+JSON.stringify(sourceManifest(mirror))+');\n';}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mirror=JSON.parse(fs.readFileSync(path.join(ROOT,'src/i18n/languages.json'),'utf8'));fs.writeFileSync(path.join(ROOT,'site/i18n/index.js'),manifestText(mirror));console.log('PASS build:languages '+mirror.languages.length+' rows');
}
