import type Database from "better-sqlite3";
import { z } from "zod";
import type { RunActor } from "./test-run-store.js";

const stableId = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:@/+!-]*$/);
const instant = z.iso.datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const externalIdentity = z.string().min(1).max(512).regex(/^\P{Cc}+$/u).refine(value => value.trim().length > 0);
const actorSchema = z.object({ type: z.enum(["human", "machine"]), id: stableId }).strict();
const intentSchema = z.object({
  runId: stableId,
  operationKey: stableId,
  kind: z.enum(["tenant", "agency", "user", "session", "matrix-room"]),
  accountId: stableId.optional(),
  parentIds: z.array(stableId).max(100)
}).strict();
const states = z.enum(["planned", "creating", "create-uncertain", "present", "deleting", "pending-purge", "delete-uncertain", "deleted", "cancelled"]);
const proofSchema = z.object({
  resourceId: stableId,
  externalId: externalIdentity,
  targetOrigin: z.literal("https://dev.oriso.org"),
  verifiedAt: instant,
  evidenceHash: sha256
}).strict();

export type ResourceIntent = z.infer<typeof intentSchema>;
export type ResourceState = z.infer<typeof states>;
export type PhysicalAbsenceProof = z.infer<typeof proofSchema>;

export interface TestResource {
  id: string;
  runId: string;
  operationKey: string;
  kind: ResourceIntent["kind"];
  accountId: string | null;
  parentIds: string[];
  project: string;
  targetEnvironment: string;
  applicationVersion: string;
  commitSha: string;
  targetOrigin: string;
  externalId: string | null;
  fingerprint: string | null;
  state: ResourceState;
  createdAt: string;
  updatedAt: string;
  deletionStartedAt: string | null;
}

interface ResourceRow {
  id: string; run_id: string; operation_key: string; kind: TestResource["kind"]; account_id: string | null;
  project: string; target_environment: string; application_version: string; commit_sha: string; target_origin: string;
  external_id: string | null; fingerprint: string | null; state: ResourceState;
  created_at: string; updated_at: string; deletion_started_at: string | null;
}

const transitions: Record<ResourceState, ResourceState[]> = {
  planned: ["creating", "cancelled"],
  creating: ["create-uncertain"],
  "create-uncertain": [],
  present: ["deleting"],
  deleting: ["pending-purge", "delete-uncertain"],
  "pending-purge": ["delete-uncertain"],
  "delete-uncertain": ["pending-purge"],
  deleted: [],
  cancelled: []
};
const terminal = (state: ResourceState) => state === "deleted" || state === "cancelled";

export class ResourcesNotCleanedError extends Error {
  constructor() { super("resources not cleaned"); this.name = "ResourcesNotCleanedError"; }
}

type ResourceEvent =
  | { resourceId: string; operationKey: string; kind: ResourceIntent["kind"]; parentIds: string[]; accountId: string | null }
  | { resourceId: string; from: ResourceState; to: ResourceState }
  | { resourceId: string; from: ResourceState; to: "present"; externalId: string; fingerprint: string }
  | { resourceId: string; from: ResourceState; to: "deleted"; externalId: string; targetOrigin: string; verifiedAt: string; evidenceHash: string };

/** Trusted server-internal ledger. Physical proof must come from an authoritative
 * coordinator, never an ordinary GET/404 or a machine client's assertion. */
export class TestResourceStore {
  constructor(private readonly sqlite: Database.Database) {}

  planIntent(rawInput: ResourceIntent, id: string, actor: RunActor, now: string): TestResource {
    const input = intentSchema.parse(rawInput);
    stableId.parse(id); this.validateActorTime(actor, now);
    const parents = [...new Set(input.parentIds)].sort();
    return this.sqlite.transaction(() => {
      const previous = this.sqlite.prepare("SELECT id FROM test_resources WHERE run_id=? AND operation_key=?")
        .get(input.runId, input.operationKey) as { id: string } | undefined;
      if (previous) {
        const resource = this.get(previous.id)!;
        if (resource.kind !== input.kind || resource.accountId !== (input.accountId ?? null)
          || JSON.stringify(resource.parentIds) !== JSON.stringify(parents)) throw new Error("resource intent differs");
        return resource;
      }
      const run = this.sqlite.prepare("SELECT project,target_environment,application_version,commit_sha,status FROM test_runs WHERE id=?")
        .get(input.runId) as { project: string; target_environment: string; application_version: string; commit_sha: string; status: string } | undefined;
      if (!run) throw new Error("test run not found");
      if (run.status === "released") throw new Error("test run released");
      if (run.project !== "oriso" || run.target_environment !== "dev") throw new Error("unsupported resource target");
      if (input.kind === "user" && !input.accountId) throw new Error("user resource requires a leased account");
      if (input.accountId && !this.sqlite.prepare("SELECT 1 FROM account_leases WHERE run_id=? AND account_id=?")
        .get(input.runId, input.accountId)) throw new Error("account not leased by run");
      for (const parentId of parents) {
        const parent = this.get(parentId);
        if (!parent || parent.runId !== input.runId || !["planned", "creating", "create-uncertain", "present"].includes(parent.state)) {
          throw new Error("invalid resource parent");
        }
      }
      this.sqlite.prepare(`INSERT INTO test_resources(
        id,run_id,operation_key,kind,account_id,project,target_environment,application_version,commit_sha,target_origin,state,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,'planned',?,?)`).run(
        id, input.runId, input.operationKey, input.kind, input.accountId ?? null,
        run.project, run.target_environment, run.application_version, run.commit_sha, "https://dev.oriso.org", now, now
      );
      const insertParent = this.sqlite.prepare("INSERT INTO test_resource_parents(resource_id,parent_id) VALUES(?,?)");
      for (const parentId of parents) insertParent.run(id, parentId);
      this.event(input.runId, "resource_planned", actor, now, {
        resourceId: id, operationKey: input.operationKey, kind: input.kind, parentIds: parents, accountId: input.accountId ?? null
      });
      return this.get(id)!;
    }).immediate();
  }

  get(id: string): TestResource | null {
    const row = this.sqlite.prepare("SELECT * FROM test_resources WHERE id=?").get(id) as ResourceRow | undefined;
    if (!row) return null;
    const parents = this.sqlite.prepare("SELECT parent_id FROM test_resource_parents WHERE resource_id=? ORDER BY parent_id")
      .all(id) as Array<{ parent_id: string }>;
    return {
      id: row.id, runId: row.run_id, operationKey: row.operation_key, kind: row.kind, accountId: row.account_id,
      parentIds: parents.map(p => p.parent_id), project: row.project, targetEnvironment: row.target_environment,
      applicationVersion: row.application_version, commitSha: row.commit_sha, targetOrigin: row.target_origin,
      externalId: row.external_id, fingerprint: row.fingerprint, state: row.state,
      createdAt: row.created_at, updatedAt: row.updated_at, deletionStartedAt: row.deletion_started_at
    };
  }

  listByRun(runId: string): TestResource[] {
    const ids = this.sqlite.prepare("SELECT id FROM test_resources WHERE run_id=? ORDER BY created_at,id").all(runId) as Array<{ id: string }>;
    return ids.map(row => this.get(row.id)!);
  }

  transition(id: string, expected: ResourceState, next: ResourceState, actor: RunActor, now: string): TestResource {
    states.parse(next); this.validateActorTime(actor, now);
    return this.sqlite.transaction(() => {
      const resource = this.current(id, expected, now);
      if (!transitions[resource.state].includes(next)) throw new Error("invalid resource transition");
      if (next === "creating" && resource.parentIds.some(p => this.get(p)?.state !== "present")) throw new Error("parent not present");
      if (next === "deleting") this.assertChildrenTerminal(id);
      this.updateState(resource, next, now, next === "deleting" ? now : resource.deletionStartedAt);
      this.event(resource.runId, `resource_${next}`, actor, now, { resourceId: id, from: expected, to: next });
      return this.get(id)!;
    }).immediate();
  }

  bindProduct(id: string, expected: ResourceState, externalId: string, fingerprint: string, actor: RunActor, now: string): TestResource {
    externalIdentity.parse(externalId); sha256.parse(fingerprint); this.validateActorTime(actor, now);
    return this.sqlite.transaction(() => {
      const resource = this.current(id, expected, now);
      if (!["creating", "create-uncertain"].includes(resource.state)) throw new Error("invalid resource binding state");
      if ((resource.kind === "tenant" || resource.kind === "agency") && !/^[1-9][0-9]*$/.test(externalId)) throw new Error("invalid positive product ID");
      if (resource.externalId !== null || resource.fingerprint !== null) throw new Error("resource binding immutable");
      this.sqlite.prepare("UPDATE test_resources SET external_id=?,fingerprint=? WHERE id=?").run(externalId, fingerprint, id);
      this.updateState(resource, "present", now, null);
      this.event(resource.runId, "resource_present", actor, now, { resourceId: id, from: expected, to: "present", externalId, fingerprint });
      return this.get(id)!;
    }).immediate();
  }

  confirmPhysicalAbsence(id: string, expected: ResourceState, rawProof: PhysicalAbsenceProof, actor: RunActor, now: string): TestResource {
    const proof = proofSchema.parse(rawProof); this.validateActorTime(actor, now);
    return this.sqlite.transaction(() => {
      const resource = this.current(id, expected, now);
      if (!["deleting", "pending-purge", "delete-uncertain"].includes(resource.state)) throw new Error("invalid physical absence state");
      if (resource.externalId === null || proof.resourceId !== resource.id || proof.externalId !== resource.externalId
        || proof.targetOrigin !== resource.targetOrigin || resource.deletionStartedAt === null
        || Date.parse(proof.verifiedAt) < Date.parse(resource.deletionStartedAt) || Date.parse(proof.verifiedAt) > Date.parse(now)) {
        throw new Error("physical absence proof mismatch");
      }
      this.assertChildrenTerminal(id);
      this.updateState(resource, "deleted", now, resource.deletionStartedAt);
      this.event(resource.runId, "resource_deleted", actor, now, {
        resourceId: id, from: expected, to: "deleted", externalId: proof.externalId,
        targetOrigin: proof.targetOrigin, verifiedAt: proof.verifiedAt, evidenceHash: proof.evidenceHash
      });
      return this.get(id)!;
    }).immediate();
  }

  assertRunReleasable(runId: string): void {
    if (this.sqlite.prepare("SELECT 1 FROM test_resources WHERE run_id=? AND state NOT IN ('deleted','cancelled') LIMIT 1").get(runId)) {
      throw new ResourcesNotCleanedError();
    }
  }

  private validateActorTime(actor: RunActor, now: string): void { actorSchema.parse(actor); instant.parse(now); }

  private current(id: string, expected: ResourceState, now: string): TestResource {
    states.parse(expected);
    const resource = this.get(id);
    if (!resource) throw new Error("test resource not found");
    if (resource.state !== expected) throw new Error("resource state changed");
    if (Date.parse(now) < Date.parse(resource.updatedAt)) throw new Error("resource observation predates current state");
    return resource;
  }

  private assertChildrenTerminal(id: string): void {
    const children = this.sqlite.prepare(`SELECT r.state FROM test_resource_parents p
      JOIN test_resources r ON r.id=p.resource_id WHERE p.parent_id=?`).all(id) as Array<{ state: ResourceState }>;
    if (children.some(child => !terminal(child.state))) throw new Error("resource child not terminal");
  }

  private updateState(resource: TestResource, next: ResourceState, now: string, deletionStartedAt: string | null): void {
    const result = this.sqlite.prepare("UPDATE test_resources SET state=?,updated_at=?,deletion_started_at=? WHERE id=? AND state=?")
      .run(next, now, deletionStartedAt, resource.id, resource.state);
    if (result.changes !== 1) throw new Error("resource state changed");
  }

  private event(runId: string, type: string, actor: RunActor, now: string, payload: ResourceEvent): void {
    this.sqlite.prepare(`INSERT INTO test_run_events(run_id,event_type,actor_type,actor_id,created_at,payload) VALUES(?,?,?,?,?,?)`)
      .run(runId, type, actor.type, actor.id, now, JSON.stringify(payload));
  }
}
