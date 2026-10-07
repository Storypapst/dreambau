// C7 (Q1): the whole page is at most 102,400 bytes. This is `wc -c site/*` of the ticket, added up in code over
// every file of site/ (folders included, so that a nested folder cannot hide bytes).
import { check, run } from '../lib/check.mjs';
import { siteFiles } from '../lib/scans.mjs';

const LIMIT = 102400;
const PAGE_FILES = ['index.html', 'teamwork.css', 'teamwork.js'];

await run(async () => {
  const files = siteFiles();
  const names = files.map((file) => file.name);
  check('C7 Q1 site/ holds the page files index.html, teamwork.css and teamwork.js', PAGE_FILES.every((name) => names.includes(name)), `found: ${names.join(', ') || 'nothing'}`);
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  check('C7 Q1 site/* is at most 102,400 bytes', files.length > 0 && total <= LIMIT, `${total} bytes in ${files.length} files`);
});
