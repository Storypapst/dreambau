import type { AccountAccessAction } from "./account-link.js";
import type { TestAccessRecord } from "./infisical-provider.js";
import type { RegistryWriter } from "./infisical-writer.js";
import { environmentForOrisoEmail } from "./oriso-provisioning.js";

const springfieldNames = new Set([
  "abe.simpson", "bart.simpson", "blinky.fish", "clancy.bouvier", "cyrus.simpson", "herb.powell", "homer.simpson", "hugo.simpson",
  "jacqueline.bouvier", "krusty.clown", "laddie.dog", "ling.bouvier", "lisa.simpson", "maggie.simpson", "marge.simpson",
  "mojo.helper.monkey", "mona.simpson", "monty.burns", "mr.teeny", "ned.flanders", "patty.bouvier", "pinchy.lobster",
  "princess.pony", "ralph.wiggum", "santas.little.helper", "selma.bouvier", "sideshow.bob", "snowball.two", "spider.pig", "stampy.elephant"
]);

export interface SetupOperatorInput {
  recordId: string;
  email: string;
  expectedCreatedAt: string;
  originalUserId: string;
  inviteId: number;
  execute: boolean;
}

export interface SetupOperatorDependencies {
  now(): Date;
  acquireLock(key: string): Promise<(() => Promise<void>) | null>;
  read(): Promise<{ record: TestAccessRecord; project: string; deleted: boolean }>;
  verify(record: TestAccessRecord): Promise<void>;
  writer: RegistryWriter;
  complete(record: TestAccessRecord, storePassword: (password: string, binding: NonNullable<TestAccessRecord["accountSetup"]>) => Promise<void>): Promise<TestAccessRecord>;
  provision(record: TestAccessRecord, storeTotp: (secret: string) => Promise<void>): Promise<{ created: boolean; ready: boolean }>;
  audit(record: TestAccessRecord, action: AccountAccessAction): Promise<void>;
  sync(record: TestAccessRecord): Promise<void>;
}

// Server-operator entry point, not a public grant or a password-repair API.
// Original IDs must come from the creation evidence, never an email lookup.
export async function runRequiredSetup(input: SetupOperatorInput, deps: SetupOperatorDependencies) {
  const key = `dev:${input.email}`;
  const release = input.execute ? await deps.acquireLock(key) : null;
  if (input.execute && !release) throw new Error("oriso_account_mutation_in_progress");
  try {
    const { record: original, project, deleted } = await deps.read();
    const age = deps.now().getTime() - Date.parse(original.createdAt);
    if (original.id !== input.recordId || original.email !== input.email || input.email !== input.email.trim().toLowerCase()
      || !springfieldNames.has(input.email.split("@")[0])
      || environmentForOrisoEmail(input.email) !== "dev" || original.project !== "oriso" || original.environment !== "dev"
      || project !== "ORISO" || deleted || original.createdAt !== input.expectedCreatedAt
      || !Number.isFinite(age) || age < 0 || age > 24 * 60 * 60 * 1000
      || (original.expiresAt !== null && Date.parse(original.expiresAt) <= deps.now().getTime())
      || original.provisioningStatus === "ready" || !["pending", "failed"].includes(original.provisioningStatus ?? "")
      || !["consultant", "agency-admin"].includes(original.roles.join(","))
      || (!original.accountSetup && original.totpSecret)
      || !input.originalUserId || !Number.isInteger(input.inviteId) || input.inviteId < 1
      || (original.accountSetup && (original.accountSetup.inviteId !== input.inviteId
        || original.accountSetup.provisionedUserId !== input.originalUserId))) throw new Error("setup_operator_precondition_failed");
    const needsOriginalBinding = !original.accountSetup;
    let record: TestAccessRecord = { ...original, accountSetup: original.accountSetup
      ?? { inviteId: input.inviteId, provisionedUserId: input.originalUserId, submittedAt: null } };
    await deps.verify(record);
    if (!input.execute) return { recordId: record.id, email: input.email, status: "preflight-ok", needsOriginalBinding };
    const writer = deps.writer;
    if (!writer.bindAccountSetup || !writer.stageAccountSetup || !writer.updateRecord) throw new Error("setup_operator_unavailable");
    if (needsOriginalBinding) {
      const updatedAt = deps.now().toISOString();
      await writer.bindAccountSetup(original, record.accountSetup!, updatedAt);
      record = { ...record, updatedAt };
      await deps.audit(record, "record_linked");
    }
    record = await deps.complete(record, async (password, binding) => {
      await writer.stageAccountSetup!(record, password, binding);
      record = { ...record, secret: password, accountSetup: binding, provisioningStatus: "pending", updatedAt: binding.submittedAt! };
      await deps.audit(record, "application_password_updated");
    });
    const result = await deps.provision(record, async (secret) => {
      const updatedAt = deps.now().toISOString();
      await writer.enrollTotp(record, secret, updatedAt);
      record = { ...record, totpSecret: secret, updatedAt };
      await deps.audit(record, "totp_enrolled");
    });
    if (result.created || !result.ready || !record.totpSecret) throw new Error("setup_operator_verification_failed");
    record = { ...record, provisioningStatus: "ready", updatedAt: deps.now().toISOString() };
    await writer.updateRecord(record);
    await deps.sync(record);
    await deps.audit(record, "oriso_account_provisioned");
    return { recordId: record.id, email: input.email, status: "ready", needsOriginalBinding };
  } finally { await release?.(); }
}
