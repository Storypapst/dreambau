// A strict XML 1.0 reader for the small subset the Blog writes (spec 5.1 FD-1: the feed "is checked as XML"). No
// dependency, no network. It reads: an optional XML declaration at the very start, comments, one root element, nested
// elements with attributes (either quote style), text, the five named references and numeric references. It REFUSES, with
// the line and column of the first fault: a byte order mark, a document type, CDATA (FD-4: the feed escapes, never
// wraps), other processing instructions, a bare "&" or "<", an undefined reference, a character XML 1.0 forbids, "]]>" in
// text, duplicate attributes, an unbound prefix, mismatched or missing tags, a second root, text outside the root.
// This is not a general XML parser (no DTD, no external entities, no namespaces beyond prefixes); it is a gate.

const NAMED = new Map([['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"]]);
const WHITESPACE = /^[ \t\r\n]$/;
const NAME_START = /^[\p{L}_:]$/u;
const NAME_CHAR = /^[\p{L}\p{N}_:.\-·]$/u;
const DECLARATION = /^<\?xml version="1\.0"( encoding="UTF-8")?( standalone="(?:yes|no)")?[ \t\r\n]*\?>/;
const REFERENCE = /^&(?:([A-Za-z_][A-Za-z0-9_.-]*)|#([0-9]+)|#x([0-9A-Fa-f]+));/;
const XML_NAMESPACE = ['http:', '', 'www.w3.org', 'XML', '1998', 'namespace'].join('/'); // the namespace of the prefix xml

const hex = (code) => `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;

// True when the code point may appear in an XML 1.0 document (the production Char).
export function isXmlChar(code) {
  return code === 0x9 || code === 0xa || code === 0xd || (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff);
}

export class XmlElement {
  constructor({ name, ns, attrs, line, column }) {
    this.name = name;               // as written: "entry", "xml:lang"
    this.local = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
    this.ns = ns;                   // the namespace name, or '' for none
    this.attrs = attrs;             // Map: attribute name as written -> decoded value
    this.children = [];             // XmlElement | string, in document order
    this.line = line;
    this.column = column;
  }

  elements() { return this.children.filter((child) => typeof child !== 'string'); }
  text() { return this.children.map((child) => (typeof child === 'string' ? child : child.text())).join(''); }
}

// kind: 'escaping' for a fault in how a text is written (a bare &, <, ]]>, CDATA, a forbidden character), 'structure' for the rest
class Fault extends Error {
  constructor(pos, what, kind) { super(what); this.pos = pos; this.what = what; this.kind = kind; }
}

// Returns { root, error }: the root XmlElement and error null, or root null and error { line, column, what }.
export function parseXml(text) {
  const points = [...String(text)];
  const total = points.length;
  let line = 1;
  let column = 1;
  let cursor = 0; // the position that line and column describe

  // line and column (1-based, in code points) of the position pos; a CR LF pair and a lone CR count as one line break
  const where = (pos) => {
    if (pos < cursor) { line = 1; column = 1; cursor = 0; }
    while (cursor < pos) {
      const character = points[cursor];
      if (character === '\n' || (character === '\r' && points[cursor + 1] !== '\n')) { line += 1; column = 1; } else if (character !== '\r') column += 1;
      cursor += 1;
    }
    return { line, column };
  };
  const stop = (pos, what, kind = 'structure') => { throw new Fault(pos, what, kind); };
  const slice = (from, to) => points.slice(from, to).join('');
  const startsWith = (pos, literal) => slice(pos, pos + [...literal].length) === literal;
  const isSpace = (pos) => pos < total && WHITESPACE.test(points[pos]);
  const skipSpace = (pos) => { while (isSpace(pos)) pos += 1; return pos; };
  const checkChar = (pos) => {
    const code = points[pos].codePointAt(0);
    if (!isXmlChar(code)) stop(pos, `the character ${hex(code)} is not allowed in XML 1.0`, 'escaping');
  };

  // a name starts at pos; returns [name, endPos] or null
  const readName = (pos) => {
    if (pos >= total || !NAME_START.test(points[pos])) return null;
    let end = pos + 1;
    while (end < total && NAME_CHAR.test(points[end])) end += 1;
    return [slice(pos, end), end];
  };

  // a reference starts at pos (the "&"); returns [decoded, endPos]
  const readReference = (pos) => {
    const match = REFERENCE.exec(slice(pos, pos + 40));
    if (!match) stop(pos, '"&" starts a reference but is not followed by a name and ";" (write &amp;)', 'escaping');
    const length = [...match[0]].length;
    if (match[1] !== undefined) {
      if (!NAMED.has(match[1])) stop(pos, `the reference ${match[0]} is not defined in XML (only &amp; &lt; &gt; &quot; &apos; and numbers)`, 'escaping');
      return [NAMED.get(match[1]), pos + length];
    }
    const code = match[2] !== undefined ? Number.parseInt(match[2], 10) : Number.parseInt(match[3], 16);
    if (!Number.isFinite(code) || !isXmlChar(code)) stop(pos, `the reference ${match[0]} is not a character XML 1.0 allows`, 'escaping');
    return [String.fromCodePoint(code), pos + length];
  };

  // an attribute value starts at pos (the opening quote); returns [value, endPos after the closing quote]
  const readValue = (pos, name) => {
    const quote = points[pos];
    if (quote !== '"' && quote !== "'") stop(pos, `the value of the attribute ${name} must be quoted`);
    let out = '';
    let at = pos + 1;
    for (; at < total && points[at] !== quote; at += 1) {
      const character = points[at];
      if (character === '<') stop(at, '"<" is not allowed in an attribute value (write &lt;)', 'escaping');
      if (character === '&') { const [decoded, next] = readReference(at); out += decoded; at = next - 1; continue; }
      checkChar(at);
      if (character === '\n' || character === '\t') out += ' ';
      else if (character === '\r') { out += ' '; if (points[at + 1] === '\n') at += 1; } else out += character;
    }
    if (at >= total) stop(pos, `the value of the attribute ${name} is never closed`);
    return [out, at + 1];
  };

  // a comment starts at pos ("<!--"); returns the position after it
  const skipComment = (pos) => {
    let end = pos + 4;
    while (end < total && !startsWith(end, '-->')) { checkChar(end); end += 1; }
    if (end >= total) stop(pos, 'the comment is never closed');
    const inner = slice(pos + 4, end);
    if (inner.includes('--') || inner.endsWith('-')) stop(pos, '"--" is not allowed inside a comment');
    return end + 3;
  };

  const resolve = (name, scope, pos, isAttribute) => {
    const colon = name.indexOf(':');
    if (colon < 0) return isAttribute ? '' : (scope.get('') || '');
    const prefix = name.slice(0, colon);
    if (prefix === 'xmlns') return '';
    if (prefix === 'xml') return XML_NAMESPACE;
    if (!scope.has(prefix)) stop(pos, `the prefix ${prefix} is not declared`);
    return scope.get(prefix);
  };

  const parse = () => {
    let pos = 0;
    if (points[0] === '﻿') stop(0, 'the file starts with a byte order mark');
    if (startsWith(0, '<?xml') && (isSpace(5) || points[5] === '?')) {
      const match = DECLARATION.exec(slice(0, 400));
      if (!match) stop(0, 'the XML declaration must be <?xml version="1.0" encoding="UTF-8"?>');
      pos = [...match[0]].length;
    }

    let root = null;
    let rootClosed = false;
    const stack = []; // { element, scope }
    while (pos < total) {
      const character = points[pos];
      if (character !== '<') {
        if (stack.length === 0) {
          if (isSpace(pos)) { pos += 1; continue; }
          stop(pos, 'text outside the root element');
        }
        // text up to the next "<"
        let out = '';
        let at = pos;
        for (; at < total && points[at] !== '<'; at += 1) {
          const c = points[at];
          if (c === '&') { const [decoded, next] = readReference(at); out += decoded; at = next - 1; continue; }
          if (c === ']' && startsWith(at, ']]>')) stop(at, '"]]>" is not allowed in text (write ]]&gt;)', 'escaping');
          checkChar(at);
          if (c === '\r') { out += '\n'; if (points[at + 1] === '\n') at += 1; } else out += c;
        }
        stack[stack.length - 1].element.children.push(out);
        pos = at;
        continue;
      }
      const next = points[pos + 1];
      if (next === '!') {
        if (startsWith(pos, '<!--')) { pos = skipComment(pos); continue; }
        if (startsWith(pos, '<![CDATA[')) stop(pos, 'CDATA sections are not used; the feed escapes its text', 'escaping');
        if (startsWith(pos, '<!DOCTYPE')) stop(pos, 'a document type declaration is not allowed');
        stop(pos, '"<!" starts something this reader does not know');
      }
      if (next === '?') {
        if (/^<\?xml[ \t\r\n?]/i.test(slice(pos, pos + 6))) stop(pos, 'the XML declaration must be at the very start of the file');
        stop(pos, 'processing instructions are not used');
      }
      if (next === '/') {
        const named = readName(pos + 2);
        if (stack.length === 0) stop(pos, 'an end tag without a start tag');
        if (!named) stop(pos + 2, '"</" must be followed by a name');
        const [name, afterName] = named;
        const open = stack[stack.length - 1].element;
        if (name !== open.name) stop(pos, `the end tag </${name}> does not match <${open.name}> (opened at line ${open.line})`);
        const close = skipSpace(afterName);
        if (points[close] !== '>') stop(close, `the end tag </${name}> must end with ">"`);
        stack.pop();
        if (stack.length === 0) rootClosed = true;
        pos = close + 1;
        continue;
      }
      // a start tag
      const named = readName(pos + 1);
      if (!named) stop(pos + 1, '"<" must be followed by a name');
      if (rootClosed) stop(pos, 'only one root element is allowed');
      const [name, afterName] = named;
      const attributes = []; // [name, value, pos]
      let at = afterName;
      let empty = false;
      for (;;) {
        at = skipSpace(at);
        if (at >= total) stop(pos, `the start tag <${name}> is never closed`);
        if (points[at] === '>') { at += 1; break; }
        if (points[at] === '/') {
          if (points[at + 1] !== '>') stop(at, '"/" in a tag must be followed by ">"');
          empty = true; at += 2; break;
        }
        if (points[at] === '<') stop(at, '"<" is not allowed inside a tag');
        const attribute = readName(at);
        if (!attribute) stop(at, `the character "${points[at]}" is not allowed in a tag`);
        const [attributeName, afterAttribute] = attribute;
        if (attributes.some((entry) => entry[0] === attributeName)) stop(at, `the attribute ${attributeName} appears twice`);
        if (points[skipSpace(afterAttribute)] !== '=') stop(afterAttribute, `the attribute ${attributeName} has no "=" and no value`);
        const [value, afterValue] = readValue(skipSpace(skipSpace(afterAttribute) + 1), attributeName);
        attributes.push([attributeName, value, at]);
        at = afterValue;
        if (at < total && !isSpace(at) && points[at] !== '/' && points[at] !== '>') stop(at, 'an attribute must be followed by a space, "/>" or ">"');
      }

      const parentScope = stack.length > 0 ? stack[stack.length - 1].scope : new Map();
      const scope = new Map(parentScope);
      for (const [attributeName, value] of attributes) {
        if (attributeName === 'xmlns') scope.set('', value);
        else if (attributeName.startsWith('xmlns:')) scope.set(attributeName.slice(6), value);
      }
      const where0 = where(pos);
      const element = new XmlElement({
        name, ns: resolve(name, scope, pos + 1, false), attrs: new Map(attributes.map(([attributeName, value]) => [attributeName, value])), line: where0.line, column: where0.column,
      });
      for (const [attributeName, , attributePos] of attributes) resolve(attributeName, scope, attributePos, true);
      if (stack.length > 0) stack[stack.length - 1].element.children.push(element);
      else root = element;
      if (empty) { if (stack.length === 0) rootClosed = true; } else stack.push({ element, scope });
      pos = at;
    }
    if (stack.length > 0) {
      const open = stack[stack.length - 1].element;
      stop(total, `the document ends inside <${open.name}> (opened at line ${open.line})`);
    }
    if (root === null) stop(total, 'no root element');
    return root;
  };

  try {
    return { root: parse(), error: null };
  } catch (fault) {
    if (!(fault instanceof Fault)) throw fault;
    const place = where(fault.pos);
    return { root: null, error: { line: place.line, column: place.column, what: fault.what, kind: fault.kind } };
  }
}
