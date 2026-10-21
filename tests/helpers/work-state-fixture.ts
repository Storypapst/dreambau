import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../../src/server/app.js";
import { createDatabase } from "../../src/server/db.js";
import { createPasskeyStore } from "../../src/server/passkey-store.js";
import { createWorkStateStore } from "../../src/server/work-state/store.js";
import type {
  PullRequestSnapshot,
  Facet,
} from "../../src/server/work-state/model.js";
export function workStateFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "work-state-c-"));
  const database = createDatabase(":memory:");
  const passkeyStore = createPasskeyStore(path.join(dir, "auth.sqlite"));
  const store = createWorkStateStore(path.join(dir, "work.sqlite"));
  const user = passkeyStore.createUser({
    email: "lisa.workstate@example.test",
    name: "Lisa Fixture",
    projects: ["oriso"],
    role: "member",
  });
  const guest = passkeyStore.createUser({
    email: "bart.workstate@example.test",
    name: "Bart Fixture",
    projects: ["oriso"],
    role: "member",
  });
  for (const actor of [user, guest])
    passkeyStore.addCredential({
      id: `${actor.id}-credential`,
      userId: actor.id,
      publicKey: new Uint8Array([1]),
      counter: 0,
      transports: ["internal"],
      deviceType: "multiDevice",
      backedUp: true,
    });
  const app = createApp({
    runtimeStatusLoader: async () => [],
    passwordHash: "unused",
    sessionSecret: "local-work-state-fixture-session-only",
    secureCookies: false,
    loadAccounts: () => [],
    database,
    passkeyStore,
    workStateStore: store,
    webauthn: {
      generateRegistrationOptions: async () => ({ challenge: "unused" }),
      verifyRegistrationResponse: async () => ({ verified: false }),
      generateAuthenticationOptions: async (options) => ({
        challenge: "local-work-state-fixture",
        allowCredentials: options.allowCredentials,
      }),
      verifyAuthenticationResponse: async (options) => ({
        verified: true,
        authenticationInfo: { newCounter: options.credential.counter + 1 },
      }),
    },
  });
  for (const id of ["A", "B"])
    store.configureRepository({
      id,
      project: "oriso",
      fullName: `OpenResilienceInitiative/repo${id}`,
      integrationBranch: "dev",
    });
  store.setRepositoryGrant({
    actorId: user.id,
    project: "oriso",
    repositoryId: "A",
    allowed: true,
  });
  const scope = { project: "oriso" as const, actorId: user.id };
  return {
    app,
    store,
    user,
    guest,
    scope,
    close() {
      store.close();
      passkeyStore.close();
      database.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
export function fixturePull(number = 1, minutes = 1): PullRequestSnapshot {
  const time = new Date(Date.now() - minutes * 60000).toISOString();
  const facet = (value: Facet["value"]): Facet => ({
    source: "github",
    value,
    sourceRevision: "head:base:feature:dev",
    observedAt: time,
    lastAttemptAt: time,
    lastSuccessAt: time,
    coverage: "complete",
    errorCode: null,
  });
  return {
    id: String(number),
    number,
    url: `https://github.com/OpenResilienceInitiative/repoA/pull/${number}`,
    title: `Change ${number}`,
    author: "not-the-owner",
    base: "dev",
    head: "feature",
    headSha: "head",
    baseSha: "base",
    draft: false,
    lifecycle: "open",
    mergedAt: null,
    facets: {
      checks: facet([
        {
          id: number,
          name: "verify",
          headSha: "head",
          appId: 1,
          suiteId: 1,
          startedAt: time,
          status: "completed",
          conclusion: "failure",
          url: `https://github.com/OpenResilienceInitiative/repoA/actions/runs/${number}`,
        },
      ]),
      statuses: facet([]),
      reviewDecision: facet("APPROVED"),
      reviewThreads: facet([]),
      mergeability: facet({ mergeable: true, state: "clean" }),
    },
  };
}
export function seedPulls(
  store: ReturnType<typeof createWorkStateStore>,
  pulls: PullRequestSnapshot[],
  repositoryId = "A",
) {
  store.applyRepositorySnapshot({
    repositoryId,
    fullName: `OpenResilienceInitiative/repo${repositoryId}`,
    collectedAt: new Date().toISOString(),
    pullRequests: pulls,
    closedCandidates: [],
    coveredPages: 1,
    complete: true,
  });
}
