// The browser launcher and the observer: headless Chromium through the Playwright that this folder pins (1.56.1).
// A check closes every browser it launches (withBrowser, or a finally block).
import { chromium } from 'playwright';

export async function launchBrowser() {
  return chromium.launch();
}

export async function withBrowser(body) {
  const browser = await launchBrowser();
  try {
    return await body(browser);
  } finally {
    await browser.close();
  }
}

// A fresh context and page that record what the clean-load rows ask about: every request, every console message,
// every uncaught page error and every policy-violation event (`violations()` reads them from the page).
//   const { context, page, seen, violations } = await openObserved(browser, { viewport: { width: 1280, height: 720 } });
export async function openObserved(browser, contextOptions = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...contextOptions });
  context.setDefaultTimeout(10000); // a missing element fails after 10 s, not after Playwright's 30
  const seen = { requests: [], console: [], pageErrors: [] };
  context.on('request', (request) => seen.requests.push({ url: request.url(), method: request.method(), type: request.resourceType() }));
  await context.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (event) => window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`.trim()));
  });
  const page = await context.newPage();
  page.on('console', (message) => seen.console.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', (error) => seen.pageErrors.push(String((error && error.message) || error)));
  return { context, page, seen, violations: () => page.evaluate(() => window.__violations || []) };
}

// What the page left in the browser: cookies, the two Web Storage areas, IndexedDB databases and Cache API entries.
export async function storedByThePage(context, page) {
  const inPage = await page.evaluate(async () => ({
    documentCookie: document.cookie,
    localStorage: localStorage.length,
    sessionStorage: sessionStorage.length,
    indexedDB: indexedDB.databases ? (await indexedDB.databases()).map((database) => database.name) : [],
    caches: window.caches ? await caches.keys() : [],
  }));
  return { cookies: (await context.cookies()).map((cookie) => cookie.name), ...inPage };
}
