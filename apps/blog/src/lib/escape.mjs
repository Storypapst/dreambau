// Escaping for the three places a text from a post can go (spec 5.13 PR-5, 5.1 FD-4): element text, attribute value,
// XML (the feed). No Markdown and no HTML of a post is ever interpreted. Escaping never decides whether a text is
// acceptable; the file rules (PF-12) and the link rules (PF-7, PR-6) do.

const asText = (value) => (value === undefined || value === null ? '' : String(value));

// Element text: & < > (a quote is harmless there).
export function escapeText(value) {
  return asText(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Attribute value, double- or single-quoted: & < > " '.
export function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// The all-purpose escape: safe in element text and in an attribute.
export const esc = escapeAttribute;

// XML 1.0 (the Atom feed): & < > " ' as entities, never CDATA, so no sequence of characters in a text can break the
// file (a closing run of ]] cannot occur at all). A character that XML 1.0 forbids is an error, not silently dropped.
export function escapeXml(value) {
  const text = asText(value);
  for (const character of text) {
    const code = character.codePointAt(0);
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || (code >= 0xd800 && code <= 0xdfff) || code === 0xfffe || code === 0xffff) {
      throw new RangeError(`the character U+${code.toString(16).toUpperCase().padStart(4, '0')} is not allowed in XML 1.0`);
    }
  }
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
