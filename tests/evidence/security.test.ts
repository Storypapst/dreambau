import { describe, expect, it } from "vitest";
import {
  detectFormat,
  extensionOf,
  hasPathTraversal,
  isForbiddenFilename,
  looksExecutable,
  looksLikeMarkupDocument,
  preflightUpload,
  uploadLimits
} from "../../src/evidence/security.js";
import { makeJpeg, makePng, makeWebp, makeZip } from "./fixtures.js";

const png = makePng();

function preflight(overrides: Partial<Parameters<typeof preflightUpload>[0]> = {}) {
  return preflightUpload({
    kind: "screenshot",
    filename: "redirect.png",
    contentType: "image/png",
    byteSize: png.length,
    head: png,
    ...overrides
  });
}

describe("format detection", () => {
  it("recognises the accepted image formats by magic bytes", () => {
    expect(detectFormat(makePng())).toBe("png");
    expect(detectFormat(makeJpeg())).toBe("jpeg");
    expect(detectFormat(makeWebp())).toBe("webp");
  });

  it("recognises archives, PDFs and plain text", () => {
    expect(detectFormat(makeZip([{ name: "a.txt", body: Buffer.from("hello") }]))).toBe("zip");
    expect(detectFormat(Buffer.from("%PDF-1.7\nbody"))).toBe("pdf");
    expect(detectFormat(Buffer.from("a plain log line"))).toBe("text");
  });

  it("recognises MP4 and QuickTime by their ftyp brand", () => {
    const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypisom", "latin1"), Buffer.alloc(16)]);
    const mov = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypqt  ", "latin1"), Buffer.alloc(16)]);
    expect(detectFormat(mp4)).toBe("mp4");
    expect(detectFormat(mov)).toBe("quicktime");
  });

  it("returns null for binary content it cannot account for", () => {
    expect(detectFormat(Buffer.from([0x00, 0x01, 0x02, 0x03, 0xfe]))).toBeNull();
  });
});

describe("filename rules", () => {
  it("rejects traversal, separators and NUL bytes", () => {
    expect(hasPathTraversal("../secret.png")).toBe(true);
    expect(hasPathTraversal("nested/shot.png")).toBe(true);
    expect(hasPathTraversal("back\\slash.png")).toBe(true);
    expect(hasPathTraversal(`shot${String.fromCharCode(0)}.png`)).toBe(true);
    expect(hasPathTraversal("shot.png")).toBe(false);
  });

  it("refuses names that carry credentials by convention", () => {
    for (const name of [
      ".env", "env.production", "storageState.json", "auth-cookies.json",
      "aws-credentials.json", "secrets.json", "api-key.txt", "id_rsa",
      "client.p12", "server.pem", "team.kdbx"
    ]) {
      expect(isForbiddenFilename(name), name).toBe(true);
    }
  });

  it("accepts ordinary evidence names", () => {
    for (const name of ["redirect.png", "run-2026-07-22.log", "trace.zip", "REPORT.md"]) {
      expect(isForbiddenFilename(name), name).toBe(false);
    }
  });

  it("reads the extension case-insensitively", () => {
    expect(extensionOf("SHOT.PNG")).toBe("png");
    expect(extensionOf("noextension")).toBe("");
  });
});

describe("executables and markup", () => {
  it("detects the common executable headers", () => {
    expect(looksExecutable(Buffer.from([0x4d, 0x5a, 0x00]))).toBe(true);
    expect(looksExecutable(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))).toBe(true);
    expect(looksExecutable(Buffer.from("#!/bin/sh\n"))).toBe(true);
    expect(looksExecutable(makePng())).toBe(false);
  });

  it("treats SVG and HTML documents as markup, including behind an XML prologue", () => {
    expect(looksLikeMarkupDocument(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(true);
    expect(looksLikeMarkupDocument(Buffer.from("<!DOCTYPE html><html></html>"))).toBe(true);
    expect(looksLikeMarkupDocument(Buffer.from("<!-- note --> <html>"))).toBe(true);
  });

  it("leaves a log that merely quotes a script tag alone", () => {
    const log = Buffer.from('2026-07-22 console: refused to run "<script>alert(1)</script>"');
    expect(looksLikeMarkupDocument(log)).toBe(false);
  });
});

describe("preflightUpload", () => {
  it("accepts a screenshot whose extension, magic bytes and content type agree", () => {
    const result = preflight();
    expect(result).toMatchObject({ ok: true, format: "png", formatClass: "image", contentType: "image/png" });
  });

  it("rejects a video renamed to .png", () => {
    const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypisom", "latin1"), Buffer.alloc(16)]);
    const result = preflight({ head: mp4, byteSize: mp4.length });
    expect(result).toEqual({ ok: false, reasons: ["format_extension_mismatch"] });
  });

  it("rejects a declared content type that contradicts the bytes", () => {
    const result = preflight({ contentType: "image/jpeg" });
    expect(result).toMatchObject({ ok: false });
    expect((result as { reasons: string[] }).reasons).toContain("content_type_mismatch");
  });

  it("rejects an executable even when it is named like a screenshot", () => {
    const result = preflight({ head: Buffer.concat([Buffer.from([0x4d, 0x5a, 0x00]), Buffer.from("binary")]) });
    expect((result as { reasons: string[] }).reasons).toContain("executable_rejected");
  });

  it("rejects a secret file before it looks at the bytes", () => {
    const result = preflight({ filename: "storageState.json", contentType: "application/json; charset=utf-8" });
    expect(result).toEqual({ ok: false, reasons: ["filename_forbidden"] });
  });

  it("rejects an SVG uploaded as a log", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const result = preflight({
      kind: "log", filename: "diagram.txt", contentType: "text/plain; charset=utf-8",
      head: svg, byteSize: svg.length
    });
    expect((result as { reasons: string[] }).reasons).toContain("active_content_rejected");
  });

  it("rejects a document offered as a screenshot", () => {
    const text = Buffer.from("plain log line");
    const result = preflight({
      kind: "screenshot", filename: "run.log", contentType: "text/plain; charset=utf-8",
      head: text, byteSize: text.length
    });
    expect((result as { reasons: string[] }).reasons).toContain("kind_format_mismatch");
  });

  it("enforces the per-file and per-run ceilings", () => {
    expect((preflight({ byteSize: uploadLimits.image + 1 }) as { reasons: string[] }).reasons)
      .toContain("size_limit_exceeded");
    expect((preflight({ runBytesAlreadyStored: uploadLimits.run }) as { reasons: string[] }).reasons)
      .toContain("run_limit_exceeded");
  });

  it("gives JSON logs their own content type", () => {
    const body = Buffer.from('{"step":"redirect"}');
    expect(preflight({
      kind: "log", filename: "run.json", contentType: "application/json",
      head: body, byteSize: body.length
    })).toMatchObject({ ok: true, contentType: "application/json; charset=utf-8" });
  });
});
