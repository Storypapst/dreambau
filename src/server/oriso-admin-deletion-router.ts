import type { RequestHandler, Router } from "express";
import { z } from "zod";
import { OrisoAdminDeletionError } from "./oriso-admin-deletion.js";
import type { LinkedTestAccount } from "./account-link.js";
import type { AccountRecord } from "./accounts.js";
import type { RegistryProvider, TestAccessRecord } from "./infisical-provider.js";
import type { RegistryWriter } from "./infisical-writer.js";
import type { OrisoProvisioningService } from "./oriso-provisioning.js";
import type { HumanUser } from "./passkey-store.js";

const selection = z.object({ accountId: z.string().min(1).max(240), environment: z.enum(["dev", "pre-dev"]) });
const confirmation = selection.extend({ productId: z.string().min(1).nullable(), confirmEmail: z.string().email(), confirmed: z.literal(true) }).strict();

export function installOrisoAdminDeletionRoutes(api: Router, options: {
  requireAdmin: RequestHandler;
  requireProvisioning: RequestHandler;
  canUseEnvironment(user: unknown, environment: "dev" | "pre-dev"): boolean;
  accounts(user: HumanUser): AccountRecord[];
  isOrisoAccount(account: AccountRecord): boolean;
  provider: RegistryProvider;
  writer?: RegistryWriter;
  services: Partial<Record<"dev" | "pre-dev", OrisoProvisioningService>>;
  guardMutation(handler: RequestHandler): RequestHandler;
  projectLinked(record: TestAccessRecord): LinkedTestAccount | null;
  markDeleted(record: TestAccessRecord, actorId: string, deletedAt: string): void;
  now(): Date;
}) {
  const locks = new Set<string>();
  const handler = (deleting: boolean): RequestHandler => async (req, res) => {
    res.set("Cache-Control", "no-store");
    const parsed = deleting ? confirmation.safeParse(req.body) : selection.strict().safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: "validation_failed" }); return; }
    const { accountId, environment } = parsed.data;
    const email = String(req.params.email).trim().toLowerCase();
    const account = options.accounts(res.locals.humanUser).find((item) => item.email.toLowerCase() === email);
    if (!account) { res.status(404).json({ error: "account_not_found" }); return; }
    if (!options.isOrisoAccount(account)) { res.status(422).json({ error: "mailbox_project_mismatch" }); return; }
    if (!options.canUseEnvironment(res.locals.humanEntitlements, environment)) { res.status(403).json({ error: "oriso_provisioning_environment_denied" }); return; }
    const service = options.services[environment]?.adminDeletion;
    if (!service) { res.status(503).json({ error: "oriso_admin_deletion_unavailable" }); return; }
    if (deleting && !options.writer?.updateRecord) { res.status(503).json({ error: "registry_update_unavailable" }); return; }
    const lock = `${environment}:${email}`;
    if (locks.has(lock)) { res.status(409).json({ error: "admin_deletion_in_progress" }); return; }
    if (deleting) locks.add(lock);
    let productDeleted = false;
    try {
      const record = await options.provider.get(accountId);
      if (!record || record.project !== "oriso" || record.kind !== "admin" || record.environment !== environment
        || record.email?.trim().toLowerCase() !== email) {
        res.status(404).json({ error: "linked_admin_not_found" }); return;
      }
      if (!deleting) { res.json(await service.preview(record)); return; }
      const body = confirmation.parse(req.body);
      if (body.confirmEmail.trim().toLowerCase() !== email) { res.status(400).json({ error: "confirmation_mismatch" }); return; }
      await service.remove(record, body.productId);
      productDeleted = true;
      const deletedAt = options.now().toISOString();
      options.markDeleted(record, res.locals.humanUser.id, deletedAt);
      const updated: TestAccessRecord = { ...record, provisioningStatus: "failed", updatedAt: deletedAt };
      await options.writer!.updateRecord!(updated);
      res.json({ deleted: true, mailboxPreserved: true, linked: options.projectLinked(updated) });
    } catch (error) {
      if (productDeleted) { res.status(502).json({ error: "admin_deleted_registry_update_failed", productDeleted: true }); return; }
      if (error instanceof OrisoAdminDeletionError) {
        const upstream = ["oriso_admin_request_failed", "admin_lookup_failed", "admin_delete_failed", "admin_delete_not_verified"].includes(error.code);
        res.status(upstream ? 502 : 409).json({ error: error.code }); return;
      }
      res.status(502).json({ error: "oriso_admin_deletion_failed" });
    } finally { if (deleting) locks.delete(lock); }
  };
  api.get("/accounts/:email/oriso-admin-deletion", options.requireAdmin, options.requireProvisioning, handler(false));
  api.post("/accounts/:email/oriso-admin-deletion", options.requireAdmin, options.requireProvisioning, options.guardMutation(handler(true)));
}
