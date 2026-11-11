// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { setActiveViewer } from "@/api";
import { EvidenceWorkspaceSteps } from "@/components/evidence-workspace-steps";
import type { WorkspaceFile, WorkspaceRunDetail } from "../src/shared/workspace.js";

const file: WorkspaceFile = {
  id: "steps", runId: "actual", filename: "test-steps.json", caption: "", kind: "document",
  contentType: "application/json", byteSize: 150, sha256: "a".repeat(64), processingState: "ready",
  previewUrl: "/testmails/api/workspace/evidence/actual/files/steps/content?viewer=human",
  publicUrl: null, viewerUrl: null, downloadUrl: null,
};
const detail: WorkspaceRunDetail = {
  id: "actual", source: "evidence-run", title: "Run", project: "oriso", environment: "pre-dev",
  createdAt: "2026-11-11T12:00:00Z", lifecycle: "draft", result: "informational", commitSha: "abcdef1",
  applicationVersion: null, repository: "Example/repo", pullRequestUrl: null, filesCount: 1, owner: "kio",
  events: [], references: [], files: [file], evidenceStatus: "available",
};

it("shows an authorized runner step, then forgets it on selection change", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setActiveViewer("human");
  const response = vi.fn(async () => Response.json({ schemaVersion: 1, steps: [{ label: "Clicked language selector", result: "passed" }] }));
  vi.stubGlobal("fetch", response);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<EvidenceWorkspaceSteps detail={detail} locale="en"/>));
    expect(container.textContent).toContain("Clicked language selector");
    expect(container.textContent).toContain("Passed");
    expect(response).toHaveBeenCalledOnce();
    await act(async () => root.render(<EvidenceWorkspaceSteps detail={{ ...detail, id: "historical", files: [] }} locale="en"/>));
    expect(container.textContent).toContain("No steps were recorded");
    expect(container.textContent).not.toContain("Clicked language selector");
    expect(response).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    setActiveViewer(null);
    vi.unstubAllGlobals();
  }
});
