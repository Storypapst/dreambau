import { defineConfig } from "@playwright/test";
const raw = process.env.WORK_STATE_BASE_URL;
if (!raw)
  throw new Error(
    "WORK_STATE_BASE_URL is required for the controlled work-state fixture",
  );
const url = new URL(raw);
if (
  url.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.username ||
  url.password ||
  url.pathname !== "/" ||
  url.search ||
  url.hash
)
  throw new Error(
    "WORK_STATE_BASE_URL must be an explicit loopback HTTP origin",
  );
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "work-state.spec.ts",
  workers: 1,
  retries: 0,
  reporter: "line",
  outputDir: "output/playwright/work-state",
  use: { baseURL: url.origin, trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "tablet",
      use: {
        browserName: "chromium",
        viewport: { width: 820, height: 1180 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "./node_modules/.bin/tsx tests/helpers/work-state-server.ts",
    url: url.origin + "/testmails/",
    reuseExistingServer: false,
    timeout: 20000,
  },
});
