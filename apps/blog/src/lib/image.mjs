// The image checks of a post (spec 5.2 PF-11, 5.13 PR-8). Plain Node, no dependency, nothing decoded: the signature, the
// container's chunks and the header are read, and that is enough to
//   - refuse a file that is not the format its name says (a jpg renamed .webp),
//   - read width and height (the build writes them into the <img>),
//   - refuse any metadata, so that no location or author data goes public:
//       webp: an `EXIF` or `XMP ` chunk, or a `VP8X` header with the EXIF or the XMP flag set
//       png:  an `eXIf`, `tEXt`, `iTXt`, `zTXt` or `tIME` chunk
//   - refuse more than 300,000 bytes (a starting value, OP-10).
// Every fault is reported on its own line that names the chunk or the flag.
import { LIMITS } from './post-rules.mjs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_METADATA = ['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME'];
const VP8X_FLAGS = [[0x08, 'EXIF'], [0x04, 'XMP']];

const problem = (what) => ({ rule: 'PF-11', what });
const latin1 = (buffer, start, end) => buffer.toString('latin1', start, end);

function readWebp(buffer, found) {
  if (buffer.length < 12 || latin1(buffer, 0, 4) !== 'RIFF' || latin1(buffer, 8, 12) !== 'WEBP') {
    found.problems.push(problem('the file is not a webp: it does not start with RIFF and WEBP'));
    return;
  }
  const riffMatches = buffer.readUInt32LE(4) + 8 === buffer.length;
  if (!riffMatches) found.problems.push(problem(`the RIFF size field says ${buffer.readUInt32LE(4) + 8} bytes but the file has ${buffer.length}`));
  let position = 12;
  let first = true;
  let extended = false;
  while (position + 8 <= buffer.length) {
    const type = latin1(buffer, position, position + 4);
    const size = buffer.readUInt32LE(position + 4);
    const start = position + 8;
    if (start + size > buffer.length) {
      found.problems.push(problem(`the ${type} chunk runs past the end of the file`));
      return;
    }
    if (first && !['VP8 ', 'VP8L', 'VP8X'].includes(type)) found.problems.push(problem(`the first chunk is ${JSON.stringify(type)}; a webp starts with VP8 , VP8L or VP8X`));
    if (type === 'VP8X') {
      if (size < 10) found.problems.push(problem('the VP8X chunk is too short'));
      else {
        extended = true;
        const flags = buffer[start];
        for (const [bit, name] of VP8X_FLAGS) if (flags & bit) found.problems.push(problem(`the VP8X header has the ${name} flag set (metadata is refused)`));
        found.width = 1 + buffer.readUIntLE(start + 4, 3);
        found.height = 1 + buffer.readUIntLE(start + 7, 3);
      }
    } else if (type === 'VP8 ' && !extended) {
      if (size < 10 || buffer[start + 3] !== 0x9d || buffer[start + 4] !== 0x01 || buffer[start + 5] !== 0x2a) found.problems.push(problem('the VP8 frame header has no start code 9D 01 2A'));
      else {
        found.width = buffer.readUInt16LE(start + 6) & 0x3fff;
        found.height = buffer.readUInt16LE(start + 8) & 0x3fff;
      }
    } else if (type === 'VP8L' && !extended) {
      if (size < 5 || buffer[start] !== 0x2f) found.problems.push(problem('the VP8L header has no signature byte 2F'));
      else {
        const bits = buffer.readUInt32LE(start + 1);
        found.width = (bits & 0x3fff) + 1;
        found.height = ((bits >>> 14) & 0x3fff) + 1;
      }
    } else if (type === 'EXIF' || type === 'XMP ') found.problems.push(problem(`the file has an ${type.trim()} chunk (metadata is refused)`));
    first = false;
    position = start + size + (size % 2);
  }
  if (riffMatches && position < buffer.length) found.problems.push(problem(`${buffer.length - position} stray bytes after the last chunk`));
  if (found.width === undefined && found.problems.length === 0) found.problems.push(problem('the webp has no picture chunk (VP8, VP8L)'));
  if (found.problems.length === 0 && (found.width < 1 || found.height < 1)) found.problems.push(problem('the width or the height is 0'));
}

function readPng(buffer, found) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    found.problems.push(problem('the file is not a png: it does not start with the png signature'));
    return;
  }
  let position = 8;
  let first = true;
  let ended = false;
  while (position + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(position);
    const type = latin1(buffer, position + 4, position + 8);
    if (position + 12 + size > buffer.length) {
      found.problems.push(problem(`the ${type} chunk runs past the end of the file`));
      return;
    }
    if (first && type !== 'IHDR') {
      found.problems.push(problem(`the first chunk is ${type}; a png starts with IHDR`));
      return;
    }
    if (type === 'IHDR') {
      if (size !== 13) found.problems.push(problem('the IHDR chunk has the wrong length'));
      else {
        found.width = buffer.readUInt32BE(position + 8);
        found.height = buffer.readUInt32BE(position + 12);
      }
    } else if (PNG_METADATA.includes(type)) found.problems.push(problem(`the file has a ${type} chunk (metadata is refused)`));
    first = false;
    position += 12 + size;
    if (type === 'IEND') { ended = true; break; }
  }
  if (!ended) found.problems.push(problem('the png has no IEND chunk'));
  else if (position !== buffer.length) found.problems.push(problem(`${buffer.length - position} bytes after IEND`));
  if (found.width !== undefined && (found.width < 1 || found.height < 1)) found.problems.push(problem('the width or the height is 0'));
}

// buffer: the file's bytes; name: the file name (its extension says which format it must be).
export function inspectImage(buffer, name) {
  const found = { problems: [], format: '', width: undefined, height: undefined, bytes: buffer.length };
  const extension = /\.(webp|png)$/.exec(String(name));
  if (!extension) {
    found.problems.push(problem(`the image ${JSON.stringify(String(name))} must be a .webp or .png file`));
    return found;
  }
  found.format = extension[1];
  if (buffer.length > LIMITS.imageBytes) found.problems.push(problem(`the image has ${buffer.length} bytes; at most ${LIMITS.imageBytes}`));
  (found.format === 'webp' ? readWebp : readPng)(buffer, found);
  return found;
}
