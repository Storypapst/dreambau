import type Database from "better-sqlite3";
import {
  assertRunTransition,
  createRunInputSchema,
  selectRunAccounts,
  type CreateRunInput,
  type PoolCandidate,
  type RunStatus,
  type SelectedRunAccount
} from "./test-run-model.js";

export interface RunActor {
  type: "human" | "machine";
  id: string;
}

export interface TestRunAccount extends SelectedRunAccount {}

export interface TestRun {
  id: string;
  project: CreateRunInput["project"];
  targetEnvironment: CreateRunInput["targetEnvironment"];
  poolEnvironment: CreateRunInput["poolEnvironment"];
  applicationVersion: string;
  commitSha: string;
  scenario: string;
  status: RunStatus;
  requestedAccounts: number;
  initiatedBy: RunActor;
  createdAt: string;
  accounts: TestRunAccount[];
}

export interface TestRunFilter {
  project?: CreateRunInput["project"];
  targetEnvironment?: CreateRunInput["targetEnvironment"];
}

export interface TestRunEvent {
  id: number;
  runId: string;
  type: string;
  actor: RunActor;
  createdAt: string;
  payload: Record<string, unknown>;
}

export class InsufficientAccountsError extends Error {
  constructor(public readonly missing: Array<{ role: string; requested: number; available: number }>) {
    super("insufficient accounts");
    this.name = "InsufficientAccountsError";
  }
}

interface RunRow {
  id: string;
  project: TestRun["project"];
  target_environment: TestRun["targetEnvironment"];
  pool_environment: TestRun["poolEnvironment"];
  application_version: string;
  commit_sha: string;
  scenario: string;
  status: RunStatus;
  requested_accounts: number;
  initiated_by_type: RunActor["type"];
  initiated_by_id: string;
  created_at: string;
}

interface AccountRow {
  account_id: string;
  email: string | null;
  roles: string;
  requested_role: string;
}

export class TestRunStore {
  constructor(private readonly sqlite: Database.Database) {}

  create(
    rawInput: CreateRunInput,
    candidates: PoolCandidate[],
    actor: RunActor,
    now: string,
    runId: string
  ): TestRun {
    const input = createRunInputSchema.parse(rawInput);
    const createTransaction = this.sqlite.transaction(() => {
      const leased = new Set(
        (this.sqlite.prepare("SELECT account_id FROM account_leases").all() as Array<{ account_id: string }>)
          .map((row) => row.account_id)
      );
      const selection = selectRunAccounts(input.roles, candidates, leased);
      if (!selection.ok) throw new InsufficientAccountsError(selection.missing);
      const requestedAccounts = input.roles.reduce((total, demand) => total + demand.count, 0);

      this.sqlite.prepare(`INSERT INTO test_runs(
        id,project,target_environment,pool_environment,application_version,commit_sha,scenario,status,
        requested_accounts,initiated_by_type,initiated_by_id,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        runId,
        input.project,
        input.targetEnvironment,
        input.poolEnvironment,
        input.applicationVersion,
        input.commitSha,
        input.scenario,
        "reserved",
        requestedAccounts,
        actor.type,
        actor.id,
        now
      );
      const insertDemand = this.sqlite.prepare(
        "INSERT INTO test_run_role_demands(run_id,role,count) VALUES(?,?,?)"
      );
      for (const demand of input.roles) insertDemand.run(runId, demand.role, demand.count);

      const insertAccount = this.sqlite.prepare(`INSERT INTO test_run_accounts(
        run_id,account_id,email,roles,requested_role
      ) VALUES(?,?,?,?,?)`);
      const insertLease = this.sqlite.prepare(
        "INSERT INTO account_leases(account_id,run_id,leased_at) VALUES(?,?,?)"
      );
      for (const account of selection.accounts) {
        insertAccount.run(
          runId,
          account.accountId,
          account.email,
          JSON.stringify(account.roles),
          account.requestedRole
        );
        insertLease.run(account.accountId, runId, now);
      }
      this.sqlite.prepare(`INSERT INTO test_run_events(
        run_id,event_type,actor_type,actor_id,created_at,payload
      ) VALUES(?,?,?,?,?,?)`).run(
        runId,
        "run_reserved",
        actor.type,
        actor.id,
        now,
        JSON.stringify({ roles: input.roles, requestedAccounts })
      );
    });
    createTransaction();
    return this.get(runId)!;
  }

  get(runId: string): TestRun | null {
    const row = this.sqlite.prepare("SELECT * FROM test_runs WHERE id=?").get(runId) as RunRow | undefined;
    if (!row) return null;
    const accounts = this.sqlite.prepare(
      "SELECT account_id,email,roles,requested_role FROM test_run_accounts WHERE run_id=? ORDER BY account_id"
    ).all(runId) as AccountRow[];
    return {
      id: row.id,
      project: row.project,
      targetEnvironment: row.target_environment,
      poolEnvironment: row.pool_environment,
      applicationVersion: row.application_version,
      commitSha: row.commit_sha,
      scenario: row.scenario,
      status: row.status,
      requestedAccounts: row.requested_accounts,
      initiatedBy: { type: row.initiated_by_type, id: row.initiated_by_id },
      createdAt: row.created_at,
      accounts: accounts.map((account) => ({
        accountId: account.account_id,
        email: account.email,
        roles: JSON.parse(account.roles) as string[],
        requestedRole: account.requested_role
      }))
    };
  }

  list(filter: TestRunFilter = {}): TestRun[] {
    const conditions: string[] = [];
    const values: string[] = [];
    if (filter.project) {
      conditions.push("project=?");
      values.push(filter.project);
    }
    if (filter.targetEnvironment) {
      conditions.push("target_environment=?");
      values.push(filter.targetEnvironment);
    }
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.sqlite.prepare(`SELECT id FROM test_runs${where} ORDER BY created_at DESC,id`).all(...values) as Array<{ id: string }>;
    return rows.map((row) => this.get(row.id)!);
  }

  leasedAccountIds(): Set<string> {
    return new Set(
      (this.sqlite.prepare("SELECT account_id FROM account_leases ORDER BY account_id").all() as Array<{ account_id: string }>)
        .map((row) => row.account_id)
    );
  }

  events(runId: string): TestRunEvent[] {
    const rows = this.sqlite.prepare(
      "SELECT id,run_id,event_type,actor_type,actor_id,created_at,payload FROM test_run_events WHERE run_id=? ORDER BY id"
    ).all(runId) as Array<{
      id: number;
      run_id: string;
      event_type: string;
      actor_type: RunActor["type"];
      actor_id: string;
      created_at: string;
      payload: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      type: row.event_type,
      actor: { type: row.actor_type, id: row.actor_id },
      createdAt: row.created_at,
      payload: JSON.parse(row.payload) as Record<string, unknown>
    }));
  }

  transition(
    runId: string,
    expected: RunStatus,
    next: RunStatus,
    actor: RunActor,
    now: string,
    payload: Record<string, unknown> = {}
  ): TestRun {
    const transitionTransaction = this.sqlite.transaction(() => {
      const current = this.sqlite.prepare("SELECT status FROM test_runs WHERE id=?").get(runId) as { status: RunStatus } | undefined;
      if (!current) throw new Error("test run not found");
      if (current.status !== expected) throw new Error("run status changed");
      assertRunTransition(current.status, next);
      const timestampColumn = next === "running"
        ? ",started_at=?"
        : next === "passed" || next === "failed"
          ? ",finished_at=?"
          : "";
      const update = this.sqlite.prepare(`UPDATE test_runs SET status=?${timestampColumn} WHERE id=? AND status=?`);
      const result = timestampColumn
        ? update.run(next, now, runId, expected)
        : update.run(next, runId, expected);
      if (result.changes !== 1) throw new Error("run status changed");
      this.insertEvent(runId, `run_${next}`, actor, now, payload);
    });
    transitionTransaction();
    return this.get(runId)!;
  }

  release(runId: string, actor: RunActor, now: string): number {
    const releaseTransaction = this.sqlite.transaction(() => {
      const current = this.sqlite.prepare("SELECT status FROM test_runs WHERE id=?").get(runId) as { status: RunStatus } | undefined;
      if (!current) throw new Error("test run not found");
      assertRunTransition(current.status, "released");
      const released = this.sqlite.prepare("DELETE FROM account_leases WHERE run_id=?").run(runId).changes;
      const update = this.sqlite.prepare(
        "UPDATE test_runs SET status='released',cleaned_at=? WHERE id=? AND status=?"
      ).run(now, runId, current.status);
      if (update.changes !== 1) throw new Error("run status changed");
      this.insertEvent(runId, "run_released", actor, now, { releasedAccounts: released });
      return released;
    });
    return releaseTransaction();
  }

  private insertEvent(
    runId: string,
    type: string,
    actor: RunActor,
    now: string,
    payload: Record<string, unknown>
  ): void {
    this.sqlite.prepare(`INSERT INTO test_run_events(
      run_id,event_type,actor_type,actor_id,created_at,payload
    ) VALUES(?,?,?,?,?,?)`).run(
      runId,
      type,
      actor.type,
      actor.id,
      now,
      JSON.stringify(payload)
    );
  }
}
