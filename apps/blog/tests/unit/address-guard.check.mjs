// AD-2, AD-6, AD-7, PF-5 (new posts sort after the newest), PF-13 (file name = slug of the title) against a copy of
// origin/main (V1 check-post-pr part, V3 order cases, V10). The base is a directory that holds a copy of apps/blog/posts;
// the tool also reads it from a git ref, which the last part proves on a throw-away repository.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, same, run } from '../lib/check.mjs';
import { plainPost, writeTree } from '../lib/posts.mjs';
import { withScratch } from '../lib/scratch.mjs';
import { checkTree, loadTreeFromDir, loadTreeFromGit } from '../../src/lib/tree.mjs';

const NOW = new Date('2026-10-09T10:00:00Z');
const BASE_POSTS = [
  { year: '2026', slug: 'alpha-eins', title: 'Alpha Eins', date: '2026-03-01' },
  { year: '2026', slug: 'beta-zwei', title: 'Beta Zwei', date: '2026-05-01' },
  { year: '2026', slug: 'gamma-drei', title: 'Gamma Drei', date: '2026-07-01' },
];
const brief = (findings) => findings.map((finding) => `${finding.level} ${finding.rule} ${finding.where}`);
// copies the base into a new head directory, applies the change, and returns the findings of the check
function scenario(dir, change, { baseTombstones = [], prefix = 'posts' } = {}) {
  const base = writeTree(path.join(dir, 'base'), BASE_POSTS, baseTombstones);
  const head = path.join(dir, 'head');
  fs.cpSync(base, head, { recursive: true });
  change(head);
  return checkTree({ head: loadTreeFromDir(head), base: loadTreeFromDir(base), headDir: head, displayDir: prefix, now: NOW });
}
const write = (head, year, slug, title, date) => writeTree(head, [{ year, slug, title, date }]);
const remove = (head, relative) => fs.rmSync(path.join(head, relative));
const rename = (head, from, to) => fs.renameSync(path.join(head, from), path.join(head, to));
const edit = (head, relative, change) => fs.writeFileSync(path.join(head, relative), change(fs.readFileSync(path.join(head, relative), 'utf8')));
const tomb = (head, ...lines) => fs.writeFileSync(path.join(head, 'removed.txt'), `${lines.join('\n')}\n`);

await run(async () => {
  withScratch('guard', (dir) => {
    let n = 0;
    const next = () => path.join(dir, `s${(n += 1)}`);

    same('V10 an unchanged copy gives no finding', brief(scenario(next(), () => {})), []);

    // ---- AD-6 ----
    same('V10 deleting a post gives FAIL AD-6 and names the address', brief(scenario(next(), (head) => remove(head, '2026/gamma-drei.md'))), ['FAIL AD-6 posts/2026/gamma-drei.md']);
    same('V10 renaming a post (and its title) gives FAIL AD-6 for the old address', brief(scenario(next(), (head) => {
      rename(head, '2026/gamma-drei.md', '2026/gamma-neu.md');
      edit(head, '2026/gamma-neu.md', (text) => text.replace('Gamma Drei', 'Gamma Neu'));
    })), ['FAIL AD-6 posts/2026/gamma-drei.md']);
    same('V10 renaming a post and listing the old address in removed.txt passes', brief(scenario(next(), (head) => {
      rename(head, '2026/gamma-drei.md', '2026/gamma-neu.md');
      edit(head, '2026/gamma-neu.md', (text) => text.replace('Gamma Drei', 'Gamma Neu'));
      tomb(head, '2026/gamma-drei 2026-10-09');
    })), []);
    same('V10 deleting a post and listing it passes', brief(scenario(next(), (head) => { remove(head, '2026/beta-zwei.md'); tomb(head, '2026/beta-zwei 2026-10-09'); })), []);
    const within = scenario(next(), (head) => edit(head, '2026/gamma-drei.md', (text) => text.replace('date: 2026-07-01', 'date: 2026-07-02')));
    same('V10 a changed date within the year gives WARN AD-6 and no FAIL', brief(within), ['WARN AD-6 posts/2026/gamma-drei.md:3']);
    same('V10 a WARN does not make the check fail', within.some((finding) => finding.level === 'FAIL'), false);
    same('V10 a date moved into another year gives FAIL AD-6 (and the year folder no longer fits: PF-1)', brief(scenario(next(), (head) => edit(head, '2026/gamma-drei.md', (text) => text.replace('date: 2026-07-01', 'date: 2025-12-31')))), ['FAIL AD-6 posts/2026/gamma-drei.md:3', 'FAIL PF-1 posts/2026/gamma-drei.md:3']);
    same('V10 changing the text of a post that is already there is fine (no PF-5 for an old post that is not the newest)', brief(scenario(next(), (head) => edit(head, '2026/alpha-eins.md', (text) => text.replace('Der Vortrag', 'Dieser Vortrag')))), []);

    // ---- AD-7 ----
    same('V10 a file at a tombstoned address gives FAIL AD-7 (and PF-13: the slug would take the suffix -2)', brief(scenario(next(), (head) => write(head, '2026', 'delta-vier', 'Delta Vier', '2026-09-01'), { baseTombstones: ['2026/delta-vier 2026-09-01'] })), ['FAIL AD-7 posts/2026/delta-vier.md', 'FAIL PF-13 posts/2026/delta-vier.md']);
    same('V10 the same title with the suffix -2 is a free address and passes', brief(scenario(next(), (head) => write(head, '2026', 'delta-vier-2', 'Delta Vier', '2026-09-01'), { baseTombstones: ['2026/delta-vier 2026-09-01'] })), []);
    same('V10 a line removed from removed.txt gives FAIL AD-7 (an address is never reused)', brief(scenario(next(), (head) => tomb(head, '2026/zzz-aaa 2026-02-02'), { baseTombstones: ['2026/zzz-aaa 2026-02-02', '2026/zzz-bbb 2026-02-02'] })), ['FAIL AD-7 posts/removed.txt']);
    same('AD-7 a bad line in removed.txt is named with its line', brief(scenario(next(), (head) => tomb(head, '2026/zzz-aaa 2026-02-02', 'nonsense', '2026/zzz-ccc 2026-13-40'), { baseTombstones: ['2026/zzz-aaa 2026-02-02'] })), ['FAIL AD-7 posts/removed.txt:2', 'FAIL AD-7 posts/removed.txt:3']);

    // ---- PF-5: a new post sorts after the newest post of the base ----
    same('V3 a new post with an earlier date than the newest is FAIL PF-5, at the date', brief(scenario(next(), (head) => write(head, '2026', 'epsilon-fuenf', 'Epsilon Fuenf', '2026-06-01'))), ['FAIL PF-5 posts/2026/epsilon-fuenf.md:3']);
    same('V3 a new post on the same day with an earlier slug is FAIL PF-5', brief(scenario(next(), (head) => write(head, '2026', 'abc-vorher', 'Abc Vorher', '2026-07-01'))), ['FAIL PF-5 posts/2026/abc-vorher.md:3']);
    same('V3 a new post on the same day with a later slug passes', brief(scenario(next(), (head) => write(head, '2026', 'zeta-sechs', 'Zeta Sechs', '2026-07-01'))), []);
    same('V3 a new post with a later date passes', brief(scenario(next(), (head) => write(head, '2026', 'eta-sieben', 'Eta Sieben', '2026-08-01'))), []);
    same('V3 two new posts, one too early: only that one fails', brief(scenario(next(), (head) => { write(head, '2026', 'eta-sieben', 'Eta Sieben', '2026-08-01'); write(head, '2026', 'theta-acht', 'Theta Acht', '2026-01-01'); })), ['FAIL PF-5 posts/2026/theta-acht.md:3']);

    // ---- PF-13: the file name is the slug of the title ----
    const named = (slug, title, baseTombstones, extra = () => {}) => brief(scenario(next(), (head) => { write(head, '2026', slug, title, '2026-09-01'); extra(head); }, { baseTombstones }));
    same('V1 a new post whose file name is not the slug of its title gives FAIL PF-13', named('anderer-name', 'Größe & Maß', []), ['FAIL PF-13 posts/2026/anderer-name.md']);
    same('V1 a new post whose file name is the slug passes', named('groesse-mass', 'Größe & Maß', []), []);
    same('V1 the suffix -2 where the plain slug is not taken gives FAIL PF-13', named('groesse-mass-2', 'Größe & Maß', []), ['FAIL PF-13 posts/2026/groesse-mass-2.md']);
    same('V1 the suffix -2 where the plain slug is a tombstone passes', named('groesse-mass-2', 'Größe & Maß', ['2026/groesse-mass 2026-01-01']), []);
    same('V1 the suffix -3 while -2 is free gives FAIL PF-13', named('groesse-mass-3', 'Größe & Maß', ['2026/groesse-mass 2026-01-01']), ['FAIL PF-13 posts/2026/groesse-mass-3.md']);
    same('V1 the suffix -3 where plain and -2 are taken passes', named('groesse-mass-3', 'Größe & Maß', ['2026/groesse-mass 2026-01-01', '2026/groesse-mass-2 2026-01-01']), []);
    const msg = scenario(next(), (head) => write(head, '2026', 'anderer-name', 'Größe & Maß', '2026-09-01')).find((finding) => finding.rule === 'PF-13').what;
    check('V1 the PF-13 line names both: the file name and the slug it should be', /anderer-name/.test(msg) && /groesse-mass/.test(msg), msg);
    same('V1 an existing post whose name no longer fits its title is not PF-13 (only new posts are held to it)', brief(scenario(next(), (head) => edit(head, '2026/alpha-eins.md', (text) => text.replace('Alpha Eins', 'Ganz Anders')))), []);

    // ---- file rules run on every post of the head ----
    same('PF-4 the file rules run on every post of the head, with the line', brief(scenario(next(), (head) => edit(head, '2026/alpha-eins.md', (text) => text.replace('date: 2026-03-01', 'date: 2026-02-30')))), ['FAIL PF-5 posts/2026/alpha-eins.md:3']);
  });

  // ---- no posts on the base at all (today's origin/main): everything is new, nothing to compare ----
  withScratch('empty', (dir) => {
    const head = writeTree(path.join(dir, 'head'), [{ year: '2026', slug: 'erster-beitrag', title: 'Erster Beitrag', date: '2026-09-01' }]);
    same('PF-5 against an empty base nothing sorts before anything', brief(checkTree({ head: loadTreeFromDir(head), base: loadTreeFromDir(path.join(dir, 'nowhere')), headDir: head, displayDir: 'posts', now: NOW })), []);
    same('PF-5 a directory that does not exist is an empty tree', [loadTreeFromDir(path.join(dir, 'nowhere')).posts.size, loadTreeFromDir(path.join(dir, 'nowhere')).tombstones.size], [0, 0]);
  });

  // ---- the same tree read from a git ref ----
  withScratch('git', (dir) => {
    const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], { cwd: dir, encoding: 'utf8' });
    git('init', '-q');
    writeTree(path.join(dir, 'apps', 'blog', 'posts'), BASE_POSTS, ['2026/alt 2026-01-01']);
    fs.mkdirSync(path.join(dir, 'other'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'other', 'x.md'), 'not a post\n');
    git('add', '-A');
    same('git: the commit works', git('commit', '-q', '-m', 'base').status, 0);
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    const fromGit = loadTreeFromGit({ ref: 'refs/remotes/origin/main', prefix: 'apps/blog/posts', cwd: dir });
    const fromDir = loadTreeFromDir(path.join(dir, 'apps', 'blog', 'posts'));
    same('git: the tree read from the ref equals the tree read from the directory (addresses, texts, tombstones)', [[...fromGit.posts.entries()].map(([a, p]) => [a, p.text]), [...fromGit.tombstones.entries()]], [[...fromDir.posts.entries()].map(([a, p]) => [a, p.text]), [...fromDir.tombstones.entries()]]);
    same('git: three posts and one tombstone', [fromGit.posts.size, fromGit.tombstones.size], [3, 1]);
    same('git: a prefix that is not in the ref (today: no posts folder on main) is an empty tree', loadTreeFromGit({ ref: 'refs/remotes/origin/main', prefix: 'apps/blog/nope', cwd: dir }).posts.size, 0);
    let message = '';
    try { loadTreeFromGit({ ref: 'refs/remotes/origin/nothing', prefix: 'apps/blog/posts', cwd: dir }); } catch (error) { message = error.message; }
    check('git: a ref that does not exist is an error that names the ref and the fetch', /refs\/remotes\/origin\/nothing/.test(message) && /fetch/.test(message), message || 'no error');
  });
});
void plainPost;
