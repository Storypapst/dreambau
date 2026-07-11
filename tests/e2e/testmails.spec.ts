import { expect, test } from "@playwright/test";

const password = process.env.TESTMAILS_E2E_PASSWORD;
if (!password) throw new Error("TESTMAILS_E2E_PASSWORD must come from the operator Keychain");

async function login(page: import("@playwright/test").Page) {
  await page.goto("/testmails/");
  await page.getByLabel("Gemeinsames Passwort").fill(password!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Springfield Testkonten" })).toBeVisible();
}

test("unauthenticated surfaces contain no credentials", async ({ page, request }) => {
  await page.goto("/testmails/");
  await expect(page.getByText("Testkonten öffnen")).toBeVisible();
  await expect(page.getByText("@dreambau.com")).toHaveCount(0);
  expect((await request.get("/testmails/api/accounts")).status()).toBe(401);
  expect((await request.get("/testmails/testmails.md")).status()).toBe(401);
});

test("login, filtering, reveal, copy, metadata, export and logout", async ({ page, browserName }, testInfo) => {
  await login(page);
  await expect(page.getByText("180 von 180 Konten")).toBeVisible();
  await expect(page.getByText("150 S/MIME")).toBeVisible();
  await expect(page.getByText("30 Vergleichskonten")).toBeVisible();
  await expect(page.getByLabel("Konten nach Version filtern")).toBeVisible();
  await expect(page.getByRole("button", { name: "Rollen filtern" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Themen filtern" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Konversationen filtern" })).toBeVisible();

  await page.getByPlaceholder("Name, E-Mail, Rolle, Thema, Notiz …").fill("spider.pig@oriso.org");
  await expect(page.getByText("1 von 180 Konten")).toBeVisible();
  const row = page.locator("tbody tr").filter({ hasText: "spider.pig@oriso.org" });
  if (testInfo.project.name === "desktop") {
    await expect(row).toHaveCount(1);
    const passwordCode = row.locator("code").filter({ hasText: "••••" });
    await row.getByRole("button", { name: "Passwort anzeigen oder maskieren" }).click();
    await expect(passwordCode).toHaveCount(0);
    if (browserName === "chromium") {
      await row.getByRole("button", { name: "Passwort kopieren" }).click();
      expect((await page.evaluate(() => navigator.clipboard.readText())).length).toBeGreaterThan(15);
    }
    await row.getByRole("button", { name: "Spider Pig" }).click();
  } else {
    await page.getByRole("button", { name: "Spider Pig" }).click();
  }
  await expect(page.getByText("Für oriso.org absichtlich deaktiviert", { exact: false })).toBeVisible();
  await page.getByRole("dialog", { name: "Spider Pig" }).getByRole("button", { name: "Metadaten bearbeiten" }).click();
  await page.getByLabel("Verschifft in Version").fill("99.0.0");
  await page.getByLabel("Notizen").fill("E2E verification marker");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("Metadaten gespeichert")).toBeVisible();
  const markdown = await page.evaluate(async () => (await fetch("/testmails/testmails.md")).text());
  expect(markdown).toContain("E2E verification marker");

  await page.getByLabel("Version größer als").fill("98");
  await page.getByRole("button", { name: "1 vormerken" }).click();
  await page.getByRole("button", { name: "Markieren", exact: true }).click();
  await expect(page.getByText("1 Konten vorgemerkt")).toBeVisible();

  await page.evaluate(async () => {
    await fetch("/testmails/api/accounts/spider.pig%40oriso.org", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shippedVersion: "", lifecycleStatus: "active", roles: [], topics: [], conversationTypes: [], fixtureQuality: "empty", sampleFileCount: 0, notes: "" }) });
  });
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page.getByText("Testkonten öffnen")).toBeVisible();
});

test("domain filter and mobile cards are usable", async ({ page }, testInfo) => {
  await login(page);
  await page.getByRole("radio", { name: "oriso.org" }).click();
  await expect(page.getByText("30 von 180 Konten")).toBeVisible();
  if (testInfo.project.name === "mobile") await expect(page.locator('[data-slot="card"]')).toHaveCount(30);
});

test("taxonomy settings are editable and persist", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Auswahllisten" }).click();
  await page.getByLabel("Themengebiete").fill("E2E Thema");
  await page.getByRole("dialog", { name: "Auswahllisten" }).getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Auswahllisten gespeichert")).toBeVisible();
  const topics = await page.evaluate(async () => (await (await fetch("/testmails/api/taxonomies")).json()).topics as string[]);
  expect(topics).toContain("E2E Thema");
  await page.evaluate(async () => { await fetch("/testmails/api/taxonomies/topics", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: [] }) }); });
});
