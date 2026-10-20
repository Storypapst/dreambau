import { z } from "zod";
import { createOrisoManagedAdminClient, OrisoManagedAdminError, type OrisoManagedAdminClientOptions, type ProvisioningFetch } from "./oriso-managed-admin-client.js";

// Contract: ORISO-UserService b1368f6f9d7c4db4df908a37c60c2e70c85f67b3,
// api/useradminservice.yaml IdentityObservation*DTO + IdentityProbe/IdentityObservationService.
const sources = ["KEYCLOAK", "ADMIN", "CONSULTANT", "ASKER"] as const;
const bounded = z.string().min(1).max(255).regex(/^[^\x00-\x1f\x7f-\x9f]+$/).refine(value => value.trim().length > 0);
const selector = bounded.refine(value => value.trim().length > 0 && !/[*%_?]/.test(value));
const selectorsSchema = z.object({ identityId: selector.optional(), username: selector.optional(), email: selector.refine(value => value.length <= 254).optional() }).strict()
  .refine(value => Object.keys(value).length > 0);
export type OrisoIdentitySelectors = z.infer<typeof selectorsSchema>;
const nullable = <T extends z.ZodType>(schema: T) => schema.nullish();
const factSchema = z.object({
  source: z.enum(sources), identityId: bounded,
  rowId: nullable(bounded), username: nullable(bounded), email: nullable(z.string().min(1).max(254)),
  tenantId: nullable(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)),
  adminType: nullable(bounded), deleted: nullable(z.boolean()), deletedAt: nullable(bounded), enabled: nullable(z.boolean())
}).strict();
const observationSchema = z.object({
  scope: z.literal("identity-occupancy-v1"), observedAt: z.string().datetime({ offset: true }),
  normalizedSelectors: z.object({ identityId: nullable(bounded), usernames: z.array(z.string().min(1).max(420).regex(/^[^\x00-\x1f\x7f-\x9f]+$/)).max(2), email: nullable(z.string().min(1).max(254)) }).strict(),
  identityScanComplete: z.boolean(), occupancy: z.enum(["FREE", "OCCUPIED", "CONFLICT", "UNKNOWN"]),
  layers: z.array(z.object({ source: z.enum(sources), status: z.enum(["COMPLETE", "LIMIT", "DEPENDENCY_FAILURE"]) }).strict()).length(4),
  facts: z.array(factSchema).max(80)
}).strict();
export type OrisoIdentityObservation = z.infer<typeof observationSchema>;
export type OrisoIdentityObservationResult =
  | { kind: "free-candidate" | "occupied" | "conflict"; observation: OrisoIdentityObservation }
  | { kind: "unknown"; reason: "invalid-selectors" | "invalid-observation" | "incomplete-observation" }
  | { kind: "unavailable"; reason: "admin-unavailable" | "permission-denied" | "unsupported-endpoint" | "upstream-unavailable" };
export interface OrisoIdentityObserver { observe(selectors: unknown): Promise<OrisoIdentityObservationResult> }
export type OrisoIdentityObserverOptions = Omit<OrisoManagedAdminClientOptions, "admitRecord" | "error" | "redirect">;

// ORISO's UsernameTranscoder uses UTF-8 Base32 with '.' in place of padding.
function encodeUsername(raw: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const byte of Buffer.from(raw, "utf8")) bits += byte.toString(2).padStart(8, "0");
  let encoded = "";
  for (let offset = 0; offset < bits.length; offset += 5) encoded += alphabet[Number.parseInt(bits.slice(offset, offset + 5).padEnd(5, "0"), 2)];
  return `enc.${encoded.padEnd(Math.ceil(encoded.length / 8) * 8, ".")}`;
}
function rawUsername(value: string): string | null {
  if (!/^enc\./i.test(value)) return value;
  if (!/^enc\.[A-Z2-7]+\.*$/i.test(value)) return null;
  let bits = "";
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  for (const char of value.slice(4).replace(/\.+$/, "").toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
  return selector.safeParse(raw).success && encodeUsername(raw).toLowerCase() === value.toLowerCase() ? raw : null;
}
function matchesSelectors(observation: OrisoIdentityObservation, selectors: OrisoIdentitySelectors, raw: string | null) {
  const normalized = observation.normalizedSelectors;
  return (normalized.identityId ?? undefined) === selectors.identityId
    && (normalized.email ?? undefined) === selectors.email?.toLowerCase()
    && (raw === null ? normalized.usernames.length === 0
      : normalized.usernames.length === 2 && normalized.usernames[0] === raw && normalized.usernames[1] === encodeUsername(raw));
}
const maximumBodyBytes = 128 * 1024;
async function boundedJson(response: Awaited<ReturnType<ProvisioningFetch>>) {
  if (!response.body) {
    const value = await response.json();
    if (Buffer.byteLength(JSON.stringify(value) ?? "") > maximumBodyBytes) throw new Error("invalid-observation");
    return value;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maximumBodyBytes) throw new Error("invalid-observation");
      chunks.push(next.value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } finally {
    try { await reader.cancel(); } catch { /* Source errors never escape this boundary. */ }
    reader.releaseLock();
  }
}
export function createOrisoIdentityObserver(options: OrisoIdentityObserverOptions): OrisoIdentityObserver {
  if (options.environment !== "dev" || options.apiBaseUrl !== "https://dev.oriso.org/service"
    || options.tokenUrl !== "https://dev.oriso.org/auth/realms/online-beratung/protocol/openid-connect/token"
    || options.clientId !== "app" || !options.adminRecordId.startsWith("oriso/dev/")) throw new Error("invalid-observation-target");
  const client = createOrisoManagedAdminClient({
    ...options, redirect: "error",
    // Local admission is an additional allowlist. Backend USER_ADMIN/nontechnical
    // platform-admin authorization remains the authority, not registry role tags.
    admitRecord: record => record.id === options.adminRecordId && record.kind === "admin"
      && record.roles.includes("platform-admin") && !record.roles.some(role => /technical/i.test(role))
  });
  return {
    async observe(input) {
      const parsedSelectors = selectorsSchema.safeParse(input);
      if (!parsedSelectors.success) return { kind: "unknown", reason: "invalid-selectors" };
      const selectors = parsedSelectors.data;
      let raw: string | null;
      try {
        raw = selectors.username === undefined ? null : rawUsername(selectors.username);
        if (selectors.username !== undefined && raw === null) return { kind: "unknown", reason: "invalid-selectors" };
      } catch { return { kind: "unknown", reason: "invalid-selectors" }; }
      let response: Awaited<ReturnType<ProvisioningFetch>>;
      try {
        response = await client.request("/useradmin/identity-observations", { method: "POST", body: JSON.stringify(selectors), redirect: "error" });
      } catch (error) {
        const reason = error instanceof OrisoManagedAdminError ? error.code === "admin_record_unavailable" ? "admin-unavailable" : "permission-denied" : "upstream-unavailable";
        return { kind: "unavailable", reason };
      }
      if (![200, 409, 502].includes(response.status)) return {
        kind: "unavailable", reason: response.status === 404 ? "unsupported-endpoint" : response.status === 401 || response.status === 403 ? "permission-denied" : "upstream-unavailable"
      };
      try {
        const observation = observationSchema.parse(await boundedJson(response));
        if (new Set(observation.layers.map(layer => layer.source)).size !== 4 || !matchesSelectors(observation, selectors, raw)) throw new Error();
        for (const fact of observation.facts) {
          const name = fact.username == null ? null : rawUsername(fact.username);
          const matches = (selectors.identityId !== undefined && fact.identityId === selectors.identityId)
            || (raw !== null && name !== null && name.toLowerCase() === raw.toLowerCase())
            || (selectors.email !== undefined && fact.email?.toLowerCase() === selectors.email.toLowerCase());
          if (!matches) throw new Error();
        }
        const identities = new Set(observation.facts.map(fact => fact.identityId));
        if (identities.size > 20 || new Set(observation.facts.map(fact => `${fact.source}:${fact.rowId ?? fact.identityId}`)).size !== observation.facts.length) throw new Error();
        const failed = observation.layers.some(layer => layer.status === "DEPENDENCY_FAILURE");
        const limited = observation.layers.some(layer => layer.status === "LIMIT");
        const complete = !failed && !limited;
        const conflict = identities.size > 1 || (selectors.identityId !== undefined && [...identities].some(id => id !== selectors.identityId));
        const expectedOccupancy = conflict ? "CONFLICT" : observation.facts.length ? "OCCUPIED" : complete ? "FREE" : "UNKNOWN";
        const expectedStatus = failed ? 502 : limited || conflict ? 409 : 200;
        if (observation.identityScanComplete !== complete || observation.occupancy !== expectedOccupancy || response.status !== expectedStatus || response.ok !== (response.status === 200)) throw new Error();
        if (!complete) return { kind: "unknown", reason: "incomplete-observation" };
        return { kind: observation.occupancy === "FREE" ? "free-candidate" : observation.occupancy === "OCCUPIED" ? "occupied" : "conflict", observation };
      } catch { return { kind: "unknown", reason: "invalid-observation" }; }
    }
  };
}
