import path from "node:path";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkStateStore } from "../src/server/work-state/store.js";

const scope = { project: "oriso" as const, actorId: "alice" };
const bob = { ...scope, actorId: "bob" };
const dirs: string[] = [];
const stores: ReturnType<typeof createWorkStateStore>[] = [];
function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), "work-state-")); dirs.push(dir);
  const filename = path.join(dir, "work-state.sqlite");
  const store = createWorkStateStore(filename); stores.push(store);
  for (const id of ["A", "B"]) store.configureRepository({ id, project: "oriso", fullName: `OpenResilienceInitiative/repo${id}`, integrationBranch: "dev" });
  store.setRepositoryGrant({ actorId: "alice", project: "oriso", repositoryId: "A", allowed: true });
  return { store, filename };
}
const linkA = { repositoryId: "A", kind: "pull" as const, number: 1 };
const linkB = { repositoryId: "B", kind: "issue" as const, number: 2 };
const note = { expectedVersion: 1, goal: "Continue safely", branch: "feat/test", commit: "abc123", lastVerifiedAction: "Tests passed", blockers: ["review"], nextAction: "Open evidence", evidenceLinks: ["https://evidence.dreambau.com/proof"], optionalSessionUrl: "https://chatgpt.com/c/session-one" };
const pr = { id: "github-pr-1", number: 1, url: "https://github.com/OpenResilienceInitiative/repoA/pull/1", title: "Fix one", author: "developer", base: "dev", head: "feat/test", headSha: "abc123", lifecycle: "open" as const, draft: false, mergedAt: null, facets: { reviewDecision: { value: "APPROVED", sourceRevision: "abc123", observedAt: "2026-10-20T10:00:00Z", lastAttemptAt: "2026-10-20T10:00:00Z", lastSuccessAt: "2026-10-20T10:00:00Z", coverage: "complete" as const, errorCode: null } } };
const snapshot = { repositoryId: "A", fullName: "OpenResilienceInitiative/repoA", collectedAt: "2026-10-20T10:00:00Z", pullRequests: [pr], closedCandidates: [], coveredPages: 1, complete: true };
afterEach(() => { for (const store of stores.splice(0)) store.close(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("persistent work state", () => {
  it("retains work items, checkpoints, links, history and PRs across close/reopen", () => {
    const { store, filename } = setup();
    const item = store.createWorkItem(scope, { goal: "Ship fix", links: [linkA] });
    const updated = store.writeCheckpoint(scope, item.id, note);
    store.applyRepositorySnapshot(snapshot);
    expect(updated.version).toBe(2);
    store.close();
    const reopened = createWorkStateStore(filename); stores.push(reopened);
    expect(reopened.getWorkItem(scope, item.id)).toMatchObject({ goal: "Ship fix", version: 2, links: [expect.objectContaining(linkA)], checkpoint: expect.objectContaining({ nextAction: "Open evidence", authorId: "alice" }) });
    expect(reopened.getWorkItem(scope, item.id).history).toHaveLength(2);
    expect(reopened.listPullRequests(scope, {}).items).toEqual([expect.objectContaining({ title: "Fix one", lifecycle: "open" })]);
  });
  it("uses a real WAL database and rejects grants for unknown repositories", () => {
    const { store, filename } = setup();
    const inspection = new Database(filename);
    try {
      expect(inspection.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(() => store.setRepositoryGrant({ ...scope, repositoryId: "unknown", allowed: true })).toThrow("scope_denied");
    } finally { inspection.close(); }
  });
  it("defaults to deny unknown and ungranted repositories, including forged scope IDs", () => {
    const { store } = setup();
    expect(() => store.createWorkItem(scope, { goal: "Unknown", links: [{ ...linkA, repositoryId: "unknown" }] })).toThrow("scope_denied");
    expect(() => store.createWorkItem({ ...scope, repositoryIds: ["A", "B"] }, { goal: "Denied", links: [linkB] })).toThrow("scope_denied");
    expect(() => store.listPullRequests(scope, { repositoryId: "B" })).toThrow("scope_denied");
    expect(() => store.listPullRequests(scope, { repositoryId: "unknown" })).toThrow("scope_denied");
  });
  it("isolates actors and projects without an administrator bypass", () => {
    const { store } = setup();
    const item = store.createWorkItem(scope, { goal: "Private", links: [linkA] }); store.applyRepositorySnapshot(snapshot);
    expect(store.listWorkItems(bob)).toEqual([]);
    expect(store.listPullRequests(bob, {}).items).toEqual([]);
    expect(() => store.getWorkItem(bob, item.id)).toThrow("scope_denied");
    expect(() => store.getWorkItem({ ...scope, project: "dreambau" }, item.id)).toThrow("scope_denied");
  });
  it("hides the whole multi-repository item and its session after revocation", () => {
    const { store } = setup();
    store.setRepositoryGrant({ ...scope, repositoryId: "B", allowed: true });
    const item = store.createWorkItem(scope, { goal: "Both repos", links: [linkA, linkB] });
    store.writeCheckpoint(scope, item.id, note);
    store.setRepositoryGrant({ ...bob, repositoryId: "A", allowed: true });
    expect(store.listRepositories(bob).map((repo) => repo.id)).toEqual(["A"]);
    expect(store.listWorkItems(bob)).toEqual([]);
    expect(() => store.getWorkItem(bob, item.id)).toThrow("scope_denied");
    store.setRepositoryGrant({ ...scope, repositoryId: "B", allowed: false });
    expect(JSON.stringify(store.listWorkItems(scope))).not.toContain("session-one");
    expect(store.listWorkItems(scope)).toEqual([]);
    expect(() => store.getWorkItem(scope, item.id)).toThrow("scope_denied");
    expect(() => store.writeCheckpoint(scope, item.id, { ...note, expectedVersion: 2 })).toThrow("scope_denied");
    expect(() => store.updateWorkItemLinks(scope, item.id, { expectedVersion: 2, links: [linkA] })).toThrow("scope_denied");
  });
  it("rejects denied link additions atomically, and versions permitted link changes", () => {
    const { store } = setup();
    const item = store.createWorkItem(scope, { goal: "One", links: [linkA] });
    expect(() => store.updateWorkItemLinks(scope, item.id, { expectedVersion: 1, links: [linkA, linkB] })).toThrow("scope_denied");
    expect(store.getWorkItem(scope, item.id)).toMatchObject({ version: 1, links: [expect.objectContaining(linkA)] });
    store.setRepositoryGrant({ ...scope, repositoryId: "B", allowed: true });
    expect(store.updateWorkItemLinks(scope, item.id, { expectedVersion: 1, links: [linkA, linkB] }).version).toBe(2);
    expect(() => store.writeCheckpoint(scope, item.id, note)).toThrow("version_conflict");
  });
  it("requires explicit internal-task permission for repository-less tasks on every access", () => {
    const { store } = setup();
    expect(() => store.createWorkItem(scope, { goal: "Internal", links: [] })).toThrow("scope_denied");
    store.setInternalTaskGrant({ ...scope, allowed: true });
    const item = store.createWorkItem(scope, { goal: "Internal", links: [] });
    store.setInternalTaskGrant({ ...scope, allowed: false });
    expect(store.listWorkItems(scope)).toEqual([]);
    expect(() => store.writeCheckpoint(scope, item.id, note)).toThrow("scope_denied");
  });
  it("rejects missing/stale versions and preserves the winning write with two connections", () => {
    const { store, filename } = setup();
    const other = createWorkStateStore(filename); stores.push(other);
    const item = store.createWorkItem(scope, { goal: "One", links: [linkA] });
    const { expectedVersion: _ignored, ...missing } = note;
    expect(() => other.writeCheckpoint(scope, item.id, missing)).toThrow("version_conflict");
    store.writeCheckpoint(scope, item.id, note);
    expect(() => other.writeCheckpoint(scope, item.id, { ...note, nextAction: "Lost update" })).toThrow("version_conflict");
    expect(other.getWorkItem(scope, item.id)).toMatchObject({ version: 2, checkpoint: { nextAction: "Open evidence" } });
    expect(other.getWorkItem(scope, item.id).history).toHaveLength(2);
  });
  it("retains confirmed inventory and facet values on partial/failed attempts without altering notes", () => {
    const { store } = setup();
    const item = store.createWorkItem(scope, { goal: "One", links: [linkA] }); store.writeCheckpoint(scope, item.id, note);
    store.applyRepositorySnapshot(snapshot);
    store.applyRepositorySnapshot({ ...snapshot, collectedAt: "2026-10-20T11:00:00Z", complete: false, errorCode: "github_unavailable", pullRequests: [{ ...pr, title: "Unconfirmed", facets: { reviewDecision: { ...pr.facets.reviewDecision, value: null, coverage: "partial", lastAttemptAt: "2026-10-20T11:00:00Z", errorCode: "graphql_partial" } } }] });
    const result = store.listPullRequests(scope, {});
    expect(result.items[0]).toMatchObject({ title: "Fix one", facets: { reviewDecision: { value: "APPROVED", lastSuccessAt: "2026-10-20T10:00:00Z", lastAttemptAt: "2026-10-20T11:00:00Z", coverage: "partial", errorCode: "graphql_partial" } } });
    expect(store.listRepositories(scope)[0]).toMatchObject({ coverage: "partial", lastSuccessAt: "2026-10-20T10:00:00Z", lastAttemptAt: "2026-10-20T11:00:00Z", errorCode: "github_unavailable" });
    store.applyRepositorySnapshot({ ...snapshot, complete: false, pullRequests: [], collectedAt: "2026-10-20T12:00:00Z", errorCode: "github_unavailable" });
    expect(store.listPullRequests(scope, {}).items).toHaveLength(1);
    expect(store.getWorkItem(scope, item.id)).toMatchObject({ version: 2, checkpoint: { nextAction: "Open evidence" } });
  });
  it("preserves separate open, closed and merged states without inferring deployment", () => {
    const { store } = setup();
    for (const lifecycle of ["open", "closed", "merged"] as const) {
      store.applyRepositorySnapshot({ ...snapshot, pullRequests: [{ ...pr, lifecycle, mergedAt: lifecycle === "merged" ? snapshot.collectedAt : null }] });
      const saved = store.listPullRequests(scope, {}).items[0];
      expect(saved.lifecycle).toBe(lifecycle); expect(saved).not.toHaveProperty("deployed");
    }
  });
  it("retains repository protection after unlinking and reopen, including old checkpoint/session content", () => {
    const { store, filename } = setup();
    store.setRepositoryGrant({ ...scope, repositoryId: "B", allowed: true });
    store.setRepositoryGrant({ ...bob, repositoryId: "A", allowed: true });
    const item = store.createWorkItem(scope, { goal: "B private", links: [linkA, linkB] });
    store.writeCheckpoint(scope, item.id, { ...note, goal: "B confidential", optionalSessionUrl: "https://chatgpt.com/c/b-private" });
    expect(store.listWorkItems(bob)).toEqual([]);
    store.updateWorkItemLinks(scope, item.id, { expectedVersion: 2, links: [linkA] });
    expect(store.listWorkItems(bob)).toEqual([]);
    expect(() => store.getWorkItem(bob, item.id)).toThrow("scope_denied");
    store.close();
    const reopened = createWorkStateStore(filename); stores.push(reopened);
    expect(reopened.listWorkItems(bob)).toEqual([]);
    expect(() => reopened.getWorkItem(bob, item.id)).toThrow("scope_denied");
    expect(reopened.getWorkItem(scope, item.id).checkpoint.optionalSessionUrl).toBe("https://chatgpt.com/c/b-private");
    reopened.setRepositoryGrant({ ...scope, repositoryId: "B", allowed: false });
    expect(reopened.listWorkItems(scope)).toEqual([]);
    expect(() => reopened.writeCheckpoint(scope, item.id, { ...note, expectedVersion: 3 })).toThrow("scope_denied");
    expect(() => reopened.updateWorkItemLinks(scope, item.id, { expectedVersion: 3, links: [linkA] })).toThrow("scope_denied");
  });
  it("keeps the internal-task requirement after adding a first repository and after reopen", () => {
    const { store, filename } = setup();
    store.setInternalTaskGrant({ ...scope, allowed: true });
    store.setRepositoryGrant({ ...bob, repositoryId: "A", allowed: true });
    const item = store.createWorkItem(scope, { goal: "Internal private", links: [] });
    store.writeCheckpoint(scope, item.id, { ...note, goal: "Internal confidential" });
    store.updateWorkItemLinks(scope, item.id, { expectedVersion: 2, links: [linkA] });
    expect(store.listWorkItems(bob)).toEqual([]);
    store.close();
    const reopened = createWorkStateStore(filename); stores.push(reopened);
    expect(() => reopened.getWorkItem(bob, item.id)).toThrow("scope_denied");
    reopened.setInternalTaskGrant({ ...scope, allowed: false });
    expect(reopened.listWorkItems(scope)).toEqual([]);
    expect(() => reopened.writeCheckpoint(scope, item.id, { ...note, expectedVersion: 3 })).toThrow("scope_denied");
  });
  it("backfills retained scope from version-one history when current links no longer show it", () => {
    const { store, filename } = setup();
    store.setRepositoryGrant({ ...scope, repositoryId: "B", allowed: true });
    store.setRepositoryGrant({ ...bob, repositoryId: "A", allowed: true });
    store.setInternalTaskGrant({ ...scope, allowed: true });
    const composite = store.createWorkItem(scope, { goal: "Old composite", links: [linkA, linkB] });
    store.writeCheckpoint(scope, composite.id, note);
    store.updateWorkItemLinks(scope, composite.id, { expectedVersion: 2, links: [linkA] });
    const internal = store.createWorkItem(scope, { goal: "Old internal", links: [] });
    store.writeCheckpoint(scope, internal.id, note);
    store.updateWorkItemLinks(scope, internal.id, { expectedVersion: 2, links: [linkA] });
    store.applyRepositorySnapshot(snapshot);
    store.close();
    // Recreate the prior schema shape, retaining its actual creation/link/checkpoint history.
    const legacy = new Database(filename);
    legacy.exec("DROP TABLE IF EXISTS work_item_required_repositories; DROP TABLE IF EXISTS work_item_required_internal; DROP TABLE IF EXISTS pull_request_history; DELETE FROM work_state_migrations WHERE version>=2;");
    legacy.close();
    const reopened = createWorkStateStore(filename); stores.push(reopened);
    expect(reopened.listWorkItems(bob)).toEqual([]);
    expect(reopened.listPullRequestHistory(scope, "A", 1)).toEqual([expect.objectContaining({ lifecycle: "open", headSha: "abc123", origin: "migration_baseline", observedAt: null })]);
    reopened.applyRepositorySnapshot({ ...snapshot, collectedAt: "2026-10-20T11:00:00Z", pullRequests: [{ ...pr, headSha: "after-migration" }] });
    expect(reopened.listPullRequestHistory(scope, "A", 1)).toHaveLength(2);
    reopened.setRepositoryGrant({ ...scope, repositoryId: "B", allowed: false });
    expect(() => reopened.getWorkItem(scope, composite.id)).toThrow("scope_denied");
    reopened.setInternalTaskGrant({ ...scope, allowed: false });
    expect(() => reopened.getWorkItem(scope, internal.id)).toThrow("scope_denied");
  });
  it("persists ordered confirmed PR lifecycle/revision transitions without replay/partial/stale inventions", () => {
    const { store, filename } = setup();
    const states = [
      { lifecycle: "open", headSha: "abc123" },
      { lifecycle: "closed", headSha: "abc123" },
      { lifecycle: "open", headSha: "abc123" },
      { lifecycle: "open", headSha: "new456" },
      { lifecycle: "merged", headSha: "new456" }
    ] as const;
    for (const [index, state] of states.entries()) {
      const at = `2026-10-20T10:0${index}:00Z`;
      store.applyRepositorySnapshot({ ...snapshot, collectedAt: at, pullRequests: [{ ...pr, ...state, mergedAt: state.lifecycle === "merged" ? at : null }] });
    }
    const repeated = { ...snapshot, collectedAt: "2026-10-20T10:05:00Z", pullRequests: [{ ...pr, lifecycle: "merged" as const, headSha: "new456", mergedAt: "2026-10-20T10:04:00Z" }] };
    store.applyRepositorySnapshot(repeated);
    store.applyRepositorySnapshot({ ...snapshot, collectedAt: "2026-10-20T10:06:00Z", complete: false, errorCode: "github_unavailable" });
    store.applyRepositorySnapshot(snapshot); // Older successful state must not rewrite confirmed lineage.
    store.close();
    const reopened = createWorkStateStore(filename); stores.push(reopened);
    const transitions = reopened.listPullRequestHistory(scope, "A", 1);
    expect(transitions.map((entry) => ({ lifecycle: entry.lifecycle, headSha: entry.headSha }))).toEqual(states);
    expect(transitions.map((entry) => entry.observedAt)).toEqual(states.map((_state, index) => `2026-10-20T10:0${index}:00Z`));
    expect(reopened.listPullRequests(scope, {}).items[0]).toMatchObject({ lifecycle: "merged", headSha: "new456" });
    expect(() => reopened.listPullRequestHistory(bob, "A", 1)).toThrow("scope_denied");
    reopened.setRepositoryGrant({ ...scope, repositoryId: "A", allowed: false });
    expect(() => reopened.listPullRequestHistory(scope, "A", 1)).toThrow("scope_denied");
  });
  it("rejects credential-bearing or mismatched link input and unknown checkpoint fields", () => {
    const { store } = setup();
    expect(() => store.createWorkItem(scope, { goal: "Spoofed", links: [{ ...linkA, url: "https://github.com/other/private/pull/1" }] })).toThrow();
    const item = store.createWorkItem(scope, { goal: "One", links: [linkA] });
    expect(() => store.writeCheckpoint(scope, item.id, { ...note, optionalSessionUrl: "https://user:password@chatgpt.com/c/id" })).toThrow();
    expect(() => store.writeCheckpoint(scope, item.id, { ...note, actorId: "bob" })).toThrow();
  });
});
