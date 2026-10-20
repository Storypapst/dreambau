import type { RegistryDatabase } from "./db.js";
import type { RegistryProvider, TestAccessRecord } from "./infisical-provider.js";
import type { OrisoIdentityObserver, OrisoIdentityObservationResult } from "./oriso-identity-observation.js";
import { environmentForOrisoEmail, orisoProvisioningRoles, provisioningRoleForRecord, provisionedIdentityProjection, type OrisoProvisioningRole } from "./oriso-provisioning.js";
import { isSpringfieldPoolEmail } from "./springfield-pool.js";
import { clockSkewMs, fixtureActorSchema, fixturePlanInputSchema, observationTtlMs, publicHash, type FixtureActor, type FixturePlan, type FixturePlanView } from "./test-fixture-plan-model.js";
import type { RunActor, TestRunAccount } from "./test-run-store.js";

function roleFor(tag: string): OrisoProvisioningRole | null {
  return orisoProvisioningRoles.find(role => role === tag) ?? provisioningRoleForRecord({ roles: [tag] });
}
function mailboxRole(tags: string[]): OrisoProvisioningRole | null {
  const roles = tags.map(roleFor);
  return roles.length > 0 && roles.every(role => role !== null && role === roles[0]) ? roles[0] : null;
}
function sameTags(a: string[], b: string[]) { return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort()); }
function validRecordTime(record: TestAccessRecord, now: number) {
  return record.expiresAt === null || (Number.isFinite(Date.parse(record.expiresAt)) && Date.parse(record.expiresAt) > now);
}

export function createFixturePlanner(options: { database: RegistryDatabase; registryProvider: RegistryProvider; observer?: OrisoIdentityObserver; now?: () => Date }) {
  const now = options.now ?? (() => new Date());
  const store = options.database.fixturePlans;

  function actorMapping(account: TestRunAccount, records: TestAccessRecord[], pool: string, at: number): FixtureActor {
    const role = roleFor(account.requestedRole);
    const blocked = (): FixtureActor => ({ accountId: account.accountId, email: account.email, requestedRole: account.requestedRole, role, accessRecordId: null, selectors: null,
      decision: "blocked", reason: "mapping-invalid", observedAt: null, counts: { identities: 0, facts: 0 } });
    const result = blocked();
    const mailbox = records.filter(record => record.id === account.accountId);
    const email = account.email;
    if (!email || email !== email.trim().toLowerCase() || !isSpringfieldPoolEmail(email) || environmentForOrisoEmail(email) !== "dev"
      || !role || mailboxRole(account.roles) !== role || mailbox.length !== 1 || records.filter(record => record.kind === "mailbox" && record.email === email).length !== 1) return result;
    const record = mailbox[0];
    if (record.kind !== "mailbox" || record.project !== "oriso" || record.environment !== pool || record.email !== email
      || !sameTags(record.roles, account.roles) || mailboxRole(record.roles) !== role || !validRecordTime(record, at)) return result;
    const matches = records.filter(candidate => candidate.kind !== "mailbox" && candidate.email?.toLowerCase() === email && candidate.project === "oriso" && candidate.environment === "dev");
    if (matches.length > 1) return result;
    const existing = matches[0];
    const projected = provisionedIdentityProjection(email, role, "dev");
    if (existing && (!['app-user', 'admin'].includes(existing.kind) || provisioningRoleForRecord(existing) !== role
      || (existing.kind === "admin") !== ["platform-admin", "tenant-admin", "agency-admin"].includes(role)
      || existing.email !== email || records.filter(candidate => candidate.id === existing.id).length !== 1
      || !validRecordTime(existing, at) || options.database.isOrisoAdminDeleted(existing.id) || options.database.isOrisoAdminDeletionPending(existing.id))) return result;
    if (!existing && records.some(candidate => candidate.id === projected.id)) return result;
    const candidate = { ...result, accessRecordId: existing?.id ?? projected.id,
      selectors: { email, username: existing?.username ?? projected.username, ...(existing?.accountSetup ? { identityId: existing.accountSetup.provisionedUserId } : {}) },
      decision: "unknown" as const, reason: "not-observed" as const };
    return fixtureActorSchema.safeParse(candidate).success ? candidate : result;
  }

  async function snapshot(runId: string, templateVersion: string) {
    fixturePlanInputSchema.parse({ templateVersion });
    const initial = store.authority(runId, now());
    let records: TestAccessRecord[];
    try { records = await options.registryProvider.list(); } catch { throw new Error("registry_unavailable"); }
    const authority = store.authority(runId, now());
    if (initial.hash !== authority.hash) throw new Error("run_changed");
    const actors = authority.run.accounts.map(account => actorMapping(account, records, authority.run.poolEnvironment, now().getTime()));
    // A cohort may not assign the same target selector or record to two actors.
    const identifiers = (actor: FixtureActor) => actor.selectors ? [
      `record:${actor.accessRecordId}`,
      `username:${actor.selectors.username.toLowerCase()}`,
      ...(actor.selectors.identityId ? [`identity:${actor.selectors.identityId}`] : [])
    ] : [];
    const duplicates = new Set<string>();
    const seen = new Set<string>();
    for (const actor of actors) for (const value of identifiers(actor)) { if (seen.has(value)) duplicates.add(value); seen.add(value); }
    for (const actor of actors) if (identifiers(actor).some(value => duplicates.has(value))) {
      actor.accessRecordId = null; actor.selectors = null; actor.decision = "blocked"; actor.reason = "mapping-invalid";
    }
    const { run: source, leases } = authority;
    const run = { id: source.id, project: "oriso" as const, targetEnvironment: "dev" as const, poolEnvironment: source.poolEnvironment,
      applicationVersion: source.applicationVersion, commitSha: source.commitSha, scenario: source.scenario, status: source.status as Exclude<typeof source.status, "released">,
      requestedAccounts: source.requestedAccounts, createdAt: source.createdAt };
    const snapshot = { run, leases: leases.map(lease => ({ accountId: lease.account_id, leasedAt: lease.leased_at, expiresAt: lease.expires_at })), authorityHash: authority.hash, templateVersion: "synthetic-dev-v1" as const, actors };
    return { authority, snapshot, snapshotHash: publicHash(snapshot) };
  }

  function applyObservation(actor: FixtureActor, result: OrisoIdentityObservationResult, at: number): void {
    if (!("observation" in result)) {
      actor.reason = result.kind === "unknown" ? "observation-unknown" : "observation-unavailable";
      return;
    }
    const observation = result.observation;
    const observedAt = Date.parse(observation.observedAt);
    if (!Number.isFinite(observedAt) || observedAt > at + clockSkewMs || observedAt + observationTtlMs <= at) {
      actor.reason = "observation-time-invalid";
      return;
    }
    actor.observedAt = new Date(observedAt).toISOString();
    actor.counts = { identities: new Set(observation.facts.map(fact => fact.identityId)).size, facts: observation.facts.length };
    actor.decision = result.kind === "free-candidate" ? "fresh-candidate" : result.kind === "occupied" ? "reference-pending-reconciliation" : "blocked";
    actor.reason = result.kind === "free-candidate" ? "free-observed" : result.kind === "occupied" ? "occupied-reconciliation-required" : "identity-conflict";
  }

  return {
    async create(runId: string, templateVersion: string, actor: RunActor): Promise<FixturePlanView> {
      const input = await snapshot(runId, templateVersion);
      const existing = store.reusable(runId, input.snapshotHash, now());
      if (existing) return store.view(existing, now(), input.snapshotHash);
      const createdAt = now();
      const deadline = createdAt.getTime() + 30_000;
      const actors = structuredClone(input.snapshot.actors);
      let cursor = 0;
      const worker = async () => {
        while (cursor < actors.length) {
          const item = actors[cursor++];
          if (item.decision === "blocked") continue;
          if (now().getTime() >= deadline) { item.reason = "dispatch-budget-exhausted"; continue; }
          if (!options.observer) { item.reason = "observation-unavailable"; continue; }
          // The canonical observer bounds each actual request (including authentication)
          // with the managed-admin timeout. Await it before releasing this worker slot.
          try { applyObservation(item, await options.observer.observe(item.selectors), now().getTime()); }
          catch { item.reason = "observation-unavailable"; }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, actors.length) }, worker));
      const finished = now();
      const observations = actors.flatMap(item => item.observedAt === null ? [] : [Date.parse(item.observedAt)]);
      const expires = Math.min(createdAt.getTime() + observationTtlMs, ...observations.map(value => Math.min(value, finished.getTime()) + observationTtlMs));
      const suffix = publicHash({ runId }).slice(0, 16);
      const draft: Omit<FixturePlan, "id" | "revision" | "fingerprint"> = {
        runId, templateVersion: "synthetic-dev-v1", targetOrigin: "https://dev.oriso.org", authorityHash: input.authority.hash,
        snapshotHash: input.snapshotHash, snapshot: input.snapshot, createdAt: createdAt.toISOString(),
        observedAt: observations.length ? new Date(Math.min(...observations)).toISOString() : null, expiresAt: new Date(expires).toISOString(), actors,
        inspectionComplete: actors.every(item => item.observedAt !== null), applyReady: false,
        blockers: ["native-creation-receipts-required", "authoritative-role-hierarchy-reconciliation-required", "tenant-scoped-catalogue-required"],
        counts: { total: actors.length, observed: observations.length, unknown: actors.filter(item => item.decision === "unknown").length, blocked: actors.filter(item => item.decision === "blocked").length },
        hierarchy: { tenant: { name: `Test run ${suffix}`, subdomain: `test-${suffix}` }, agency: { name: `Test agency ${suffix}`, status: "unresolved", required: ["tenant-native-receipt", "consulting-type-catalogue", "team-agency-choice", "external-choice", "conditional-demographics"] } }
      };
      return store.view(store.save(draft, actor, finished), finished, input.snapshotHash);
    },
    async get(runId: string, planId: string): Promise<FixturePlanView | null> {
      const plan = store.get(runId, planId);
      if (!plan) return null;
      const basic = store.view(plan, now());
      if (basic.usability !== "current") return basic;
      try { return store.view(plan, now(), (await snapshot(runId, plan.templateVersion)).snapshotHash); }
      catch { return { ...plan, usability: "mapping-unavailable" }; }
    }
  };
}
