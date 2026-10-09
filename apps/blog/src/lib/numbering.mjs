// Order and numbers of the posts (spec 5.2 PF-15, 5.5 LI-3). The order is by (date, slug), the oldest first; the number
// of a post is its rank counted from the oldest, so 01 is the oldest post and the list, which shows the newest first,
// counts down. The number is a pure function of the files: the build derives it and no file stores it. Strings are
// compared by code unit, so in a slug a dash sorts before a digit and a digit before a letter.
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Returns copies of the posts, oldest first, each with `number` (1, 2, 3, ...).
export function numberPosts(posts) {
  return [...posts].sort((a, b) => compare(a.date, b.date) || compare(a.slug, b.slug)).map((post, index) => ({ ...post, number: index + 1 }));
}

export const newestFirst = (numbered) => [...numbered].reverse();

// Two digits up to 99, then as many as needed.
export const formatNumber = (number) => String(number).padStart(2, '0');
