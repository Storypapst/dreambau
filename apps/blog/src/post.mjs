// Reads one post file (spec 5.2 and 7.1). Slice S0 reads only what the tracer bullet needs: one `key: value` per
// line, a plain scalar or a "double-quoted" (JSON escapes) or 'single-quoted' value. Slice S1 replaces this reader with
// the full rules (PF-1 to PF-15, every error with its line, all of them at once); the shape of the result stays.

const KEYS = ['title', 'date', 'lang', 'sourceLink', 'sourceTitle', 'quote', 'quoteSource', 'image', 'imageAlt', 'imageRights', 'example'];
const REQUIRED = ['title', 'date'];

function scalar(raw, where) {
  if (raw.startsWith('"')) {
    try {
      const value = JSON.parse(raw);
      if (typeof value === 'string') return value;
    } catch { /* falls through to the error below */ }
    throw new Error(`${where}: a double-quoted value must be a JSON string`);
  }
  if (raw.startsWith("'")) {
    if (!raw.endsWith("'") || raw.length < 2) throw new Error(`${where}: a single-quoted value is not closed`);
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  return raw;
}

// text: the content of the file; file: its name for the error messages.
export function readPost(text, file) {
  const lines = text.split('\n');
  if (lines[0] !== '---') throw new Error(`${file}: line 1: the file must start with a line ---`);
  const end = lines.indexOf('---', 1);
  if (end === -1) throw new Error(`${file}: the front matter has no closing line ---`);
  if (lines[end + 1] !== '') throw new Error(`${file}: line ${end + 2}: a blank line must follow the closing ---`);

  const meta = {};
  for (let index = 1; index < end; index += 1) {
    const where = `${file}: line ${index + 1}`;
    const match = /^([A-Za-z]+): (.+)$/.exec(lines[index]);
    if (!match) throw new Error(`${where}: expected "key: value"`);
    if (!KEYS.includes(match[1])) throw new Error(`${where}: unknown key ${match[1]}`);
    if (match[1] in meta) throw new Error(`${where}: the key ${match[1]} appears twice`);
    meta[match[1]] = scalar(match[2], where);
  }
  for (const key of REQUIRED) if (!(key in meta)) throw new Error(`${file}: the required key ${key} is missing`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error(`${file}: date must look like 2026-10-02`);

  // The body: paragraphs separated by a blank line; a single line feed inside a paragraph reads as a space.
  const paragraphs = lines.slice(end + 2).join('\n').split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim()).filter((paragraph) => paragraph !== '');
  return { ...meta, lang: meta.lang || 'de', paragraphs };
}
