import { inflateRawSync } from "node:zlib";

/**
 * A deliberately small ZIP reader. Playwright traces and HTML reports arrive as
 * archives, and they have to be inspected before anything from them is served,
 * so the reader refuses everything it cannot account for rather than guessing.
 */

export interface ZipLimits {
  maxEntries: number;
  maxTotalUncompressedBytes: number;
  maxCompressionRatio: number;
  maxEntryNameLength: number;
}

export const defaultZipLimits: ZipLimits = {
  maxEntries: 5_000,
  maxTotalUncompressedBytes: 512 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxEntryNameLength: 240
};

export interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  read(): Buffer;
}

export class ZipError extends Error {
  constructor(readonly reason: ZipRejection, detail?: string) {
    super(detail ? `${reason}: ${detail}` : reason);
  }
}

export type ZipRejection =
  | "not_a_zip"
  | "unsupported_zip64"
  | "unsupported_compression"
  | "encrypted_entry"
  | "too_many_entries"
  | "archive_too_large"
  | "compression_ratio_exceeded"
  | "entry_name_rejected"
  | "corrupt_archive";

const endOfCentralDirectorySignature = 0x06054b50;
const centralDirectorySignature = 0x02014b50;
const localHeaderSignature = 0x04034b50;
const zip64Marker = 0xffffffff;

function findEndOfCentralDirectory(bytes: Buffer): number {
  const earliest = Math.max(0, bytes.length - (0xffff + 22));
  for (let offset = bytes.length - 22; offset >= earliest; offset -= 1) {
    if (bytes.readUInt32LE(offset) === endOfCentralDirectorySignature) return offset;
  }
  throw new ZipError("not_a_zip");
}

/** Rejects absolute paths, parent traversal and anything that is not plain UTF-8. */
export function isSafeEntryName(name: string, maxLength: number): boolean {
  if (name.length === 0 || name.length > maxLength) return false;
  if (name.includes("\u0000") || name.includes("\\")) return false;
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) return false;
  return !name.split("/").some((segment) => segment === ".." || segment === ".");
}

export function readZip(bytes: Buffer, limits: ZipLimits = defaultZipLimits): ZipEntry[] {
  if (bytes.length < 22) throw new ZipError("not_a_zip");
  const eocd = findEndOfCentralDirectory(bytes);
  const entryCount = bytes.readUInt16LE(eocd + 10);
  const directorySize = bytes.readUInt32LE(eocd + 12);
  const directoryOffset = bytes.readUInt32LE(eocd + 16);
  if (directoryOffset === zip64Marker || entryCount === 0xffff) throw new ZipError("unsupported_zip64");
  if (entryCount > limits.maxEntries) throw new ZipError("too_many_entries");
  if (directoryOffset + directorySize > bytes.length) throw new ZipError("corrupt_archive");

  const entries: ZipEntry[] = [];
  let cursor = directoryOffset;
  let totalUncompressed = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== centralDirectorySignature) {
      throw new ZipError("corrupt_archive");
    }
    const flags = bytes.readUInt16LE(cursor + 8);
    const compressionMethod = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    cursor += 46 + nameLength + extraLength + commentLength;

    if ((flags & 0x0001) !== 0) throw new ZipError("encrypted_entry");
    if (compressedSize === zip64Marker || uncompressedSize === zip64Marker || localOffset === zip64Marker) {
      throw new ZipError("unsupported_zip64");
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) throw new ZipError("unsupported_compression");
    if (!isSafeEntryName(name, limits.maxEntryNameLength)) {
      throw new ZipError("entry_name_rejected", `rejected archive entry name at index ${index}`);
    }
    if (name.endsWith("/")) continue;

    totalUncompressed += uncompressedSize;
    if (totalUncompressed > limits.maxTotalUncompressedBytes) throw new ZipError("archive_too_large");
    if (compressedSize >= 1024 && uncompressedSize / compressedSize > limits.maxCompressionRatio) {
      throw new ZipError("compression_ratio_exceeded");
    }

    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      compressionMethod,
      read() {
        if (localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== localHeaderSignature) {
          throw new ZipError("corrupt_archive");
        }
        const localNameLength = bytes.readUInt16LE(localOffset + 26);
        const localExtraLength = bytes.readUInt16LE(localOffset + 28);
        const start = localOffset + 30 + localNameLength + localExtraLength;
        const body = bytes.subarray(start, start + compressedSize);
        if (body.length !== compressedSize) throw new ZipError("corrupt_archive");
        const inflated = compressionMethod === 0
          ? Buffer.from(body)
          : inflateRawSync(body, { maxOutputLength: limits.maxTotalUncompressedBytes });
        if (inflated.length !== uncompressedSize) throw new ZipError("corrupt_archive");
        return inflated;
      }
    });
  }
  return entries;
}
