import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isSafeEntryName, readZip, ZipError } from "../../src/evidence/zip.js";
import { makeZip } from "./fixtures.js";

describe("readZip", () => {
  it("reads deflated and stored entries", () => {
    const archive = makeZip([
      { name: "index.html", body: Buffer.from("<html>report</html>") },
      { name: "data/trace.txt", body: Buffer.from("step one"), store: true }
    ]);
    const entries = readZip(archive);
    expect(entries.map((entry) => entry.name)).toEqual(["index.html", "data/trace.txt"]);
    expect(entries[0].read().toString()).toBe("<html>report</html>");
    expect(entries[1].read().toString()).toBe("step one");
  });

  it("refuses anything that is not an archive", () => {
    expect(() => readZip(Buffer.from("not a zip at all"))).toThrow(ZipError);
  });

  it("refuses entries that escape the archive root", () => {
    for (const name of ["../escape.txt", "/etc/passwd", "nested/../../escape.txt"]) {
      const archive = makeZip([{ name, body: Buffer.from("x") }]);
      expect(() => readZip(archive), name).toThrow(/entry_name_rejected/);
    }
  });

  it("refuses an implausible compression ratio", () => {
    // Incompressible bytes keep the compressed size above the 1 KiB floor, so
    // the declared expansion is what triggers the guard.
    const incompressible = randomBytes(8192);
    const archive = makeZip([{
      name: "bomb.txt",
      body: incompressible,
      declaredUncompressedSize: 8192 * 400
    }]);
    expect(() => readZip(archive)).toThrow(/compression_ratio_exceeded/);
  });

  it("refuses an archive above the total size ceiling", () => {
    const archive = makeZip([{ name: "big.txt", body: Buffer.alloc(2048, 0x42), declaredUncompressedSize: 900 }]);
    expect(() => readZip(archive, {
      maxEntries: 10,
      maxTotalUncompressedBytes: 100,
      maxCompressionRatio: 10_000,
      maxEntryNameLength: 240
    })).toThrow(/archive_too_large/);
  });

  it("refuses more entries than the limit allows", () => {
    const archive = makeZip([
      { name: "a.txt", body: Buffer.from("a") },
      { name: "b.txt", body: Buffer.from("b") }
    ]);
    expect(() => readZip(archive, {
      maxEntries: 1,
      maxTotalUncompressedBytes: 1_000,
      maxCompressionRatio: 200,
      maxEntryNameLength: 240
    })).toThrow(/too_many_entries/);
  });

  it("refuses to read an entry whose local header was tampered with", () => {
    const archive = makeZip([{ name: "a.txt", body: Buffer.from("hello world") }]);
    const entries = readZip(archive);
    archive.writeUInt32LE(0xdeadbeef, 0);
    expect(() => entries[0].read()).toThrow(/corrupt_archive/);
  });
});

describe("isSafeEntryName", () => {
  it("accepts nested report assets", () => {
    expect(isSafeEntryName("index.html", 240)).toBe(true);
    expect(isSafeEntryName("data/attachment-1.png", 240)).toBe(true);
  });

  it("rejects traversal, absolute paths, drive letters and over-long names", () => {
    expect(isSafeEntryName("../x", 240)).toBe(false);
    expect(isSafeEntryName("/x", 240)).toBe(false);
    expect(isSafeEntryName("C:/x", 240)).toBe(false);
    expect(isSafeEntryName("./x", 240)).toBe(false);
    expect(isSafeEntryName("a".repeat(241), 240)).toBe(false);
  });
});
