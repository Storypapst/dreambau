import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import Database from "better-sqlite3";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db.js";
import { acquireAccountMutationLock } from "./account-mutation-lock.js";
import { createInfisicalRegistryProvider, type TestEnvironment, type TestProject } from "./infisical-provider.js";
import { createInfisicalRegistryWriter } from "./infisical-writer.js";
import { accountsFromRecords } from "./infisical-accounts.js";
import { createOrisoProvisioningService } from "./oriso-provisioning.js";
import { createJmapTestMailReader } from "./test-mail.js";
import { runRequiredSetup } from "./oriso-setup-operator.js";

export async function runSetupOperatorCli(args: string[]) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    "record-id": { type: "string" }, email: { type: "string" }, "expected-created-at": { type: "string" },
    "original-user-id": { type: "string" }, "invite-id": { type: "string" }, execute: { type: "boolean", default: false }
  } });
  const input = z.object({ recordId: z.string().startsWith("oriso/dev/"), email: z.string().email(),
    expectedCreatedAt: z.string().datetime(), originalUserId: z.string().min(1).max(160),
    inviteId: z.coerce.number().int().positive(), execute: z.boolean() }).parse({
    recordId: values["record-id"], email: values.email, expectedCreatedAt: values["expected-created-at"],
    originalUserId: values["original-user-id"], inviteId: values["invite-id"], execute: values.execute
  });
  const config = loadConfig();
  const infisical = config.infisical;
  const target = config.orisoProvisioningTargets.dev;
  if (config.registryProvider !== "infisical" || !infisical?.writer || !target
    || new URL(target.apiBaseUrl).origin !== "https://dev.oriso.org"
    || new URL(target.tokenUrl).origin !== "https://dev.oriso.org") throw new Error("setup_operator_unavailable");
  const environments: TestEnvironment[] = ["local", "pre-dev", "dev", "production-test"];
  const registry = createInfisicalRegistryProvider({ ...infisical, sources: (Object.entries(infisical.projectIds) as [TestProject,string][])
    .flatMap(([project,projectId]) => environments.map(environment => ({project,projectId,environment}))) });
  const writer = createInfisicalRegistryWriter({ ...infisical, ...infisical.writer });
  const service = createOrisoProvisioningService({ ...target, environment: "dev", registryProvider: registry });
  const mail = createJmapTestMailReader();
  const writeDatabase = async (action: (db: ReturnType<typeof createDatabase>) => void) => {
    const db = createDatabase(config.databasePath);
    try { action(db); } finally { db.close(); }
  };
  return runRequiredSetup(input, {
    now: () => new Date(), acquireLock: key => acquireAccountMutationLock(config.databasePath, key),
    read: async () => {
      const record = await registry.get(input.recordId);
      if (!record) throw new Error("setup_operator_precondition_failed");
      const db = new Database(config.databasePath, { readonly:true, fileMustExist:true });
      try {
        const metadata = db.prepare("SELECT project,lifecycle_status FROM account_metadata WHERE email=?").get(input.email) as { project:string; lifecycle_status:string } | undefined;
        const deletion = db.prepare("SELECT state FROM oriso_admin_deletions WHERE account_id=?").get(record.id);
        return { record, project:metadata?.project ?? "NONE", deleted:Boolean(deletion) || ["delete_candidate","archived"].includes(metadata?.lifecycle_status ?? "") };
      } finally { db.close(); }
    },
    verify: record => service.verifyAccountSetup!(record), writer,
    complete: (record,storePassword) => service.completeAccountSetup!({ record, storePassword, readMail:async () => {
      const account = accountsFromRecords(await registry.list()).find(item => item.email === input.email);
      if (!account) throw new Error("setup_operator_precondition_failed");
      const message = await mail.latest(account,"counsellor-onboarding");
      if (!message) throw new Error("account_setup_mail_unavailable");
      return message.text;
    } }),
    provision: async (record,storeTotp) => {
      const names = record.displayName.trim().split(/\s+/);
      const result = await service.provision({ record, role:record.roles.join(",") === "consultant" ? "counsellor":"agency-admin",
        firstName:names[0],lastName:names.slice(1).join(" ") || "-",existingAccountOnly:true,storeTotp });
      return {created:result.created,ready:result.state.state === "ready"};
    },
    audit: (record,action) => writeDatabase(db => { db.recordAccountAccess({ accountId:record.id,email:input.email,actorId:"operator:codex-m4-oriso",
      action,createdAt:new Date().toISOString(),context:{environment:"dev"} }); }),
    sync: async (record) => {
      const records = await registry.list();
      const accounts = accountsFromRecords(records);
      await writeDatabase(db => {
        db.reconcileTestAccessLinks(accounts.map(account=>account.email), [...records.filter(item=>item.id!==record.id),record]);
        db.upsertMetadata(input.email,{ lifecycleStatus:"active" });
      });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSetupOperatorCli(process.argv.slice(2)).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => {
    const safe = error instanceof Error && /^(setup_operator_[a-z_]+|account_setup_[a-z_]+|oriso_account_mutation_in_progress|totp_verification_failed)$/.test(error.message)
      ? error.message : "setup_operator_failed";
    process.stderr.write(`${safe}\n`); process.exitCode=1;
  });
}
