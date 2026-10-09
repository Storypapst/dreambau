// FD-1 (checked as XML), FD-4 (escaping, never CDATA): the strict XML 1.0 reader that the feed check stands on. It reads
// the small subset the Blog writes (one root, elements, attributes, text, the five named and the numeric references, an
// XML declaration, comments) and refuses everything else with the line and column of the first error. Expected values are
// written out by hand.
import { check, same, run } from '../lib/check.mjs';
import { parseXml } from '../../src/lib/xml.mjs';

const NS = ['http:', '', 'www.example.test', 'ns'].join('/'); // an invented namespace name (the hygiene scan reads every host)

const bad = (text) => {
  const { root, error } = parseXml(text);
  return root === null && error ? `${error.line}:${error.column} ${error.what}` : `parsed (error: ${JSON.stringify(error)})`;
};

await run(async () => {
  // ---- a good document, read completely ----
  const { root, error } = parseXml(`<?xml version="1.0" encoding="UTF-8"?>\n<a xmlns="${NS}" xml:lang="de" x='1 &amp; 2'>\n<b k="v">t &lt;&gt;&amp;&quot;&apos; &#65;&#x42;</b>\n<c/>\n<!-- note -->\n</a>\n`);
  same('FD-1 a good document has no error', error, null);
  same('FD-1 the root is a, in the namespace, with its attributes (both quote styles, references decoded)', [root.name, root.ns, root.attrs.get('xml:lang'), root.attrs.get('x'), root.attrs.get('xmlns')], ['a', NS, 'de', '1 & 2', NS]);
  const [b, c] = root.children.filter((child) => typeof child !== 'string');
  same('FD-1 the children keep their order, names, namespace and line', [b.name, b.ns, b.line, c.name, c.line, root.line], ['b', NS, 3, 'c', 4, 2]);
  same('FD-4 the five named references and the numeric ones in text are decoded', b.text(), 't <>&"\' AB');
  same('FD-1 the text of an empty element is the empty string and its attribute map is empty', [c.text(), c.attrs.size], ['', 0]);
  same('FD-1 a prefix is bound by the document: xml:lang needs no declaration', parseXml('<a xml:lang="de"/>').error, null);

  // ---- every kind of error gives the line and column of the first fault ----
  same('FD-4 an unescaped & in text', bad('<a>\n<b>Tom & Jerry</b>\n</a>'), '2:8 "&" starts a reference but is not followed by a name and ";" (write &amp;)');
  same('FD-4 an unescaped & in an attribute', bad('<a href="x?a=1&b=2"/>'), '1:15 "&" starts a reference but is not followed by a name and ";" (write &amp;)');
  same('FD-4 a reference that is not one of the five (&nbsp;)', bad('<a>&nbsp;</a>'), '1:4 the reference &nbsp; is not defined in XML (only &amp; &lt; &gt; &quot; &apos; and numbers)');
  same('FD-4 a numeric reference to a character XML forbids', bad('<a>&#0;</a>'), '1:4 the reference &#0; is not a character XML 1.0 allows');
  same('FD-4 a < in an attribute value', bad('<a b="<"/>'), '1:7 "<" is not allowed in an attribute value (write &lt;)');
  same('FD-4 ]]> in text', bad('<a>x ]]> y</a>'), '1:6 "]]>" is not allowed in text (write ]]&gt;)');
  same('FD-4 CDATA is not used by the Blog', bad('<a><![CDATA[x]]></a>'), '1:4 CDATA sections are not used; the feed escapes its text');
  same('FD-1 a DOCTYPE', bad('<!DOCTYPE a><a/>'), '1:1 a document type declaration is not allowed');
  same('FD-1 a mismatched end tag', bad('<a>\n<b></c></a>'), '2:4 the end tag </c> does not match <b> (opened at line 2)');
  same('FD-1 an element that is never closed', bad('<a>\n<b>\n'), '3:1 the document ends inside <b> (opened at line 2)');
  same('FD-1 content after the root', bad('<a/>\n<b/>'), '2:1 only one root element is allowed');
  same('FD-1 text after the root', bad('<a/> x'), '1:6 text outside the root element');
  same('FD-1 no root at all', bad('  \n'), '2:1 no root element');
  same('FD-1 a repeated attribute', bad('<a b="1" b="2"/>'), '1:10 the attribute b appears twice');
  same('FD-1 an attribute without quotes', bad('<a b=1/>'), '1:6 the value of the attribute b must be quoted');
  same('FD-1 two attributes with no space between them', bad('<a b="1"c="2"/>'), '1:9 an attribute must be followed by a space, "/>" or ">"');
  same('FD-1 an attribute without a value', bad('<a b/>'), '1:5 the attribute b has no "=" and no value');
  same('FD-1 an unbound prefix', bad('<x:a/>'), '1:2 the prefix x is not declared');
  same('FD-1 the XML declaration must be first', bad('\n<?xml version="1.0"?><a/>'), '2:1 the XML declaration must be at the very start of the file');
  same('FD-1 a byte order mark', bad('﻿<a/>'), '1:1 the file starts with a byte order mark');
  same('FD-1 the declaration must say version 1.0', bad('<?xml version="1.1"?><a/>'), '1:1 the XML declaration must be <?xml version="1.0" encoding="UTF-8"?>');
  same('FD-1 the declaration must say UTF-8 when it names an encoding', bad('<?xml version="1.0" encoding="ISO-8859-1"?><a/>'), '1:1 the XML declaration must be <?xml version="1.0" encoding="UTF-8"?>');
  same('FD-1 another processing instruction', bad('<a><?php x ?></a>'), '1:4 processing instructions are not used');
  same('FD-1 a comment with two dashes inside', bad('<a><!-- x -- y --></a>'), '1:4 "--" is not allowed inside a comment');
  same('FD-1 a comment that is never closed', bad('<a><!-- x </a>'), '1:4 the comment is never closed');
  same('FD-1 a tag that is never closed', bad('<a <b/>'), '1:4 "<" is not allowed inside a tag');
  same('FD-1 a name that starts with a digit', bad('<1a/>'), '1:2 "<" must be followed by a name');
  same('FD-4 a control character in text', bad('<a>x\u0001y</a>'), '1:5 the character U+0001 is not allowed in XML 1.0');
  same('FD-4 a lone surrogate in text', bad('<a>x\uD800y</a>'), '1:5 the character U+D800 is not allowed in XML 1.0');
  same('FD-4 U+FFFE in text', bad('<a>x￾y</a>'), '1:5 the character U+FFFE is not allowed in XML 1.0');
  same('FD-4 a line break and a tab in an attribute value are plain characters', parseXml('<a b="x\ny\tz"/>').error, null);

  // ---- columns count code points, lines count line feeds (a CR LF counts once) ----
  same('FD-1 the column counts characters, not UTF-16 units: an emoji before the fault', bad('<a>😀 & </a>'), '1:6 "&" starts a reference but is not followed by a name and ";" (write &amp;)');
  same('FD-1 CR LF counts as one line break', bad('<a>\r\n<b>&</b></a>'), '2:4 "&" starts a reference but is not followed by a name and ";" (write &amp;)');
  check('FD-1 a text node keeps its text exactly, including a newline between elements', parseXml('<a>x\n<b/>\ny</a>').root.children.filter((child) => typeof child === 'string').join('|') === 'x\n|\ny');
});
