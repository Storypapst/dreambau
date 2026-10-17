// BD-2, BD-3 (demo mode), BD-11: the commands, run for real in scratch copies of the folder. Two builds in two
// copies give the same sha256 for every file; the demo build writes only dist-demo/ and leaves dist/ alone; the
// default build writes dist/ and leaves dist-demo/ alone.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, same, run } from '../lib/check.mjs';
import { ROOT } from '../lib/paths.mjs';
import { copyApp, digestTree, topLevel, withScratch } from '../lib/scratch.mjs';

const npm = (cwd, ...args) => spawnSync('npm', ['run', '--silent', ...args], { cwd, encoding: 'utf8' });

await run(async () => {
  withScratch('copy-a', (a) => withScratch('copy-b', (b) => {
    const appA = copyApp(ROOT, path.join(a, 'blog'));
    const appB = copyApp(ROOT, path.join(b, 'a-different-path', 'blog'));
    const first = npm(appA, 'build:demo');
    same('BD-2 npm run build:demo exits 0 in the first copy', first.status, 0);
    same('BD-2 npm run build:demo exits 0 in the second copy', npm(appB, 'build:demo').status, 0);
    const treeA = digestTree(path.join(appA, 'dist-demo'));
    const treeB = digestTree(path.join(appB, 'dist-demo'));
    same('BD-2 the build wrote blog.json, the list, the 404 page, blog.css, blog.js, feed.xml, seven post pages and the one image', treeA.map((file) => file.path), [
      'blog.json', 'public/2026/ein-film-der-in-eine-mail-passt/index.html', 'public/2026/ein-werkzeug-das-zeichen-zaehlt/index.html', 'public/2026/kurzer-film-lange-nachgedacht/index.html',
      'public/2026/notiz-aus-der-werkstatt/index.html', 'public/2026/small-is-a-habit/index.html', 'public/2026/warum-bei-uns-der-text-zuerst-kommt/image.png',
      'public/2026/warum-bei-uns-der-text-zuerst-kommt/index.html', 'public/2026/warum-hier-niemand-mitzaehlt/index.html', 'public/404.html', 'public/blog.css', 'public/blog.js', 'public/feed.xml', 'public/index.html']);
    same('BD-2 two builds in two scratch copies (other paths) give the same sha256 for every file, blog.json included', treeB, treeA);
    npm(appA, 'build:demo');
    same('BD-2 a second build in the same copy changes nothing', digestTree(path.join(appA, 'dist-demo')), treeA);
    check('BD-3 the demo build tells what it built and where', /7 posts/.test(first.stdout) && /dist-demo/.test(first.stdout), first.stdout);
    const manifest = JSON.parse(fs.readFileSync(path.join(appA, 'dist-demo', 'blog.json'), 'utf8'));
    same('BD-3 the demo build is a preview build', manifest.mode, 'preview');
  }));

  // ---- the demo build writes only dist-demo/ ----
  withScratch('scope', (dir) => {
    const app = copyApp(ROOT, path.join(dir, 'blog'));
    fs.mkdirSync(path.join(app, 'dist'));
    fs.writeFileSync(path.join(app, 'dist', 'keep.txt'), 'untouched\n');
    const before = { top: topLevel(app), dist: digestTree(path.join(app, 'dist')) };
    same('BD-11 npm run build:demo exits 0', npm(app, 'build:demo').status, 0);
    same('BD-11 the demo build adds one directory to the folder, dist-demo, and nothing else', topLevel(app).filter((name) => !before.top.includes(name)), ['dist-demo']);
    same('BD-11 dist/ is unchanged by the demo build', digestTree(path.join(app, 'dist')), before.dist);
    same('BD-11 nothing that was in the folder before is gone or changed (all but dist-demo)', topLevel(app).filter((name) => name !== 'dist-demo'), before.top);
  });

  // ---- the default build is the preview of posts/ into dist/ ----
  withScratch('preview', (dir) => {
    const app = copyApp(ROOT, path.join(dir, 'blog'));
    same('BD-3 npm run build (preview, the default) exits 0', npm(app, 'build').status, 0);
    same('BD-3 it writes dist/, and not dist-demo/', [fs.existsSync(path.join(app, 'dist', 'blog.json')), fs.existsSync(path.join(app, 'dist-demo'))], [true, false]);
    const manifest = JSON.parse(fs.readFileSync(path.join(app, 'dist', 'blog.json'), 'utf8'));
    same('BD-3 no post exists in posts/ yet, so the preview is an empty list in preview mode', [manifest.mode, manifest.posts], ['preview', []]);
    const wrong = npm(app, 'build', '--', '--publish');
    check('BD-3 an unknown option exits 2 and names the usage', wrong.status === 2 && /Usage/.test(wrong.stderr), `${wrong.status} ${wrong.stderr}`);
  });

  // ---- a bad post in posts/: the build refuses it with the exact lines and writes nothing (BD-4) ----
  withScratch('refuse', (dir) => {
    const app = copyApp(ROOT, path.join(dir, 'blog'));
    fs.mkdirSync(path.join(app, 'posts', '2026'), { recursive: true });
    fs.writeFileSync(path.join(app, 'posts', '2026', 'schlecht.md'), '---\ntitle: Schlecht\ndate: 2026-02-30\nlang: fr\n---\n\nZu kurz.\n');
    const result = npm(app, 'build');
    same('BD-4 npm run build with a bad post exits 1', result.status, 1);
    same('BD-4 ... and prints every failure with its line, in the shape FAIL <rule> <file>:<line>: <what>', result.stderr.split('\n').filter(Boolean).map((line) => line.split(': ')[0]),
      ['FAIL PF-5 posts/2026/schlecht.md:3', 'FAIL PF-6 posts/2026/schlecht.md:4', 'FAIL PF-10 posts/2026/schlecht.md:7']);
    same('BD-4 ... and writes no dist/', fs.existsSync(path.join(app, 'dist')), false);
  });
});
