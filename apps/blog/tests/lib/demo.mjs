// What the checks know about the seven demo posts of tests/fixtures/, typed by hand from the files (newest first, as the
// list shows them). The numbers are the rank from the oldest (LI-3). `first` is read from the file by firstParagraph().
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES } from './paths.mjs';

export const DEMO = [
  { n: '07', date: '2026-10-02', slug: 'ein-film-der-in-eine-mail-passt', title: 'Ein Film, der in eine Mail passt', source: true, en: false, quote: true, image: false },
  { n: '06', date: '2026-09-24', slug: 'warum-bei-uns-der-text-zuerst-kommt', title: 'Warum bei uns der Text zuerst kommt', source: true, en: false, quote: true, image: true },
  { n: '05', date: '2026-09-17', slug: 'ein-werkzeug-das-zeichen-zaehlt', title: 'Ein Werkzeug, das Zeichen zählt', source: true, en: false, quote: false, image: false },
  { n: '04', date: '2026-09-09', slug: 'notiz-aus-der-werkstatt', title: 'Notiz aus der Werkstatt', source: false, en: false, quote: false, image: false },
  { n: '03', date: '2026-08-28', slug: 'small-is-a-habit', title: 'Small is a habit', source: true, en: true, quote: false, image: false },
  { n: '02', date: '2026-08-12', slug: 'kurzer-film-lange-nachgedacht', title: 'Kurzer Film, lange nachgedacht', source: true, en: false, quote: true, image: false },
  { n: '01', date: '2026-07-30', slug: 'warum-hier-niemand-mitzaehlt', title: 'Warum hier niemand mitzählt', source: false, en: false, quote: true, image: false },
];

export const addressOfDemo = (post) => `2026/${post.slug}`;

// The text of a fixture file after the front matter, as paragraphs.
export function paragraphsOf(post) {
  const text = fs.readFileSync(path.join(FIXTURES, '2026', `${post.slug}.md`), 'utf8');
  const body = text.slice(text.indexOf('\n---\n', 4) + 5).replace(/^\n+/, '').replace(/\n+$/, '');
  return body.split('\n\n');
}
export const firstParagraph = (post) => paragraphsOf(post)[0];
export const points = (text) => [...text].length;
