import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { TestRunStore, type RunActor } from "./test-run-store.js";
import { FixturePlanConflict, fixturePlanSchema, publicHash, type FixturePlan, type FixturePlanView } from "./test-fixture-plan-model.js";

export class TestFixturePlanStore {
  constructor(private readonly sqlite: Database.Database) {}

  authority(runId: string, now: Date) {
    const run = new TestRunStore(this.sqlite).get(runId);
    if (!run || run.project !== "oriso" || run.targetEnvironment !== "dev" || run.status === "released"
      || run.accounts.length === 0 || run.accounts.length > 180 || run.accounts.length !== run.requestedAccounts) throw new FixturePlanConflict();
    const leases = this.sqlite.prepare("SELECT account_id,run_id,leased_at,expires_at FROM account_leases WHERE run_id=? ORDER BY account_id").all(runId) as Array<{ account_id: string; run_id: string; leased_at: string; expires_at: string | null }>;
    if (leases.length !== run.accounts.length || leases.some((lease, index) => lease.account_id !== run.accounts[index].accountId
      || !Number.isFinite(Date.parse(lease.leased_at)) || Date.parse(lease.leased_at) > now.getTime() + 30_000
      || (lease.expires_at !== null && (!Number.isFinite(Date.parse(lease.expires_at)) || Date.parse(lease.expires_at) <= now.getTime())))) throw new FixturePlanConflict();
    return { run, leases, hash: publicHash({ run, leases }) };
  }

  get(runId: string, id: string): FixturePlan | null {
    const row = this.sqlite.prepare("SELECT body FROM test_fixture_plans WHERE run_id=? AND id=?").get(runId, id) as { body: string } | undefined;
    return row ? fixturePlanSchema.parse(JSON.parse(row.body)) : null;
  }

  reusable(runId: string, snapshotHash: string, now: Date): FixturePlan | null {
    const row = this.sqlite.prepare("SELECT body FROM test_fixture_plans WHERE run_id=? AND snapshot_hash=? AND revision=(SELECT MAX(revision) FROM test_fixture_plans WHERE run_id=?)").get(runId, snapshotHash, runId) as { body: string } | undefined;
    if (!row) return null;
    const plan = fixturePlanSchema.parse(JSON.parse(row.body));
    return Date.parse(plan.expiresAt) > now.getTime() ? plan : null;
  }

  view(plan: FixturePlan, now: Date, mappingHash?: string): FixturePlanView {
    let usability: FixturePlanView["usability"] = "current";
    try { if (this.authority(plan.runId, now).hash !== plan.authorityHash) usability = "run-changed"; }
    catch { usability = "run-changed"; }
    const latest = this.sqlite.prepare("SELECT MAX(revision) revision FROM test_fixture_plans WHERE run_id=?").get(plan.runId) as { revision: number };
    if (usability === "current" && latest.revision !== plan.revision) usability = "superseded";
    if (usability === "current" && Date.parse(plan.expiresAt) <= now.getTime()) usability = "expired";
    if (usability === "current" && mappingHash !== undefined && mappingHash !== plan.snapshotHash) usability = "mapping-changed";
    return { ...plan, usability };
  }

  save(draft: Omit<FixturePlan, "id" | "revision" | "fingerprint">, actor: RunActor, now: Date): FixturePlan {
    return this.sqlite.transaction(() => {
      if (this.authority(draft.runId, now).hash !== draft.authorityHash) throw new FixturePlanConflict();
      const prior = this.reusable(draft.runId, draft.snapshotHash, now);
      if (prior) return prior;
      const row = this.sqlite.prepare("SELECT COALESCE(MAX(revision),0)+1 revision FROM test_fixture_plans WHERE run_id=?").get(draft.runId) as { revision: number };
      const unsigned = { ...draft, id: randomUUID(), revision: row.revision };
      const plan = fixturePlanSchema.parse({ ...unsigned, fingerprint: publicHash(unsigned) });
      this.sqlite.prepare("INSERT INTO test_fixture_plans(id,run_id,revision,snapshot_hash,body) VALUES(?,?,?,?,?)").run(plan.id, plan.runId, plan.revision, plan.snapshotHash, JSON.stringify(plan));
      this.sqlite.prepare("INSERT INTO test_run_events(run_id,event_type,actor_type,actor_id,created_at,payload) VALUES(?,?,?,?,?,?)").run(plan.runId, "fixture_plan_created", actor.type, actor.id, now.toISOString(), JSON.stringify({ planId: plan.id, revision: plan.revision, fingerprint: plan.fingerprint }));
      return plan;
    }).immediate();
  }
}
