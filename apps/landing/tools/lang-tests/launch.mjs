// launch (tools/lib.mjs): CHROMIUM_EXECUTABLE names the Chromium to start instead of the build that Playwright pins (spec 8.2, 9).
// A path that does not exist must be the one the launch tries and complains about; the working case is the gate's own run of
// the browser modules with that variable set (it needs a real browser, so it is not repeated here).
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { launch } from '../lib.mjs';

test('launch() tries the executable named by CHROMIUM_EXECUTABLE', async () => {
  const wanted = path.join(os.tmpdir(), `no-such-chromium-${process.pid}`);
  const before = process.env.CHROMIUM_EXECUTABLE;
  process.env.CHROMIUM_EXECUTABLE = wanted;
  try {
    let browser = null, error = null;
    try { browser = await launch(); } catch (e) { error = e; } finally { if (browser) await browser.close(); }
    assert.ok(error, 'launch() started a browser although CHROMIUM_EXECUTABLE names a file that does not exist');
    assert.ok(String(error.message).includes(wanted), `the error does not name ${wanted}: ${error.message}`);
  } finally {
    if (before === undefined) delete process.env.CHROMIUM_EXECUTABLE; else process.env.CHROMIUM_EXECUTABLE = before;
  }
});
