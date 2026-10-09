// Plain functions over text and files, so that a check can prove each one on made-up input before it trusts it on
// the real files.
import fs from 'node:fs';
import path from 'node:path';

// Every file below `dir` (symbolic links are not followed) as { name, bytes, text }, names relative with `/`.
export function filesBelow(dir, { skipFolders = [], skipFiles = [] } = {}) {
  const found = [];
  const walk = (current) => {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skipFolders.includes(entry.name)) walk(full);
      } else if (entry.isFile() && !skipFiles.includes(entry.name)) {
        const buffer = fs.readFileSync(full);
        found.push({ name: path.relative(dir, full).split(path.sep).join('/'), bytes: buffer.length, text: buffer.toString('utf8') });
      }
    }
  };
  walk(dir);
  return found.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// Lines that switch a check off. The pattern is assembled from parts so that this file does not match itself.
export const SKIP_PATTERN = new RegExp([String.raw`\.skip\(`, String.raw`\.only\(`, 'fix' + 'me', String.raw`xit\(`].join('|'));

export function skipLines(files) {
  const found = [];
  for (const file of files) file.text.split('\n').forEach((line, index) => { if (SKIP_PATTERN.test(line)) found.push(`${file.name}:${index + 1}`); });
  return found;
}

// The hosts of all addresses (a scheme, two slashes and a host) of a text.
export function hostsOf(text) {
  return [...text.matchAll(/\b[a-z][a-z0-9+.-]*:\/\/(?:[^\s/@"'<>`]*@)?([^\s/:?#"'<>`]+)/gi)].map((match) => match[1].toLowerCase());
}

// The e-mail addresses of a text.
export function emailsOf(text) {
  return [...text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g)].map((match) => match[0].toLowerCase());
}

// The only real names in the folder are dreambau.com and info@dreambau.com. Invented hosts end in example.test; the
// address of the local test server (127.0.0.1, localhost) is no name of anyone. A placeholder such as ${host} is no host.
const allowedHost = (host) => host === 'dreambau.com' || host === 'example.test' || host.endsWith('.example.test')
  || host === '127.0.0.1' || host === 'localhost' || host === 'blog.test' || /^[<${]/.test(host);

export function foreignNames(files) {
  const found = [];
  for (const file of files) {
    for (const host of hostsOf(file.text)) if (!allowedHost(host)) found.push(`${file.name}: host ${host}`);
    for (const mail of emailsOf(file.text)) if (mail !== 'info@dreambau.com') found.push(`${file.name}: address ${mail}`);
  }
  return found;
}
