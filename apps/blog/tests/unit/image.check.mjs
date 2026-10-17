// PF-11, PR-8 (V7): the image checks. Signature, width and height from the header, at most 300,000 bytes, and every
// metadata case refused with a line that names the chunk or the flag. The real files come from an encoder that is not
// ours (tests/lib/images.mjs); the faulty ones differ from a well-formed file by exactly one chunk or flag.
import { check, same, run } from '../lib/check.mjs';
import { PNG_SIGNATURE, WEBP_FLAGS, pngChunk, png, pngOfSize, realImage, riffChunk, vp8Chunk, vp8lChunk, vp8xChunk, webp, webpFile } from '../lib/images.mjs';
import { inspectImage } from '../../src/lib/image.mjs';
import { postText } from '../lib/posts.mjs';
import { checkPostText } from '../../src/lib/post-file.mjs';

const inspect = (buffer, name) => inspectImage(buffer, name);
const whats = (result) => result.problems.map((item) => item.what);
const onlyProblem = (result, pattern) => result.problems.length === 1 && result.problems.every((item) => item.rule === 'PF-11') && pattern.test(result.problems[0].what);

await run(async () => {
  // ---- valid files: real ones first ----
  for (const [name, file, width, height, format] of [
    ['a real lossy webp (VP8)', 'real-lossy-8x6.webp', 8, 6, 'webp'],
    ['a real lossless webp (VP8L)', 'real-lossless-5x7.webp', 5, 7, 'webp'],
    ['a real webp with alpha (VP8X, ALPH, VP8)', 'real-alpha-9x4.webp', 9, 4, 'webp'],
    ['a real png', 'real-6x3.png', 6, 3, 'png'],
  ]) {
    const result = inspect(realImage(file), file);
    same(`V7 ${name} passes and gives its width and height`, [result.problems, result.format, result.width, result.height], [[], format, width, height]);
  }
  for (const [name, buffer, file, width, height] of [
    ['a built webp (VP8)', webp({ width: 1200, height: 630 }), 'a.webp', 1200, 630],
    ['a built webp (VP8L)', webpFile([vp8lChunk(321, 123)]), 'a.webp', 321, 123],
    ['a built webp (VP8X, no metadata flag)', webp({ width: 1000, height: 700, flags: WEBP_FLAGS.alpha }), 'a.webp', 1000, 700],
    ['a built webp with an ICC profile (not on the list of metadata)', webpFile([vp8xChunk(50, 40, WEBP_FLAGS.icc), riffChunk('ICCP', Buffer.alloc(8)), vp8Chunk(50, 40)]), 'a.webp', 50, 40],
    ['a built webp of 16383 x 16383', webp({ width: 16383, height: 16383 }), 'a.webp', 16383, 16383],
    ['a built png', png({ width: 1200, height: 4 }), 'a.png', 1200, 4],
    ['a png with an iCCP chunk (not on the list)', png({ extra: [pngChunk('iCCP', Buffer.alloc(8))] }), 'a.png', 6, 3],
  ]) {
    const result = inspect(buffer, file);
    same(`V7 ${name} passes`, [result.problems, result.width, result.height], [[], width, height]);
  }

  // ---- the size limit ----
  same('V7 a png of 300,000 bytes passes', [inspect(pngOfSize(300000), 'a.png').problems, pngOfSize(300000).length], [[], 300000]);
  const big = inspect(pngOfSize(300001), 'a.png');
  same('V7 a png of 300,001 bytes gives one PF-11 line that names the size', [big.problems.length, /300001 bytes/.test(whats(big)[0] || ''), /300000/.test(whats(big)[0] || '')], [1, true, true]);
  same('V7 a webp of 300,000 bytes passes', [inspect(webp({ size: 300000 }), 'a.webp').problems, webp({ size: 300000 }).length], [[], 300000]);
  same('V7 a webp of 300,002 bytes fails with one line', inspect(webp({ size: 300002 }), 'a.webp').problems.length, 1);

  // ---- not the format it says ----
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]), Buffer.from('JFIF\0', 'latin1'), Buffer.alloc(20)]);
  check('V7 a jpg renamed .webp is refused and the line says what it is not', onlyProblem(inspect(jpg, 'a.webp'), /not a webp/i), whats(inspect(jpg, 'a.webp')).join(' | '));
  check('V7 a jpg renamed .png is refused', onlyProblem(inspect(jpg, 'a.png'), /not a png/i), whats(inspect(jpg, 'a.png')).join(' | '));
  check('V7 a png named .webp is refused', onlyProblem(inspect(png(), 'a.webp'), /not a webp/i), whats(inspect(png(), 'a.webp')).join(' | '));
  check('V7 a webp named .png is refused', onlyProblem(inspect(webp(), 'a.png'), /not a png/i), whats(inspect(webp(), 'a.png')).join(' | '));
  check('V7 a name with another extension is refused', onlyProblem(inspect(png(), 'a.jpg'), /\.webp or \.png/), whats(inspect(png(), 'a.jpg')).join(' | '));
  check('V7 an empty file is refused', onlyProblem(inspect(Buffer.alloc(0), 'a.png'), /not a png/i));

  // ---- the nine faulty files, one fault each; each line names the chunk or the flag ----
  const faults = [
    ['a webp with an EXIF chunk', webp({ extra: [riffChunk('EXIF', Buffer.from('Exif\0\0'))] }), 'a.webp', /EXIF chunk/],
    ['a webp with an XMP chunk', webp({ extra: [riffChunk('XMP ', Buffer.from('<x/>'))] }), 'a.webp', /XMP chunk/],
    ['a webp whose VP8X header has the EXIF flag set', webp({ flags: WEBP_FLAGS.exif }), 'a.webp', /VP8X.*EXIF flag/],
    ['a webp whose VP8X header has the XMP flag set', webp({ flags: WEBP_FLAGS.xmp }), 'a.webp', /VP8X.*XMP flag/],
    ['a png with a tEXt chunk', png({ extra: [pngChunk('tEXt', Buffer.from('Author\0Someone'))] }), 'a.png', /tEXt chunk/],
    ['a png with an iTXt chunk', png({ extra: [pngChunk('iTXt', Buffer.from('k\0\0\0\0\0v'))] }), 'a.png', /iTXt chunk/],
    ['a png with a zTXt chunk', png({ extra: [pngChunk('zTXt', Buffer.from('k\0\0x'))] }), 'a.png', /zTXt chunk/],
    ['a png with an eXIf chunk', png({ extra: [pngChunk('eXIf', Buffer.from('MM\0*'))] }), 'a.png', /eXIf chunk/],
    ['a png with a tIME chunk', png({ extra: [pngChunk('tIME', Buffer.alloc(7))] }), 'a.png', /tIME chunk/],
  ];
  for (const [name, buffer, file, pattern] of faults) {
    const result = inspect(buffer, file);
    check(`V7 ${name}: exactly one PF-11 line, naming it`, onlyProblem(result, pattern), whats(result).join(' | '));
  }
  same('V7 there are nine faulty files', faults.length, 9);
  const both = inspect(webp({ flags: WEBP_FLAGS.exif | WEBP_FLAGS.xmp, extra: [riffChunk('EXIF', Buffer.alloc(4)), riffChunk('XMP ', Buffer.alloc(4))] }), 'a.webp');
  same('V7 a webp with both flags and both chunks gives four lines', both.problems.length, 4);
  const real = inspect(Buffer.concat([realImage('real-6x3.png').subarray(0, 33), pngChunk('tEXt', Buffer.from('Comment\0hallo')), realImage('real-6x3.png').subarray(33)]), 'a.png');
  check('V7 a real png with a tEXt chunk inserted after its IHDR is refused', onlyProblem(real, /tEXt chunk/), whats(real).join(' | '));

  // ---- damaged files ----
  const damaged = [
    ['a webp whose RIFF size is wrong', webpFile([vp8Chunk(10, 10)], { riffSize: 99 }), 'a.webp', /RIFF/],
    ['a webp with a chunk that runs past the end', Buffer.concat([webp().subarray(0, webp().length - 8)]), 'a.webp', /RIFF|past the end/],
    ['a webp without a picture chunk', webpFile([riffChunk('JUNK', Buffer.alloc(4))]), 'a.webp', /VP8/],
    ['a webp with a bad frame header', webpFile([riffChunk('VP8 ', Buffer.alloc(30))]), 'a.webp', /frame header|start code/],
    ['a png with width 0', png({ width: 0 }), 'a.png', /width|height/],
    ['a png without IEND', Buffer.concat([png().subarray(0, png().length - 12)]), 'a.png', /IEND/],
    ['a png with data after IEND', png({ after: Buffer.from('Comment: hello') }), 'a.png', /after IEND/],
    ['a png that does not start with IHDR', Buffer.concat([PNG_SIGNATURE, pngChunk('IDAT', Buffer.alloc(4)), pngChunk('IEND')]), 'a.png', /IHDR/],
    ['a png with a chunk that runs past the end', Buffer.concat([png().subarray(0, 50)]), 'a.png', /past the end/],
  ];
  for (const [name, buffer, file, pattern] of damaged) {
    const result = inspect(buffer, file);
    check(`V7 ${name} is refused with a PF-11 line`, result.problems.length >= 1 && result.problems.every((item) => item.rule === 'PF-11') && result.problems.some((item) => pattern.test(item.what)), whats(result).join(' | '));
  }
  void both;

  // ---- in a post file: the keys image, imageAlt, imageRights (PF-11) ----
  const FILE = 'tests/fixtures/2026/ein-film.md';
  const images = { 'ein-film.webp': webp({ width: 800, height: 450 }), 'ein-film.png': png({ width: 640, height: 360 }), 'ein-film.jpg': png() };
  const withImage = { image: 'ein-film.webp', imageAlt: '"Eine Folie aus dem Vortrag"', imageRights: 'true' };
  const verdict = (front, options = {}) => checkPostText(postText({ front }), { file: FILE, fixture: true, readImage: (name) => images[name] || null, ...options })
    .findings.map((finding) => `${finding.rule}:${finding.where.slice(FILE.length + 1)}`);
  const result = checkPostText(postText({ front: withImage }), { file: FILE, fixture: true, readImage: (name) => images[name] || null });
  same('V7 a post with a valid webp passes, and the build gets format, width and height', [result.findings, result.post.image, result.post.imageInfo], [[], 'ein-film.webp', { format: 'webp', width: 800, height: 450, bytes: images['ein-film.webp'].length }]);
  same('V7 a post with a valid png passes', verdict({ ...withImage, image: 'ein-film.png' }), []);
  same('V7 a faulty image gives its own PF-11 line at the line of the key image', verdict({ ...withImage }, { readImage: () => webp({ extra: [riffChunk('EXIF', Buffer.alloc(4))] }) }), ['PF-11:10']);
  same('V7 image without imageAlt', verdict({ ...withImage, imageAlt: undefined }), ['PF-11:10']);
  same('V7 imageAlt without image', verdict({ imageAlt: '"Text"' }), ['PF-11:10']);
  same('V7 image without imageRights: true', verdict({ ...withImage, imageRights: undefined }), ['PF-11:10']);
  same('V7 image with imageRights: false', verdict({ ...withImage, imageRights: 'false' }), ['PF-11:12']);
  same('V7 imageRights without image', verdict({ imageRights: 'true' }), ['PF-11:10']);
  same('V7 imageAlt of 251 characters', verdict({ ...withImage, imageAlt: 'x'.repeat(251) }), ['PF-11:11']);
  same('V7 imageAlt of 250 characters', verdict({ ...withImage, imageAlt: 'x'.repeat(250) }), []);
  same('V7 an image name with a path part', verdict({ ...withImage, image: '../ein-film.webp' }), ['PF-11:10']);
  same('V7 an image name that is not the slug of the post', verdict({ ...withImage, image: 'anderes.webp' }), ['PF-11:10']);
  same('V7 an image file that does not exist', verdict({ ...withImage, image: 'ein-film.webp' }, { readImage: () => null }), ['PF-11:10']);
  same('V7 an image with another extension', verdict({ ...withImage, image: 'ein-film.jpg' }), ['PF-11:10']);
});
