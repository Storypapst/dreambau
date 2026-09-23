import { Marked, type Tokens } from "marked";

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;");

const safeHref = (href: string) => {
  try {
    const url = new URL(href, "https://dreambau.com");
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? href : null;
  } catch { return null; }
};

/**
 * Markdown that the whole team edits and everyone renders, so raw HTML is shown
 * as text and only http(s)/mailto links survive; images become plain links.
 */
const markdown = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html({ text }: Tokens.HTML | Tokens.Tag) { return escapeHtml(text); },
    link({ href, title, tokens }: Tokens.Link) {
      const label = this.parser.parseInline(tokens);
      const target = safeHref(href);
      if (!target) return label;
      return `<a href="${escapeHtml(target)}"${title ? ` title="${escapeHtml(title)}"` : ""} target="_blank" rel="noreferrer noopener">${label}</a>`;
    },
    image({ href, text }: Tokens.Image) {
      const target = safeHref(href);
      return target ? `<a href="${escapeHtml(target)}" target="_blank" rel="noreferrer noopener">${escapeHtml(text || target)}</a>` : escapeHtml(text);
    }
  }
});

export function renderMarkdown(source: string): string {
  return markdown.parse(source, { async: false });
}
