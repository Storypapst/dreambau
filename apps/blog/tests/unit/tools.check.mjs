// BD-4, BD-9 and the literal commands of the ticket: the three tools, run for real as processes. Each one reports all
// failures in one run as `FAIL <rule> <where>: <what>` or `WARN ...`, exits 0, 1 or 2, never throws, and has a
// deliberately broken input that must give the exact line (the negative controls). The expected lines are written by hand.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, same, run } from '../lib/check.mjs';
import { FIXTURE_POST, ROOT } from '../lib/paths.mjs';
import { BODY, plainPost, postText, writeTree } from '../lib/posts.mjs';
import { png } from '../lib/images.mjs';
import { withScratch } from '../lib/scratch.mjs';

const tool = (name, args, options = {}) => {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'tools', name), ...args], { cwd: options.cwd || ROOT, encoding: 'utf8' });
  return { status: result.status, out: result.stdout, err: result.stderr, lines: result.stdout.split('\n').filter(Boolean) };
};
const FIXTURE_DIR = path.dirname(FIXTURE_POST);

await run(async () => {
  // ================= check-post: the post validator =================
  const good = tool('check-post.mjs', [FIXTURE_POST]);
  same('the ticket: the validator on tests/fixtures/2026/ein-film-der-in-eine-mail-passt.md gives no output and exit code 0', [good.out, good.err, good.status], ['', '', 0]);

  // a copy next to the fixture (so that the fixture rule PF-14 and the year folder fit) with the bad date
  const stray = path.join(FIXTURE_DIR, 'bad-date-copy.md');
  try {
    fs.writeFileSync(stray, fs.readFileSync(FIXTURE_POST, 'utf8').replace('date: 2026-10-02', 'date: 2026-02-30'));
    const bad = tool('check-post.mjs', [stray]);
    same('the ticket: date 2026-02-30 gives FAIL PF-5 with the line number, exit 1', [bad.lines.map((line) => line.replace(`${stray}`, 'FILE')), bad.status],
      [['FAIL PF-5 FILE:3: the date "2026-02-30" is not a real calendar date written YYYY-MM-DD'], 1]);
    // the title of 101 characters and the http:// link in the same file: both in one run
    fs.writeFileSync(stray, fs.readFileSync(FIXTURE_POST, 'utf8').replace('title: Ein Film, der in eine Mail passt', `title: ${'a'.repeat(101)}`).replace('https://videos', 'http://videos'));
    const both = tool('check-post.mjs', [stray]);
    same('the ticket: a title of 101 characters and an http:// link give both failures in one run, with their lines', [both.lines.map((line) => line.split(': ')[0].replace(stray, 'FILE')), both.status], [['FAIL PF-4 FILE:2', 'FAIL PF-7 FILE:5'], 1]);
  } finally {
    fs.rmSync(stray, { force: true });
  }

  withScratch('tool-files', (dir) => {
    // ---- 14 bad files in one run: each gives its line(s) ----
    const base = ['title: Ein Titel', 'date: 2026-10-02'];
    const files = {
      'no-fence': 'title: Ein Titel\ndate: 2026-10-02\n\nText\n',
      bom: `﻿${postText({ front: { example: undefined } })}`,
      crlf: postText({ front: { example: undefined } }).replace(/\n/g, '\r\n'),
      tab: postText({ lines: ['title:\tEin Titel', 'date: 2026-10-02'] }),
      list: postText({ lines: [...base, 'sourceTitle: [a, b]'] }),
      block: postText({ lines: [...base, 'quote: |', '  eins'] }),
      anchor: postText({ lines: ['title: &a Ein Titel', 'date: 2026-10-02'] }),
      repeated: postText({ lines: [...base, 'title: Noch ein Titel'] }),
      unknown: postText({ lines: [...base, 'author: jemand'] }),
      missing: postText({ lines: ['title: Ein Titel'] }),
      colon: postText({ lines: ['title: Wichtig: ein Titel', 'date: 2026-10-02'] }),
      multiline: postText({ lines: ['title: Ein sehr', '  langer Titel', 'date: 2026-10-02'] }),
      'no-body': '---\ntitle: Ein Titel\ndate: 2026-10-02\n---\n',
      unclosed: postText({ lines: ['title: "Ein Titel', 'date: 2026-10-02'] }),
    };
    const paths = Object.entries(files).map(([name, text]) => { const file = path.join(dir, '2026', `${name}.md`); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); return file; });
    const all = tool('check-post.mjs', paths);
    same('V2 the 14 bad files in one run: exit 1, no exception', [all.status, /Error|at .*\.mjs|node:internal/.test(all.err + all.out), all.err], [1, false, '']);
    const perFile = paths.map((file) => all.lines.filter((line) => /^(FAIL|WARN) PF-\d+ /.test(line) && line.includes(`${file}`)));
    same('V2 each of the 14 files has at least one FAIL PF-2 or FAIL PF-3 line', perFile.map((lines) => lines.some((line) => /^FAIL PF-[23] /.test(line))), Array(14).fill(true));
    same('V2 every line has the shape FAIL <rule> <where>: <what>', all.lines.every((line) => /^(FAIL|WARN) [A-Z]{2}-\d+ \S.*: .+$/.test(line)), true);
    check('V2 a line with a line number: the tab file names line 2', all.lines.some((line) => line.startsWith(`FAIL PF-2 ${paths[3]}:2: a tab`)), all.lines[3]);
    // a file that is not there, and nothing at all
    const missing = tool('check-post.mjs', [path.join(dir, 'nope.md')]);
    same('BD-4 a file that does not exist gives a FAIL line, exit 1', [missing.status, missing.lines.length, /^FAIL PF-2 .*nope\.md: cannot read the file/.test(missing.lines[0] || '')], [1, 1, true]);
    same('BD-4 no file at all: usage on stderr, exit 2', [tool('check-post.mjs', []).status, /Usage/.test(tool('check-post.mjs', []).err)], [2, true]);
    same('BD-4 an unknown option: exit 2', tool('check-post.mjs', ['--nope', paths[0]]).status, 2);
    same('BD-4 --now without a valid instant: exit 2', tool('check-post.mjs', ['--now', 'gestern', paths[0]]).status, 2);

    // ---- images are read from the folder of the post ----
    const withImage = path.join(dir, '2027', 'mit-bild.md');
    fs.mkdirSync(path.dirname(withImage), { recursive: true });
    const text = plainPost({ title: 'Mit Bild', date: '2027-01-02', extra: 'image: mit-bild.png\nimageAlt: Ein grauer Streifen\nimageRights: true\n' });
    fs.writeFileSync(withImage, text);
    same('V7 the image file is missing: FAIL PF-11 at the line of the key', tool('check-post.mjs', [withImage]).lines.map((line) => line.replace(withImage, 'FILE').split(':').slice(0, 2).join(':')), ['FAIL PF-11 FILE:4']);
    fs.writeFileSync(path.join(dir, '2027', 'mit-bild.png'), png({ width: 640, height: 360 }));
    same('V7 with a valid png next to the post: no output, exit 0', (({ out, status }) => [out, status])(tool('check-post.mjs', [withImage])), ['', 0]);
    // a png with a tEXt chunk
    fs.writeFileSync(path.join(dir, '2027', 'mit-bild.png'), png({ width: 640, height: 360, extra: [Buffer.concat([Buffer.from([0, 0, 0, 5]), Buffer.from('tEXt'), Buffer.from('a\0bcd'), Buffer.alloc(4)])] }));
    const metadata = tool('check-post.mjs', [withImage]);
    check('V7 a png with a tEXt chunk: FAIL PF-11 naming the chunk, exit 1', metadata.status === 1 && /^FAIL PF-11 .*mit-bild\.md:4: the file has a tEXt chunk/.test(metadata.lines[0] || ''), metadata.out);

    // ---- publish and the injected clock ----
    const future = path.join(dir, '2026', 'zukunft.md');
    fs.writeFileSync(future, plainPost({ title: 'Zukunft', date: '2026-10-10', extra: 'sourceLink: https://videos.beispiel-video.de/x\n' }));
    same('V3 preview: tomorrow is fine', tool('check-post.mjs', ['--now', '2026-10-09T10:00:00Z', future]).status, 0);
    same('V3 --publish: tomorrow in Berlin is FAIL PF-5, exit 1', (({ lines, status }) => [lines.map((line) => line.split(':')[0].replace(future, 'FILE')), status])(tool('check-post.mjs', ['--publish', '--now', '2026-10-09T10:00:00Z', future])), [['FAIL PF-5 FILE'], 1]);
    same('V3 --publish at 22:30 UTC (already tomorrow in Berlin): passes', tool('check-post.mjs', ['--publish', '--now', '2026-10-09T22:30:00Z', future]).status, 0);
  });

  // ================= slug.mjs =================
  const slug = (...args) => tool('slug.mjs', args);
  for (const [title, expected] of [['Ein Film, der in eine Mail passt', 'ein-film-der-in-eine-mail-passt'], ['Größe & Maß', 'groesse-mass'], ['  ÄÖÜ  ', 'aeoeue'], ['Café-Bar', 'cafe-bar']]) {
    const result = slug(title);
    same(`V1 node tools/slug.mjs ${JSON.stringify(title)} prints ${expected}`, [result.out, result.err, result.status], [`${expected}\n`, '', 0]);
  }
  const longTitle = Array.from({ length: 18 }, () => 'abcd').join(' ');
  same('V1 a 90-character title with dashes gives at most 60 characters', (({ out }) => [out.trim().length <= 60, out.trim().endsWith('abcd'), out.trim().length])(slug(longTitle)), [true, true, 59]);
  same('V1 one 90-letter word gives exactly 60 letters', slug('a'.repeat(90)).out, `${'a'.repeat(60)}\n`);
  const nothing = slug('!!!');
  same('V1 !!! exits 1 with no slug and a message on stderr', [nothing.status, nothing.out, /^FAIL PF-13 title: /.test(nothing.err)], [1, '', true]);
  same('V1 a title with fewer than three letters or digits has no slug either (PF-4)', (({ status, out, err }) => [status, out, /^FAIL PF-4 /.test(err)])(slug('Ab')), [1, '', true]);
  same('V1 no title: usage, exit 2', [slug().status, /Usage/.test(slug().err)], [2, true]);
  same('V1 --year that is not a year: exit 2', slug('Titel', '--year', 'zwei').status, 2);
  same('V1 --year needs the copy of origin/main; a ref that is not there: exit 2 with the fetch hint', (({ status, err }) => [status, /git fetch origin main/.test(err)])(slug('Titel', '--year', '2026', '--base-ref', 'refs/remotes/origin/nothing')), [2, true]);
  same('V1 --year with both --base and --base-ref: exit 2', slug('Titel', '--year', '2026', '--base', '.', '--base-ref', 'x').status, 2);
  withScratch('slug-year', (dir) => {
    const base = writeTree(path.join(dir, 'base'), [{ year: '2026', slug: 'groesse-mass', title: 'Größe & Maß', date: '2026-01-01' }, { year: '2026', slug: 'groesse-mass-2', title: 'Größe & Maß', date: '2026-01-02' }], ['2026/cafe-bar 2026-01-01']);
    const withBase = (title, year = '2026') => slug(title, '--year', year, '--base', base);
    same('V1 --year 2026 appends -3 for a taken address when -2 is taken too', withBase('Größe & Maß').out, 'groesse-mass-3\n');
    same('V1 --year 2026 appends -2 for a tombstoned address', withBase('Café-Bar').out, 'cafe-bar-2\n');
    same('V1 --year 2026 for a free title prints the plain slug', withBase('Ganz neu').out, 'ganz-neu\n');
    same('V1 the same title in another year is free', withBase('Größe & Maß', '2027').out, 'groesse-mass\n');
    same('V1 --year with !!! still exits 1 and prints no slug', [withBase('!!!').status, withBase('!!!').out], [1, '']);
  });

  // ================= check-post-pr: file names, order, address guard =================
  withScratch('pr', (dir) => {
    const base = writeTree(path.join(dir, 'base'), [{ year: '2026', slug: 'alpha-eins', title: 'Alpha Eins', date: '2026-03-01' }, { year: '2026', slug: 'beta-zwei', title: 'Beta Zwei', date: '2026-05-01' }], []);
    const head = path.join(dir, 'head');
    fs.cpSync(base, head, { recursive: true });
    const pr = (...extra) => tool('check-post-pr.mjs', ['--posts', head, '--base', base, '--now', '2026-10-09T10:00:00Z', ...extra]);
    same('BD-4 an unchanged tree: no output, exit 0', (({ out, status }) => [out, status])(pr()), ['', 0]);
    writeTree(head, [{ year: '2026', slug: 'falscher-name', title: 'Größe & Maß', date: '2026-09-01' }]);
    same('V1 a new post with a wrong file name: the exact line, exit 1', (({ lines, status }) => [lines, status])(pr()), [[`FAIL PF-13 ${head}/2026/falscher-name.md: the file name is falscher-name but the slug of the title is groesse-mass; a new post must be named by its title`], 1]);
    fs.rmSync(path.join(head, '2026', 'falscher-name.md'));
    fs.rmSync(path.join(head, '2026', 'beta-zwei.md'));
    same('V10 a deleted post: FAIL AD-6 with the address, exit 1', (({ lines, status }) => [lines.map((line) => line.slice(0, line.indexOf(': '))), status])(pr()), [[`FAIL AD-6 ${head}/2026/beta-zwei.md`], 1]);
    fs.copyFileSync(path.join(base, '2026', 'beta-zwei.md'), path.join(head, '2026', 'beta-zwei.md'));
    fs.writeFileSync(path.join(head, '2026', 'beta-zwei.md'), fs.readFileSync(path.join(base, '2026', 'beta-zwei.md'), 'utf8').replace('2026-05-01', '2026-05-02'));
    const warned = pr();
    same('V10 a changed date within the year: a WARN line and exit 0', [warned.status, warned.lines.map((line) => line.slice(0, line.indexOf(': ')))], [0, [`WARN AD-6 ${head}/2026/beta-zwei.md:3`]]);
    same('BD-4 no posts folder at all: usage error, exit 2', tool('check-post-pr.mjs', ['--posts', path.join(dir, 'nope'), '--base', base]).status, 2);
    same('BD-4 both --base and --base-ref: exit 2', tool('check-post-pr.mjs', ['--posts', head, '--base', base, '--base-ref', 'x']).status, 2);
    same('BD-4 --base-ref that does not exist: exit 2 and the fetch hint', (({ status, err }) => [status, /git fetch origin main/.test(err)])(tool('check-post-pr.mjs', ['--posts', head, '--base-ref', 'refs/remotes/origin/nothing'])), [2, true]);
  });
  void BODY;
});
