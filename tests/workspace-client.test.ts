// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, setActiveViewer } from "../src/client/api.js";
import { loadWorkspaceRuns, loadWorkspaceRun, loadWorkspaceDocuments, safeWorkspaceContentUrl, safeWorkspaceExternalUrl } from "../src/client/workspace-client.js";
import type { WorkspaceFile } from "../src/shared/workspace.js";
vi.mock("../src/client/api.js", async (original) => ({ ...await original<typeof import("../src/client/api.js")>(), api: vi.fn() }));
afterEach(() => { vi.mocked(api).mockReset(); setActiveViewer(null); });
const file: WorkspaceFile = { id: "file-1", runId: "run-1", kind: "screenshot", filename: "proof.png", caption: "Proof", contentType: "image/png", byteSize: 42, sha256: "a".repeat(64), publicUrl: null, viewerUrl: null, previewUrl: "/testmails/api/workspace/evidence/run-1/files/file-1/content?viewer=viewer-a", downloadUrl: "/testmails/api/workspace/evidence/run-1/files/file-1/content?viewer=viewer-a&download=1", processingState: "ready" };
describe("workspace client", () => {
  it("sends scoped filters, opaque cursors and abort signals without dropping source identity", async () => {
    vi.mocked(api).mockResolvedValue({ items: [], nextCursor: null, evidenceStatus: "available" });
    const signal = new AbortController().signal;
    await loadWorkspaceRuns({ project: "oriso", source: "evidence-run", environment: "dev", result: "failed", q: "Role & issue 212", cursor: "a/b+==", limit: 20 }, signal);
    const [path, init] = vi.mocked(api).mock.calls[0];
    const url = new URL(path, "https://example.test");
    expect(url.pathname).toBe("/workspace/runs");
    expect(Object.fromEntries(url.searchParams)).toEqual({ project: "oriso", source: "evidence-run", environment: "dev", result: "failed", q: "Role & issue 212", cursor: "a/b+==", limit: "20" });
    expect(init?.signal).toBe(signal);
    await loadWorkspaceRun("test-run", "same/id", signal);
    expect(vi.mocked(api).mock.calls[1][0]).toBe("/workspace/runs/test-run/same%2Fid");
    await loadWorkspaceDocuments({ project: "orimo", q: "Guide" }, signal);
    expect(vi.mocked(api).mock.calls[2][0]).toContain("/workspace/documents?project=orimo");
  });
  it("accepts only the exact authenticated file endpoint bound to the active viewer", () => {
    setActiveViewer("viewer-a");
    expect(safeWorkspaceContentUrl(file, "preview")).toBe(file.previewUrl);
    expect(safeWorkspaceContentUrl(file, "download")).toBe(file.downloadUrl);
    for (const previewUrl of ["javascript:alert(1)", "https://evil.test/x", "/testmails/api/auth/session?viewer=viewer-a", "/testmails/api/workspace/evidence/other/files/file-1/content?viewer=viewer-a", "/testmails/api/workspace/evidence/run-1/files/file-1/content?viewer=viewer-b"]) {
      expect(safeWorkspaceContentUrl({ ...file, previewUrl }, "preview")).toBeNull();
    }
    expect(safeWorkspaceContentUrl({ ...file, processingState: "rejected" }, "preview")).toBeNull();
    setActiveViewer(null);
    expect(safeWorkspaceContentUrl(file, "preview")).toBeNull();
  });
  it("rejects active schemes, insecure external links and URL credentials", () => {
    expect(safeWorkspaceExternalUrl("https://github.com/Storypapst/dreambau/issues/212")).toContain("github.com");
    for (const url of ["javascript:alert(1)", "data:text/html,<script>", "http://evil.test", "https://user:secret@example.test/x", "//evil.test"]) expect(safeWorkspaceExternalUrl(url)).toBeNull();
  });
});
