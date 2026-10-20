import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, email = "lisa.workstate@example.test") {
  const options = await page.request.post(
    "/testmails/api/auth/passkeys/authentication/options",
    { data: { email } },
  );
  expect(options.status()).toBe(200);
  const challenge = await options.json();
  const result = await page.request.post(
    "/testmails/api/auth/passkeys/authentication/verify",
    {
      data: {
        flowId: challenge.flowId,
        response: { id: challenge.options.allowCredentials[0].id },
      },
    },
  );
  // Credential ids are opaque. Discover the fixture's id only through the controlled login adapter.
  return result;
}
test("bookmark, filters, keyboard, source links and private data boundaries", async ({
  page,
}, info) => {
  const authentication = await login(page);
  expect(authentication.status()).toBe(200);
  await page.goto("/testmails/?view=work-state");
  await expect(
    page.getByRole("heading", { name: "ORISO Arbeitsstand", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Check needs attention", exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    "Private repository record",
  );
  await expect(
    page
      .locator(
        'a[href="https://github.com/OpenResilienceInitiative/repoA/actions/runs/1"]',
      )
      .first(),
  ).toBeVisible();
  const finalTab = await page
    .getByRole("tab", { name: /^Datenstand/ })
    .boundingBox();
  const firstCard = await page
    .locator('[data-slot="card"]')
    .first()
    .boundingBox();
  expect(firstCard!.y).toBeGreaterThanOrEqual(finalTab!.y + finalTab!.height);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Zurück", exact: true }),
  ).toBeFocused();
  const waiting = page.getByRole("tab", { name: /^Wartet/ });
  await page.getByRole("tab", { name: /^Handlung nötig/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(waiting).toHaveAttribute("data-state", "active");
  await expect(
    page.getByRole("link", { name: "Review needed", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /^Handlung nötig/ }).click();
  await page.getByRole("combobox", { name: "Priorität", exact: true }).click();
  await page.getByRole("option", { name: "P1", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Source needs refreshing", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
  await page.getByRole("combobox", { name: "Zuständig", exact: true }).click();
  await page.getByRole("option", { name: "Lisa Fixture", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Partial review evidence", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
  const scopedResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/work-state/attention?") &&
      new URL(response.url()).searchParams.get("repositoryId") === "A",
  );
  await page.getByRole("combobox", { name: "Repository", exact: true }).click();
  await page
    .getByRole("option", {
      name: "OpenResilienceInitiative/repoA",
      exact: true,
    })
    .click();
  expect((await scopedResponse).status()).toBe(200);
  await page.getByRole("combobox", { name: "Grund", exact: true }).click();
  await page
    .getByRole("option", { name: "Mergefähigkeit unbekannt", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Check needs attention", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Source needs refreshing", exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Priorität", exact: true }).click();
  await page.getByRole("option", { name: "P1", exact: true }).click();
  await expect(
    page.getByText("Keine passenden Pull Requests", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
  await page.getByRole("tab", { name: /^Datenstand/ }).click();
  await expect(
    page.getByRole("link", { name: "Source needs refreshing", exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).toContainText("Daten veraltet");
  await page.getByRole("tab", { name: /^Zuletzt gemerged/ }).click();
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Nicht erfasst");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Details", exact: true }),
  ).toBeFocused();
  await page.getByRole("tab", { name: /^Handlung nötig/ }).click();
  await page
    .getByRole("button", { name: "Details", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Inspect the failing job",
  );
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page
    .getByRole("button", { name: "Fortsetzung kopieren", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Fortsetzung kopiert");
  const copied = JSON.parse(
    await page.evaluate(() => navigator.clipboard.readText()),
  );
  expect(copied.nextAction).toBe(
    "Inspect the failing job and repeat verification",
  );
  expect(copied.localVerificationRequired).toBe(true);
  expect(Buffer.byteLength(JSON.stringify(copied))).toBeLessThanOrEqual(6144);
  await page.screenshot({
    path: `output/playwright/work-state/verified-resume-${info.project.name}-de.png`,
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `output/playwright/work-state/verified-after-${info.project.name}-de.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Quelle aktualisieren", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Aktualisierung vorgemerkt" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zurück", exact: true }).click();
  await page
    .getByRole("button", { name: "Koordinationszentrum", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ORISO Arbeitsstand öffnen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ORISO Arbeitsstand", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zurück", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "ORISO Arbeitsstand öffnen",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "ORISO Arbeitsstand öffnen", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "ORISO Arbeitsstand", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("view")).toBe("work-state");
  await page.evaluate(() => localStorage.setItem("testmails-locale", "en"));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "ORISO work state", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh source", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: `output/playwright/work-state/verified-after-${info.project.name}-en.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Details", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Copy continuation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Continuation copied");
  await page.screenshot({
    path: `output/playwright/work-state/verified-resume-${info.project.name}-en.png`,
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  const guest = await login(page, "bart.workstate@example.test");
  expect(guest.status()).toBe(200);
  await page.reload();
  await expect(
    page.getByText("No repository access", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.get(
        "/testmails/api/work-state/attention?repositoryId=A",
      )
    ).status(),
  ).toBe(403);
  await expect(page.locator("body")).not.toContainText("Check needs attention");
});
