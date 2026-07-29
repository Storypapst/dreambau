import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import https from "node:https";
import { z } from "zod";
import { testAccessRecordSchema, type RegistryProvider, type TestAccessRecord } from "./infisical-provider.js";
import { generateTotp } from "./totp.js";

export const orisoProvisioningRoles = ["tenant-admin", "agency-admin", "counsellor"] as const;
export type OrisoProvisioningRole = typeof orisoProvisioningRoles[number];

export const orisoOnboardingStates = ["invited", "onboarding-pending", "two-factor-pending", "ready"] as const;
export type OrisoOnboardingState = typeof orisoOnboardingStates[number];

const roleContract: Record<OrisoProvisioningRole, {
  targetRole: string;
  templateKind: string;
  recordKind: "admin" | "app-user";
  recordRoles: string[];
  loginArea: "admin" | "app";
}> = {
  "tenant-admin": { targetRole: "TENANT_ADMIN", templateKind: "TENANT_INVITE", recordKind: "admin", recordRoles: ["tenant-admin"], loginArea: "admin" },
  "agency-admin": { targetRole: "AGENCY_ADMIN", templateKind: "COUNSELLOR_INVITE", recordKind: "admin", recordRoles: ["agency-admin"], loginArea: "admin" },
  counsellor: { targetRole: "COUNSELLOR", templateKind: "COUNSELLOR_INVITE", recordKind: "app-user", recordRoles: ["consultant"], loginArea: "app" }
};

const targetRoleToRole = new Map(
  (Object.entries(roleContract) as Array<[OrisoProvisioningRole, typeof roleContract[OrisoProvisioningRole]]>)
    .map(([role, contract]) => [contract.targetRole, role])
);

export type OrisoProvisioningErrorCode =
  | "admin_record_unavailable"
  | "oriso_authentication_failed"
  | "invite_lookup_failed"
  | "invite_template_missing"
  | "invite_create_failed";

export class OrisoProvisioningError extends Error {
  constructor(readonly code: OrisoProvisioningErrorCode) {
    super(code);
    this.name = "OrisoProvisioningError";
  }
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive()
}).passthrough();

const inviteSchema = z.object({
  id: z.number(),
  targetRole: z.string(),
  recipientEmail: z.string(),
  inviteStatus: z.string(),
  emailVerificationStatus: z.string().nullable().optional(),
  twoFactorStatus: z.string().nullable().optional(),
  accessGateStatus: z.string().nullable().optional(),
  createDate: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  acceptedAt: z.string().nullable().optional()
}).passthrough();
type OrisoInvite = z.infer<typeof inviteSchema>;

const invitePageSchema = z.object({
  content: z.array(inviteSchema),
  totalPages: z.number().int().nonnegative().optional()
}).passthrough();

const templateSchema = z.object({
  id: z.number(),
  kind: z.string(),
  active: z.boolean(),
  updateDate: z.string().nullable().optional()
}).passthrough();

const activeInviteStatuses = new Set(["DRAFT", "EMAIL_SENT", "ACCEPTED"]);

export function provisioningStateForInvite(invite: Pick<OrisoInvite, "accessGateStatus" | "inviteStatus">): OrisoOnboardingState {
  switch (invite.accessGateStatus) {
    case "READY": return "ready";
    case "BLOCKED_TWO_FACTOR": return "two-factor-pending";
    case "BLOCKED_EMAIL": return "onboarding-pending";
    case "BLOCKED_INVITE": return "invited";
    default: return invite.inviteStatus === "ACCEPTED" ? "onboarding-pending" : "invited";
  }
}

export interface OrisoProvisioningStateView {
  state: OrisoOnboardingState;
  role: OrisoProvisioningRole | null;
  targetRole: string;
  inviteId: number;
  inviteStatus: string;
  emailVerificationStatus: string | null;
  twoFactorStatus: string | null;
  accessGateStatus: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  acceptedAt: string | null;
  nextStep: "open-invitation-mail" | "complete-onboarding" | "store-totp" | "none";
}

/**
 * Reduces an ORISO invite to the fields the browser may see. The raw invite
 * response can carry `rawToken` and `acceptUrl`; both are onboarding
 * credentials that must only travel through the invitation mail.
 */
export function publicInviteState(invite: OrisoInvite): OrisoProvisioningStateView {
  const state = provisioningStateForInvite(invite);
  const nextStep = state === "invited" ? "open-invitation-mail"
    : state === "onboarding-pending" ? "complete-onboarding"
    : state === "two-factor-pending" ? "store-totp"
    : "none";
  return {
    state,
    role: targetRoleToRole.get(invite.targetRole) ?? null,
    targetRole: invite.targetRole,
    inviteId: invite.id,
    inviteStatus: invite.inviteStatus,
    emailVerificationStatus: invite.emailVerificationStatus ?? null,
    twoFactorStatus: invite.twoFactorStatus ?? null,
    accessGateStatus: invite.accessGateStatus ?? null,
    createdAt: invite.createDate ?? null,
    expiresAt: invite.expiresAt ?? null,
    acceptedAt: invite.acceptedAt ?? null,
    nextStep
  };
}

const passwordAlphabets = [
  "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "abcdefghijkmnopqrstuvwxyz",
  "23456789",
  "!$%*+-=?"
];

/**
 * Generates the application password stored in the provisioned Test Access
 * record. The invited human sets exactly this password during ORISO
 * onboarding so humans and authorized agents share one credential that never
 * leaves the Test Access boundary.
 */
export function generateApplicationPassword(length = 24) {
  const all = passwordAlphabets.join("");
  const characters = passwordAlphabets.map((alphabet) => alphabet[randomInt(alphabet.length)]);
  while (characters.length < length) characters.push(all[randomInt(all.length)]);
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [characters[index], characters[swap]] = [characters[swap], characters[index]];
  }
  return characters.join("");
}

export function buildProvisionedRecord(input: {
  email: string;
  displayName: string;
  role: OrisoProvisioningRole;
  adminBaseUrl: string;
  appBaseUrl: string;
  responsiblePerson: string;
  now: Date;
  secret: string;
}): TestAccessRecord {
  const contract = roleContract[input.role];
  const localPart = input.email.trim().toLowerCase().split("@")[0];
  const timestamp = input.now.toISOString();
  return testAccessRecordSchema.parse({
    id: `oriso/pre-dev/${localPart}`,
    project: "oriso",
    environment: "pre-dev",
    kind: contract.recordKind,
    displayName: `${input.displayName} — ORISO PreDev ${input.role}`,
    username: input.email.trim().toLowerCase(),
    email: input.email.trim().toLowerCase(),
    roles: [...contract.recordRoles],
    permissionsDescription: `Self-service provisioned ORISO PreDev ${input.role}`,
    loginUrl: contract.loginArea === "admin" ? input.adminBaseUrl : input.appBaseUrl,
    secret: input.secret,
    responsiblePerson: input.responsiblePerson,
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: null,
    shared: true,
    rotationStatus: "current",
    documentationUrl: "https://dreambau.com/testmails/"
  });
}

export type ProvisioningFetch = (input: string | URL, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface OrisoProvisioningTarget {
  apiBaseUrl: string;
  tokenUrl: string;
  clientId: string;
  adminRecordId: string;
  adminBaseUrl: string;
  appBaseUrl: string;
}

interface ServiceOptions extends OrisoProvisioningTarget {
  registryProvider: RegistryProvider;
  fetch?: ProvisioningFetch;
  now?: () => Date;
}

export interface OrisoProvisioningService {
  target: OrisoProvisioningTarget;
  status(recipientEmail: string): Promise<OrisoProvisioningStateView | null>;
  ensureInvite(input: {
    recipientEmail: string;
    firstName: string;
    lastName: string;
    role: OrisoProvisioningRole;
  }): Promise<{ created: boolean; state: OrisoProvisioningStateView }>;
}

export function createOrisoProvisioningService(options: ServiceOptions): OrisoProvisioningService {
  const fetch = options.fetch ?? (globalThis.fetch as ProvisioningFetch);
  const now = options.now ?? (() => new Date());
  const apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, "");
  let cachedToken: { value: string; expiresAt: number } | null = null;
  let pendingToken: Promise<string> | null = null;

  async function authenticate() {
    const record = await options.registryProvider.get(options.adminRecordId);
    if (!record || record.project !== "oriso" || record.environment !== "pre-dev") {
      throw new OrisoProvisioningError("admin_record_unavailable");
    }
    const form = new URLSearchParams({
      client_id: options.clientId,
      grant_type: "password",
      username: record.username,
      password: record.secret
    });
    if (record.totpSecret) form.set("otp", generateTotp(record.totpSecret, now()).code);
    const response = await fetch(options.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    if (!response.ok) throw new OrisoProvisioningError("oriso_authentication_failed");
    try {
      const parsed = tokenResponseSchema.parse(await response.json());
      cachedToken = { value: parsed.access_token, expiresAt: now().getTime() + parsed.expires_in * 1000 };
      return cachedToken.value;
    } catch {
      throw new OrisoProvisioningError("oriso_authentication_failed");
    }
  }

  async function accessToken() {
    if (cachedToken && cachedToken.expiresAt > now().getTime() + 30_000) return cachedToken.value;
    if (!pendingToken) pendingToken = authenticate().finally(() => { pendingToken = null; });
    return pendingToken;
  }

  async function authorizedJson(path: string, init?: { method?: string; body?: string }) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {})
      },
      body: init?.body
    });
    return response;
  }

  async function findInvite(recipientEmail: string) {
    const normalized = recipientEmail.trim().toLowerCase();
    const matches: OrisoInvite[] = [];
    for (let page = 0; page < 20; page += 1) {
      const response = await authorizedJson(`/useradmin/account-invites?page=${page}&size=100`);
      if (!response.ok) throw new OrisoProvisioningError("invite_lookup_failed");
      let parsed: z.infer<typeof invitePageSchema>;
      try {
        parsed = invitePageSchema.parse(await response.json());
      } catch {
        throw new OrisoProvisioningError("invite_lookup_failed");
      }
      matches.push(...parsed.content.filter((invite) => invite.recipientEmail.trim().toLowerCase() === normalized));
      if (parsed.content.length === 0 || parsed.totalPages === undefined || page + 1 >= parsed.totalPages) break;
    }
    const active = matches
      .filter((invite) => activeInviteStatuses.has(invite.inviteStatus))
      .sort((left, right) => (right.createDate ?? "").localeCompare(left.createDate ?? ""));
    return active[0] ?? null;
  }

  async function findTemplateId(templateKind: string) {
    const response = await authorizedJson("/useradmin/invite-email-templates");
    if (!response.ok) throw new OrisoProvisioningError("invite_template_missing");
    let templates: Array<z.infer<typeof templateSchema>>;
    try {
      templates = z.array(templateSchema).parse(await response.json());
    } catch {
      throw new OrisoProvisioningError("invite_template_missing");
    }
    const candidate = templates
      .filter((template) => template.active && template.kind === templateKind)
      .sort((left, right) => (right.updateDate ?? "").localeCompare(left.updateDate ?? ""))[0];
    if (!candidate) throw new OrisoProvisioningError("invite_template_missing");
    return candidate.id;
  }

  return {
    target: {
      apiBaseUrl,
      tokenUrl: options.tokenUrl,
      clientId: options.clientId,
      adminRecordId: options.adminRecordId,
      adminBaseUrl: options.adminBaseUrl,
      appBaseUrl: options.appBaseUrl
    },
    async status(recipientEmail) {
      const invite = await findInvite(recipientEmail);
      return invite ? publicInviteState(invite) : null;
    },
    async ensureInvite(input) {
      const existing = await findInvite(input.recipientEmail);
      if (existing) return { created: false, state: publicInviteState(existing) };
      const contract = roleContract[input.role];
      const templateId = await findTemplateId(contract.templateKind);
      const response = await authorizedJson("/useradmin/account-invites", {
        method: "POST",
        body: JSON.stringify({
          targetRole: contract.targetRole,
          recipientEmail: input.recipientEmail.trim().toLowerCase(),
          firstName: input.firstName,
          lastName: input.lastName,
          templateId
        })
      });
      if (!response.ok) throw new OrisoProvisioningError("invite_create_failed");
      let invite: OrisoInvite;
      try {
        invite = inviteSchema.parse(await response.json());
      } catch {
        throw new OrisoProvisioningError("invite_create_failed");
      }
      return { created: true, state: publicInviteState(invite) };
    }
  };
}

/**
 * The public DNS for oriso-dev.site still points at the retired PreDev host,
 * and the current host serves a certificate from the internal "ORISO Dev
 * Local CA". This fetch adapter pins the resolved IP and optionally trusts
 * that CA so the hub reaches the real PreDev without weakening TLS globally.
 */
export function createPinnedHttpsFetch(options: { resolveIp?: string; caFile?: string }): ProvisioningFetch {
  const ca = options.caFile ? readFileSync(options.caFile, "utf8") : undefined;
  return (input, init) => new Promise((resolve, reject) => {
    const url = new URL(String(input));
    if (url.protocol !== "https:") return reject(new Error("Pinned fetch requires HTTPS"));
    const request = https.request({
      host: options.resolveIp ?? url.hostname,
      servername: url.hostname,
      port: url.port ? Number(url.port) : 443,
      path: `${url.pathname}${url.search}`,
      method: init?.method ?? "GET",
      headers: { Host: url.hostname, ...init?.headers },
      ca,
      timeout: 15_000
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const status = response.statusCode ?? 0;
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({
          ok: status >= 200 && status < 300,
          status,
          async json() { return JSON.parse(body); }
        });
      });
    });
    request.on("timeout", () => request.destroy(new Error("Pinned fetch timed out")));
    request.on("error", reject);
    if (init?.body) request.write(init.body);
    request.end();
  });
}
