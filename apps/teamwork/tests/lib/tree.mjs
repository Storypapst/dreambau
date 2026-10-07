// The test-tree builder: the directories the page server mounts, built the way the live host lays them out (spec 3.3).
//
//   <root>/site/          the start page's own files (a placeholder: only the routes of the config need something there)
//   <root>/bildungshaus/  the Bildungshaus site (a placeholder as well)
//   <root>/teamwork/      what the publish step and the status script leave on the host: the page files (a copy of
//                         apps/teamwork/site/) and data/programs.json and data/status.json
//   <root>/etc/           nginx.conf, the config the container reads at /etc/dreambau-web/nginx.conf
//
// Directories are 0755 and files 0644 (spec O3, gap G12): a Linux runner creates private temporary directories that
// the nginx worker, another user inside the image, could not read.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nowUtc, publicCatalogue, publicJson, publicStatus } from './catalogue.mjs';
import { EXAMPLE_LIST, OPS, SITE } from './paths.mjs';

const START_PAGE = '<!doctype html>\n<title>Start page</title>\n<p>The start page of the test tree.</p>\n';
const BILDUNGSHAUS = '<!doctype html>\n<title>Bildungshaus</title>\n<p>The Bildungshaus site of the test tree.</p>\n';

export function makeReadable(dir) {
  fs.chmodSync(dir, 0o755);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) makeReadable(full);
    else fs.chmodSync(full, 0o644);
  }
}

function copyInto(from, to) {
  ensureDirectory(to);
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) copyInto(path.join(from, entry.name), path.join(to, entry.name));
    else fs.copyFileSync(path.join(from, entry.name), path.join(to, entry.name));
  }
}

// Makes a directory and every missing one above it, each 0755 (whatever the umask says).
export function ensureDirectory(directory) {
  if (fs.existsSync(directory)) return;
  ensureDirectory(path.dirname(directory));
  fs.mkdirSync(directory);
  fs.chmodSync(directory, 0o755);
}

function write(file, content) {
  ensureDirectory(path.dirname(file));
  fs.writeFileSync(file, content);
}

// Replaces a file by writing a new one under a temporary name in the same directory and renaming it over the old one
// (an atomic replace: a reader sees the old file or the new one, never half of it). The temporary name starts with a
// dot, so that the config's dotfile rule would never serve it.
export function replaceAtomically(file, content) {
  const directory = path.dirname(file);
  ensureDirectory(directory);
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${Date.now().toString(36)}.tmp`);
  fs.writeFileSync(temporary, content, { mode: 0o644 });
  fs.chmodSync(temporary, 0o644);
  fs.renameSync(temporary, file);
}

// The list as an object, from a file name or from an object.
export function readList(list = EXAMPLE_LIST) {
  return typeof list === 'string' ? JSON.parse(fs.readFileSync(list, 'utf8')) : list;
}

// options: site (directory with the page files, default apps/teamwork/site), list (file name or object, default the
// example list), reachable (ids for status.json, default every program), checkedAt (default now), conf (nginx config
// file, default ops/nginx-test.conf), files (more files for the teamwork directory, { 'relative/path': text }).
export function buildTree({ site = SITE, list, reachable, checkedAt, conf = path.join(OPS, 'nginx-test.conf'), files = {} } = {}) {
  const parsed = readList(list);
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'teamwork-tree-')));
  const dirs = { root, site: path.join(root, 'site'), bildungshaus: path.join(root, 'bildungshaus'), teamwork: path.join(root, 'teamwork'), etc: path.join(root, 'etc') };
  try {
    write(path.join(dirs.site, 'index.html'), START_PAGE);
    write(path.join(dirs.site, 'style.css'), 'body { margin: 0; }\n');
    write(path.join(dirs.bildungshaus, 'index.html'), BILDUNGSHAUS);
    write(path.join(dirs.bildungshaus, 'design-system.html'), BILDUNGSHAUS);
    if (fs.existsSync(site)) copyInto(site, dirs.teamwork); else fs.mkdirSync(dirs.teamwork, { recursive: true });
    write(path.join(dirs.teamwork, 'data', 'programs.json'), publicJson(publicCatalogue(parsed)));
    write(path.join(dirs.teamwork, 'data', 'status.json'), publicJson(publicStatus(reachable ?? parsed.programs.map((program) => program.id), checkedAt ?? nowUtc())));
    for (const [relative, content] of Object.entries(files)) write(path.join(dirs.teamwork, relative), content);
    write(path.join(dirs.etc, 'nginx.conf'), fs.readFileSync(conf));
    makeReadable(root);
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
  return { ...dirs, list: parsed, remove: () => fs.rmSync(root, { recursive: true, force: true }) };
}
