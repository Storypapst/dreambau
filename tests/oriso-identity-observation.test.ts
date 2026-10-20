import { describe, expect, it, vi } from "vitest";
import { createOrisoIdentityObserver } from "../src/server/oriso-identity-observation.js";
import type { TestAccessRecord } from "../src/server/infisical-provider.js";
import type { ProvisioningFetch } from "../src/server/oriso-provisioning.js";

const selectors = { username: "lisa", email: "Lisa@oriso.org", identityId: "known-id" };
const record = {
  id: "oriso/dev/admin", project: "oriso", environment: "dev", kind: "admin",
  roles: ["platform-admin"], username: "managed-admin", secret: "private-password",
  totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
} as TestAccessRecord;
const target = {
  environment: "dev" as const, apiBaseUrl: "https://dev.oriso.org/service",
  tokenUrl: "https://dev.oriso.org/auth/realms/online-beratung/protocol/openid-connect/token",
  clientId: "app", adminRecordId: record.id
};
function payload(patch: Record<string, unknown> = {}) {
  return {
    scope: "identity-occupancy-v1", observedAt: "2026-10-20T10:00:00Z",
    normalizedSelectors: { identityId: "known-id", usernames: ["lisa", "enc.NRUXGYI."], email: "lisa@oriso.org" },
    identityScanComplete: true, occupancy: "FREE",
    layers: ["KEYCLOAK", "ADMIN", "CONSULTANT", "ASKER"].map(source => ({ source, status: "COMPLETE" })),
    facts: [], ...patch
  };
}
function harness(body: unknown = payload(), status = 200, recordPatch: Partial<TestAccessRecord> = {}) {
  const fetch = vi.fn<ProvisioningFetch>(async (input) => {
    if (String(input) === target.tokenUrl) return { ok: true, status: 200, json: async () => ({ access_token: "private-token", expires_in: 300 }) };
    return { ok: status < 400, status, json: async () => body };
  });
  const get = vi.fn(async () => ({ ...record, ...recordPatch }));
  const subject = createOrisoIdentityObserver({ ...target, registryProvider: { get, list: async () => [] }, fetch });
  return { fetch, get, subject };
}

describe("strict Dev identity occupancy read", () => {
  it("accepts a complete empty exact union only as a fresh candidate", async () => {
    const h = harness();
    expect(await h.subject.observe(selectors)).toMatchObject({ kind: "free-candidate", observation: { occupancy: "FREE", facts: [] } });
    expect(h.fetch).toHaveBeenLastCalledWith("https://dev.oriso.org/service/useradmin/identity-observations", expect.objectContaining({ method: "POST", body: JSON.stringify({ identityId: "known-id", username: "lisa", email: "Lisa@oriso.org" }), redirect: "error" }));
    expect(h.fetch.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it("accepts occupied disabled/deleted facts as existing references", async () => {
    const facts = [{ source: "ADMIN", identityId: "known-id", rowId: "row", deleted: true, enabled: false, tenantId: 3 }];
    expect(await harness(payload({ occupancy: "OCCUPIED", facts })).subject.observe(selectors)).toMatchObject({ kind: "occupied", observation: { facts } });
  });
  it("retains complete conflicting identities without claiming ownership", async () => {
    const facts = [{ source: "ADMIN", identityId: "other-id", email: "lisa@oriso.org" }];
    expect(await harness(payload({ occupancy: "CONFLICT", facts }), 409).subject.observe(selectors)).toMatchObject({ kind: "conflict" });
  });
  it.each([
    ["wrong scope", { scope: "other" }, 200],
    ["missing layer", { layers: [] }, 200],
    ["duplicate layer", { layers: Array(4).fill({ source: "ADMIN", status: "COMPLETE" }) }, 200],
    ["incomplete free", { identityScanComplete: false }, 200],
    ["free with facts", { facts: [{ source: "KEYCLOAK", identityId: "known-id" }] }, 200],
    ["occupied empty", { occupancy: "OCCUPIED" }, 200],
    ["conflict on 200", { occupancy: "CONFLICT", facts: [{ source: "ADMIN", identityId: "other" }] }, 200],
    ["free on 409", {}, 409],
    ["free on 502", {}, 502],
    ["selector omission", { normalizedSelectors: { email: "lisa@oriso.org" } }, 200],
    ["wrong selector", { normalizedSelectors: { identityId: "different", usernames: ["lisa", "enc.NRUXGYI."], email: "lisa@oriso.org" } }, 200],
    ["unrelated username", { normalizedSelectors: { identityId: "known-id", usernames: ["lisa", "enc.OTHER"], email: "lisa@oriso.org" } }, 200],
    ["invalid time", { observedAt: "yesterday" }, 200],
    ["oversized facts", { facts: Array(81).fill({ source: "ADMIN", identityId: "known-id" }) }, 200],
    ["oversized id", { occupancy: "OCCUPIED", facts: [{ source: "ADMIN", identityId: "x".repeat(256) }] }, 200],
    ["unsafe integer", { occupancy: "OCCUPIED", facts: [{ source: "ADMIN", identityId: "known-id", tenantId: Number.MAX_SAFE_INTEGER + 1 }] }, 200],
    ["malformed fact", { occupancy: "OCCUPIED", facts: [{ source: "ADMIN", identityId: null }] }, 200],
    ["unknown field", { privateToken: "must-not-escape" }, 200]
  ])("returns unknown for %s", async (_name, patch, status) => {
    expect(await harness(payload(patch), status).subject.observe(selectors)).toEqual({ kind: "unknown", reason: "invalid-observation" });
  });
  it.each([401, 403, 404, 429, 500])("does not read error bodies or infer FREE on HTTP %s", async status => {
    const h = harness();
    const json = vi.fn(async () => { throw new Error("private selector source error"); });
    h.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: "private-token", expires_in: 300 }) });
    h.fetch.mockResolvedValueOnce({ ok: false, status, json });
    expect(await h.subject.observe(selectors)).toEqual({ kind: "unavailable", reason: status === 404 ? "unsupported-endpoint" : status === 401 || status === 403 ? "permission-denied" : "upstream-unavailable" });
    expect(json).not.toHaveBeenCalled();
  });
  it.each([null, "<html>SPA</html>", {}, []])("rejects malformed 200 payload %#", async body => {
    expect(await harness(body).subject.observe(selectors)).toMatchObject({ kind: "unknown" });
  });
  it("keeps partial dependency facts unknown even when occupied", async () => {
    const body = payload({ identityScanComplete: false, occupancy: "OCCUPIED", facts: [{ source: "ADMIN", identityId: "known-id" }] });
    body.layers[0].status = "DEPENDENCY_FAILURE";
    expect(await harness(body, 502).subject.observe(selectors)).toEqual({ kind: "unknown", reason: "incomplete-observation" });
  });
  it("keeps a valid limit conflict blocked", async () => {
    const body = payload({ identityScanComplete: false, occupancy: "UNKNOWN" });
    body.layers[0].status = "LIMIT";
    expect(await harness(body, 409).subject.observe(selectors)).toEqual({ kind: "unknown", reason: "incomplete-observation" });
  });
  it.each(["kind", "project", "environment", "roles"] as const)("rejects factory admin %s without changing legacy admission", async field => {
    const patch = { kind: "app-user", project: "orimo", environment: "pre-dev", roles: ["technical", "platform-admin"] };
    const h = harness(payload(), 200, { [field]: patch[field] } as Partial<TestAccessRecord>);
    expect(await h.subject.observe(selectors)).toEqual({ kind: "unavailable", reason: "admin-unavailable" });
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("sanitizes thrown auth/provider/JSON/transport errors and never logs", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const h = harness();
    h.fetch.mockRejectedValue(new Error("private-token private-password Lisa@oriso.org OTP"));
    expect(await h.subject.observe(selectors)).toEqual({ kind: "unavailable", reason: "upstream-unavailable" });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it("rejects malformed JSON without returning parser details", async () => {
    const h = harness();
    h.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: "private-token", expires_in: 300 }) });
    h.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error("private JSON"); } });
    expect(await h.subject.observe(selectors)).toEqual({ kind: "unknown", reason: "invalid-observation" });
  });
  it.each([{}, { username: "a*" }, { username: "a%" }, { username: "a?" }, { username: " " }, { email: "x".repeat(255) }, { username: "a\n" }, { username: "enc.invalid" }, { username: "lisa", host: "elsewhere" }])("rejects invalid selectors before auth %#", async invalid => {
    const h = harness();
    expect(await h.subject.observe(invalid)).toEqual({ kind: "unknown", reason: "invalid-selectors" });
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("validates encoded usernames against the exact raw/encoded union", async () => {
    const h = harness();
    expect(await h.subject.observe({ ...selectors, username: "ENC.NRUXGYI." })).toMatchObject({ kind: "free-candidate" });
  });
  it.each([
    ["counsellor", "marge.simpson_at_oriso.org", "enc.NVQXEZ3FFZZWS3LQONXW4X3BORPW64TJONXS433SM4......"],
    ["advice-seeker", "lisa.simpson_at_oriso.org", "enc.NRUXGYJOONUW24DTN5XF6YLUL5XXE2LTN4XG64TH"]
  ])("observes literal _at_ %s usernames in raw and encoded form", async (_role, raw, encoded) => {
    for (const username of [raw, encoded]) {
      for (const occupied of [false, true]) {
        const facts = occupied ? [
          { source: "KEYCLOAK", identityId: "same-id", username: raw },
          { source: "CONSULTANT", identityId: "same-id", rowId: "row", username: encoded }
        ] : [];
        const h = harness(payload({
          normalizedSelectors: { identityId: null, usernames: [raw, encoded], email: null },
          occupancy: occupied ? "OCCUPIED" : "FREE", facts
        }));
        expect(await h.subject.observe({ username })).toMatchObject({ kind: occupied ? "occupied" : "free-candidate" });
        expect(h.fetch).toHaveBeenLastCalledWith("https://dev.oriso.org/service/useradmin/identity-observations", expect.objectContaining({ body: JSON.stringify({ username }) }));
      }
    }
  });
  it("keeps literal underscore selectors as an exact union, including email and known ID", async () => {
    const input = { identityId: "known_id", username: "lisa.simpson_at_oriso.org", email: "Lisa_Simpson@oriso.org" };
    const names = [input.username, "enc.NRUXGYJOONUW24DTN5XF6YLUL5XXE2LTN4XG64TH"];
    const h = harness(payload({
      normalizedSelectors: { identityId: input.identityId, usernames: names, email: "lisa_simpson@oriso.org" },
      occupancy: "CONFLICT", facts: [
        { source: "KEYCLOAK", identityId: "known_id", username: input.username },
        { source: "ADMIN", identityId: "other_id", email: "lisa_simpson@oriso.org" }
      ]
    }), 409);
    expect(await h.subject.observe(input)).toMatchObject({ kind: "conflict" });
    expect(h.fetch).toHaveBeenLastCalledWith("https://dev.oriso.org/service/useradmin/identity-observations", expect.objectContaining({ body: JSON.stringify(input) }));
  });
  it.each(["lisa.simpsonXatYoriso.org", "lisa.simpsonatoriso.org"])("does not expand underscores to match %s", async username => {
    const raw = "lisa.simpson_at_oriso.org";
    const h = harness(payload({
      normalizedSelectors: { identityId: null, usernames: [raw, "enc.NRUXGYJOONUW24DTN5XF6YLUL5XXE2LTN4XG64TH"], email: null },
      occupancy: "OCCUPIED", facts: [{ source: "KEYCLOAK", identityId: "stranger", username }]
    }));
    expect(await h.subject.observe({ username: raw })).toEqual({ kind: "unknown", reason: "invalid-observation" });
  });
  it("rejects facts unrelated to every exact selector", async () => {
    const h = harness(payload({ normalizedSelectors: { identityId: null, usernames: [], email: "lisa@oriso.org" }, occupancy: "OCCUPIED", facts: [{ source: "ADMIN", identityId: "stranger", email: "other@oriso.org" }] }));
    expect(await h.subject.observe({ email: "lisa@oriso.org" })).toEqual({ kind: "unknown", reason: "invalid-observation" });
  });
  it("accepts email-only probes with empty username normalization", async () => {
    const h = harness(payload({ normalizedSelectors: { identityId: null, usernames: [], email: "lisa@oriso.org" } }));
    expect(await h.subject.observe({ email: "Lisa@oriso.org" })).toMatchObject({ kind: "free-candidate" });
  });
  it("bounds streaming wire bodies before parsing and cancels oversized intake", async () => {
    const h = harness();
    const cancel = vi.fn();
    h.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: "private-token", expires_in: 300 }) });
    const json = vi.fn();
    h.fetch.mockResolvedValueOnce({ ok: true, status: 200, json, body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(128 * 1024 + 1)); }, cancel }) });
    expect(await h.subject.observe(selectors)).toEqual({ kind: "unknown", reason: "invalid-observation" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(json).not.toHaveBeenCalled();
  });
  it("parses bounded native response streams", async () => {
    const h = harness();
    h.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: "private-token", expires_in: 300 }) });
    h.fetch.mockResolvedValueOnce(new Response(JSON.stringify(payload())));
    expect(await h.subject.observe(selectors)).toMatchObject({ kind: "free-candidate" });
  });
  it("returns a safe unavailable result for an aborted request without fallback", async () => {
    const h = harness();
    h.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: "private-token", expires_in: 300 }) });
    h.fetch.mockRejectedValueOnce(new DOMException("private request", "TimeoutError"));
    expect(await h.subject.observe(selectors)).toEqual({ kind: "unavailable", reason: "upstream-unavailable" });
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });
  it("fails closed on noncanonical target configuration", () => {
    expect(() => createOrisoIdentityObserver({ ...target, apiBaseUrl: "https://other/service", registryProvider: { get: async () => record, list: async () => [] } })).toThrow("invalid-observation-target");
  });
});
