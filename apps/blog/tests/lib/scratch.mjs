// Scratch directories that a check removes again.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export function withScratch(prefix, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `blog-${prefix}-`));
  const finish = () => fs.rmSync(dir, { recursive: true, force: true });
  let result;
  try {
    result = body(dir);
  } catch (error) {
    finish();
    throw error;
  }
  if (result && typeof result.then === 'function') return result.finally(finish);
  finish();
  return result;
}

// Every file below `dir` as { path, bytes, sha256 }, sorted by path.
export function digestTree(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const buffer = fs.readFileSync(full);
        found.push({ path: path.relative(dir, full).split(path.sep).join('/'), bytes: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') });
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function writePost(postsDir, relative, text) {
  const file = path.join(postsDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

// A copy of the apps/blog folder (without installed packages and build output) in a new scratch directory.
export function copyApp(from, to) {
  fs.cpSync(from, to, { recursive: true, filter: (source) => !['node_modules', 'dist', 'dist-demo'].includes(path.basename(source)) });
  return to;
}

export function topLevel(dir) {
  return fs.readdirSync(dir).sort();
}
