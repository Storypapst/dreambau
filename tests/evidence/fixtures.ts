import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { crc32, encodePngChunk } from "../../src/evidence/media.js";

export const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function makePng(options: { text?: string; exif?: Buffer } = {}): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const chunks = [pngSignature, encodePngChunk("IHDR", header)];
  if (options.text) chunks.push(encodePngChunk("tEXt", Buffer.from(options.text, "latin1")));
  if (options.exif) chunks.push(encodePngChunk("eXIf", options.exif));
  chunks.push(encodePngChunk("IDAT", deflateRawSync(Buffer.from([0, 0, 0, 0, 0]))));
  chunks.push(encodePngChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function jpegSegment(marker: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = marker;
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

export function makeJpeg(options: { exif?: string; comment?: string } = {}): Buffer {
  const parts = [
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xe0, Buffer.concat([Buffer.from([0x4a, 0x46, 0x49, 0x46, 0x00]), Buffer.from([1, 1, 0, 0, 1, 0, 1, 0, 0])]))
  ];
  if (options.exif) parts.push(jpegSegment(0xe1, Buffer.concat([Buffer.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]), Buffer.from(options.exif, "latin1")])));
  if (options.comment) parts.push(jpegSegment(0xfe, Buffer.from(options.comment, "latin1")));
  parts.push(jpegSegment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])));
  parts.push(Buffer.from([0x12, 0x34, 0x56, 0xff, 0xd9]));
  return Buffer.concat(parts);
}

function riffChunk(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(type, 0, "latin1");
  header.writeUInt32LE(payload.length, 4);
  const padding = payload.length % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([header, payload, padding]);
}

export function makeWebp(options: { exif?: string } = {}): Buffer {
  const chunks = [riffChunk("VP8 ", Buffer.from([0x10, 0x20, 0x30, 0x40]))];
  if (options.exif) chunks.push(riffChunk("EXIF", Buffer.from(options.exif, "latin1")));
  const payload = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(payload.length + 4, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, payload]);
}

export interface ZipInput {
  name: string;
  body: Buffer;
  /** Store uncompressed so a deliberate ratio can be constructed. */
  store?: boolean;
  /** Overrides the recorded uncompressed size, for zip-bomb fixtures. */
  declaredUncompressedSize?: number;
}

export function makeZip(inputs: ZipInput[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const input of inputs) {
    const nameBytes = Buffer.from(input.name, "utf8");
    const compressed = input.store ? input.body : deflateRawSync(input.body);
    const method = input.store ? 0 : 8;
    const checksum = crc32(input.body);
    const uncompressedSize = input.declaredUncompressedSize ?? input.body.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(uncompressedSize, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += 30 + nameBytes.length + compressed.length;
  }

  const localBytes = Buffer.concat(locals);
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(inputs.length, 8);
  end.writeUInt16LE(inputs.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(localBytes.length, 16);
  return Buffer.concat([localBytes, centralBytes, end]);
}

export function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
