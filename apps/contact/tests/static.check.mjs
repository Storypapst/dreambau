// Static rules: no inline style or script (X5), honeypot markup (P6), German texts complete (L1, L2), no credentials (D3), Dockerfile (D2).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formPage, thanksPage, errorPage, T } from '../src/page.mjs';
import { config } from './helpers.mjs';

const cfg = config();
const pages = [formPage(cfg, { token: 'f1.x' }), formPage(cfg, { token: 'f1.x', errors: { email: 'contact.err.email' }, notice: 'contact.err.retry' }),
  thanksPage(cfg, true, ''), thanksPage(cfg, false, ''), errorPage(cfg)];

test('X5: no inline style, style attribute, event handler or script (i18n off)', () => {
  for (const p of pages) {
    assert.doesNotMatch(p, /<style[\s>]|\sstyle\s*=|\son[a-z]+\s*=|<script/i);
    assert.match(p, /<html lang="de" dir="ltr">/);
    assert.equal((p.match(/<h1/g) || []).length, 1);
  }
});
test('L3: with i18n on, exactly the two language scripts, at the end of body', () => {
  const p = formPage({ ...cfg, i18n: true }, { token: 'f1.x' });
  assert.deepEqual(p.match(/<script[^>]*>/g), ['<script src="/homepage-assets/i18n.js">', '<script src="/homepage-assets/i18n/index.js">']);
});
test('P6: honeypot markup', () => {
  assert.match(pages[0], /<div class="hp" aria-hidden="true" inert><label for="f-web">Website<\/label><input id="f-web" name="website" type="text" tabindex="-1" autocomplete="off" value=""><\/div>/);
  assert.match(fs.readFileSync(new URL('../public/kontakt.css', import.meta.url), 'utf8'), /\.hp \{[^}]*inset-inline-start: -10000px/);
});
test('L1/L2: every data-i18n key has German text; texts avoid Sie and du', () => {
  for (const p of pages) for (const [, k] of p.matchAll(/data-i18n="([^"]+)"/g)) assert.ok(T[k], k);
  for (const [k, v] of Object.entries(T)) assert.doesNotMatch(v, /\b(Sie|Ihre?[nmrs]?|du|dein\w*|dir|dich)\b/, k);
  assert.match(T['contact.promise'], /per E-Mail, in der Regel am nächsten Werktag/);
});
test('P10: the only transition sits inside prefers-reduced-motion: no-preference; no fixed or sticky', () => {
  const css = fs.readFileSync(new URL('../public/kontakt.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /position:\s*(fixed|sticky)/);
  assert.doesNotMatch(css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[^}]*\}[^}]*\}/, ''), /transition/);
});
test('D2/D3: Dockerfile shape; no credential-looking value in shipped files', () => {
  const df = fs.readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.match(df, /^FROM node:20-bookworm-slim/m);
  assert.match(df, /npm ci --omit=dev/);
  assert.match(df, /^USER node/m);
  assert.match(df, /CMD \["node", "src\/server.mjs"\]/);
  assert.doesNotMatch(df, /^(ENV|ARG) .*(SECRET|PASSWORD)/m);
  const compose = fs.readFileSync(new URL('../compose.example.yaml', import.meta.url), 'utf8');
  for (const line of compose.split('\n').filter(l => /(SECRET|PASSWORD|USER)\s*:/.test(l))) assert.match(line, /<[^>]+>|_FILE/, line);
  assert.match(compose, /127\.0\.0\.1:<[^>]+>:8080/);
});
