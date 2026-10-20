import { describe, expect, it, vi } from "vitest";
import { createOrisoManagedAdminClient } from "../src/server/oriso-managed-admin-client.js";
import type { TestAccessRecord } from "../src/server/infisical-provider.js";
import type { ProvisioningFetch } from "../src/server/oriso-provisioning.js";
import { generateCompatibleOrisoTotp } from "../src/server/totp.js";
const record = { project: "oriso", environment: "pre-dev", kind: "app-user", username: "old-admin", secret: "private", totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" } as TestAccessRecord;
function harness() {
  let time = new Date("2026-10-20T10:00:00Z");
  const fetch = vi.fn<ProvisioningFetch>(async input => ({ ok: true, status: 200, json: async () => String(input).includes("/token") ? { access_token: "private-token", expires_in: 300 } : {} }));
  const get = vi.fn(async () => record);
  const subject = createOrisoManagedAdminClient({ environment: "pre-dev", apiBaseUrl: "https://api.oriso-dev.site/service/", tokenUrl: "https://auth.oriso-dev.site/token", clientId: "app", adminRecordId: "managed", registryProvider: { get, list: async () => [] }, fetch, now: () => time });
  return { subject, fetch, get, advance: (seconds: number) => { time = new Date(time.getTime() + seconds * 1000); } };
}
describe("canonical managed admin authentication", () => {
  it("retains legacy app-user admin admission, OTP and single-flight cache, then refreshes at the original 30s margin", async () => {
    const h = harness();
    await Promise.all([h.subject.request("/one"), h.subject.request("/two")]);
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.fetch).toHaveBeenCalledTimes(3);
    const form = new URLSearchParams(h.fetch.mock.calls[0][1]?.body);
    expect(Object.fromEntries(form)).toEqual({ client_id: "app", grant_type: "password", username: "old-admin", password: "private", otp: generateCompatibleOrisoTotp(record.totpSecret!, new Date("2026-10-20T10:00:00Z")).code });
    expect(h.fetch.mock.calls.every(([, init]) => init?.signal instanceof AbortSignal)).toBe(true);
    expect(h.fetch.mock.calls[1]).toEqual(["https://api.oriso-dev.site/service/one", expect.objectContaining({ headers: { Authorization: "Bearer private-token" }, method: "GET" })]);
    h.advance(269);
    await h.subject.request("/three");
    expect(h.get).toHaveBeenCalledTimes(1);
    h.advance(1);
    await h.subject.request("/four");
    expect(h.get).toHaveBeenCalledTimes(2);
  });
  it("preserves the pre-dispatch callback and mutation body behavior for legacy callers", async () => {
    const h = harness();
    const beforeSend = vi.fn();
    await h.subject.request("/legacy", { method: "PUT", body: "{}" }, beforeSend);
    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(h.fetch).toHaveBeenLastCalledWith("https://api.oriso-dev.site/service/legacy", expect.objectContaining({ method: "PUT", body: "{}", headers: { Authorization: "Bearer private-token", "Content-Type": "application/json" } }));
  });
  it("clears failed single-flight authentication and returns only fixed auth errors", async () => {
    const h = harness();
    h.fetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => { throw new Error("private"); } });
    await expect(h.subject.request("/read")).rejects.toMatchObject({ message: "oriso_authentication_failed" });
    await h.subject.request("/read");
    expect(h.get).toHaveBeenCalledTimes(2);
  });
});
