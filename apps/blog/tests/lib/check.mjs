// The tiny helper that every check file uses.
//
//   import { check, same, run } from '../lib/check.mjs';
//   await run(async () => {
//     check('BD-1 no runtime dependency', count === 0, `${count} found`);
//   });
//
// A check file prints one PASS or FAIL line per assertion and ends with a summary line. Its verdict is its exit
// code: 0 only when every assertion passed and at least one ran. Every line starts with the spec rule it covers.
import { isDeepStrictEqual } from 'node:util';
import { ROOT } from './paths.mjs';

let passed = 0;
let failed = 0;

// The detail of a line is one line of at most 300 characters, so that a failure stays readable.
function oneLine(text) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > 300 ? `${flat.slice(0, 297)}...` : flat;
}

export function check(name, ok, detail = '') {
  if (ok) passed += 1; else failed += 1;
  const shown = oneLine(detail);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${shown === '' ? '' : `  (${shown})`}`);
  return ok;
}

// Compares with deep equality and shows both values when they differ.
export function same(name, actual, expected) {
  const ok = isDeepStrictEqual(actual, expected);
  return check(name, ok, ok ? '' : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

function finish() {
  if (passed + failed === 0) check('the check made at least one assertion', false);
  console.log(`  ${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

function describe(error) {
  const message = (error && error.message) || error;
  const frame = String((error && error.stack) || '').split('\n').find((line) => /^\s+at /.test(line)) || '';
  return `${message} ${frame}`.split(`file://${ROOT}`).join('apps/blog').split(ROOT).join('apps/blog');
}

// Runs the body of a check. An error that escapes the body is a failed check, never a silent pass.
export async function run(body) {
  try {
    await body();
  } catch (error) {
    check('the check ran to its end', false, describe(error));
  }
  finish();
}
