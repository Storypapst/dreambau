// Copied from apps/teamwork/tests/lib/miniyaml.mjs (this comment line added): each app is a package of its own and shares no code.
// A reader for the small part of YAML that the workflow files of this repository use, so that a check can read a
// workflow as a structure and not as text (no new dependency). Supported: comments, block mappings, block sequences
// (also `- key: value` items), plain, 'single' and "double" quoted scalars, numbers, true, false, null, flow sequences
// of scalars (`[a, b]`), empty flow mappings, and block scalars (`|`, `|-`, `>`, `>-`). Anything else throws an error
// that names the line, so that a workflow that uses more than this is noticed and not misread.
const INDENT = /^ */;
const isBlank = (line) => /^\s*(#.*)?$/.test(line);

// The line without a trailing comment (a # that follows white space and is not inside quotes).
function stripComment(text) {
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote === "'") {
      if (char === "'") {
        if (text[index + 1] === "'") index += 1; // two single quotes inside single quotes are one quote character
        else quote = null;
      }
    } else if (quote === '"') {
      if (char === '\\') index += 1;
      else if (char === '"') quote = null;
    } else if (char === '"' || char === "'") {
      if (index === 0 || /[\s[,:{]/.test(text[index - 1])) quote = char;
    } else if (char === '#' && (index === 0 || /\s/.test(text[index - 1]))) {
      return text.slice(0, index).trimEnd();
    }
  }
  return text.trimEnd();
}

function unquote(text) {
  if (text.startsWith("'")) return text.slice(1, -1).replace(/''/g, "'");
  return text.slice(1, -1).replace(/\\(["\\/nt])/g, (_, char) => ({ n: '\n', t: '\t' }[char] ?? char));
}

function scalar(raw, number) {
  const text = raw.trim();
  if (text === '' || text === '~' || text === 'null') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (/^["']/.test(text)) {
    if (text.length < 2 || text[text.length - 1] !== text[0]) throw new Error(`YAML line ${number}: a quoted value is not closed: ${text}`);
    return unquote(text);
  }
  if (text.startsWith('[')) {
    if (!text.endsWith(']')) throw new Error(`YAML line ${number}: a flow sequence must stay on one line: ${text}`);
    const inner = text.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((item) => scalar(item, number));
  }
  if (text === '{}') return {};
  if (/^[{&*!|>@`%]/.test(text)) throw new Error(`YAML line ${number}: this reader does not support ${JSON.stringify(text.slice(0, 20))}`);
  return text;
}

export function parseYaml(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let position = 0;
  const skipBlank = () => {
    while (position < lines.length && isBlank(lines[position])) position += 1;
  };

  // The block scalar that starts after a `|` or `>` at the given parent indent: the more indented lines that follow.
  function blockScalar(header, parentIndent) {
    const collected = [];
    while (position < lines.length && (isBlankStrict(lines[position]) || indent(lines[position]) > parentIndent)) {
      collected.push(lines[position]);
      position += 1;
    }
    while (collected.length > 0 && collected[collected.length - 1].trim() === '') collected.pop();
    const depth = Math.min(...collected.filter((line) => line.trim() !== '').map(indent));
    const text = collected.map((line) => line.slice(Math.min(depth, line.length))).join(header.startsWith('>') ? ' ' : '\n');
    return header.endsWith('-') ? text : `${text}\n`;
  }
  const indent = (line) => line.match(INDENT)[0].length;
  const isBlankStrict = (line) => line.trim() === '';

  function value(rest, parentIndent, number) {
    if (/^[|>][+-]?$/.test(rest)) return blockScalar(rest, parentIndent);
    if (rest === '') {
      skipBlank();
      if (position < lines.length && indent(lines[position]) > parentIndent) return block(indent(lines[position]));
      return null;
    }
    return scalar(rest, number);
  }

  function mapping(level) {
    const result = {};
    for (skipBlank(); position < lines.length && indent(lines[position]) === level; skipBlank()) {
      const number = position + 1;
      const text = stripComment(lines[position].slice(level));
      if (text.startsWith('- ') || text === '-') throw new Error(`YAML line ${number}: a list item where a key was expected`);
      const match = /^("[^"]*"|'[^']*'|[^\s'"][^:]*?)\s*:(?:\s+(.*))?$/.exec(text);
      if (!match) throw new Error(`YAML line ${number}: expected "key: value", found ${JSON.stringify(text.slice(0, 40))}`);
      const key = /^["']/.test(match[1]) ? unquote(match[1]) : match[1];
      if (key in result) throw new Error(`YAML line ${number}: the key ${key} appears twice`);
      position += 1;
      result[key] = value((match[2] ?? '').trim(), level, number);
    }
    return result;
  }

  function sequence(level) {
    const result = [];
    for (skipBlank(); position < lines.length && indent(lines[position]) === level && /^-(?: |$)/.test(lines[position].slice(level)); skipBlank()) {
      const number = position + 1;
      const content = lines[position].slice(level + 1);
      const inner = stripComment(content).trim();
      const column = level + 1 + (content.length - content.trimStart().length);
      if (inner === '') {
        position += 1;
        skipBlank();
        result.push(position < lines.length && indent(lines[position]) > level ? block(indent(lines[position])) : null);
      } else if (/^("[^"]*"|'[^']*'|[^\s'"[{][^:]*?)\s*:(?:\s|$)/.test(inner)) {
        lines[position] = `${' '.repeat(column)}${content.trimStart()}`; // the item is a mapping that starts on this line
        result.push(mapping(column));
      } else {
        position += 1;
        result.push(scalar(inner, number));
      }
    }
    return result;
  }

  function block(level) {
    skipBlank();
    return /^-(?: |$)/.test(lines[position].slice(level)) ? sequence(level) : mapping(level);
  }

  skipBlank();
  if (position >= lines.length) return null;
  const top = block(indent(lines[position]));
  skipBlank();
  if (position < lines.length) throw new Error(`YAML line ${position + 1}: unexpected indentation`);
  return top;
}
