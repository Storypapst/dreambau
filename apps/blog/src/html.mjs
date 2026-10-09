// Escaping for the two places a text can go: element text and attribute value (spec 5.13 PR-5). No Markdown and no HTML
// of a post is ever interpreted.
export function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// A source link is a link and nothing else: https only (spec 5.13 PR-6). It is checked here again at render time, also
// for a post that a validator has already passed.
export function httpsLink(value, where) {
  if (typeof value !== 'string' || !/^https:\/\/[^\s\u0000-\u001f]+$/.test(value)) throw new Error(`${where}: sourceLink must be an https: address`);
  return value;
}
