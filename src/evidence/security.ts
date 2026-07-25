import type { EvidenceKind } from "./model.js";

export const megabyte = 1024 * 1024;
export const gigabyte = 1024 * megabyte;

/**
 * Size ceilings. The video and document limits come from the pipeline plan; the
 * image limit is an added guard so a mis-typed screenshot cannot occupy a video
 * sized slot.
 */
export const uploadLimits = {
  image: 64 * megabyte,
  video: 2 * gigabyte,
  document: 500 * megabyte,
  run: 5 * gigabyte
} as const;

export const multipartChunkSize = 64 * megabyte;

export type EvidenceFormat = "png" | "jpeg" | "webp" | "mp4" | "quicktime" | "webm" | "pdf" | "zip" | "text";
export type FormatClass = "image" | "video" | "document";

interface FormatDefinition {
  format: EvidenceFormat;
  formatClass: FormatClass;
  contentType: string;
  extensions: string[];
}

const formats: FormatDefinition[] = [
  { format: "png", formatClass: "image", contentType: "image/png", extensions: ["png"] },
  { format: "jpeg", formatClass: "image", contentType: "image/jpeg", extensions: ["jpg", "jpeg"] },
  { format: "webp", formatClass: "image", contentType: "image/webp", extensions: ["webp"] },
  { format: "mp4", formatClass: "video", contentType: "video/mp4", extensions: ["mp4", "m4v"] },
  { format: "quicktime", formatClass: "video", contentType: "video/quicktime", extensions: ["mov"] },
  { format: "webm", formatClass: "video", contentType: "video/webm", extensions: ["webm"] },
  { format: "pdf", formatClass: "document", contentType: "application/pdf", extensions: ["pdf"] },
  { format: "zip", formatClass: "document", contentType: "application/zip", extensions: ["zip"] },
  { format: "text", formatClass: "document", contentType: "text/plain; charset=utf-8", extensions: ["txt", "json", "md", "log", "jsonl"] }
];

const formatByName = new Map(formats.map((entry) => [entry.format, entry]));

/** Text uploads keep the caller's narrower content type when it is one of these. */
const textContentTypes = new Map([
  ["txt", "text/plain; charset=utf-8"],
  ["log", "text/plain; charset=utf-8"],
  ["json", "application/json; charset=utf-8"],
  ["jsonl", "application/json; charset=utf-8"],
  ["md", "text/markdown; charset=utf-8"]
]);

const kindFormats: Record<EvidenceKind, FormatClass[]> = {
  screenshot: ["image"],
  video: ["video"],
  "playwright-report": ["document"],
  trace: ["document"],
  log: ["document"],
  document: ["document"],
  other: ["image", "document"]
};

export type RejectionReason =
  | "filename_invalid"
  | "filename_traversal"
  | "filename_forbidden"
  | "extension_unknown"
  | "format_unrecognised"
  | "format_extension_mismatch"
  | "content_type_mismatch"
  | "kind_format_mismatch"
  | "executable_rejected"
  | "active_content_rejected"
  | "size_limit_exceeded"
  | "run_limit_exceeded"
  | "size_mismatch"
  | "checksum_mismatch";

export interface PreflightAccepted {
  ok: true;
  format: EvidenceFormat;
  formatClass: FormatClass;
  contentType: string;
  sizeLimit: number;
}

export interface PreflightRejected {
  ok: false;
  reasons: RejectionReason[];
}

export type PreflightResult = PreflightAccepted | PreflightRejected;

const filenamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/;

/**
 * Names that carry credentials by convention. These are refused before any
 * content check so a rename is never enough to smuggle them past the gateway.
 */
const forbiddenNamePatterns: RegExp[] = [
  /^\.?env(\..*)?$/i,
  /(^|[._-])storagestate([._-]|$)/i,
  /(^|[._-])cookies?([._-]|$)/i,
  /(^|[._-])credentials?([._-]|$)/i,
  /(^|[._-])secrets?([._-]|$)/i,
  /(^|[._-])(token|tokens|apikey|api-key|api_key)([._-]|$)/i,
  /^auth(orization)?\.(json|txt)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)/i,
  /^\.?(npmrc|netrc|htpasswd|pgpass|pypirc)$/i,
  /\.(p12|pfx|pem|key|jks|keystore|kdbx|asc|gpg|ppk)$/i
];

export function isForbiddenFilename(filename: string): boolean {
  return forbiddenNamePatterns.some((pattern) => pattern.test(filename));
}

export function hasPathTraversal(filename: string): boolean {
  return filename.includes("/")
    || filename.includes("\\")
    || filename.includes("\u0000")
    || filename === ".."
    || filename.split(".").includes("");
}

export function extensionOf(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index > 0 ? filename.slice(index + 1).toLowerCase() : "";
}

const startsWith = (bytes: Buffer, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length
  && signature.every((byte, index) => bytes[offset + index] === byte);

const executableSignatures: number[][] = [
  [0x4d, 0x5a], // DOS/PE
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0xfe, 0xed, 0xfa, 0xce], // Mach-O 32 big endian
  [0xfe, 0xed, 0xfa, 0xcf], // Mach-O 64 big endian
  [0xce, 0xfa, 0xed, 0xfe], // Mach-O 32 little endian
  [0xcf, 0xfa, 0xed, 0xfe], // Mach-O 64 little endian
  [0xca, 0xfe, 0xba, 0xbe], // Mach-O universal / Java class
  [0x23, 0x21] // shebang
];

export function looksExecutable(bytes: Buffer): boolean {
  return executableSignatures.some((signature) => startsWith(bytes, signature));
}

const markupDocumentPatterns = [
  /^<svg[\s>]/i,
  /^<!doctype\s+html/i,
  /^<html[\s>]/i,
  /^<script[\s>]/i
];

/**
 * Rejects uploads that *are* SVG or HTML documents. A log that merely quotes a
 * `<script>` tag stays acceptable: text evidence is only ever served as
 * `text/plain` or `application/json` with `nosniff`, so quoted markup is inert,
 * and refusing it would quarantine ordinary browser console logs.
 */
export function looksLikeMarkupDocument(bytes: Buffer): boolean {
  let head = bytes.subarray(0, 8 * 1024).toString("utf8").replace(/^﻿/, "").trimStart();
  for (;;) {
    const before = head;
    head = head.replace(/^<\?xml[^>]*\?>/i, "").replace(/^<!--[\s\S]*?-->/, "").trimStart();
    if (head === before) break;
  }
  return markupDocumentPatterns.some((pattern) => pattern.test(head));
}

function isUtf8Text(bytes: Buffer): boolean {
  const sample = bytes.subarray(0, 256 * 1024);
  if (sample.includes(0)) return false;
  const decoded = new TextDecoder("utf-8", { fatal: true });
  try {
    decoded.decode(sample);
  } catch {
    return false;
  }
  return true;
}

/** Content sniffing. The declared content type never decides the outcome. */
export function detectFormat(bytes: Buffer): EvidenceFormat | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "webm";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
    || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])
    || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])) return "zip";
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = bytes.subarray(8, 12).toString("latin1");
    return brand.startsWith("qt") ? "quicktime" : "mp4";
  }
  if (bytes.length > 0 && isUtf8Text(bytes)) return "text";
  return null;
}

export function limitForClass(formatClass: FormatClass): number {
  return uploadLimits[formatClass];
}

export interface PreflightInput {
  kind: EvidenceKind;
  filename: string;
  contentType: string;
  byteSize: number;
  head: Buffer;
  runBytesAlreadyStored?: number;
}

/**
 * Runs every structural check that does not need the whole file. Content scans
 * that need the full body (secret patterns, archive contents) run afterwards in
 * the processing stage; a failure there quarantines the run.
 */
export function preflightUpload(input: PreflightInput): PreflightResult {
  const reasons: RejectionReason[] = [];
  if (hasPathTraversal(input.filename)) reasons.push("filename_traversal");
  else if (!filenamePattern.test(input.filename)) reasons.push("filename_invalid");
  if (isForbiddenFilename(input.filename)) reasons.push("filename_forbidden");
  if (reasons.length > 0) return { ok: false, reasons };

  const extension = extensionOf(input.filename);
  const byExtension = formats.find((entry) => entry.extensions.includes(extension));
  if (!byExtension) reasons.push("extension_unknown");

  if (looksExecutable(input.head)) reasons.push("executable_rejected");
  const detected = detectFormat(input.head);
  if (!detected) reasons.push("format_unrecognised");
  if (detected && byExtension && detected !== byExtension.format) reasons.push("format_extension_mismatch");
  if (reasons.length > 0) return { ok: false, reasons };

  const definition = formatByName.get(detected!)!;
  if (definition.format === "text" && looksLikeMarkupDocument(input.head)) reasons.push("active_content_rejected");
  if (!kindFormats[input.kind].includes(definition.formatClass)) reasons.push("kind_format_mismatch");

  const contentType = definition.format === "text"
    ? textContentTypes.get(extension) ?? definition.contentType
    : definition.contentType;
  const declared = input.contentType.split(";")[0].trim().toLowerCase();
  const expected = contentType.split(";")[0].trim().toLowerCase();
  if (declared !== expected) reasons.push("content_type_mismatch");

  const sizeLimit = limitForClass(definition.formatClass);
  if (input.byteSize > sizeLimit) reasons.push("size_limit_exceeded");
  if ((input.runBytesAlreadyStored ?? 0) + input.byteSize > uploadLimits.run) reasons.push("run_limit_exceeded");
  if (reasons.length > 0) return { ok: false, reasons };

  return { ok: true, format: definition.format, formatClass: definition.formatClass, contentType, sizeLimit };
}
