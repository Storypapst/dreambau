import { promises as fs } from "node:fs";
import path from "node:path";
import express from "express";
import { marked } from "marked";

const CONTENT_TYPES: Record<string, string> = {
  ".txt": "text/plain; charset=utf-8",
  ".yaml": "text/plain; charset=utf-8",
  ".yml": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".canvas": "application/json; charset=utf-8"
};

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const page = (title: string, body: string) => `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light dark; }
body { margin: 0 auto; max-width: 48rem; padding: 2rem 1.25rem 4rem; font: 16px/1.6 -apple-system, "Segoe UI", sans-serif; }
a { color: #2563eb; text-decoration: none; } a:hover { text-decoration: underline; }
nav { font-size: 0.875rem; margin-bottom: 1.5rem; opacity: 0.8; }
ul.listing { list-style: none; padding: 0; } ul.listing li { padding: 0.2rem 0; }
pre { overflow-x: auto; padding: 0.75rem; border-radius: 6px; background: rgba(127,127,127,0.12); }
code { font-size: 0.9em; }
table { border-collapse: collapse; } th, td { border: 1px solid rgba(127,127,127,0.4); padding: 0.3rem 0.6rem; }
blockquote { margin: 0; padding-left: 1rem; border-left: 3px solid rgba(127,127,127,0.4); opacity: 0.9; }
img { max-width: 100%; }
</style>
</head>
<body>${body}</body>
</html>`;

const breadcrumb = (baseUrl: string, relative: string) => {
  const segments = relative.split("/").filter(Boolean);
  const links = [`<a href="${baseUrl}/">Docs</a>`];
  segments.forEach((segment, index) => {
    const href = `${baseUrl}/${segments.slice(0, index + 1).map(encodeURIComponent).join("/")}`;
    links.push(index === segments.length - 1 ? escapeHtml(segment) : `<a href="${href}">${escapeHtml(segment)}</a>`);
  });
  return `<nav>${links.join(" / ")}</nav>`;
};

export function createDocsMirrorRouter(docsDir: string) {
  const root = path.resolve(docsDir);
  const router = express.Router();
  router.get(["/", "/*splat"], async (req, res, next) => {
    try {
      const relative = decodeURIComponent(req.path).replace(/\/+$/, "");
      const target = path.resolve(root, `.${relative}`);
      if (target !== root && !target.startsWith(`${root}${path.sep}`)) return res.status(404).json({ error: "not_found" });
      let stats;
      try { stats = await fs.stat(target); } catch { return res.status(404).json({ error: "not_found" }); }
      res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'");
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (stats.isDirectory()) {
        const entries = (await fs.readdir(target, { withFileTypes: true }))
          .filter((entry) => !entry.name.startsWith("."))
          .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, "de"));
        const items = entries.map((entry) => {
          const href = `${req.baseUrl}${relative}/${encodeURIComponent(entry.name)}`;
          return `<li>${entry.isDirectory() ? "📁" : "📄"} <a href="${href}">${escapeHtml(entry.name)}</a></li>`;
        });
        return res.type("html").send(page(relative || "Docs", `${breadcrumb(req.baseUrl, relative)}<ul class="listing">${items.join("") || "<li>Leer</li>"}</ul>`));
      }
      const extension = path.extname(target).toLowerCase();
      if (extension === ".md") {
        const rendered = await marked.parse(await fs.readFile(target, "utf8"));
        return res.type("html").send(page(path.basename(target), `${breadcrumb(req.baseUrl, relative)}<main>${rendered}</main>`));
      }
      const contentType = CONTENT_TYPES[extension];
      if (!contentType) return res.status(404).json({ error: "not_found" });
      res.setHeader("Content-Type", contentType);
      return res.send(await fs.readFile(target, "utf8"));
    } catch (error) {
      next(error);
    }
  });
  return router;
}
