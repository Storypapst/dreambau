// LI-3, PF-15 (V9): the number of a post is its rank by (date, slug) counted from the oldest, two digits up to 99, then
// as many as needed. The expected numbers are written out by hand.
import { same, run } from '../lib/check.mjs';
import { formatNumber, newestFirst, numberPosts } from '../../src/lib/numbering.mjs';

const post = (date, slug) => ({ date, slug });
const summary = (posts) => posts.map((item) => `${item.number}:${item.date}:${item.slug}`);

await run(async () => {
  // seven posts, dates in a different order, two on one day (2026-09-10): "bbb" sorts after "aaa"
  const seven = [post('2026-10-05', 'sieben'), post('2026-09-10', 'bbb'), post('2026-08-01', 'eins'), post('2026-09-10', 'aaa'), post('2026-12-24', 'sechs-ende'), post('2026-09-30', 'vier'), post('2026-10-01', 'fuenf')];
  const numbered = numberPosts(seven);
  same('V9 seven posts are numbered 1 to 7 by (date, slug) ascending', summary(numbered), [
    '1:2026-08-01:eins', '2:2026-09-10:aaa', '3:2026-09-10:bbb', '4:2026-09-30:vier', '5:2026-10-01:fuenf', '6:2026-10-05:sieben', '7:2026-12-24:sechs-ende']);
  same('V9 the list shows the newest first: 07 on top', newestFirst(numbered).map((item) => formatNumber(item.number)), ['07', '06', '05', '04', '03', '02', '01']);
  same('V9 the order of the input does not matter', summary(numberPosts([...seven].reverse())), summary(numbered));
  same('V9 the input is not changed', seven[0], post('2026-10-05', 'sieben'));
  same('V9 two posts on one day are ordered by slug, and a dash sorts before a letter', summary(numberPosts([post('2026-01-01', 'ab'), post('2026-01-01', 'a-b'), post('2026-01-01', 'a1')])), ['1:2026-01-01:a-b', '2:2026-01-01:a1', '3:2026-01-01:ab']);
  same('V9 the same posts give the same numbers twice', summary(numberPosts(seven)), summary(numberPosts(seven)));

  // a newer post changes no existing number
  const newer = numberPosts([...seven, post('2027-01-02', 'neu')]);
  same('V9 adding a newer post changes no existing number', summary(newer).slice(0, 7), summary(numbered));
  same('V9 the new post has the next number', newer[7].number, 8);
  // an older post renumbers (OP-3): that is why PF-5 forbids it
  same('LI-3 inserting an older post renumbers all newer ones (the reason for PF-5)', numberPosts([...seven, post('2020-01-01', 'alt')]).find((item) => item.slug === 'eins').number, 2);

  // 105 posts
  const many = Array.from({ length: 105 }, (_, index) => post(`2026-${String(1 + Math.floor(index / 28)).padStart(2, '0')}-${String(1 + (index % 28)).padStart(2, '0')}`, `beitrag-${index}`));
  const all = numberPosts(many);
  same('V9 with 105 posts the numbers run 1 to 105', [all[0].number, all[98].number, all[99].number, all[104].number], [1, 99, 100, 105]);
  const shown = newestFirst(all).map((item) => formatNumber(item.number));
  same('V9 the list of 105 shows 105 first, then down to 100, 99 (two digits) and 01 last', [shown.slice(0, 7), shown[6], shown[104]], [['105', '104', '103', '102', '101', '100', '99'], '99', '01']);
  same('V9 two digits up to 99, then as many as needed', [1, 9, 10, 99, 100, 105, 1000].map(formatNumber), ['01', '09', '10', '99', '100', '105', '1000']);
  same('V9 no posts, no numbers', numberPosts([]), []);
});
