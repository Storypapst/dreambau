import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { FixturePlanConflict } from "./test-fixture-plan-model.js";
import type { TestFixturePlanStore } from "./test-fixture-plan-store.js";
import { HeadlessRegistrationError, isHeadlessDevRun, type HeadlessApproval, type HeadlessOutcome } from "./headless-registration-model.js";
import type { TestResourceStore } from "./test-resource-store.js";
import type { RunActor, TestRunStore } from "./test-run-store.js";

const operationKey = "headless-asker-registration";

export class HeadlessRegistrationStore {
  constructor(
    private readonly sqlite: Database.Database,
    private readonly runs: TestRunStore,
    private readonly fixturePlans: TestFixturePlanStore,
    private readonly resources: TestResourceStore
  ) {}

  ownedRun(runId: string, actor: RunActor) {
    const run = this.runs.get(runId);
    if (!run || !isHeadlessDevRun(run) ||
      actor.type !== "machine" || run.initiatedBy.type !== "machine" || run.initiatedBy.id !== actor.id) {
      throw new HeadlessRegistrationError("run_not_found", 404);
    }
    return run;
  }

  authority(runId: string, actor: RunActor, now: Date) {
    const run = this.ownedRun(runId, actor);
    if (run.status !== "running") throw new HeadlessRegistrationError("run_not_running");
    try {
      return this.fixturePlans.authority(runId, now);
    } catch (error) {
      if (error instanceof FixturePlanConflict) throw new HeadlessRegistrationError("run_changed");
      throw error;
    }
  }

  assertUnclaimed(runId: string): void {
    if (this.sqlite.prepare("SELECT 1 FROM test_resources WHERE run_id=? AND operation_key=?").get(runId, operationKey)) {
      throw new HeadlessRegistrationError("registration_already_claimed");
    }
  }

  claim(input: {
    approval: HeadlessApproval;
    authorityHash: string;
    bindingHash: string;
    expiresAt: string;
    username: string;
    askerAccountId: string;
  }, actor: RunActor, now: Date) {
    const { approval, authorityHash, bindingHash, expiresAt, username, askerAccountId } = input;
    const { runId } = approval;
    return this.sqlite.transaction(() => {
      const current = this.authority(runId, actor, now);
      if (current.hash !== authorityHash || current.run.commitSha !== approval.commitSha ||
        actor.id !== approval.machineId || Date.parse(expiresAt) <= now.getTime() ||
        Date.parse(approval.expiresAt) <= now.getTime()) {
        throw new HeadlessRegistrationError("binding_changed");
      }
      this.assertUnclaimed(runId);
      const resourceId = randomUUID();
      const timestamp = now.toISOString();
      this.resources.planIntent({
        runId, operationKey, kind: "user", accountId: approval.askerMailboxId, parentIds: []
      }, resourceId, actor, timestamp);
      this.resources.transition(resourceId, "planned", "creating", actor, timestamp);
      this.audit(runId, "headless_registration_claimed", actor, timestamp, {
        resourceId, bindingHash, approvedBy: approval.approvedBy, expiresAt, approvalExpiresAt: approval.expiresAt,
        username, askerAccountId, counsellorAccountId: approval.counsellorAccountId,
        counsellorMailboxId: approval.counsellorMailboxId, fixture: approval.fixture,
        onlySignedDevices: approval.onlySignedDevices
      });
      return { resourceId, bindingHash, state: "creating" as const };
    }).immediate();
  }

  report(runId: string, resourceId: string, result: HeadlessOutcome, actor: RunActor, now: Date) {
    return this.sqlite.transaction(() => {
      this.ownedRun(runId, actor);
      const resource = this.resources.get(resourceId);
      if (!resource || resource.runId !== runId || resource.operationKey !== operationKey) {
        throw new HeadlessRegistrationError("registration_not_found", 404);
      }
      const prior = this.sqlite.prepare(
        "SELECT payload FROM test_run_events WHERE run_id=? AND event_type='headless_registration_reported' LIMIT 1"
      ).get(runId) as { payload: string } | undefined;
      if (prior) {
        const reported = JSON.parse(prior.payload) as { resourceId: string; result: HeadlessOutcome };
        if (reported.resourceId !== resourceId || reported.result !== result) {
          throw new HeadlessRegistrationError("outcome_already_reported");
        }
        return { resourceId, result, state: resource.state };
      }
      if (resource.state !== "creating") throw new HeadlessRegistrationError("registration_state_changed");
      const timestamp = now.toISOString();
      // A bodyless 201 confirms an HTTP result. Product ownership needs native evidence.
      const next = this.resources.transition(resourceId, "creating", "create-uncertain", actor, timestamp);
      this.audit(runId, "headless_registration_reported", actor, timestamp, { resourceId, result });
      return { resourceId, result, state: next.state };
    }).immediate();
  }

  private audit(runId: string, type: string, actor: RunActor, now: string, payload: Record<string, unknown>): void {
    this.sqlite.prepare("INSERT INTO test_run_events(run_id,event_type,actor_type,actor_id,created_at,payload) VALUES(?,?,?,?,?,?)")
      .run(runId, type, actor.type, actor.id, now, JSON.stringify(payload));
  }
}
