import { expect, it, vi } from "vitest";
import { runRequiredSetup, type SetupOperatorDependencies } from "../src/server/oriso-setup-operator.js";
import type { TestAccessRecord } from "../src/server/infisical-provider.js";

function harness() {
  const createdAt = "2026-10-09T01:34:58.000Z";
  let record: TestAccessRecord = { id: "oriso/dev/marge.simpson-trail.ist", project: "oriso", environment: "dev", kind: "app-user", displayName: "Marge Simpson", username: "marge.simpson_at_trail.ist", email: "marge.simpson@trail.ist", roles: ["consultant"], permissionsDescription: "Synthetic", loginUrl: "https://dev.oriso.org", secret: "temporary-synthetic", responsiblePerson: "qa", createdAt, updatedAt: createdAt, expiresAt: null, shared: true, rotationStatus: "current", documentationUrl: "https://dreambau.com/testmails/", provisioningStatus: "failed" };
  const input = { recordId: record.id, email: record.email!, expectedCreatedAt: createdAt, originalUserId: "original-id", inviteId: 119, execute: false };
  const release = vi.fn(async () => {});
  const deps: SetupOperatorDependencies = {
    now: () => new Date("2026-10-09T02:00:00.000Z"),
    acquireLock: vi.fn(async () => release),
    read: vi.fn(async () => ({ record, project: "ORISO", deleted: false })),
    verify: vi.fn(async () => {}),
    writer: { enrollTotp: vi.fn(async () => ({ recordId: record.id, updatedAt: createdAt })),
      bindAccountSetup: vi.fn(async (_record, binding, updatedAt) => { record = { ...record, accountSetup: binding, updatedAt }; return { recordId: record.id, updatedAt }; }),
      stageAccountSetup: vi.fn(async () => ({ recordId: record.id, updatedAt: createdAt })),
      updateRecord: vi.fn(async () => ({ recordId: record.id, updatedAt: createdAt })) },
    complete: vi.fn(async (current, storePassword) => { const binding = { ...current.accountSetup!, submittedAt: "2026-10-09T02:00:00.000Z" }; await storePassword("protected-synthetic-final", binding); return { ...current, secret: "protected-synthetic-final", accountSetup: binding }; }),
    provision: vi.fn(async (_current, storeTotp) => { await storeTotp("SYNTHETIC-TOTP"); return { created: false, ready: true }; }),
    audit: vi.fn(async () => {}), sync: vi.fn(async () => {})
  };
  return { input, deps, release, patch: (patch: Partial<TestAccessRecord>) => { record = { ...record, ...patch }; } };
}

it("preflights original provenance without locks, writes, setup, mail or factor changes", async () => {
  const h = harness();
  await expect(runRequiredSetup(h.input, h.deps)).resolves.toEqual({ recordId: h.input.recordId, email: h.input.email, status: "preflight-ok", needsOriginalBinding: true });
  expect(h.deps.verify).toHaveBeenCalledWith(expect.objectContaining({ accountSetup: { inviteId:119, provisionedUserId:"original-id", submittedAt:null } }));
  for(const action of [h.deps.acquireLock,h.deps.writer.bindAccountSetup,h.deps.complete,h.deps.provision,h.deps.audit,h.deps.sync]) expect(action).not.toHaveBeenCalled();
});

it("executes under the shared lock, retains original identity and persists password before factor/ready", async () => {
  const h = harness();
  await expect(runRequiredSetup({ ...h.input, execute:true },h.deps)).resolves.toMatchObject({ status:"ready" });
  expect(h.deps.acquireLock).toHaveBeenCalledWith("dev:marge.simpson@trail.ist");
  expect(h.deps.writer.bindAccountSetup).toHaveBeenCalledOnce();
  expect(h.deps.writer.stageAccountSetup).toHaveBeenCalledOnce();
  expect(h.deps.writer.updateRecord).toHaveBeenCalledWith(expect.objectContaining({ provisioningStatus:"ready", totpSecret:"SYNTHETIC-TOTP", accountSetup:expect.objectContaining({ provisionedUserId:"original-id" }) }));
  expect(h.release).toHaveBeenCalledOnce();
});

it.each([{ provisioningStatus:"ready" as const },{ totpSecret:"already-managed" },{ createdAt:"2020-01-01T00:00:00.000Z" },{ environment:"pre-dev" as const },{ email:"another@trail.ist" },{ accountSetup:{inviteId:120,provisionedUserId:"replacement-id",submittedAt:null} }])("rejects changed or managed provenance before writes: %j", async patch => {
  const h=harness();h.patch(patch);
  await expect(runRequiredSetup({...h.input,execute:true},h.deps)).rejects.toThrow("setup_operator_precondition_failed");
  expect(h.deps.writer.bindAccountSetup).not.toHaveBeenCalled();expect(h.deps.complete).not.toHaveBeenCalled();expect(h.release).toHaveBeenCalledOnce();
});

it("rejects a concurrently held web/CLI mutation lock without reading or writing", async () => {
  const h=harness();h.deps.acquireLock=vi.fn(async()=>null);
  await expect(runRequiredSetup({...h.input,execute:true},h.deps)).rejects.toThrow("oriso_account_mutation_in_progress");
  expect(h.deps.read).not.toHaveBeenCalled();expect(h.deps.complete).not.toHaveBeenCalled();
});

it("retains a staged uncertain outcome and does not mark it ready", async () => {
  const h=harness();h.deps.complete=vi.fn(async (record,storePassword)=>{await storePassword("protected-synthetic-final",{...record.accountSetup!,submittedAt:"2026-10-09T02:00:00.000Z"});throw Error("account_setup_outcome_unknown");});
  await expect(runRequiredSetup({...h.input,execute:true},h.deps)).rejects.toThrow("account_setup_outcome_unknown");
  expect(h.deps.writer.stageAccountSetup).toHaveBeenCalledOnce();expect(h.deps.writer.updateRecord).not.toHaveBeenCalled();expect(h.deps.provision).not.toHaveBeenCalled();expect(h.release).toHaveBeenCalledOnce();
});
