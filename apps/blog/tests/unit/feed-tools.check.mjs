// V14, V16, BD-4, BD-9 and the negative controls of the ticket: the two tools of slice S3, run for real as processes.
// `node tools/check-feed.mjs <feed.xml> ...` and `node tools/check-output.mjs <public-dir>` print every failure as
// `FAIL <rule> <where>: <what>`, exit 0 (nothing to report), 1 (a FAIL) or 2 (a wrong command line). The expected lines
// are written by hand.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, same, run } from '../lib/check.mjs';
import { FIXTURES, ROOT } from '../lib/paths.mjs';
import { withScratch } from '../lib/scratch.mjs';
import { buildBlog } from '../../src/generate.mjs';

const tool = (name, args) => {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'tools', name), ...args], { cwd: ROOT, encoding: 'utf8' });
  return { status: result.status, out: result.stdout, err: result.stderr, lines: result.stdout.split('\n').filter(Boolean) };
};

await run(async () => {
  withScratch('feed-tools', (dir) => {
    buildBlog({ postsDir: FIXTURES, outDir: dir, mode: 'preview' });
    const feedFile = path.join(dir, 'public', 'feed.xml');
    const original = fs.readFileSync(feedFile, 'utf8');
    const lines = original.split('\n');
    same('the demo feed: line 10 opens the newest entry, 11 is its id, 12 its title', [lines[9], lines[10], lines[11]], ['<entry>', '<id>https://dreambau.com/blog/2026/ein-film-der-in-eine-mail-passt/</id>', '<title>Ein Film, der in eine Mail passt</title>']);

    // ---- check-feed ----
    const good = tool('check-feed.mjs', [feedFile]);
    same('V14 the validator on the demo feed: no output, exit 0', [good.out, good.err, good.status], ['', '', 0]);

    const broken = path.join(dir, 'broken.xml');
    fs.writeFileSync(broken, original.replace('<title>Ein Film, der in eine Mail passt</title>', '<title>Ein Film & eine Mail</title>'));
    const ampersand = tool('check-feed.mjs', [broken]);
    same('the ticket: an entry with an unescaped & fails with the exact line, exit 1', [ampersand.lines.map((line) => line.replace(broken, 'FILE')), ampersand.status],
      [['FAIL FD-4 FILE:12: not well-formed XML at column 17: "&" starts a reference but is not followed by a name and ";" (write &amp;)'], 1]);

    fs.writeFileSync(broken, lines.filter((_, index) => index !== 10).join('\n'));
    const noId = tool('check-feed.mjs', [broken]);
    same('the ticket: an entry with a missing id fails with the exact line, exit 1', [noId.lines.map((line) => line.replace(broken, 'FILE')), noId.status], [['FAIL FD-3 FILE:10: the entry has no <id>'], 1]);

    const twoFiles = tool('check-feed.mjs', [feedFile, broken]);
    same('BD-4 two files in one run: each failure carries the name of its file', twoFiles.lines.map((line) => line.replace(broken, 'FILE')), ['FAIL FD-3 FILE:10: the entry has no <id>']);
    same('BD-4 a file that does not exist is a failure with its name, not a crash', tool('check-feed.mjs', [path.join(dir, 'nope.xml')]).lines.map((line) => line.replace(dir, 'DIR')), ['FAIL FD-1 DIR/nope.xml: cannot read the file (ENOENT)']);
    const usage = tool('check-feed.mjs', []);
    check('BD-4 no file given: usage on stderr, exit 2, nothing on stdout', usage.status === 2 && usage.out === '' && /^no feed file given\nUsage: node tools\/check-feed\.mjs/.test(usage.err), usage.err);
    same('BD-4 an unknown option: exit 2', tool('check-feed.mjs', ['--nope', feedFile]).status, 2);

    // ---- check-output ----
    const publicDir = path.join(dir, 'public');
    const tree = tool('check-output.mjs', [publicDir]);
    same('V16 the tree check on the demo build: no output, exit 0', [tree.out, tree.err, tree.status], ['', '', 0]);
    fs.writeFileSync(path.join(publicDir, '.DS_Store'), 'x');
    fs.writeFileSync(path.join(publicDir, '2026', 'notiz-aus-der-werkstatt', 'index.html'), fs.readFileSync(path.join(publicDir, '2026', 'notiz-aus-der-werkstatt', 'index.html'), 'utf8').replace('href="https://dreambau.com/blog/2026/notiz-aus-der-werkstatt/"', `href="https://${['www', 'dreambau', 'com'].join('.')}/blog/2026/notiz-aus-der-werkstatt/"`));
    const bad = tool('check-output.mjs', [publicDir]);
    same('V16 a dot file and a www canonical link: the exact lines, exit 1', [bad.lines, bad.status], [[
      'FAIL AD-1 .DS_Store: not a file of the shapes of spec 7.2 (index.html, 404.html, feed.xml, blog.css, blog.js, <year>/<slug>/index.html, <year>/<slug>/image.webp or image.png)',
      'FAIL DL-4 .DS_Store: a name below public/ must not begin with a dot',
      `FAIL AD-3 2026/notiz-aus-der-werkstatt/index.html:9: the address https://${['www', 'dreambau', 'com'].join('.')}/blog/2026/notiz-aus-der-werkstatt/ must use the host dreambau.com, not ${['www', 'dreambau', 'com'].join('.')}`], 1]);
    const missing = tool('check-output.mjs', [path.join(dir, 'nowhere')]);
    check('BD-4 a directory that does not exist: exit 2', missing.status === 2 && /not a directory/.test(missing.err), missing.err);
    same('BD-4 no argument: exit 2', tool('check-output.mjs', []).status, 2);
  });
});
