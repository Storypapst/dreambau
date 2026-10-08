import { z } from "zod";
import type { RegistryProvider, TestAccessRecord } from "./infisical-provider.js";

export type OrisoAdminRole = "platform-admin" | "tenant-admin" | "agency-admin";
export interface OrisoAdminDeletionPreview {
  accountId: string;
  environment: "dev" | "pre-dev";
  role: OrisoAdminRole;
  email: string;
  username: string;
  productId: string | null;
  state: "present" | "absent";
}
export class OrisoAdminDeletionError extends Error {
  constructor(readonly code: string) { super(code); }
}
export interface OrisoAdminDeletionService {
  preview(record: TestAccessRecord): Promise<OrisoAdminDeletionPreview>;
  remove(record: TestAccessRecord, expectedProductId: string | null, beforeDelete?: () => void): Promise<void>;
}

const adminSchema = z.object({
  id: z.string().min(1), email: z.string().email(), username: z.string().min(1),
  tenantId: z.union([z.string(), z.number()]).nullable().optional(),
  hasOtherIdentity: z.boolean()
});
const responseSchema = z.object({ _embedded: adminSchema });
const searchSchema = z.object({
  _embedded: z.array(responseSchema), total: z.number().int().nonnegative()
});
const normalize = (value: string) => value.trim().toLowerCase();

export function createOrisoAdminDeletionService(options: {
  environment: "dev" | "pre-dev";
  adminRecordId: string;
  registryProvider: RegistryProvider;
  request(path: string, init?: { method?: string }): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}): OrisoAdminDeletionService {
  async function request(path: string, method = "GET") {
    try { return await options.request(path, { method }); }
    catch { throw new OrisoAdminDeletionError("oriso_admin_request_failed"); }
  }
  function roleFor(record: TestAccessRecord): OrisoAdminRole {
    const role = record.roles[0];
    if (record.project !== "oriso" || record.environment !== options.environment || record.kind !== "admin"
      || !record.email || record.roles.length !== 1
      || !["platform-admin", "tenant-admin", "agency-admin"].includes(role)) {
      throw new OrisoAdminDeletionError("admin_record_not_supported");
    }
    return role as OrisoAdminRole;
  }
  const basePath = (role: OrisoAdminRole) => `/useradmin/${role === "agency-admin" ? "agencyadmins" : "tenantadmins"}`;
  async function preview(record: TestAccessRecord): Promise<OrisoAdminDeletionPreview> {
    const role = roleFor(record);
    const managedAdmin = await options.registryProvider.get(options.adminRecordId);
    if (!managedAdmin || managedAdmin.environment !== options.environment || managedAdmin.project !== "oriso") {
      throw new OrisoAdminDeletionError("admin_record_unavailable");
    }
    if (record.id === options.adminRecordId || normalize(record.username) === normalize(managedAdmin.username)
      || (managedAdmin.email && normalize(record.email!) === normalize(managedAdmin.email))) {
      throw new OrisoAdminDeletionError("managed_admin_protected");
    }
    const response = await request(`${basePath(role)}/search?${new URLSearchParams({ query: record.email!, page: "1", perPage: "100" })}`);
    if (!response.ok) throw new OrisoAdminDeletionError("admin_lookup_failed");
    let page: z.infer<typeof searchSchema>;
    try { page = searchSchema.parse(await response.json()); }
    catch { throw new OrisoAdminDeletionError("admin_lookup_failed"); }
    if (page.total > page._embedded.length) throw new OrisoAdminDeletionError("admin_lookup_incomplete");
    const matches = page._embedded.map((row) => row._embedded).filter((admin) => normalize(admin.email) === normalize(record.email!));
    if (matches.length > 1) throw new OrisoAdminDeletionError("admin_identity_ambiguous");
    const admin = matches[0];
    if (admin) {
      if (normalize(admin.username) !== normalize(record.username)) throw new OrisoAdminDeletionError("admin_identity_changed");
      if (admin.hasOtherIdentity) throw new OrisoAdminDeletionError("shared_admin_identity_protected");
      if (role !== "agency-admin" && (admin.tenantId == null || (role === "platform-admin") !== (String(admin.tenantId) === "0"))) {
        throw new OrisoAdminDeletionError("admin_role_changed");
      }
    }
    return { accountId: record.id, environment: options.environment, role, email: record.email!, username: record.username,
      productId: admin?.id ?? null, state: admin ? "present" : "absent" };
  }
  return {
    preview,
    async remove(record, expectedProductId, beforeDelete) {
      const current = await preview(record);
      if (current.productId !== expectedProductId) throw new OrisoAdminDeletionError("admin_identity_changed");
      if (!current.productId) return;
      const path = `${basePath(current.role)}/${encodeURIComponent(current.productId)}`;
      const before = await request(path);
      if (before.status !== 200) throw new OrisoAdminDeletionError("admin_identity_changed");
      let admin: z.infer<typeof adminSchema>;
      try { admin = responseSchema.parse(await before.json())._embedded; }
      catch { throw new OrisoAdminDeletionError("admin_lookup_failed"); }
      if (admin.id !== current.productId || normalize(admin.email) !== normalize(current.email)
        || normalize(admin.username) !== normalize(current.username) || admin.hasOtherIdentity
        || (current.role !== "agency-admin" && (admin.tenantId == null || (current.role === "platform-admin") !== (String(admin.tenantId) === "0")))) {
        throw new OrisoAdminDeletionError("admin_identity_changed");
      }
      // Persist uncertainty before the irreversible request: a timeout or failed
      // verification must never leave retained credentials reporting READY.
      beforeDelete?.();
      const deleted = await request(path, "DELETE");
      if (deleted.status !== 200 && deleted.status !== 204) throw new OrisoAdminDeletionError("admin_delete_failed");
      const after = await request(path);
      if (after.status !== 204 && after.status !== 404) throw new OrisoAdminDeletionError("admin_delete_not_verified");
      if ((await preview(record)).state !== "absent") throw new OrisoAdminDeletionError("admin_delete_not_verified");
    }
  };
}
