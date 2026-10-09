// PR-5: escaping for element text, attribute and XML, with hostile input. The expected strings are written out by hand;
// the round-trip check uses a decoder of its own that knows only the entities named in the spec of HTML and XML.
import { check, same, run } from '../lib/check.mjs';
import { esc, escapeAttribute, escapeText, escapeXml } from '../../src/lib/escape.mjs';

const HOSTILE = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=1>',
  "' onmouseover='alert(1)",
  '&amp; &lt; &#60; &quot;',
  'a & b < c > d "e" \'f\'',
  ']]>',
  '</title><script>',
  '<!-- comment -->',
  'javascript:alert(1)',
  '`backtick` ${template}',
  '‮⁦mixed direction',
  '',
  'Größe ä 😀',
];

const decode = (text) => text.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" })[name]);

await run(async () => {
  same('PR-5 element text: < > & are escaped, quotes stay', escapeText('<script>alert(1)</script> & "x" \'y\''), '&lt;script&gt;alert(1)&lt;/script&gt; &amp; "x" \'y\'');
  same('PR-5 attribute: < > & " \' are escaped', escapeAttribute('"><img src=x onerror=1> & \''), '&quot;&gt;&lt;img src=x onerror=1&gt; &amp; &#39;');
  same('PR-5 XML: < > & " \' are escaped, ]]> cannot occur', escapeXml('a & <b> "c" \'d\' ]]>'), 'a &amp; &lt;b&gt; &quot;c&quot; &apos;d&apos; ]]&gt;');
  same('PR-5 an entity typed by the author is escaped, never decoded', [escapeText('&amp;'), escapeAttribute('&lt;'), escapeXml('&#60;')], ['&amp;amp;', '&amp;lt;', '&amp;#60;']);
  same('PR-5 a javascript: address is only text for the escaper (the link rules decide, PR-6)', escapeAttribute('javascript:alert(1)'), 'javascript:alert(1)');
  same('PR-5 esc is the all-purpose escape (safe in an attribute and in text)', esc('"<&>\''), escapeAttribute('"<&>\''));
  same('PR-5 nothing and nothing-like become the empty string, not the word null', [escapeText(undefined), escapeAttribute(null), escapeXml(undefined)], ['', '', '']);
  same('PR-5 a number is written as a number', escapeText(42), '42');

  for (const [name, escape, forbidden] of [['text', escapeText, /[<>]/], ['attribute', escapeAttribute, /[<>"']/], ['xml', escapeXml, /[<>"']/]]) {
    for (const input of HOSTILE) {
      const out = escape(input);
      check(`PR-5 ${name}: ${JSON.stringify(input).slice(0, 40)} leaves no raw markup character`, !forbidden.test(out), out);
      check(`PR-5 ${name}: ${JSON.stringify(input).slice(0, 40)} has only known entities after each &`, [...out.matchAll(/&([^;\s]*;?)/g)].every((match) => /^(amp|lt|gt|quot|apos|#39);$/.test(match[1])), out);
      same(`PR-5 ${name}: ${JSON.stringify(input).slice(0, 40)} decodes back to the input exactly`, decode(out), input);
    }
  }
  check('PR-5 XML: the three characters XML allows below space (tab, line feed, carriage return) pass', escapeXml('a\tb\nc\rd') === 'a\tb\nc\rd');
  for (const [name, bad] of [['U+0001', '\u0001'], ['U+0008', '\u0008'], ['U+FFFE', '￾'], ['U+FFFF', '￿'], ['a lone surrogate', '\ud800']]) {
    let message = '';
    try { escapeXml(`x${bad}y`); } catch (error) { message = error.message; }
    check(`FD-4 XML: ${name} cannot be written, the escaper refuses it`, /XML 1\.0/.test(message), message || 'no error');
  }
  check('FD-4 XML: an emoji (a surrogate pair) is fine', escapeXml('😀') === '😀');
});
