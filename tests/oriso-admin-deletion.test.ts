import { describe, expect, it, vi } from "vitest";
import { createOrisoAdminDeletionService, type OrisoAdminRole } from "../src/server/oriso-admin-deletion.js";
import type { TestAccessRecord } from "../src/server/infisical-provider.js";

function setup(environment: "dev" | "pre-dev" = "dev", role: OrisoAdminRole = "tenant-admin") {
  const record = { id: `oriso/${environment}/lisa`, project: "oriso", environment, kind: "admin", roles: [role],
    email: "lisa.simpson@oriso.org", username: "lisa.simpson@oriso.org" } as TestAccessRecord;
  const admin = { id: "product-id", email: record.email, username: record.username, tenantId: role === "platform-admin" ? "0" : "7", hasOtherIdentity: false };
  let exists = true;
  const request = vi.fn(async (path: string, init?: { method?: string }) => {
    if (path.includes("/search?")) return { ok: true, status: 200, json: async () => ({ total: exists ? 1 : 0, _embedded: exists ? [{ _embedded: admin }] : [] }) };
    if (init?.method === "DELETE") { exists = false; return { ok: true, status: 200, json: async () => ({}) }; }
    return { ok: true, status: exists ? 200 : 204, json: async () => ({ _embedded: admin }) };
  });
  const managed = { ...record, id: "managed-admin", username: "monty.burns@oriso.org", email: "monty.burns@oriso.org" };
  const service = createOrisoAdminDeletionService({ environment, adminRecordId: managed.id,
    registryProvider: { list: async () => [record, managed], get: async () => managed }, request });
  return { service, record, admin, request };
}

describe("ORISO admin deletion", () => {
  it.each(["dev", "pre-dev"] as const)("previews and verifies deletion in %s", async (environment) => {
    const { service, record, request } = setup(environment);
    expect(await service.preview(record)).toMatchObject({ environment, productId: "product-id", state: "present" });
    await service.remove(record, "product-id");
    expect(request.mock.calls.filter(([, init]) => init?.method === "DELETE")).toEqual([["/useradmin/tenantadmins/product-id", { method: "DELETE" }]]);
    expect((await service.preview(record)).state).toBe("absent");
  });
  it.each(["platform-admin", "agency-admin"] as const)("uses the product endpoint for %s", async (role) => {
    const { service, record, request } = setup("dev", role);
    await service.remove(record, "product-id");
    expect(request.mock.calls.find(([, init]) => init?.method === "DELETE")?.[0]).toBe(`/useradmin/${role === "agency-admin" ? "agencyadmins" : "tenantadmins"}/product-id`);
  });
  it("refuses a replaced product id before DELETE", async () => {
    const { service, record, admin, request } = setup(); admin.id = "replacement";
    await expect(service.remove(record, "product-id")).rejects.toThrow("admin_identity_changed");
    expect(request.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });
  it("refuses a shared counsellor identity", async () => {
    const { service, record, admin } = setup(); admin.hasOtherIdentity = true;
    await expect(service.preview(record)).rejects.toThrow("shared_admin_identity_protected");
  });
  it("protects aliases of the managed service administrator", async () => {
    const { service, record, request } = setup(); record.username = "monty.burns@oriso.org";
    await expect(service.preview(record)).rejects.toThrow("managed_admin_protected");
    expect(request).not.toHaveBeenCalled();
  });
  it("refuses a role mismatch", async () => {
    const { service, record, admin } = setup(); admin.tenantId = "0";
    await expect(service.preview(record)).rejects.toThrow("admin_role_changed");
  });
  it("refuses ambiguous or truncated search results", async () => {
    const { service, record, admin, request } = setup();
    request.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ total: 2, _embedded: [{ _embedded: admin }, { _embedded: admin }] }) });
    await expect(service.preview(record)).rejects.toThrow("admin_identity_ambiguous");
    request.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ total: 101, _embedded: [{ _embedded: admin }] }) });
    await expect(service.preview(record)).rejects.toThrow("admin_lookup_incomplete");
  });
  it("does not treat an upstream failure as absence", async () => {
    const { service, record, request } = setup(); request.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    await expect(service.preview(record)).rejects.toThrow("admin_lookup_failed");
  });
  it("reports a failed DELETE without claiming success", async () => {
    const { service, record, request } = setup();
    request.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ total: 1, _embedded: [{ _embedded: setup().admin }] }) });
    request.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ _embedded: setup().admin }) });
    request.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(service.remove(record, "product-id")).rejects.toThrow("admin_delete_failed");
  });
  it("requires post-delete absence even after a successful response", async () => {
    const { service, record, admin, request } = setup();
    request.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ total: 1, _embedded: [{ _embedded: admin }] }) }));
    request.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ total: 1, _embedded: [{ _embedded: admin }] }) });
    request.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ _embedded: admin }) });
    await expect(service.remove(record, "product-id")).rejects.toThrow("admin_delete_not_verified");
  });
});
