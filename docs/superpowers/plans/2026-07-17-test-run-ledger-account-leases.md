# Test Run Ledger and Account Leases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a scoped machine identity atomically reserve a role-shaped set of stable Test Access accounts for a versioned test run, inspect and transition that run, and release the leases without ever persisting a secret.

**Architecture:** Add a pure run-domain module, a focused SQLite `TestRunStore`, a scoped machine router mounted beneath the existing Test Access authentication middleware, and `test-access run ...` CLI commands. Infisical remains the account source; SQLite stores only stable record IDs, non-secret snapshots, leases, status and audit events.

**Tech Stack:** TypeScript, Zod 4, Express 5, better-sqlite3, Vitest, Supertest, existing Test Access CLI and Infisical `RegistryProvider`.

## Global Constraints

- Mailboxes, Infisical records and passwords are durable and cannot be deleted by this delivery.
- No password, OTP seed, access token, browser state or message body may enter SQLite, stdout errors, tests or Markdown.
- Run creation is atomic: either every requested role is leased or no run/lease is written.
- Production is not a valid environment.
- A machine identity needs explicit `runs:read` or `runs:create`/`runs:execute`; legacy identities retain only existing account/session behavior.
- Every state mutation appends an audit event in the same SQLite transaction.
- Implement one RED → GREEN slice at a time and commit after each task.

---

### Task 1: Pure run domain and deterministic account selection

**Files:**
- Create: `src/server/test-run-model.ts`
- Create: `tests/test-run-model.test.ts`

**Interfaces:**
- Consumes: public, secret-free `TestAccessRecord` metadata.
- Produces: `createRunInputSchema`, `RunStatus`, `RoleDemand`, `PoolCandidate`, `selectRunAccounts()` and `assertRunTransition()`.

- [ ] **Step 1: Write the failing allocation test**

```ts
import { describe, expect, it } from "vitest";
import { selectRunAccounts } from "../src/server/test-run-model.js";

it("selects the complete deterministic role mix or reports the shortage", () => {
  const candidates = [
    { accountId: "mailbox:a@oriso.org", email: "a@oriso.org", roles: ["consultant"] },
    { accountId: "mailbox:b@oriso.org", email: "b@oriso.org", roles: ["consultant"] },
    { accountId: "mailbox:c@oriso.org", email: "c@oriso.org", roles: ["user"] }
  ];
  expect(selectRunAccounts([{ role: "consultant", count: 2 }, { role: "user", count: 1 }], candidates, new Set()))
    .toEqual({ ok: true, accounts: [
      { ...candidates[0], requestedRole: "consultant" },
      { ...candidates[1], requestedRole: "consultant" },
      { ...candidates[2], requestedRole: "user" }
    ] });
  expect(selectRunAccounts([{ role: "consultant", count: 3 }], candidates, new Set()))
    .toEqual({ ok: false, missing: [{ role: "consultant", requested: 3, available: 2 }] });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- --run tests/test-run-model.test.ts`  
Expected: FAIL because `test-run-model.js` does not exist.

- [ ] **Step 3: Implement the domain contract**

```ts
import { z } from "zod";

export const runStatuses = ["reserved", "running", "passed", "failed", "released"] as const;
export type RunStatus = typeof runStatuses[number];
export const roleDemandSchema = z.object({ role: z.string().trim().min(1).max(60), count: z.number().int().positive().max(180) }).strict();
export const createRunInputSchema = z.object({
  project: z.enum(["oriso", "orimo", "dreambau"]),
  targetEnvironment: z.enum(["local", "pre-dev", "dev", "production-test"]),
  poolEnvironment: z.enum(["local", "pre-dev", "dev", "production-test"]),
  applicationVersion: z.string().trim().min(1).max(40),
  commitSha: z.string().regex(/^[a-f0-9]{7,64}$/i),
  scenario: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/),
  roles: z.array(roleDemandSchema).min(1).max(20)
}).strict().superRefine((value, context) => {
  const roles = new Set<string>();
  for (const demand of value.roles) {
    if (roles.has(demand.role)) context.addIssue({ code: "custom", path: ["roles"], message: "duplicate role demand" });
    roles.add(demand.role);
  }
});

export interface PoolCandidate { accountId: string; email: string | null; roles: string[] }
export interface SelectedRunAccount extends PoolCandidate { requestedRole: string }

export function selectRunAccounts(demands: Array<{ role: string; count: number }>, candidates: PoolCandidate[], leased: Set<string>) {
  const available = candidates.filter((candidate) => !leased.has(candidate.accountId)).sort((a, b) => a.accountId.localeCompare(b.accountId));
  const selected: SelectedRunAccount[] = [];
  const used = new Set<string>();
  const missing: Array<{ role: string; requested: number; available: number }> = [];
  for (const demand of demands) {
    const matches = available.filter((candidate) => !used.has(candidate.accountId) && candidate.roles.includes(demand.role));
    if (matches.length < demand.count) missing.push({ role: demand.role, requested: demand.count, available: matches.length });
    for (const candidate of matches.slice(0, demand.count)) { used.add(candidate.accountId); selected.push({ ...candidate, requestedRole: demand.role }); }
  }
  return missing.length ? { ok: false as const, missing } : { ok: true as const, accounts: selected };
}

const transitions: Record<RunStatus, RunStatus[]> = {
  reserved: ["running", "released"], running: ["passed", "failed"],
  passed: ["released"], failed: ["released"], released: []
};
export function assertRunTransition(from: RunStatus, to: RunStatus) {
  if (!transitions[from].includes(to)) throw new Error(`invalid run transition: ${from} -> ${to}`);
}
```

- [ ] **Step 4: Add transition and input-validation cases, then run GREEN**

Run: `npm test -- --run tests/test-run-model.test.ts`  
Expected: PASS with allocation, shortage, duplicate-role and invalid-transition coverage.

- [ ] **Step 5: Commit**

```bash
git add src/server/test-run-model.ts tests/test-run-model.test.ts
git commit -m "feat(test-runs): define allocation domain"
```

### Task 2: Atomic SQLite run store and append-only audit

**Files:**
- Create: `src/server/test-run-store.ts`
- Modify: `src/server/db.ts`
- Modify: `src/server/schema.ts`
- Create: `tests/test-run-store.test.ts`

**Interfaces:**
- Consumes: `createRunInputSchema`, `PoolCandidate`, `SelectedRunAccount`, `RunStatus`.
- Produces: `TestRunStore.create()`, `.get()`, `.list()`, `.transition()`, `.release()` and `.leasedAccountIds()`.

- [ ] **Step 1: Write a failing atomic-lease test**

```ts
const database = createDatabase(testPath());
const first = database.testRuns.create(input, candidates, { type: "machine", id: "kio" }, fixedNow, "run-1");
expect(first.accounts).toHaveLength(3);
expect(() => database.testRuns.create(input, candidates, { type: "machine", id: "m4" }, fixedNow, "run-2"))
  .toThrowError(/insufficient accounts/);
expect(database.testRuns.list({ project: "oriso", targetEnvironment: "pre-dev" })).toHaveLength(1);
```

- [ ] **Step 2: Confirm RED**

Run: `npm test -- --run tests/test-run-store.test.ts`  
Expected: FAIL because `RegistryDatabase.testRuns` does not exist.

- [ ] **Step 3: Install the schema in `createDatabase()`**

Create tables `test_runs`, `test_run_role_demands`, `test_run_accounts`,
`account_leases` and `test_run_events` exactly as defined in the design. Add
foreign keys with `ON DELETE RESTRICT`, an index on
`(project,target_environment,application_version)` and an event index on
`(run_id,id)`.

- [ ] **Step 4: Implement one-transaction creation**

Inside a better-sqlite3 transaction:

1. Read all current `account_leases.account_id` values.
2. Call `selectRunAccounts()`.
3. Throw a typed `InsufficientAccountsError` before any insert when selection fails.
4. Insert run, role demands, selected account snapshots and leases.
5. Insert `run_reserved` with actor and non-secret role counts.
6. Return the fully read-back run.

- [ ] **Step 5: Implement transition/release and test audit ordering**

`transition(runId, expected, next, actor, now, payload)` must compare current
status, call `assertRunTransition`, update exactly one row and append an event in
the same transaction. `release()` must delete leases, set `released`, append
`run_released`, and return the released account count.

Run: `npm test -- --run tests/test-run-store.test.ts`  
Expected: PASS; a forced transition error leaves status and event count unchanged.

- [ ] **Step 6: Run database regressions and commit**

```bash
npm test -- --run tests/metadata.test.ts tests/test-run-store.test.ts
git add src/server/schema.ts src/server/db.ts src/server/test-run-store.ts tests/test-run-store.test.ts
git commit -m "feat(test-runs): persist atomic account leases"
```

### Task 3: Explicit machine actions

**Files:**
- Modify: `src/server/machine-access.ts`
- Modify: `tests/machine-access.test.ts`
- Modify: `tests/test-access-api.test.ts`

**Interfaces:**
- Produces: `MachineAction`, optional `MachineIdentity.actions`, and `machineCan(identity, action)`.

- [ ] **Step 1: Write failing least-privilege tests**

```ts
expect(machineCan(identity(), "accounts:read")).toBe(true);
expect(machineCan(identity(), "sessions:open")).toBe(true);
expect(machineCan(identity(), "runs:create")).toBe(false);
expect(machineCan(identity({ actions: ["runs:read", "runs:create"] }), "runs:create")).toBe(true);
```

- [ ] **Step 2: Confirm RED**

Run: `npm test -- --run tests/machine-access.test.ts`  
Expected: FAIL because actions and `machineCan` do not exist.

- [ ] **Step 3: Implement backward-compatible action parsing**

```ts
export const machineActions = ["accounts:read", "sessions:open", "runs:read", "runs:create", "runs:execute", "runs:cleanup"] as const;
export type MachineAction = typeof machineActions[number];
// Add to schema:
actions: z.array(z.enum(machineActions)).min(1).optional()
export function machineCan(identity: MachineIdentity, action: MachineAction) {
  return (identity.actions ?? ["accounts:read", "sessions:open"]).includes(action);
}
```

- [ ] **Step 4: Run authentication/API regressions and commit**

```bash
npm test -- --run tests/machine-access.test.ts tests/test-access-api.test.ts
git add src/server/machine-access.ts tests/machine-access.test.ts tests/test-access-api.test.ts
git commit -m "feat(test-runs): scope machine actions"
```

### Task 4: Scoped Test Run API

**Files:**
- Create: `src/server/test-run-router.ts`
- Modify: `src/server/test-access.ts`
- Create: `tests/test-run-api.test.ts`

**Interfaces:**
- Consumes: authenticated `res.locals.machineIdentity`, `RegistryProvider`, `TestRunStore`.
- Produces: `POST/GET /testmails/api/v1/runs`, `GET /runs/:id`, `POST /runs/:id/start`, `POST /runs/:id/finish`, `POST /runs/:id/release`.

- [ ] **Step 1: Write the failing create-run API test**

Create a registry with three production-test mailbox records and an identity
scoped to `oriso`, `pre-dev`, `production-test` with `runs:create` and
`runs:read`. POST the exact body:

```json
{
  "project": "oriso",
  "targetEnvironment": "pre-dev",
  "poolEnvironment": "production-test",
  "applicationVersion": "4.9",
  "commitSha": "abcdef1",
  "scenario": "three-way-chat",
  "roles": [{ "role": "consultant", "count": 2 }, { "role": "user", "count": 1 }]
}
```

Assert HTTP 201, status `reserved`, three secret-free account snapshots and a
subsequent second request returning HTTP 409 `insufficient_accounts` without a
second run.

- [ ] **Step 2: Confirm RED**

Run: `npm test -- --run tests/test-run-api.test.ts`  
Expected: FAIL with HTTP 404.

- [ ] **Step 3: Implement router scope checks**

The router must:

- return 403 when required action is absent;
- return 403 unless identity includes project, target environment and pool environment;
- source candidates only from matching `project`, `poolEnvironment`, `kind=mailbox` records;
- map `InsufficientAccountsError` to a non-secret HTTP 409 response;
- filter list/get results to the authenticated identity's projects/environments;
- require `runs:execute` for start/finish/release.

- [ ] **Step 4: Add lifecycle, cross-project and secret-leak tests**

Assert `reserved -> running -> passed -> released`, reject `reserved -> passed`,
and ensure serialized responses contain none of the registry secrets or token.

- [ ] **Step 5: Run API regressions and commit**

```bash
npm test -- --run tests/test-run-api.test.ts tests/test-access-api.test.ts
git add src/server/test-run-router.ts src/server/test-access.ts tests/test-run-api.test.ts
git commit -m "feat(test-runs): expose scoped run API"
```

### Task 5: Agent CLI for versioned runs

**Files:**
- Create: `src/server/test-run-cli.ts`
- Modify: `src/server/test-access-cli.ts`
- Modify: `tests/test-access-cli.test.ts`
- Create: `tests/test-run-cli.test.ts`
- Modify: `README.md`

**Interfaces:**
- Produces:
  - `test-access run create --project oriso --target pre-dev --pool production-test --version 4.9 --commit abcdef1 --scenario three-way-chat --role consultant=2 --role user=1`
  - `test-access run list --project oriso --target pre-dev`
  - `test-access run show <run-id>`
  - `test-access run start <run-id>`
  - `test-access run finish <run-id> --result passed`
  - `test-access run release <run-id>`

- [ ] **Step 1: Write failing command-building tests**

Assert that repeated `--role` values become the JSON role array, required flags
are rejected locally, and the bearer token never appears in the request body or
output.

- [ ] **Step 2: Confirm RED**

Run: `npm test -- --run tests/test-run-cli.test.ts`  
Expected: FAIL because run commands are unsupported.

- [ ] **Step 3: Implement run command routing**

Keep parsing and HTTP request construction in `test-run-cli.ts`; keep
`test-access-cli.ts` as the top-level dispatcher. JSON output contains run and
account metadata only. Errors print stable error codes, never response bodies.

- [ ] **Step 4: Run CLI and installer regressions**

```bash
npm test -- --run tests/test-run-cli.test.ts tests/test-access-cli.test.ts tests/test-access-install.test.ts
```

Expected: PASS and the portable bundle contains no source-machine absolute path.

- [ ] **Step 5: Document and commit**

```bash
git add README.md src/server/test-run-cli.ts src/server/test-access-cli.ts tests/test-run-cli.test.ts tests/test-access-cli.test.ts
git commit -m "feat(test-runs): add autonomous run CLI"
```

### Task 6: Full gate and two-account live tracer

**Files:**
- Modify: `docs/superpowers/specs/2026-07-17-autonomous-test-lab-design.md` only if verified contracts differ.
- Create: `docs/test-runs/2026-07-17-ledger-live-proof.md`

**Interfaces:**
- Consumes: deployed Test Run API and one machine identity with explicit run actions.
- Produces: secret-free live evidence for reservation, transition and release.

- [ ] **Step 1: Run the complete local quality gate**

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Update one non-production machine identity**

Grant KIO's ORISO identity only:

```json
["accounts:read", "sessions:open", "runs:read", "runs:create", "runs:execute"]
```

Do not grant `runs:cleanup` in this delivery.

- [ ] **Step 3: Run a two-account PreDev reservation tracer**

Create version `ledger-pilot-1` with one consultant and one user. Verify run
status and leases, transition to `running`, record `passed`, and release. Do not
provision or delete ORISO product users in this delivery.

- [ ] **Step 4: Prove stable identities were preserved**

Before and after the tracer, verify both mailbox record IDs still resolve and
targeted secret retrieval succeeds without printing values. Record only exit
statuses and record IDs.

- [ ] **Step 5: Commit evidence**

```bash
git add docs/test-runs/2026-07-17-ledger-live-proof.md
git commit -m "docs(test-runs): record lease pilot evidence"
```
