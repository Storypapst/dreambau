// `npm run build`       preview of posts/        -> dist/       (the default; the marks of the preview come with slice S8)
// `npm run build:demo`  fixtures of tests/fixtures/ -> dist-demo/ (preview mode; never the input of the publisher, BD-3)
// The two commands write to different directories and never touch each other's (BD-11).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBlog } from './generate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'Usage: npm run build            preview of posts/ into dist/\n       npm run build:demo       the fixtures of tests/fixtures/ into dist-demo/ (preview mode)';

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--demo')) {
  console.error(`Unknown option: ${args.filter((arg) => arg !== '--demo').join(' ')}\n${USAGE}`);
  process.exit(2);
}
const demo = args.includes('--demo');
const outName = demo ? 'dist-demo' : 'dist';

try {
  const manifest = buildBlog({
    postsDir: path.join(ROOT, demo ? path.join('tests', 'fixtures') : 'posts'),
    outDir: path.join(ROOT, outName),
    mode: 'preview',
  });
  console.log(`Built ${manifest.posts.length} ${manifest.posts.length === 1 ? 'post' : 'posts'} and ${manifest.files.length} files into ${outName}/ (mode ${manifest.mode}).`);
} catch (error) {
  console.error(`FAIL build: ${error.message}`);
  process.exit(1);
}
