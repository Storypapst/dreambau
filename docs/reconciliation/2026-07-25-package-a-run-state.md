# Package A — RUN-STATE (source, runtime and branch reconciliation)

Issue: [#25](https://github.com/Storypapst/dreambau/issues/25) (parent [#24](https://github.com/Storypapst/dreambau/issues/24))
Date: 2026-07-25
Target: reconciliation only. **No deployment is performed in this package.**

All values below are non-secret identifiers. No credential, token, OTP, session
cookie or mailbox content appears in this document.

## 1. Source and runtime identifiers

| Item | Value |
|---|---|
| Canonical `origin/main` | `a5b70c8` — *Merge pull request #19 from Storypapst/feat/springfield-account-sync* |
| Reconciliation branch | `fix/reconcile-human-access-25`, based on `a5b70c8` |
| Reconciliation worktree | `dreambau-wt-reconcile` (clean, created from freshly fetched `origin/main`) |
| Pre-existing checkout | `Dreambau/` on `main` at `91112b1`, **66 commits behind** `origin/main` |
| Live namespace / workload | `wcr` / `Deployment/testmails` |
| Live Deployment revision | 34 |
| Live image tag | `dreambau-testmails:0.7.2-dashboard-integrity-20260723` |
| Live image ID (**rollback digest**) | `sha256:978757064a3c5ea4a43345775443b1d5c0906438c1aa4b041d470025e274dc04` |
| `imagePullPolicy` | `Never` — image is built on the node; **no registry digest exists** |
| Live pod | `testmails-77bfdf7949-d6hmd` (age 2d2h at time of capture) |
| In-image `package.json` version | `0.3.1` — the image **tag is not the application version** |
| Public route | `dreambau.com` → path `/testmails` → `Service/testmails:3000` (ClusterIP) |

### Rollback anchor

Restoring service means setting the Deployment back to image ID
`sha256:978757064a3c5ea4a43345775443b1d5c0906438c1aa4b041d470025e274dc04`.
Because `imagePullPolicy: Never`, that image exists **only in the node's local
image store**. It is not in any registry and cannot be re-pulled. Do not prune
images on this node until a reproducible replacement is promoted.

## 2. Gate state on this branch

Verified locally on Node 20.20.2 (matching the Dockerfile base `node:20-bookworm-slim`):

| Gate | Result |
|---|---|
| `npm run lint` | pass |
| `npm test` | pass — 54 files, 196 tests plus 2 recorded known-defect contracts |
| `npm run build` | pass |

### Toolchain finding

The suite failed 9 tests across 3 files on the workstation's Node 26.5.0 and
passes fully on Node 20. Node 26 exposes `localStorage` as a `globalThis`
accessor that returns `undefined` unless `--localstorage-file` is supplied. The
vitest jsdom environment treats the already-present key as populated and skips
installing the jsdom implementation, so `localStorage` is `undefined` and every
test touching it fails in `beforeEach`.

Nothing pinned the supported Node version — no `.nvmrc`, no `engines` field, and
**no CI workflow existed at all**, so the lint/test/build gates had never been
enforced automatically. This branch adds `.nvmrc`, `engines`, and a CI workflow
that reads `.nvmrc` as the single source of truth.

## 3. Live image provenance — verdict: UNREPRODUCIBLE

The running image cannot be rebuilt from any commit in this repository.

Method: the live `dist/` tree was copied out of the running pod and compared
byte-for-byte against a Node 20 build of every candidate ref.

Closest candidate: `origin/feat/email-otp-device-enrollment` tip `11019b9`.

| Comparison | Result |
|---|---|
| `dist/server/*.js` file names | 41 of 41 match |
| Byte-identical files | 37 of 41 |
| Differing files | 4 — `account-link.js`, `app.js`, `infisical-human-access.js`, `playwright-login-broker.js` |

The differing content exists in **no commit, branch, tag, stash, reflog entry or
dangling object**. All five dangling commits were checked individually. The
`fix/broker-semantic-login-selectors` worktree is clean. No `.js.map` carries
`sourcesContent`, and no build metadata or commit SHA is baked into the image, so
there is no alternative provenance record.

**Consequence:** the image must not be promoted, and its behaviour is not
covered by review or tests. Section 5 specifies the reconstruction.

## 4. Commit classification

| Commit | Subject | Where it lives | Classification |
|---|---|---|---|
| `9d9da40` | docs: design Infisical human access groups | `origin/feat/email-otp-device-enrollment` | reuse — design record for the grant model |
| `6c998bc` | feat: read human project groups from Infisical | same | replace — Package B supersedes with a source-aware grant store |
| `4e58ae6` | feat: sync human scopes from Infisical groups | same | replace — sync must write only `source=infisical` rows |
| `dcbe27d` | docs: explain Infisical project scope sync | same | reuse — update alongside the Package B contract |
| `0028400` | fix: use no-access project memberships | same | replace — live already widened this rule (see 5.2) |
| `f905b5f` | docs: record human access rollout verification | same | reuse — historical evidence |
| `5f0a66d` | fix: guide users through passkey enrollment | same | reuse — Package B keeps passkeys optional on top of this |
| `80e7200` | docs: design email OTP and AI device enrollment | same | reuse — Package B makes email OTP the default path |
| `11019b9` | feat: add email OTP login for managed devices | same | reuse — closest ancestor of the live image |
| `e62a637` | *(cited in the plan)* | **does not exist** | discard — not resolvable in this repository |
| `bc003c2` | fix(test-access): resolve login fields semantically | PR [#21](https://github.com/Storypapst/dreambau/pull/21) | reuse — overlaps live broker code, not identical |
| `6885ba5` | fix(test-access): support ORISO Admin login | PR [#23](https://github.com/Storypapst/dreambau/pull/23) | reuse — overlaps live `account-link` code, not identical |

Correction to the plan: these commits are **not local-only**. All except
`e62a637` are pushed on `origin/feat/email-otp-device-enrollment`, which is 11
commits ahead of and 0 behind `origin/main`.

## 5. Live-only behaviour that must be reconstructed

Recorded here so it survives even if the node's image store is lost. Each item
needs source, tests and review before any promotion.

### 5.1 `GET /accounts/:email/application-secret` — serves account secrets

Present in the live `app.js`, absent from every ref. Gated by
`requireActiveHumanSession`, filtered by `user.projects`, records a
`secret_requested` audit row, sets `Cache-Control: no-store`, and responds
`{ accountId, secret }`.

Live audit counts from `account_access_events` on 2026-07-25:

| Action | Count | First | Last |
|---|---|---|---|
| `secret_requested` | 89 | 2026-07-19T17:21:24Z | 2026-07-24T10:00:53Z |
| `otp_requested` | 71 | 2026-07-19T17:20:49Z | 2026-07-24T13:09:48Z |
| `catalog_sync` | 9 | 2026-07-19T17:20:39Z | 2026-07-23T16:17:39Z |
| `mail_requested` | 3 | 2026-07-23T15:56:31Z | 2026-07-23T15:57:26Z |

Serving test-account secrets to authenticated employees is plausibly the
product's purpose; the defect is that the endpoint is unreviewed and untested,
not necessarily that it is wrong. **Flagged for explicit security review.**

### 5.2 Widened Infisical assignment rule

| Source | Rule |
|---|---|
| `origin/feat/email-otp-device-enrollment` | membership roles must all be `no-access` |
| Live image | membership roles must all be in `{ "no-access", "admin" }` |

Live authorization is **broader than any reviewed source**.
**Flagged for explicit security review.**

### 5.3 Linked-application role merging

Live `account-link.js` adds `linkedApplicationRecordsForEmail` (filters records
to `app-user` and `admin` kinds) and exports `dashboardRoles`. Live `app.js` uses
them to merge linked roles into `account.metadata.roles` in the `GET /accounts`
response.

### 5.4 Broker login hardening

Live `playwright-login-broker.js` resolves login fields semantically
(`getByRole("textbox", { name: /Benutzername|Username|E-Mail/i })`,
`getByLabel(/Passwort|Password/i)`), broadens the OTP selector to
`#otp, input[name='otp'], input[autocomplete='one-time-code']`, and treats a
same-pathname URL as an inline 2FA challenge. This overlaps PRs #21 and #23 but
is not byte-identical to either.

## 6. Root cause of the reported incident

Proven end-to-end against production data.

1. `createUser` requires at least one project (`projects: z.array(...).min(1)`).
2. `updateUserProjects` — which exists **only on the branch and in the live
   image** — validates against a schema with no minimum, so it accepts `[]`.
3. The Infisical scope sync calls it with whatever `projectsFor(email)` returns,
   which is `[]` for an address with no matching membership.
4. The stored grant is overwritten with `[]`. On `main` no code path can produce
   this state; `setUserStatus` is the only `UPDATE` on `human_users`.
5. `GET /accounts` applies `scopedAccountViews` and returns **`200 []`**.
6. The client compares the visible array length with the constant `180` and
   renders `0 of 0 accounts` together with `Expected 180 unique accounts`.

Live `human_users` on 2026-07-25 — 7 rows:

| `projects` | `status` | `role` | Count |
|---|---|---|---|
| `["oriso","dreambau"]` | active | member | 2 |
| `["oriso","orimo","dreambau"]` | active | admin | 1 |
| `[]` | active | **member** | **4** |

Four of seven employees are authenticated with zero grants — exactly the
reported state.

## 7. Contract recorded by this package

`tests/human-access-scope.test.ts` pins the defect: an authenticated employee
whose stored grants are empty must receive `403 human_scope_missing`, not a
successful empty array.

Both cases use `it.fails`, so CI stays green while the wrong behaviour is
documented and pinned. Package C ([#27](https://github.com/Storypapst/dreambau/issues/27))
implements the fix; the tests will then start passing, `it.fails` will report
them as failures, and they must be flipped to plain `it`. That flip is the
acceptance signal.

## 8. Follow-ups opened by this package

- Reconstruct §5.1–§5.4 into reviewed commits with tests — lands with Package B
  ([#26](https://github.com/Storypapst/dreambau/issues/26)), which is where the
  human-access base branch merges.
- Security review of §5.1 (secret endpoint) and §5.2 (widened `admin` rule).
- Dependency drift: 36 of 42 dependencies are declared as `"latest"`.
