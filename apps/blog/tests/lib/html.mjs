// A small reader for the HTML that the generator writes, for the checks that must say what a page CONTAINS (which
// elements, which attributes, which text) rather than how it is spelled. It is not a general HTML parser: the pages are
// generated, their attribute values are always quoted and escape < > & " ', and a tag name is followed by a space, "/" or ">".
// tokens(html) -> [{ type: 'tag', name, attrs: [[name, value]], close } | { type: 'text', text }] with entities decoded.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
export const decode = (text) => text.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, name) => ENTITIES[name]);

export function tokens(html) {
  const found = [];
  let index = 0;
  while (index < html.length) {
    if (html[index] !== '<') {
      const end = html.indexOf('<', index);
      const stop = end < 0 ? html.length : end;
      found.push({ type: 'text', text: decode(html.slice(index, stop)) });
      index = stop;
      continue;
    }
    if (html.startsWith('<!', index)) { index = html.indexOf('>', index) + 1; continue; }
    const match = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(html.slice(index, index + 40));
    if (!match) { found.push({ type: 'text', text: '<' }); index += 1; continue; }
    let cursor = index + match[0].length;
    const attrs = [];
    for (;;) {
      while (/\s/.test(html[cursor])) cursor += 1;
      if (html[cursor] === '>') { cursor += 1; break; }
      if (html[cursor] === '/') { cursor += 1; continue; }
      const name = /^[^\s=>/]+/.exec(html.slice(cursor))[0];
      cursor += name.length;
      let value = '';
      if (html[cursor] === '=') {
        cursor += 1;
        const quote = html[cursor];
        if (quote === '"' || quote === "'") {
          const end = html.indexOf(quote, cursor + 1);
          value = decode(html.slice(cursor + 1, end));
          cursor = end + 1;
        } else {
          const bare = /^[^\s>]*/.exec(html.slice(cursor))[0];
          value = bare;
          cursor += bare.length;
        }
      }
      attrs.push([name, value]);
    }
    found.push({ type: 'tag', name: match[2].toLowerCase(), attrs, close: match[1] === '/' });
    index = cursor;
  }
  return found;
}

// The tag names of the start tags, sorted, with repeats.
export const tagNames = (html) => tokens(html).filter((token) => token.type === 'tag' && !token.close).map((token) => token.name).sort();
// The attribute names of all start tags, sorted, with repeats.
export const attributeNames = (html) => tokens(html).filter((token) => token.type === 'tag' && !token.close).flatMap((token) => token.attrs.map(([name]) => name)).sort();
// The values of the attributes href and src, in document order.
export const addressesOf = (html) => tokens(html).filter((token) => token.type === 'tag' && !token.close).flatMap((token) => token.attrs.filter(([name]) => name === 'href' || name === 'src').map(([, value]) => value));
// All texts of the elements that match, in order.
export function textsOf(html, name, className) {
  const list = tokens(html);
  const found = [];
  list.forEach((token, start) => {
    if (token.type !== 'tag' || token.close || token.name !== name) return;
    if (className !== undefined && !token.attrs.some(([key, value]) => key === 'class' && value.split(' ').includes(className))) return;
    let depth = 0;
    let text = '';
    for (let index = start; index < list.length; index += 1) {
      const next = list[index];
      if (next.type === 'text') { text += next.text; continue; }
      if (next.name !== name) continue;
      depth += next.close ? -1 : 1;
      if (depth === 0) break;
    }
    found.push(text);
  });
  return found;
}
