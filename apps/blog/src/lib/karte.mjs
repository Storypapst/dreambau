// The markup of the map "Navigieren" that the list page /blog/ and the prototype (prototypes/navigieren/) share: the stage
// with its canvas, buttons and the help over it, and the sheet a post opens in. M is one language of src/karte.labels.json.
// Everything here is fixed text through esc(); src/karte.js fills it at run time from the list of the page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc } from './escape.mjs';

export const KARTE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // src/: karte.js, karte.css, karte.labels.json
export const loadMapLabels = () => JSON.parse(fs.readFileSync(path.join(KARTE_DIR, 'karte.labels.json'), 'utf8'));

// The script of the map with its labels in front: `languages` is the object of karte.labels.json, or a part of it.
export const mapScript = (languages) => `const KARTE_LABELS = ${JSON.stringify(languages)};\n${fs.readFileSync(path.join(KARTE_DIR, 'karte.js'), 'utf8')}`;

// The help over the map: how to get around, drawn as small pictures. Desktop and phone see their own gestures (karte.css
// picks by "hover"). karte.js shows it when the map starts and hides it at the first move; "?" brings it back.
const G = (body) => `<svg class="hg" viewBox="0 0 72 48" width="72" height="48" aria-hidden="true" focusable="false">${body}</svg>`;
const KEY = (x, y, d) => `<rect class="ln" x="${x}" y="${y}" width="20" height="18" rx="4"/><path class="ac" d="${d}"/>`;
const CURSOR = (x, y) => `<path class="ln fl" d="M${x} ${y}l0 16 4.5-4 3 7 3-1.4-3-6.8 6-.3z"/>`;
const HELP_DESK = [
  ['helpWalk', G(KEY(26, 3, 'M36 8v8M32 12l4-4 4 4') + KEY(3, 26, 'M17 35H9M13 31l-4 4 4 4') + KEY(26, 26, 'M36 30v8M32 34l4 4 4-4') + KEY(49, 26, 'M55 35h8M59 31l4 4-4 4'))],
  ['helpSpace', G('<rect class="ln" x="4" y="28" width="64" height="16" rx="4"/><path class="ac" d="M22 22q14-20 28 0M46 18l4 4 2-6"/>')],
  ['helpPoint', G('<rect class="ac" x="30" y="4" width="38" height="18" rx="4"/><path class="ac" d="M36 10h26M36 16h18"/>' + CURSOR(14, 20))],
  ['helpClick', G('<circle class="ac" cx="24" cy="22" r="7"/><circle class="ac dim" cx="24" cy="22" r="13"/>' + CURSOR(24, 22))],
  ['helpDrag', G('<path class="ac" d="M8 12h56M8 12l6-5M8 12l6 5M64 12l-6-5M64 12l-6 5"/>' + CURSOR(30, 22))],
];
const FINGER = (x, y) => `<path class="ln fl" d="M${x} ${y}c0-3 4-3 4 0v12l2-1c3-1 5 1 4 4l-3 9h-12l-4-9c-1-3 2-4 4-2l1 1z"/>`;
const HELP_TOUCH = [
  ['helpTap', G('<circle class="ac" cx="38" cy="12" r="6"/><circle class="ac dim" cx="38" cy="12" r="11"/>' + FINGER(35, 14))],
  ['helpHold', G('<path class="ac dot" d="M14 40q10-30 40-30"/><circle class="ac" cx="58" cy="10" r="4"/>' + FINGER(9, 16))],
  ['helpButtons', G('<rect class="ln" x="2" y="16" width="32" height="16" rx="8"/><rect class="ac" x="38" y="16" width="32" height="16" rx="8"/><path class="ln" d="M10 24h16M46 24h16"/>')],
];
const helpItems = (M, items) => items.map(([key, svg]) => `<li>${svg}<span data-l="${key}">${esc(M[key])}</span></li>`).join('');
const helpOverlay = (M) => `<div class="help" id="help" role="dialog" aria-modal="false" aria-labelledby="help-title" hidden>
<div class="hcard">
<h2 class="htitle" id="help-title" data-l="helpTitle">${esc(M.helpTitle)}</h2>
<ul class="hgrid hdesk">${helpItems(M, HELP_DESK)}</ul>
<ul class="hgrid htouch">${helpItems(M, HELP_TOUCH)}</ul>
<p class="hmore" data-l="helpMore">${esc(M.helpMore)}</p>
<button class="pill pri" id="help-go" type="button" data-l="helpGo">${esc(M.helpGo)}</button>
</div>
</div>
<button class="pill helpbtn" id="help-open" type="button" aria-label="${esc(M.helpOpen)}" data-l-aria="helpOpen" aria-controls="help" aria-expanded="false">?</button>`;

// The stage: hidden without JavaScript (karte.css), so a page without the script shows no empty box.
export const mapStage = (M) => `<div class="stage" id="stage" tabindex="0" role="group" aria-label="${esc(M.stage)}" data-l-aria="stage">
<canvas id="map" aria-hidden="true"></canvas>
<button class="pill center" id="center" type="button" data-l="center">${esc(M.center)}</button>
<div class="hud" aria-hidden="true"><p class="keys" data-l="keys">${esc(M.keys)}</p><p class="score" id="score" hidden></p></div>
<div class="acts"><button class="pill pri" id="read" type="button" data-l="read" hidden>${esc(M.read)}</button><button class="pill jump" id="jump" type="button" data-l="jump">${esc(M.jump)}</button></div>
<p class="hint" id="hint" data-l="hint">${esc(M.hint)}</p>
<div class="tip" id="tip" hidden></div>
${helpOverlay(M)}
</div>
`;

// The sheet a post opens in: from below on a phone, in the middle on a desktop. Hidden until karte.js fills it.
export const mapSheet = (M) => `<div class="veil" id="veil" hidden></div>
<section class="panel" id="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title" hidden>
<div class="phead"><p class="pmeta" id="panel-meta"></p><button class="pill" id="close" type="button"><span data-l="close">${esc(M.close)}</span><kbd class="esc" aria-hidden="true">Esc</kbd></button></div>
<h2 class="ptitle" id="panel-title" tabindex="-1"></h2>
<div class="pbody" id="panel-body"></div>
</section>
`;
