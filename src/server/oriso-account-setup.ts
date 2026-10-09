import { z } from "zod";
import type { TestAccessRecord } from "./infisical-provider.js";
import { generateApplicationPassword, OrisoProvisioningError, type OrisoProvisioningTarget, type ProvisioningFetch } from "./oriso-provisioning.js";

export interface AccountSetupInput {
  record: TestAccessRecord;
  readMail(): Promise<string>;
  storePassword(password: string, binding: NonNullable<TestAccessRecord["accountSetup"]>): Promise<void>;
}

const bindingSchema = z.object({
  id: z.number().int().positive(), targetRole: z.enum(["COUNSELLOR", "AGENCY_ADMIN"]),
  onboardingPurpose: z.literal("EXISTING_ACCOUNT_SETUP"), tenantId: z.number().int().positive(),
  recipientEmail: z.string().email(), provisionedUserId: z.string().min(1), inviteStatus: z.literal("EMAIL_SENT")
});

function encodedUsername(username: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...Buffer.from(username, "utf8")].map((byte) => byte.toString(2).padStart(8, "0")).join("");
  let encoded = "";
  for (let offset = 0; offset < bits.length; offset += 5) encoded += alphabet[Number.parseInt(bits.slice(offset, offset + 5).padEnd(5, "0"), 2)];
  return `enc.${encoded.padEnd(Math.ceil(encoded.length / 8) * 8, ".")}`;
}

export async function verifyBoundAccountSetupIdentity(input: {
  record: TestAccessRecord; target: OrisoProvisioningTarget;
  readIdentity(path: string): ReturnType<ProvisioningFetch>;
}) {
  const { record, target } = input;
  const role = record.roles.join(",");
  const binding = record.accountSetup;
  if (!binding || record.project !== "oriso" || record.environment !== target.environment
    || record.username.startsWith("enc.") || record.provisioningStatus === "ready"
    || (role !== "consultant" && role !== "agency-admin")
    || record.kind !== (role === "consultant" ? "app-user" : "admin")) {
    throw new OrisoProvisioningError("account_setup_binding_mismatch");
  }
  try {
    const path = role === "consultant" ? "consultants" : "agencyadmins";
    const response = await input.readIdentity(`/useradmin/${path}/${encodeURIComponent(binding.provisionedUserId)}`);
    if (!response.ok) throw new Error("Bound identity unavailable");
    const { _embedded: identity } = z.object({ _embedded: z.object({
      id: z.string(), username: z.string(), email: z.string().email(), tenantId: z.union([z.number(), z.string()]),
      deleteDate: z.string().nullable().optional()
    }).passthrough() }).parse(await response.json());
    if (identity.id !== binding.provisionedUserId || identity.email.toLowerCase() !== record.email?.toLowerCase()
      || String(identity.tenantId) !== String(target.defaultTenantId)
      || (identity.username !== record.username && identity.username !== encodedUsername(record.username))
      || (role === "consultant" && identity.deleteDate === undefined)
      || (identity.deleteDate != null && identity.deleteDate !== "null")) throw new Error("Bound identity changed");
  } catch { throw new OrisoProvisioningError("account_setup_binding_mismatch"); }
}

export function validateAccountSetupInvite(input: {
  record: TestAccessRecord; invite: unknown; target: OrisoProvisioningTarget;
}) {
  const { record, target } = input;
  const invite = bindingSchema.safeParse(input.invite);
  const role = record.roles.join(",") === "consultant" ? "COUNSELLOR"
    : record.roles.join(",") === "agency-admin" ? "AGENCY_ADMIN" : null;
  if (!invite.success || !role || record.totpSecret || record.provisioningStatus === "ready"
    || !record.accountSetup || record.accountSetup.submittedAt
    || record.accountSetup.inviteId !== invite.data.id
    || record.accountSetup.provisionedUserId !== invite.data.provisionedUserId
    || record.project !== "oriso" || record.environment !== target.environment
    || invite.data.targetRole !== role || invite.data.tenantId !== target.defaultTenantId
    || invite.data.recipientEmail.toLowerCase() !== record.email?.toLowerCase()) {
    throw new OrisoProvisioningError("account_setup_binding_mismatch");
  }
  return invite.data;
}

export async function completeBoundAccountSetup(input: AccountSetupInput & {
  invite: unknown; target: OrisoProvisioningTarget; fetch: ProvisioningFetch; now(): Date;
}): Promise<TestAccessRecord> {
  const { record, target } = input;
  const invite = { data: validateAccountSetupInvite(input) };
  let mail: string;
  try { mail = await input.readMail(); } catch { throw new OrisoProvisioningError("account_setup_mail_unavailable"); }
  const base = new URL(target.adminBaseUrl);
  const prefix = `${base.pathname.replace(/\/$/, "")}/counsellor-onboarding/`;
  const tokens = new Set<string>();
  for (const candidate of mail.match(/https:\/\/[^\s<>"']+/g) ?? []) {
    try {
      const url = new URL(candidate);
      if (url.origin !== base.origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(prefix)) continue;
      const token = url.pathname.slice(prefix.length);
      if (/^[A-Za-z0-9_-]{1,256}$/.test(token)) tokens.add(token);
    } catch { /* Unrelated text is not an onboarding credential. */ }
  }
  if (tokens.size !== 1) throw new OrisoProvisioningError("account_setup_mail_unavailable");
  const endpoint = `${target.apiBaseUrl.replace(/\/$/, "")}/users/account-invites/${encodeURIComponent([...tokens][0])}`;
  let verified: z.infer<typeof bindingSchema>;
  try {
    const response = await input.fetch(endpoint, { headers: { tenantId: String(target.defaultTenantId) }, signal: AbortSignal.timeout(15_000), redirect: "error" });
    if (!response.ok) throw new Error("Inactive setup token");
    verified = bindingSchema.parse(await response.json());
  } catch { throw new OrisoProvisioningError("account_setup_binding_mismatch"); }
  if (verified.id !== invite.data.id || verified.provisionedUserId !== invite.data.provisionedUserId
    || verified.tenantId !== invite.data.tenantId || verified.targetRole !== invite.data.targetRole
    || verified.recipientEmail.toLowerCase() !== invite.data.recipientEmail.toLowerCase()) {
    throw new OrisoProvisioningError("account_setup_binding_mismatch");
  }
  const password = generateApplicationPassword();
  if (password === record.secret) throw new OrisoProvisioningError("account_setup_store_failed");
  const binding = { inviteId: verified.id, provisionedUserId: verified.provisionedUserId, submittedAt: input.now().toISOString() };
  try { await input.storePassword(password, binding); } catch { throw new OrisoProvisioningError("account_setup_store_failed"); }
  // Persist both the credential and the one-shot marker before dispatch. A lost
  // response must never trigger a second password change, even after restart.
  try {
    const response = await input.fetch(`${endpoint}/setup`, {
      method: "POST", headers: { "Content-Type": "application/json", tenantId: String(target.defaultTenantId) }, body: JSON.stringify({ password }),
      signal: AbortSignal.timeout(15_000), redirect: "error"
    });
    if (!response.ok || !z.object({ phase: z.literal("COMPLETED") }).safeParse(await response.json()).success) throw new Error("Setup outcome uncertain");
  } catch { throw new OrisoProvisioningError("account_setup_outcome_unknown"); }
  return { ...record, secret: password, accountSetup: binding, provisioningStatus: "pending", updatedAt: binding.submittedAt };
}
