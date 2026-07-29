/**
 * Minimal HTML rendering for the public viewer. Every value that reaches a page
 * is author-supplied — captions, filenames, repository names — so escaping is
 * not optional and there is no template engine to get it wrong.
 */

const entities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

/** Escapes a value for use inside an attribute that holds a URL we built. */
export function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

const styles = `
:root { color-scheme: light dark; --fg: #16181d; --muted: #5c6370; --bg: #fbfbfc; --card: #fff; --line: #e3e5ea; --pass: #1f7a44; --fail: #a3232b; --warn: #8a6100; }
@media (prefers-color-scheme: dark) { :root { --fg: #e7e9ee; --muted: #a0a6b4; --bg: #14161a; --card: #1c1f25; --line: #2c313a; --pass: #6ad39a; --fail: #f2868d; --warn: #e0b667; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 1.5rem 1rem 4rem; background: var(--bg); color: var(--fg); font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
main { max-width: 52rem; margin: 0 auto; }
h1 { font-size: 1.5rem; margin: 0 0 .35rem; line-height: 1.25; }
h2 { font-size: 1.05rem; margin: 0 0 .5rem; }
a { color: inherit; }
.meta { display: flex; flex-wrap: wrap; gap: .4rem .75rem; align-items: center; color: var(--muted); font-size: .875rem; margin-bottom: 1.5rem; }
.result { font-weight: 600; letter-spacing: .02em; }
.result-PASS { color: var(--pass); } .result-FAIL, .result-BLOCKED { color: var(--fail); } .result-FLAKY { color: var(--warn); }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em; background: var(--card); border: 1px solid var(--line); border-radius: .25rem; padding: .05rem .3rem; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: .6rem; padding: 1rem; margin-bottom: 1rem; }
.card img, .card video { display: block; width: 100%; height: auto; border-radius: .35rem; background: #000; }
.caption { color: var(--muted); font-size: .875rem; margin: .6rem 0 0; }
.actor { color: var(--muted); font-size: .8rem; margin: .35rem 0 0; }
.actions { margin-top: .75rem; font-size: .9rem; }
.empty { color: var(--muted); }
footer { color: var(--muted); font-size: .8rem; margin-top: 2rem; border-top: 1px solid var(--line); padding-top: 1rem; }
`.trim();

export interface PageOptions {
  title: string;
  body: string;
}

export function renderPage({ title, body }: PageOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>${styles}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

/**
 * The same page for an unknown identifier and for a run that exists but is not
 * published, so the response cannot be used to tell the two apart.
 */
export function renderNotFound(): string {
  return renderPage({
    title: "Not found",
    body: `<h1>Not found</h1>\n<p class="empty">This evidence link is not valid, or the run it pointed at is no longer published.</p>`
  });
}
