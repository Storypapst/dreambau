// @vitest-environment jsdom
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkStateDashboard } from "../src/client/components/work-state-dashboard.js";
let container: HTMLDivElement, root: Root;
const row = {
  pr: {
    id: "7",
    number: 7,
    url: "https://github.com/org/repo/pull/7",
    title: "Failing build",
    author: "author",
    base: "dev",
    head: "feature",
    headSha: "head",
    baseSha: "base",
    repositoryId: "A",
    lifecycle: "open",
    draft: false,
    mergedAt: null,
  },
  repository: { id: "A", fullName: "org/repo" },
  reasons: [
    {
      code: "checks_failed",
      category: "action",
      url: "https://github.com/org/repo/actions/runs/7",
      observedAt: new Date().toISOString(),
    },
  ],
  assignments: [],
  observedAt: new Date().toISOString(),
  deployment: "not_recorded",
  acceptance: "not_recorded",
};
const payload = {
  items: [row],
  nextCursor: null,
  total: 1,
  counts: { action: 1, waiting: 0, merged: 0, data: 0 },
  repositories: [
    {
      id: "A",
      fullName: "org/repo",
      coverage: "complete",
      lastSuccessAt: new Date().toISOString(),
      errorCode: null,
    },
  ],
  options: { people: [], priorities: [], reasons: ["checks_failed"] },
  mode: "normal",
  generatedAt: new Date().toISOString(),
};
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/testmails/?view=work-state");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function mount(locale: "de" | "en" = "en") {
  await act(async () => {
    root.render(
      <WorkStateDashboard locale={locale} onBack={() => undefined} />,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
it("shows loading before an empty stored result", async () => {
  let done!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    () =>
      new Promise<Response>((resolve) => {
        done = resolve;
      }),
  );
  await mount();
  expect(container.textContent).toContain("Loading");
  await act(async () =>
    done(
      new Response(JSON.stringify({ ...payload, items: [], total: 0 }), {
        status: 200,
      }),
    ),
  );
  expect(container.textContent).toContain("No matching pull requests");
});
it("shows a source link, unknown assignments and real details", async () => {
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL) =>
      new Response(
        JSON.stringify(
          String(input).includes("/pulls/7")
            ? {
                ...row,
                pr: { ...row.pr, facets: {} },
                workItems: [
                  {
                    id: "work",
                    goal: "Ship change",
                    owner: null,
                    priority: null,
                    links: [],
                    checkpoint: {
                      nextAction: "Inspect failing job",
                      lastVerifiedAction: "Observed failure",
                      blockers: [],
                      evidenceLinks: ["https://example.test/evidence"],
                    },
                  },
                ],
                history: [],
              }
            : payload,
        ),
        { status: 200 },
      ),
  );
  await mount();
  expect(
    container.querySelector(
      'a[href="https://github.com/org/repo/actions/runs/7"]',
    ),
  ).not.toBeNull();
  expect(container.textContent).toContain("Unknown");
  const button = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Details"),
  )!;
  await act(async () => button.click());
  expect(document.body.textContent).toContain("Inspect failing job");
  expect(document.body.textContent).toContain("Not recorded");
});
it("renders error and retries instead of showing an empty success", async () => {
  let calls = 0;
  vi.stubGlobal("fetch", async () =>
    ++calls === 1
      ? new Response(JSON.stringify({ error: "scope_denied" }), { status: 403 })
      : new Response(JSON.stringify(payload), { status: 200 }),
  );
  await mount("de");
  expect(container.textContent).toContain("Zugriff");
  expect(container.textContent).not.toContain("Failing build");
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Erneut"))!
      .click(),
  );
  expect(container.textContent).toContain("Failing build");
});
it("shows partial source coverage and changes the actual requested view", async () => {
  const paths: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    paths.push(String(input));
    return new Response(
      JSON.stringify({
        ...payload,
        repositories: [
          {
            ...payload.repositories[0],
            coverage: "partial",
            errorCode: "http_403",
          },
        ],
      }),
      { status: 200 },
    );
  });
  await mount();
  expect(container.textContent).toContain("Partial");
  const tab = container.querySelector('[role="tab"][data-state="inactive"]')!;
  await act(async () =>
    tab.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    ),
  );
  expect(paths.some((path) => path.includes("view=waiting"))).toBe(true);
});
it("labels old-revision details as unconfirmed and retains safe source links", async () => {
  const facet = {
    coverage: "complete",
    errorCode: null,
    observedAt: new Date().toISOString(),
    sourceRevision: "old:base:feature:dev",
    value: [
      {
        name: "prior build",
        url: "https://github.com/org/repo/actions/runs/old",
      },
      { name: "unsafe", url: "javascript:alert(1)" },
    ],
  };
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL) =>
      new Response(
        JSON.stringify(
          String(input).includes("/pulls/7")
            ? {
                ...row,
                pr: { ...row.pr, facets: { checks: facet } },
                workItems: [],
                history: [],
              }
            : payload,
        ),
        { status: 200 },
      ),
  );
  await mount();
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Details"))!
      .click(),
  );
  expect(document.body.textContent).toContain("Not current");
  expect(
    document.querySelector(
      'a[href="https://github.com/org/repo/actions/runs/old"]',
    ),
  ).not.toBeNull();
  expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
});

it("renders the PR observation age instead of a newer repository scan", async () => {
  const old = new Date(Date.now() - 31 * 24 * 60 * 60000).toISOString();
  window.history.replaceState(
    null,
    "",
    "/testmails/?view=work-state&wsView=merged",
  );
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          ...payload,
          items: [
            {
              ...row,
              observedAt: old,
              reasons: [],
              pr: { ...row.pr, lifecycle: "merged", mergedAt: old },
            },
          ],
        }),
        { status: 200 },
      ),
  );
  await mount();
  expect(
    [...container.querySelectorAll("p")].find((p) =>
      p.textContent?.startsWith("Source observed:"),
    )?.textContent,
  ).toContain("744 hours");
});

async function openDetails() {
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Details"))!
      .click(),
  );
}
function pollCallback(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.find((args) => args[1] === 60000)![0] as () => void;
}
it("revalidates an open detail sheet after the list observes a newer head", async () => {
  const interval = vi.spyOn(window, "setInterval");
  let head = "head";
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL) =>
      new Response(
        JSON.stringify(
          String(input).includes("/pulls/7")
            ? {
                ...row,
                pr: { ...row.pr, headSha: head, facets: {} },
                workItems: [
                  {
                    id: "work",
                    goal: "Change",
                    links: [],
                    checkpoint: {
                      nextAction: `Inspect ${head}`,
                      blockers: [],
                      evidenceLinks: [],
                    },
                  },
                ],
              }
            : {
                ...payload,
                items: [{ ...row, pr: { ...row.pr, headSha: head } }],
              },
        ),
        { status: 200 },
      ),
  );
  await mount();
  await openDetails();
  expect(document.body.textContent).toContain("Inspect head");
  head = "new-head";
  await act(async () => pollCallback(interval)());
  expect(document.body.textContent).toContain("Inspect new-head");
  expect(document.body.textContent).not.toContain("Inspect head");
});

it.each(["scope_denied", "session_required", "grant_removed", "network_error"])(
  "clears open and pending details after %s is learned by a list reload",
  async (failure) => {
    const interval = vi.spyOn(window, "setInterval");
    let revoked = false,
      detailCalls = 0;
    let pending!: (value: Response) => void;
    const detail = {
      ...row,
      pr: { ...row.pr, facets: {} },
      workItems: [
        {
          id: "work",
          goal: "Change",
          links: [],
          checkpoint: {
            nextAction: "Protected note",
            blockers: [],
            evidenceLinks: [],
          },
        },
      ],
    };
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      if (String(input).includes("/pulls/7")) {
        if (++detailCalls > 1)
          return new Promise<Response>((resolve) => {
            pending = resolve;
          });
        return new Response(JSON.stringify(detail), { status: 200 });
      }
      if (!revoked)
        return new Response(JSON.stringify(payload), { status: 200 });
      if (failure === "network_error") throw new Error("network_error");
      return failure === "grant_removed"
        ? new Response(
            JSON.stringify({ ...payload, items: [], repositories: [] }),
            { status: 200 },
          )
        : new Response(JSON.stringify({ error: failure }), {
            status: failure === "scope_denied" ? 403 : 401,
          });
    });
    await mount();
    await openDetails();
    expect(document.body.textContent).toContain("Protected note");
    await act(async () => pollCallback(interval)());
    revoked = true;
    await act(async () => pollCallback(interval)());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    if (pending)
      await act(async () =>
        pending(new Response(JSON.stringify(detail), { status: 200 })),
      );
    expect(document.body.textContent).not.toContain("Protected note");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  },
);
