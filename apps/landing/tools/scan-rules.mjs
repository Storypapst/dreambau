// The static scan of the shipped files (tools/verify.mjs, spec VER-5): patterns that must not occur in the page, its scripts and the
// language files, because the live policy forbids them or the page promises not to use them (no network, no media, no assets).
// eval( and new Function are blocked by the policy of the start page and ruled out for language data (FIL-5).
import fs from 'node:fs';
import path from 'node:path';

export const SCAN_RULES = [
  [/https?:\/\//i, 'absolute http(s) URL'], [/\bfetch\s*\(/, 'fetch()'], [/XMLHttpRequest/, 'XMLHttpRequest'], [/WebSocket/, 'WebSocket'],
  [/\bnew\s+Image\b/, 'Image()'], [/<img\b/i, '<img>'], [/<iframe\b/i, '<iframe>'], [/<video\b/i, '<video>'], [/<audio\b/i, '<audio>'],
  [/\bimport\s*\(/, 'dynamic import()'], [/sendBeacon/, 'sendBeacon'], [/document\.cookie/, 'cookies'],
  [/\beval\s*\(/, 'eval()'], [/\bnew\s+Function\b/, 'new Function'],
];

// the names of the rules that match the text
export const scanText = text => SCAN_RULES.filter(([re]) => re.test(text)).map(([, what]) => what);

// the shipped files below site/ that exist: the page, the runtime, the language runtime, the Animations, the manifest and every language file
export function scanTargets(siteDir, ids) {
  const i18n = path.join(siteDir, 'i18n');
  const langFiles = fs.existsSync(i18n) ? fs.readdirSync(i18n).filter(f => f.endsWith('.js')).sort().map(f => `i18n/${f}`) : [];
  return ['index.html', 'shell.js', 'i18n.js', ...ids.map(id => `p/${id}.js`), ...langFiles].filter(f => fs.existsSync(path.join(siteDir, f)));
}

// one line per hit: "<file>: <rule>"; an empty list means clean
export function scanSite(siteDir, ids) {
  const bad = [];
  for (const f of scanTargets(siteDir, ids)) for (const what of scanText(fs.readFileSync(path.join(siteDir, f), 'utf8'))) bad.push(`${path.basename(f)}: ${what}`);
  return bad;
}
