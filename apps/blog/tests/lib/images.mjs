// Image files for the checks. The REAL files in tests/images/ were written by Pillow 11.3 (libwebp and libpng) from
// invented gradients, so the reader is checked against an encoder that is not ours: real-lossy-8x6.webp (VP8),
// real-lossless-5x7.webp (VP8L), real-alpha-9x4.webp (VP8X with ALPH and VP8) and real-6x3.png. The builders below make
// the faulty variants by adding one chunk or one flag to a well-formed file, and files of an exact size.
import fs from 'node:fs';
import path from 'node:path';
import { TESTS } from './paths.mjs';

export const realImage = (name) => fs.readFileSync(path.join(TESTS, 'images', name));

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const u32be = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const u32le = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };

// ---- png ----
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export function pngChunk(type, data = Buffer.alloc(0)) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  return Buffer.concat([u32be(data.length), body, u32be(crc32(body))]);
}
// A well-formed png of width x height (grey, 8 bit, no compression: stored blocks). `extra` chunks go after IHDR;
// `pad` bytes of a private ancillary chunk (prVt) make the file larger; `after` goes after IEND.
export function png({ width = 6, height = 3, extra = [], pad = 0, after = Buffer.alloc(0) } = {}) {
  const header = Buffer.concat([u32be(width), u32be(height), Buffer.from([8, 0, 0, 0, 0])]);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width, 0x80)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const stored = Buffer.concat([Buffer.from([0x78, 0x01, 0x01]), Buffer.from([raw.length & 0xff, raw.length >> 8, ~raw.length & 0xff, (~raw.length >> 8) & 0xff]), raw, u32be(adler32(raw))]);
  const chunks = [pngChunk('IHDR', header), ...extra, ...(pad > 0 ? [pngChunk('prVt', Buffer.alloc(pad - 12))] : []), pngChunk('IDAT', stored), pngChunk('IEND')];
  return Buffer.concat([PNG_SIGNATURE, ...chunks, after]);
}
function adler32(buffer) {
  let a = 1; let b = 0;
  for (const byte of buffer) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}
// A png of exactly `size` bytes.
export function pngOfSize(size) {
  const base = png().length;
  return png({ pad: size - base });
}

// ---- webp ----
export function riffChunk(type, payload) {
  const padded = payload.length % 2 === 1 ? Buffer.concat([payload, Buffer.from([0])]) : payload;
  return Buffer.concat([Buffer.from(type, 'latin1'), u32le(payload.length), padded]);
}
export function webpFile(chunks, { riffSize } = {}) {
  const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), ...chunks]);
  return Buffer.concat([Buffer.from('RIFF', 'latin1'), u32le(riffSize === undefined ? body.length : riffSize), body]);
}
// A "VP8 " chunk whose frame header says width x height (the picture data after it is not a real picture).
export function vp8Chunk(width, height) {
  const payload = Buffer.alloc(30);
  payload.writeUIntLE(0x000010, 0, 3); // key frame, version 0, shown
  payload.set([0x9d, 0x01, 0x2a], 3);
  payload.writeUInt16LE(width, 6);
  payload.writeUInt16LE(height, 8);
  return riffChunk('VP8 ', payload);
}
export function vp8lChunk(width, height) {
  const payload = Buffer.alloc(12);
  payload[0] = 0x2f;
  payload.writeUInt32LE(((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14), 1);
  return riffChunk('VP8L', payload);
}
export function vp8xChunk(width, height, flags = 0) {
  const payload = Buffer.alloc(10);
  payload[0] = flags;
  payload.writeUIntLE(width - 1, 4, 3);
  payload.writeUIntLE(height - 1, 7, 3);
  return riffChunk('VP8X', payload);
}
export const WEBP_FLAGS = { icc: 0x20, alpha: 0x10, exif: 0x08, xmp: 0x04, animation: 0x02 };
export const webp = ({ width = 640, height = 480, extra = [], flags, size } = {}) => {
  const head = flags === undefined ? [] : [vp8xChunk(width, height, flags)];
  const filler = size === undefined ? [] : [riffChunk('JUNK', Buffer.alloc(Math.max(0, size - webpFile([...head, vp8Chunk(width, height), ...extra]).length - 8)))];
  return webpFile([...head, vp8Chunk(width, height), ...extra, ...filler]);
};
