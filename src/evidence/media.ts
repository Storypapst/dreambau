/**
 * Metadata removal for the formats the gateway accepts. Images are rewritten in
 * process, because dropping a chunk is a parsing job rather than a re-encode and
 * a re-encode would degrade a screenshot. Video work is delegated to ffmpeg
 * behind {@link MediaToolRunner} so the argument list stays unit-testable.
 */

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Ancillary PNG chunks that can carry authorship, location or capture history. */
const pngChunksToDrop = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME", "dSIG", "caNv", "prVW"]);

export function stripPngMetadata(bytes: Buffer): Buffer {
  if (!bytes.subarray(0, 8).equals(pngSignature)) throw new Error("not a PNG");
  const kept: Buffer[] = [bytes.subarray(0, 8)];
  let offset = 8;
  let sawHeader = false;
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("latin1");
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error("truncated PNG chunk");
    if (!sawHeader && type !== "IHDR") throw new Error("PNG does not start with IHDR");
    sawHeader = true;
    if (!pngChunksToDrop.has(type)) kept.push(bytes.subarray(offset, end));
    offset = end;
    if (type === "IEND") { sawEnd = true; break; }
  }
  if (!sawHeader || !sawEnd) throw new Error("incomplete PNG");
  return Buffer.concat(kept);
}

const crcTable = Array.from({ length: 256 }, (_unused, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export function crc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

/** Written for tests and fixtures; production PNGs come from the caller. */
export function encodePngChunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, "latin1");
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "latin1"), data])), 0);
  return Buffer.concat([header, data, checksum]);
}

/**
 * JPEG APP segments. APP0 (JFIF) and APP2 (ICC colour profile) stay because
 * dropping them changes how the image renders; everything else — Exif, XMP,
 * Photoshop resources, comments — goes.
 */
export function stripJpegMetadata(bytes: Buffer): Buffer {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("not a JPEG");
  const kept: Buffer[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error("corrupt JPEG marker");
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      kept.push(bytes.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (end > bytes.length) throw new Error("truncated JPEG segment");
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const dropped = (isApp && marker !== 0xe0 && marker !== 0xe2) || marker === 0xfe;
    if (!dropped) kept.push(bytes.subarray(offset, end));
    offset = end;
    if (marker === 0xda) {
      // Start of scan: the entropy coded payload runs to the end of the file.
      kept.push(bytes.subarray(offset));
      return Buffer.concat(kept);
    }
  }
  throw new Error("incomplete JPEG: no start of scan");
}

const webpChunksToDrop = new Set(["EXIF", "XMP "]);

export function stripWebpMetadata(bytes: Buffer): Buffer {
  if (bytes.subarray(0, 4).toString("latin1") !== "RIFF" || bytes.subarray(8, 12).toString("latin1") !== "WEBP") {
    throw new Error("not a WebP");
  }
  const kept: Buffer[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.subarray(offset, offset + 4).toString("latin1");
    const size = bytes.readUInt32LE(offset + 4);
    const padded = size + (size % 2);
    const end = offset + 8 + padded;
    if (end > bytes.length) throw new Error("truncated WebP chunk");
    if (!webpChunksToDrop.has(type)) kept.push(bytes.subarray(offset, end));
    offset = end;
  }
  if (kept.length === 0) throw new Error("incomplete WebP: no image chunk");
  const payload = Buffer.concat(kept);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(payload.length + 4, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, payload]);
}

export type StrippableImageFormat = "png" | "jpeg" | "webp";

export function stripImageMetadata(format: StrippableImageFormat, bytes: Buffer): Buffer {
  if (format === "png") return stripPngMetadata(bytes);
  if (format === "jpeg") return stripJpegMetadata(bytes);
  return stripWebpMetadata(bytes);
}

export interface ToolResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface MediaToolRunner {
  run(command: string, args: string[]): Promise<ToolResult>;
}

export interface VideoToolPaths {
  ffmpeg?: string;
  ffprobe?: string;
}

export interface VideoProcessor {
  /** Re-encodes to MP4/H.264/AAC with every metadata track dropped. */
  normalise(inputPath: string, outputPath: string): Promise<void>;
  /** Extracts a single poster frame for the viewer and the PR comment. */
  poster(inputPath: string, outputPath: string, atSeconds?: number): Promise<void>;
  probe(inputPath: string): Promise<{ durationSeconds: number | null; width: number | null; height: number | null }>;
}

export function normaliseArgs(inputPath: string, outputPath: string): string[] {
  return [
    "-nostdin", "-y",
    "-i", inputPath,
    "-map_metadata", "-1",
    "-map_chapters", "-1",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    "-f", "mp4",
    outputPath
  ];
}

export function posterArgs(inputPath: string, outputPath: string, atSeconds: number): string[] {
  return [
    "-nostdin", "-y",
    "-ss", String(atSeconds),
    "-i", inputPath,
    "-map_metadata", "-1",
    "-frames:v", "1",
    "-vf", "scale='min(1280,iw)':-2",
    "-f", "image2", "-c:v", "mjpeg",
    outputPath
  ];
}

export function thumbnailArgs(inputPath: string, outputPath: string, width: number): string[] {
  return [
    "-nostdin", "-y",
    "-i", inputPath,
    "-map_metadata", "-1",
    "-frames:v", "1",
    "-vf", `scale='min(${width},iw)':-2`,
    "-f", "image2", "-c:v", "png",
    outputPath
  ];
}

export function probeArgs(inputPath: string): string[] {
  return ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", inputPath];
}

export function createFfmpegVideoProcessor(runner: MediaToolRunner, paths: VideoToolPaths = {}): VideoProcessor {
  const ffmpeg = paths.ffmpeg ?? "ffmpeg";
  const ffprobe = paths.ffprobe ?? "ffprobe";
  const expectSuccess = (result: ToolResult, step: string) => {
    if (result.code !== 0) throw new Error(`${step} failed with exit code ${result.code}`);
  };
  return {
    async normalise(inputPath, outputPath) {
      expectSuccess(await runner.run(ffmpeg, normaliseArgs(inputPath, outputPath)), "video normalisation");
    },
    async poster(inputPath, outputPath, atSeconds = 1) {
      expectSuccess(await runner.run(ffmpeg, posterArgs(inputPath, outputPath, atSeconds)), "poster extraction");
    },
    async probe(inputPath) {
      const result = await runner.run(ffprobe, probeArgs(inputPath));
      if (result.code !== 0) throw new Error(`video probe failed with exit code ${result.code}`);
      const parsed = JSON.parse(result.stdout) as {
        format?: { duration?: string };
        streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
      };
      const video = parsed.streams?.find((stream) => stream.codec_type === "video");
      const duration = Number(parsed.format?.duration);
      return {
        durationSeconds: Number.isFinite(duration) ? duration : null,
        width: video?.width ?? null,
        height: video?.height ?? null
      };
    }
  };
}

/**
 * Optional OCR preflight. Task 3 lists it as optional, so the pipeline ships
 * with no scanner wired in; supplying one makes screenshot text subject to the
 * same secret rules as logs.
 */
export interface OcrScanner {
  text(imagePath: string): Promise<string>;
}
