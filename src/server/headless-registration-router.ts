import express from "express";
import type { RegistryDatabase } from "./db.js";
import type { RegistryProvider, TestAccessRecord } from "./infisical-provider.js";
import { machineCan, type MachineIdentity } from "./machine-access.js";
import type { OrisoIdentityObserver } from "./oriso-identity-observation.js";
import { environmentForOrisoEmail, provisionedIdentityProjection, provisioningRoleForRecord, type OrisoProvisioningRole } from "./oriso-provisioning.js";
import { isSpringfieldPoolEmail } from "./springfield-pool.js";
import { clockSkewMs, observationTtlMs, publicHash } from "./test-fixture-plan-model.js";
import { mailboxRole, sameTags, validRecordTime } from "./test-fixture-planner.js";
import type { RunActor, TestRun } from "./test-run-store.js";
import { HeadlessRegistrationError, headlessAskerUsername, headlessClaimInput, headlessOutcomeInput, headlessResourceId, readHeadlessApproval } from "./headless-registration-model.js";

const targetOrigin = "https://dev.oriso.org";
const normalizedEmail = (record: TestAccessRecord) => record.email?.trim().toLowerCase();

function leasedMailbox(run: TestRun, records: TestAccessRecord[], id: string, role: OrisoProvisioningRole, at: number) {
  const account = run.accounts.find(candidate => candidate.accountId === id);
  const email = account?.email;
  const candidates = records.filter(candidate => candidate.id === id);
  const record = candidates.length === 1 ? candidates[0] : undefined;
  if (!account || !email || email !== email.trim().toLowerCase() || !isSpringfieldPoolEmail(email) ||
    environmentForOrisoEmail(email) !== "dev" || mailboxRole([account.requestedRole]) !== role ||
    mailboxRole(account.roles) !== role || record?.kind !== "mailbox" || record.email !== email ||
    record.project !== run.project || record.environment !== run.poolEnvironment || !validRecordTime(record, at) ||
    !sameTags(record.roles, account.roles) ||
    records.filter(candidate => candidate.kind === "mailbox" && normalizedEmail(candidate) === email).length !== 1) {
    throw new HeadlessRegistrationError("mailbox_binding_changed");
  }
  return { email, expiresAt: record.expiresAt };
}

export function createHeadlessRegistrationRouter(options: {
  database: RegistryDatabase;
  registryProvider: RegistryProvider;
  fixtureObserver?: OrisoIdentityObserver;
  headlessDevApprovalsFile?: string | null;
  now?: () => Date;
}) {
  const router = express.Router({ mergeParams: true });
  const store = options.database.headlessRegistrations;
  const now = options.now ?? (() => new Date());

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    const identity = res.locals.machineIdentity as MachineIdentity;
    if (!machineCan(identity, "fixtures:headless-register")) return res.status(403).json({ error: "action_denied" });
    next();
  });

  function scopedRun(req: express.Request, res: express.Response) {
    const identity = res.locals.machineIdentity as MachineIdentity;
    const actor: RunActor = { type: "machine", id: identity.id };
    const run = store.ownedRun(String(req.params.runId), actor);
    if (!identity.projects.includes(run.project) || !identity.environments.includes(run.targetEnvironment) ||
      !identity.environments.includes(run.poolEnvironment)) throw new HeadlessRegistrationError("run_not_found", 404);
    return { runId: run.id, actor, identityExpiresAt: identity.expiresAt };
  }

  async function prepare({ runId, actor, identityExpiresAt }: ReturnType<typeof scopedRun>) {
    const file = options.headlessDevApprovalsFile ?? null;
    const started = now();
    readHeadlessApproval(file, runId, actor.id, started);
    const before = store.authority(runId, actor, started);
    let records: TestAccessRecord[];
    try { records = await options.registryProvider.list(); }
    catch { throw new HeadlessRegistrationError("registry_unavailable", 503); }
    const at = now();
    const approval = readHeadlessApproval(file, runId, actor.id, at);
    const authority = store.authority(runId, actor, at);
    if (before.hash !== authority.hash || approval.commitSha !== authority.run.commitSha) {
      throw new HeadlessRegistrationError("binding_changed");
    }
    const { run } = authority;
    const askerMailbox = leasedMailbox(run, records, approval.askerMailboxId, "advice-seeker", at.getTime());
    const counsellorMailbox = leasedMailbox(run, records, approval.counsellorMailboxId, "counsellor", at.getTime());
    const { email: askerEmail } = askerMailbox;
    const { email: counsellorEmail } = counsellorMailbox;
    const devAccounts = records.filter(record => record.kind !== "mailbox" && record.project === "oriso" && record.environment === "dev");
    const askerAccountId = provisionedIdentityProjection(askerEmail, "advice-seeker", "dev").id;
    if (records.some(record => record.id === askerAccountId) || devAccounts.some(record => normalizedEmail(record) === askerEmail)) {
      throw new HeadlessRegistrationError("asker_binding_occupied");
    }
    const candidates = devAccounts.filter(record => normalizedEmail(record) === counsellorEmail);
    const counsellor = candidates.length === 1 ? candidates[0] : undefined;
    if (!counsellor || counsellor.kind !== "app-user" || counsellor.id !== approval.counsellorAccountId ||
      counsellor.email !== counsellorEmail || provisioningRoleForRecord(counsellor) !== "counsellor" ||
      counsellor.provisioningStatus !== "ready" || counsellor.rotationStatus !== "current" ||
      !counsellor.username.trim() || !counsellor.totpSecret?.trim() ||
      !validRecordTime(counsellor, at.getTime()) || records.filter(record => record.id === counsellor.id).length !== 1 ||
      options.database.isOrisoAdminDeleted(counsellor.id) || options.database.isOrisoAdminDeletionPending(counsellor.id)) {
      throw new HeadlessRegistrationError("counsellor_binding_changed");
    }
    const expiries = [approval.expiresAt, identityExpiresAt, askerMailbox.expiresAt, counsellorMailbox.expiresAt, counsellor.expiresAt,
      ...authority.leases.map(lease => lease.expires_at)];
    const expiry = Math.min(...expiries.flatMap(value => value === null ? [] : [Date.parse(value)]));
    if (expiry <= at.getTime()) throw new HeadlessRegistrationError("authorization_expired", 404);
    const expiresAt = new Date(expiry).toISOString();
    const binding = {
      runId, targetOrigin, commitSha: run.commitSha, expiresAt,
      asker: { accountId: askerAccountId, username: headlessAskerUsername(runId), email: askerEmail },
      counsellor: { accountId: counsellor.id, username: counsellor.username },
      fixture: approval.fixture, onlySignedDevices: approval.onlySignedDevices
    };
    const bindingHash = publicHash({
      approval, binding, authorityHash: authority.hash, counsellorExpiry: counsellor.expiresAt,
      counsellorIdentity: counsellor.accountSetup?.provisionedUserId ?? null
    });
    return { approval, authorityHash: authority.hash, binding: { ...binding, bindingHash } };
  }

  router.get("/", async (req, res) => {
    if (Object.keys(req.query).length) return res.status(400).json({ error: "invalid_query" });
    const { binding } = await prepare(scopedRun(req, res));
    return res.json(binding);
  });

  router.post("/", async (req, res) => {
    const parsed = headlessClaimInput.safeParse(req.body);
    if (!parsed.success || Object.keys(req.query).length) return res.status(400).json({ error: "invalid_registration" });
    const scope = scopedRun(req, res);
    const { runId, actor } = scope;
    const prepared = await prepare(scope);
    if (prepared.binding.bindingHash !== parsed.data.bindingHash) throw new HeadlessRegistrationError("binding_changed");
    store.assertUnclaimed(runId);
    const { username, email, accountId } = prepared.binding.asker;
    const observer = options.fixtureObserver;
    if (!observer) throw new HeadlessRegistrationError("observation_unavailable", 503);
    const observationStarted = now().getTime();
    let observation;
    try { observation = await observer.observe({ username, email }); }
    catch { throw new HeadlessRegistrationError("observation_unavailable", 503); }
    if (observation.kind === "unavailable") throw new HeadlessRegistrationError("observation_unavailable", 503);
    if (observation.kind !== "free-candidate") throw new HeadlessRegistrationError("identity_not_free");
    const refreshed = await prepare(scope);
    if (refreshed.binding.bindingHash !== prepared.binding.bindingHash) throw new HeadlessRegistrationError("binding_changed");
    const at = now();
    const observedAt = Date.parse(observation.observation.observedAt);
    if (!Number.isFinite(observedAt) || observedAt > at.getTime() + clockSkewMs ||
      observedAt + clockSkewMs < observationStarted || observedAt + observationTtlMs <= at.getTime()) {
      throw new HeadlessRegistrationError("observation_stale");
    }
    return res.status(201).json(store.claim({
      approval: refreshed.approval, authorityHash: refreshed.authorityHash,
      bindingHash: refreshed.binding.bindingHash, expiresAt: refreshed.binding.expiresAt, username, askerAccountId: accountId
    }, actor, at));
  });

  router.post("/:resourceId/outcome", (req, res) => {
    const resourceId = headlessResourceId.safeParse(req.params.resourceId);
    const parsed = headlessOutcomeInput.safeParse(req.body);
    if (!resourceId.success || !parsed.success || Object.keys(req.query).length) {
      return res.status(400).json({ error: "invalid_outcome" });
    }
    const { runId, actor } = scopedRun(req, res);
    return res.json(store.report(runId, resourceId.data, parsed.data.result, actor, now()));
  });

  router.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error instanceof HeadlessRegistrationError) return res.status(error.status).json({ error: error.code });
    next(error);
  });
  return router;
}
