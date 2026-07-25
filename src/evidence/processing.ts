import { createHash } from "node:crypto";
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import type { EvidenceFile } from "./model.js";
import { stripImageMetadata, type OcrScanner, type StrippableImageFormat, type VideoProcessor } from "./media.js";
import { isScannableContentType, scanTextForSecrets, type SecretFinding } from "./secret-scan.js";
import { detectFormat, type EvidenceFormat } from "./security.js";
import { objectKey, reportEntryKey, type ObjectStore } from "./storage.js";
import type { EvidenceStore, StoredFinding } from "./store.js";
import { readZip, ZipError } from "./zip.js";

/**
 * Everything a file has to survive before it can be reachable. A rejection here
 * quarantines the run: the plan allows no partial publication and no redaction
 * on the fly.
 */

const scanWindowBytes = 8 * 1024 * 1024;
/** Overlap must exceed the longest line the scanner will consider. */
const scanOverlapBytes = 16 * 1024;
const maxArchiveInspectionBytes = 256 * 1024 * 1024;
const maxImageProcessingBytes = 64 * 1024 * 1024;
/** Window used when copying or hashing an object without buffering it whole. */
const transferWindowBytes = 8 * 1024 * 1024;

export interface ProcessingResult {
  fileId: string;
  state: "ready" | "rejected";
  findings: StoredFinding[];
}

export interface Workspace {
  /** Provides a private directory that is removed once `use` settles. */
  withDirectory<T>(use: (directory: string) => Promise<T>): Promise<T>;
}

export const temporaryWorkspace: Workspace = {
  async withDirectory(use) {
    const directory = await mkdtemp(join(tmpdir(), "evidence-"));
    try {
      return await use(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
};

export interface ProcessorOptions {
  store: EvidenceStore;
  objectStore: ObjectStore;
  video?: VideoProcessor;
  ocr?: OcrScanner;
  workspace?: Workspace;
  now?: () => Date;
}

export interface Processor {
  processFile(fileId: string): Promise<ProcessingResult>;
  processRun(runId: string): Promise<ProcessingResult[]>;
}

const imageFormats: StrippableImageFormat[] = ["png", "jpeg", "webp"];
const isImageFormat = (format: EvidenceFormat | null): format is StrippableImageFormat =>
  format !== null && (imageFormats as string[]).includes(format);

export function createProcessor(options: ProcessorOptions): Processor {
  const { store, objectStore } = options;
  const workspace = options.workspace ?? temporaryWorkspace;
  const now = options.now ?? (() => new Date());

  const finding = (file: EvidenceFile, rule: string, location = ""): StoredFinding =>
    ({ runId: file.runId, fileId: file.id, rule, location });

  const toStoredFindings = (file: EvidenceFile, secrets: SecretFinding[]): StoredFinding[] =>
    secrets.map((secret) => finding(
      file,
      `secret:${secret.rule}`,
      secret.entry ? `${secret.entry}:${secret.line}` : `line ${secret.line}`
    ));

  /** Hashes a stored object in windows, so the digest never needs it in memory. */
  async function digestOf(key: string, byteSize: number): Promise<string> {
    const hash = createHash("sha256");
    for (let offset = 0; offset < byteSize; offset += transferWindowBytes) {
      const chunk = await objectStore.getRange(key, offset, transferWindowBytes);
      if (chunk.length === 0) break;
      hash.update(chunk);
    }
    return hash.digest("hex");
  }

  /** Scans a stored object in overlapping windows so a 400 MiB trace stays affordable. */
  async function scanStoredText(file: EvidenceFile, key: string): Promise<StoredFinding[]> {
    const head = await objectStore.head(key);
    const total = head?.byteSize ?? file.byteSize;
    const collected: SecretFinding[] = [];
    for (let offset = 0; offset < total; offset += scanWindowBytes - scanOverlapBytes) {
      const window = await objectStore.getRange(key, offset, scanWindowBytes);
      if (window.length === 0) break;
      collected.push(...scanTextForSecrets(window.toString("utf8"), { limit: 20 }));
      if (collected.length >= 20) break;
    }
    return toStoredFindings(file, collected);
  }

  async function processArchive(file: EvidenceFile, key: string): Promise<StoredFinding[]> {
    if (file.byteSize > maxArchiveInspectionBytes) {
      return [finding(file, "archive_too_large_to_inspect", `${file.byteSize} bytes`)];
    }
    const bytes = await objectStore.get(key);
    let entries;
    try {
      entries = readZip(bytes);
    } catch (error) {
      const reason = error instanceof ZipError ? error.reason : "corrupt_archive";
      return [finding(file, `archive:${reason}`)];
    }
    const findings: StoredFinding[] = [];
    const bodies = new Map<string, Buffer>();
    for (const entry of entries) {
      let body: Buffer;
      try {
        // Central-directory metadata can be valid while the compressed payload
        // is corrupt or the local header was tampered with. An entry we cannot
        // read is an entry we cannot vouch for.
        body = entry.read();
      } catch (error) {
        const reason = error instanceof ZipError ? error.reason : "corrupt_archive";
        return [finding(file, `archive:${reason}`, entry.name)];
      }
      bodies.set(entry.name, body);
      const detected = detectFormat(body);
      if (detected === "text") {
        findings.push(...toStoredFindings(file, scanTextForSecrets(body.toString("utf8"), { entry: entry.name, limit: 10 })));
      } else if (detected === "pdf") {
        findings.push(...toStoredFindings(file, scanPdfForSecrets(body, entry.name)));
      }
      if (findings.length >= 20) break;
    }
    if (findings.length > 0) return findings;

    if (file.kind === "playwright-report") {
      const index = entries.find((entry) => entry.name === "index.html" || entry.name.endsWith("/index.html"));
      if (!index) return [finding(file, "report_index_missing")];
      // Report entries live on their own key prefix so the isolated report route
      // can serve them without ever exposing the archive layout. The index may
      // sit in a subdirectory, so its real path is recorded rather than assumed.
      for (const entry of entries) {
        await objectStore.put(
          reportEntryKey(file.runId, file.id, entry.name),
          bodies.get(entry.name) ?? entry.read(),
          contentTypeForEntry(entry.name)
        );
      }
      store.setReportIndex(file.id, index.name);
    }
    return [];
  }

  async function processImage(file: EvidenceFile, key: string, format: StrippableImageFormat): Promise<StoredFinding[]> {
    if (file.byteSize > maxImageProcessingBytes) return [finding(file, "image_too_large")];
    const original = await objectStore.get(key);
    let stripped: Buffer;
    try {
      stripped = stripImageMetadata(format, original);
    } catch {
      return [finding(file, "image_metadata_strip_failed")];
    }
    if (options.ocr) {
      const text = await workspace.withDirectory(async (directory) => {
        const path = join(directory, file.filename);
        await writeFile(path, stripped);
        return options.ocr!.text(path);
      });
      const secrets = scanTextForSecrets(text, { limit: 10 });
      if (secrets.length > 0) return toStoredFindings(file, secrets);
    }
    await objectStore.put(objectKey(file.runId, file.id, "public"), stripped, file.contentType);
    return [];
  }

  /**
   * Copies a stored object to disk in windows. A 2 GiB recording must never sit
   * in the gateway's heap: the container limit is far below the upload ceiling.
   */
  async function downloadToFile(key: string, target: string, byteSize: number): Promise<void> {
    const handle = await open(target, "w");
    try {
      for (let offset = 0; offset < byteSize; offset += transferWindowBytes) {
        const chunk = await objectStore.getRange(key, offset, transferWindowBytes);
        if (chunk.length === 0) break;
        await handle.write(chunk);
      }
    } finally {
      await handle.close();
    }
  }

  async function processVideo(file: EvidenceFile, key: string): Promise<StoredFinding[]> {
    if (!options.video) return [finding(file, "video_processor_unavailable")];
    return workspace.withDirectory(async (directory) => {
      const source = join(directory, "source");
      const normalised = join(directory, "normalised.mp4");
      const poster = join(directory, "poster.jpg");
      await downloadToFile(key, source, file.byteSize);
      try {
        await options.video!.normalise(source, normalised);
        await options.video!.poster(source, poster);
      } catch {
        return [finding(file, "video_normalisation_failed")];
      }
      await objectStore.put(objectKey(file.runId, file.id, "public"), await readFile(normalised), "video/mp4");
      await objectStore.put(objectKey(file.runId, file.id, "poster"), await readFile(poster), "image/jpeg");
      // The served bytes are MP4 whatever the upload was, so the recorded type
      // has to follow or a MOV upload would be served as video/quicktime.
      store.setContentType(file.id, "video/mp4");
      return [];
    });
  }

  async function processFile(fileId: string): Promise<ProcessingResult> {
    const file = store.getFile(fileId);
    if (!file) throw new Error(`evidence file not found: ${fileId}`);
    const originalKey = objectKey(file.runId, file.id, "original");
    const head = await objectStore.head(originalKey);
    if (!head) {
      return reject(file, [finding(file, "upload_incomplete")]);
    }
    if (head.byteSize !== file.byteSize) {
      return reject(file, [finding(file, "size_mismatch", `${head.byteSize} != ${file.byteSize}`)]);
    }

    // The declared digest is what deduplication keys on, so it has to be true
    // of the bytes that actually arrived — otherwise a later upload claiming the
    // same digest would be served this file's content instead of its own.
    const actualDigest = await digestOf(originalKey, head.byteSize);
    if (actualDigest !== file.sha256.toLowerCase()) {
      return reject(file, [finding(file, "checksum_mismatch")]);
    }

    const isVideo = file.contentType.startsWith("video/");
    const isArchive = file.contentType.startsWith("application/zip");
    const format = isVideo || isArchive ? null : detectFormat(await objectStore.getRange(originalKey, 0, 4096));

    let findings: StoredFinding[];
    let servedKey = originalKey;
    let posterPath: string | null = null;

    if (isVideo) {
      findings = await processVideo(file, originalKey);
      servedKey = objectKey(file.runId, file.id, "public");
      posterPath = `${file.id}/poster.jpg`;
    } else if (isArchive) {
      findings = await processArchive(file, originalKey);
    } else if (isImageFormat(format)) {
      findings = await processImage(file, originalKey, format);
      servedKey = objectKey(file.runId, file.id, "public");
    } else if (isScannableContentType(file.contentType)) {
      findings = await scanStoredText(file, originalKey);
    } else if (file.contentType.startsWith("application/pdf")) {
      findings = file.byteSize > maxArchiveInspectionBytes
        ? [finding(file, "pdf_too_large_to_inspect", `${file.byteSize} bytes`)]
        : toStoredFindings(file, scanPdfForSecrets(await objectStore.get(originalKey)));
    } else {
      findings = [];
    }

    if (findings.length > 0) return reject(file, findings);

    store.setProcessingOutcome(file.id, {
      state: "ready",
      servedKey,
      publicPath: `${file.id}/${encodeURIComponent(file.filename)}`,
      posterPath
    });
    store.appendEvent(file.runId, "file_ready", "gateway", now().toISOString(), { fileId: file.id });
    return { fileId: file.id, state: "ready", findings: [] };
  }

  function reject(file: EvidenceFile, findings: StoredFinding[]): ProcessingResult {
    const at = now().toISOString();
    store.setProcessingOutcome(file.id, { state: "rejected", servedKey: null, publicPath: null, posterPath: null });
    store.addFindings(findings, at);
    const run = store.getRun(file.runId);
    if (run && run.state !== "quarantined" && run.state !== "archived") {
      store.transitionRun(file.runId, "quarantined", at);
    }
    store.appendEvent(file.runId, "file_quarantined", "gateway", at, {
      fileId: file.id,
      rules: findings.map((entry) => entry.rule)
    });
    return { fileId: file.id, state: "rejected", findings };
  }

  return {
    processFile,
    async processRun(runId) {
      const results: ProcessingResult[] = [];
      for (const file of store.listFiles(runId)) {
        if (file.processingState !== "pending") continue;
        results.push(await processFile(file.id));
      }
      return results;
    }
  };
}

const reportContentTypes = new Map([
  ["html", "text/html; charset=utf-8"],
  ["css", "text/css; charset=utf-8"],
  ["js", "text/javascript; charset=utf-8"],
  ["json", "application/json; charset=utf-8"],
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
  ["svg", "image/svg+xml"],
  ["webm", "video/webm"],
  ["mp4", "video/mp4"],
  ["zip", "application/zip"],
  ["woff2", "font/woff2"],
  ["txt", "text/plain; charset=utf-8"]
]);

export function contentTypeForEntry(name: string): string {
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return reportContentTypes.get(extension) ?? "application/octet-stream";
}

/** Convenience for callers that already hold the bytes, e.g. tests and the CLI. */
export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Pulls readable text out of a PDF: the literal strings, plus anything inside a
 * Flate-compressed stream that inflates. It is not a full PDF parser, so it is
 * paired with a scan of the raw bytes — between them, a credential pasted into a
 * document is caught whether or not the producer compressed it.
 */
export function extractPdfText(bytes: Buffer): string {
  const parts: string[] = [bytes.toString("latin1")];
  const marker = Buffer.from("stream");
  let index = bytes.indexOf(marker);
  let budget = 64;
  while (index !== -1 && budget > 0) {
    let start = index + marker.length;
    if (bytes[start] === 0x0d) start += 1;
    if (bytes[start] === 0x0a) start += 1;
    const end = bytes.indexOf(Buffer.from("endstream"), start);
    if (end === -1) break;
    try {
      parts.push(inflateSync(bytes.subarray(start, end)).toString("utf8"));
    } catch {
      // Not a Flate stream, or not inflatable. The raw pass still covers it.
    }
    budget -= 1;
    index = bytes.indexOf(marker, end);
  }
  return parts.join("\n");
}

export function scanPdfForSecrets(bytes: Buffer, entry?: string): SecretFinding[] {
  return scanTextForSecrets(extractPdfText(bytes), { limit: 10, ...(entry ? { entry } : {}) });
}
