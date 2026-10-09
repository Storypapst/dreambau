// Short texts cut from a post (spec 5.5 LI-4, 5.6 PO-1): the preview of the list and the description of a post page.
// The limits count Unicode code points, never UTF-16 code units, and a cut falls between words.
import { LIMITS } from './post-rules.mjs';

export const DESCRIPTION_LIMIT = 160; // PO-1

// The longest start of `text` that is at most `limit` code points and ends after a whole word; a text without a space in
// its first `limit` code points is cut at exactly `limit`. A comma, semicolon, colon or space at the end of the cut is
// dropped, so that an ellipsis follows a word. Returns { text, cut }.
export function cutAtWord(text, limit) {
  const points = [...text];
  if (points.length <= limit) return { text, cut: false };
  let end = limit;
  if (!/\s/u.test(points[limit])) {
    let space = -1;
    for (let index = limit - 1; index > 0; index -= 1) if (/\s/u.test(points[index])) { space = index; break; }
    if (space > 0) end = space;
  }
  const head = points.slice(0, end).join('').replace(/[\s,;:]+$/u, '');
  return { text: head, cut: true };
}

// LI-4: the first paragraph, cut at 200 code points at a word boundary, "…" when it was cut.
export function previewOf(paragraph, limit = LIMITS.preview) {
  const { text, cut } = cutAtWord(paragraph, limit);
  return cut ? `${text}…` : text;
}

// PO-1: the first 160 code points of the body at a word boundary; the paragraphs are joined by one space; no ellipsis.
export function descriptionOf(paragraphs, limit = DESCRIPTION_LIMIT) {
  return cutAtWord(paragraphs.join(' '), limit).text;
}
