// C6 (X1, X2, X4, X12): the static scan of the page files. In site/* there is no <style> element, no style=
// attribute, no <script> with a body, no eval(, new Function or document.write, and no http: or https: address.
// The scan first proves itself on made-up files: every forbidden thing must be flagged, and the allowed look-alikes
// (a script element that only points to a file, the bare protocol name, a variable called style) must not be.
// Reading of "address": http: or https: followed by a slash, a letter or a digit; a quoted protocol name such as
// 'https:' in a comparison is not an address.
// The strings below are text samples for the scan. They are only read by the scan; nothing in this file runs them.
import { check, same, run } from '../lib/check.mjs';
import { PAGE_RULES, pageProblems, siteFiles } from '../lib/scans.mjs';

const MUST_FLAG = [
  ['style-element', 'index.html', '<p>x</p><style>p { color: red }</style>'],
  ['style-attribute', 'index.html', '<p style="color: red">x</p>'],
  ['style-attribute', 'index.html', '<p STYLE = "color: red">x</p>'],
  ['style-attribute', 'teamwork.js', 'element.style="color: red";'],
  ['script-body', 'index.html', '<script>alert(1)</script>'],
  ['script-body', 'index.html', '<script type="module">\n  boot();\n</script>'],
  ['eval', 'teamwork.js', 'const v = eval("1 + 1");'],
  ['eval', 'teamwork.js', 'window.eval ("1 + 1");'],
  ['new-function', 'teamwork.js', 'const f = new Function("return 1");'],
  ['document-write', 'teamwork.js', 'document.write("<p>x</p>");'],
  ['address', 'teamwork.js', 'fetch("https://a.example.test/x");'],
  ['address', 'teamwork.js', "const a = 'http://127.0.0.1/';"],
  ['address', 'teamwork.css', 'a { background: url(HTTPS://a.example.test/i.png) }'],
];

const MUST_PASS = [
  ['a script element that only points to a file', 'index.html', '<script type="module" src="teamwork.js"></script>'],
  ['a script element whose body is only white space', 'index.html', '<script type="module" src="teamwork.js">\n</script>'],
  ['the bare protocol name in a comparison', 'teamwork.js', "if (new URL(a).protocol === 'https:') { ok = true; }"],
  ['a variable called style', 'teamwork.js', 'const style = getComputedStyle(element); style.color;'],
  ['the canvas properties fillStyle and strokeStyle in compact code', 'teamwork.js', 'context.fillStyle="#fff"; context.strokeStyle="#000";'],
  ['a function called evaluate and a word that ends in eval', 'teamwork.js', 'function evaluate(x) { return x; } evaluate(retrieval(1));'],
  ['the e-mail address of the notice', 'index.html', '<a href="mailto:info@dreambau.com">info@dreambau.com</a>'],
  ['the word style in text and the style sheet link', 'index.html', '<link rel="stylesheet" href="teamwork.css"><p>Stil und style</p>'],
];

await run(async () => {
  for (const [rule, name, text] of MUST_FLAG) {
    const flagged = pageProblems([{ name, text, binary: false }]).map((problem) => problem.rule);
    check(`C6 the scan flags rule ${rule} in ${name}: ${JSON.stringify(text).slice(0, 48)}`, flagged.includes(rule), `flagged ${JSON.stringify(flagged)}`);
  }
  for (const [what, name, text] of MUST_PASS) {
    same(`C6 the scan lets pass ${what}`, pageProblems([{ name, text, binary: false }]), []);
  }

  const files = siteFiles();
  check('C6 there are page files to scan in site/', files.length > 0, `${files.length} files`);
  const problems = pageProblems(files);
  for (const rule of PAGE_RULES) {
    same(`C6 X1 X2 X4 X12 site/* has ${rule.label}`, problems.filter((problem) => problem.rule === rule.id), []);
  }
});
