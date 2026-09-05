import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import express from "express";
import { createMachineAuthMiddleware, type MachineIdentitySource } from "./machine-auth.js";
import type { MachineIdentity } from "./machine-access.js";

/**
 * Understand-Kit subscription endpoint (concept step 7.3).
 *
 * Mounted top-level at /understand/api/v1 — not under /testmails, because the
 * kit is its own product surface, not part of the test-mail dashboard.
 *
 * Authentication is the Test-Access machine-token mechanism, unchanged: a
 * valid, unexpired, unrevoked bearer token may read. There is deliberately no
 * new scope field — the kit is the same working material every developer and
 * agent session already has, and a token that can reach the Test-Access API is
 * by definition a token Frank issued to a person or machine on the team.
 *
 * Two endpoints, matching the subscription contract in understand-kit/README.md:
 *   GET /kit/manifest → manifest.json (version, date, changelog, sha256 per file)
 *   GET /kit/bundle   → dist/understand-kit-<manifest version>.tar.gz
 *
 * The bundle's ETag is the sha256 of the archive, so a client that already has
 * the current bundle gets a 304 instead of a download. `dist/` is a build
 * artefact and gitignored; when it is missing the endpoint says so with 503
 * rather than pretending the kit does not exist.
 */

export const DEFAULT_KIT_DIR_NAME = "understand-kit";

interface ManifestShape {
  version?: unknown;
  name?: unknown;
}

const archiveDigests = new Map<string, string>();

async function archiveDigest(filePath: string, mtimeMs: number, size: number) {
  const key = `${filePath}:${mtimeMs}:${size}`;
  const cached = archiveDigests.get(key);
  if (cached) return { digest: cached, body: await fs.readFile(filePath) };
  const body = await fs.readFile(filePath);
  const digest = createHash("sha256").update(body).digest("hex");
  archiveDigests.set(key, digest);
  return { digest, body };
}

/** `If-None-Match: "abc", W/"def"` → does any entity tag match ours? */
function etagMatches(header: string | undefined, etag: string) {
  if (!header) return false;
  if (header.trim() === "*") return true;
  return header
    .split(",")
    .map((value) => value.trim().replace(/^W\//, ""))
    .includes(etag);
}

export function createUnderstandKitRouter(options: {
  kitDir: string;
  identities: MachineIdentitySource;
  onAuthenticated?: (identity: MachineIdentity) => void;
  now?: () => Date;
}) {
  const router = express.Router();

  router.use(createMachineAuthMiddleware({
    identities: options.identities,
    onAuthenticated: options.onAuthenticated,
    now: options.now
  }));

  const manifestPath = path.join(options.kitDir, "manifest.json");

  const readManifest = async (): Promise<{ raw: string; parsed: ManifestShape } | null> => {
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      return { raw, parsed: JSON.parse(raw) as ManifestShape };
    } catch {
      return null;
    }
  };

  router.get("/kit/manifest", async (_req, res) => {
    const manifest = await readManifest();
    if (!manifest) {
      return res.status(503).json({ error: "kit_unavailable", message: "kit manifest not found" });
    }
    res.set("Cache-Control", "no-store");
    res.type("application/json; charset=utf-8").send(manifest.raw);
  });

  router.get("/kit/bundle", async (req, res, next) => {
    const manifest = await readManifest();
    if (!manifest) {
      return res.status(503).json({ error: "kit_unavailable", message: "kit manifest not found" });
    }
    const version = typeof manifest.parsed.version === "string" ? manifest.parsed.version : "";
    if (!version) {
      return res.status(503).json({ error: "bundle_not_built", message: "bundle not built: manifest has no version" });
    }

    const filename = `understand-kit-${version}.tar.gz`;
    const archivePath = path.join(options.kitDir, "dist", filename);
    let stats;
    try {
      stats = await fs.stat(archivePath);
    } catch {
      return res.status(503).json({
        error: "bundle_not_built",
        message: `bundle not built: ${filename} is missing — run understand-kit/build-bundle.sh`
      });
    }
    if (!stats.isFile()) {
      return res.status(503).json({ error: "bundle_not_built", message: `bundle not built: ${filename} is not a file` });
    }

    try {
      const { digest, body } = await archiveDigest(archivePath, stats.mtimeMs, stats.size);
      const etag = `"${digest}"`;
      res.set("ETag", etag);
      res.set("Cache-Control", "no-store");
      res.set("X-Kit-Version", version);
      if (etagMatches(req.header("if-none-match"), etag)) return res.status(304).end();
      res.set("Content-Type", "application/gzip");
      res.set("Content-Disposition", `attachment; filename="${filename}"`);
      res.set("Content-Length", String(body.byteLength));
      res.send(body);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
