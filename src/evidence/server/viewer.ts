import express from "express";
import { isPublicId } from "../ids.js";
import type { EvidenceFile, EvidenceRun } from "../model.js";
import { contentTypeForEntry } from "../processing.js";
import { objectKey, reportEntryKey, ObjectNotFoundError, type ObjectStore } from "../storage.js";
import type { EvidenceStore } from "../store.js";
import { escapeAttribute, escapeHtml, renderNotFound, renderPage } from "./html.js";

/**
 * The public surface. It reads nothing but published runs, sets no cookies and
 * hands out no bucket address: every byte is relayed from storage by key.
 */

const environmentLabels: Record<EvidenceRun["environment"], string> = {
  local: "Local",
  "pre-dev": "Pre-Dev",
  dev: "Dev",
  "production-test": "Production test"
};

const sourceLabels: Record<EvidenceRun["source"], string> = {
  codex: "Codex",
  claude: "Claude",
  kio: "Kio",
  "github-actions": "GitHub Actions",
  obs: "OBS",
  cap: "Cap",
  manual: "Manual"
};

/** No scripts at all on the run page; it is static markup and one stylesheet. */
const viewerCsp = [
  "default-src 'none'",
  "img-src 'self'",
  "media-src 'self'",
  "style-src 'unsafe-inline'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join("; ");

/**
 * Playwright reports are self-contained applications, so they need their own
 * scripts and styles. They stay pinned to this origin and may not reach out.
 */
const reportCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join("; ");

function applyPublicHeaders(res: express.Response, csp: string): void {
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
}

/**
 * Links are relative on purpose. The page is served from the same host as the
 * files, so a relative link stays correct whatever the configured public base
 * URL says — including behind a port-forward during verification.
 */
function assetPath(run: EvidenceRun, file: EvidenceFile, name: string): string {
  return `/e/${run.publicId}/${file.id}/${encodeURIComponent(name)}`;
}

function fileCard(run: EvidenceRun, file: EvidenceFile, posterUrl: string | null): string {
  const heading = escapeHtml(file.caption || file.filename);
  const url = escapeAttribute(assetPath(run, file, file.filename));
  const parts = [`<section class="card">`, `<h2>${heading}</h2>`];

  if (!file.publicUrl) {
    parts.push(`<p class="empty">This file is not publicly reachable.</p>`);
  } else if (file.kind === "screenshot") {
    parts.push(`<img src="${url}" alt="${heading}" loading="lazy">`);
  } else if (file.kind === "video") {
    const poster = posterUrl ? ` poster="${escapeAttribute(posterUrl)}"` : "";
    parts.push(
      `<video controls preload="metadata"${poster}>`,
      `<source src="${url}" type="${escapeAttribute(file.contentType)}">`,
      `</video>`
    );
  } else if (file.kind === "playwright-report") {
    const report = escapeAttribute(`/reports/${run.publicId}/${file.id}/index.html`);
    parts.push(`<p class="actions"><a href="${report}">Open the Playwright report</a></p>`);
  }

  if (file.publicUrl && file.kind !== "screenshot") {
    parts.push(`<p class="actions"><a href="${url}" download>Download ${escapeHtml(file.filename)}</a></p>`);
  }
  if (file.caption && file.caption !== file.filename) {
    parts.push(`<p class="caption">${escapeHtml(file.filename)}</p>`);
  }
  if (file.primaryActor) {
    const actor = file.primaryActor;
    parts.push(
      `<p class="actor">Test user: <code>${escapeHtml(actor.username)}</code> `
      + `(<code>${escapeHtml(actor.syntheticEmail)}</code>) — ${escapeHtml(actor.role)}</p>`
    );
  }
  parts.push(`</section>`);
  return parts.join("\n");
}

function runPage(run: EvidenceRun, files: EvidenceFile[], posterFor: (file: EvidenceFile) => string | null): string {
  const repositoryUrl = `https://github.com/${run.repository}`;
  const meta = [
    `<span class="result result-${escapeAttribute(run.result)}">${escapeHtml(run.result)}</span>`,
    `<span>${escapeHtml(environmentLabels[run.environment])}</span>`,
    `<span><code>${escapeHtml(run.commitSha.slice(0, 7))}</code></span>`,
    `<span>${escapeHtml(sourceLabels[run.source])}</span>`,
    `<span><a href="${escapeAttribute(repositoryUrl)}">${escapeHtml(run.repository)}</a></span>`
  ];
  if (run.pullRequestUrl) {
    meta.push(`<span><a href="${escapeAttribute(run.pullRequestUrl)}">#${run.pullRequestNumber}</a></span>`);
  }

  const body = [
    `<h1>${escapeHtml(run.title)}</h1>`,
    `<div class="meta">${meta.join("\n")}</div>`,
    files.length === 0
      ? `<p class="empty">This run has no evidence files.</p>`
      : files.map((file) => fileCard(run, file, posterFor(file))).join("\n"),
    `<footer>Published ${escapeHtml(run.publishedAt ?? run.createdAt)}. `
    + `Anyone with this link can read it, so it holds synthetic test data only.</footer>`
  ];
  return renderPage({ title: run.title, body: body.join("\n") });
}

export interface ViewerOptions {
  store: EvidenceStore;
  objectStore: ObjectStore;
}

export function createEvidenceViewer(options: ViewerOptions) {
  const router = express.Router();

  /** Resolves a public id to a run only while that run is actually published. */
  const publishedRun = (value: string): EvidenceRun | null => {
    if (!isPublicId(value)) return null;
    const run = options.store.getRunByPublicId(value);
    return run && run.state === "published" ? run : null;
  };

  const notFoundPage = (res: express.Response) => {
    applyPublicHeaders(res, viewerCsp);
    res.status(404).type("text/html; charset=utf-8").send(renderNotFound());
  };

  const notFoundAsset = (res: express.Response) => {
    applyPublicHeaders(res, viewerCsp);
    res.status(404).type("text/plain; charset=utf-8").send("not found\n");
  };

  router.get("/r/:publicId", (req, res) => {
    const run = publishedRun(String(req.params.publicId));
    if (!run) return notFoundPage(res);
    const files = options.store.listFiles(run.id).filter((file) => file.processingState === "ready");
    const posterFor = (file: EvidenceFile) =>
      file.kind === "video" ? `/e/${run.publicId}/${file.id}/poster.jpg` : null;
    applyPublicHeaders(res, viewerCsp);
    // The run page may gain files or change state, so it must not be pinned.
    res.setHeader("Cache-Control", "no-cache");
    return res.type("text/html; charset=utf-8").send(runPage(run, files, posterFor));
  });

  /**
   * Streams one stored object. Range requests are answered so a browser can
   * scrub a video without downloading it whole.
   */
  async function sendObject(
    res: express.Response,
    rangeHeader: string | undefined,
    key: string,
    contentType: string,
    filename: string | null
  ) {
    const head = await options.objectStore.head(key);
    if (!head) return notFoundAsset(res);

    applyPublicHeaders(res, viewerCsp);
    // Stored objects are immutable, so a cached copy can never go stale.
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", contentType);
    if (filename) {
      res.setHeader("Content-Disposition", `inline; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`);
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader ?? "");
    if (match && (match[1] !== "" || match[2] !== "")) {
      const total = head.byteSize;
      let start = match[1] === "" ? total - Number(match[2]) : Number(match[1]);
      let end = match[1] === "" || match[2] === "" ? total - 1 : Number(match[2]);
      start = Math.max(0, start);
      end = Math.min(total - 1, end);
      if (start > end) {
        res.setHeader("Content-Range", `bytes */${total}`);
        return res.status(416).end();
      }
      const body = await options.objectStore.getRange(key, start, end - start + 1);
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
      res.setHeader("Content-Length", String(body.length));
      return res.end(body);
    }

    const body = await options.objectStore.get(key);
    res.setHeader("Content-Length", String(body.length));
    return res.end(body);
  }

  router.get("/e/:publicId/:fileId/:filename", async (req, res, next) => {
    const run = publishedRun(String(req.params.publicId));
    if (!run) return notFoundAsset(res);
    const file = options.store.getFile(String(req.params.fileId));
    if (!file || file.runId !== run.id || file.processingState !== "ready") return notFoundAsset(res);

    const requested = String(req.params.filename);
    try {
      if (requested === "poster.jpg" && file.kind === "video") {
        return await sendObject(res, req.header("range"), objectKey(run.id, file.id, "poster"), "image/jpeg", null);
      }
      // The filename in the path has to be the real one, so a link cannot be
      // dressed up as a different kind of file than it is.
      if (requested !== file.filename) return notFoundAsset(res);
      const key = options.store.servedKeyFor(file.id);
      if (!key) return notFoundAsset(res);
      return await sendObject(res, req.header("range"), key, file.contentType, file.filename);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return notFoundAsset(res);
      return next(error);
    }
  });

  router.get("/reports/:publicId/:fileId/{*entry}", async (req, res, next) => {
    const run = publishedRun(String(req.params.publicId));
    if (!run) return notFoundAsset(res);
    const file = options.store.getFile(String(req.params.fileId));
    if (!file || file.runId !== run.id || file.kind !== "playwright-report" || file.processingState !== "ready") {
      return notFoundAsset(res);
    }
    const segments = ([] as string[]).concat((req.params as Record<string, string[] | string>).entry ?? []);
    const entry = (Array.isArray(segments) ? segments.join("/") : String(segments)) || "index.html";
    if (entry.split("/").some((segment) => segment === ".." || segment === "." || segment === "")) {
      return notFoundAsset(res);
    }
    try {
      const body = await options.objectStore.get(reportEntryKey(run.id, file.id, entry));
      applyPublicHeaders(res, reportCsp);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.type(contentTypeForEntry(entry)).end(body);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return notFoundAsset(res);
      return next(error);
    }
  });

  return router;
}
