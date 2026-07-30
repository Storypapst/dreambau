import { randomBytes, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import https from "node:https";
import { z } from "zod";
import { testAccessRecordSchema, type RegistryProvider, type TestAccessRecord } from "./infisical-provider.js";
import { generateTotp } from "./totp.js";

export const orisoProvisioningRoles = [
  "platform-admin",
  "tenant-admin",
  "agency-admin",
  "counsellor",
  "advice-seeker"
] as const;
export type OrisoProvisioningRole = typeof orisoProvisioningRoles[number];
export type OrisoProvisioningEnvironment = "pre-dev" | "dev";

const orisoEnvironmentByDomain: Record<string, OrisoProvisioningEnvironment> = {
  "dreambau.com": "pre-dev",
  "dreambau.de": "pre-dev",
  "oriso.org": "dev",
  "openresilience.cc": "dev"
};

export function environmentForOrisoEmail(email: string): OrisoProvisioningEnvironment | null {
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  if (separator < 1 || separator === normalized.length - 1) return null;
  return orisoEnvironmentByDomain[normalized.slice(separator + 1)] ?? null;
}

export const orisoOnboardingStates = ["invited", "onboarding-pending", "two-factor-pending", "ready"] as const;
export type OrisoOnboardingState = typeof orisoOnboardingStates[number];

const roleContract: Record<OrisoProvisioningRole, {
  targetRole: string;
  templateKind: string;
  recordKind: "admin" | "app-user";
  recordRoles: string[];
  loginArea: "admin" | "app";
}> = {
  "platform-admin": { targetRole: "PLATFORM_ADMIN", templateKind: "TENANT_INVITE", recordKind: "admin", recordRoles: ["platform-admin"], loginArea: "admin" },
  "tenant-admin": { targetRole: "TENANT_ADMIN", templateKind: "TENANT_INVITE", recordKind: "admin", recordRoles: ["tenant-admin"], loginArea: "admin" },
  "agency-admin": { targetRole: "AGENCY_ADMIN", templateKind: "COUNSELLOR_INVITE", recordKind: "admin", recordRoles: ["agency-admin"], loginArea: "admin" },
  counsellor: { targetRole: "COUNSELLOR", templateKind: "COUNSELLOR_INVITE", recordKind: "app-user", recordRoles: ["consultant"], loginArea: "app" },
  "advice-seeker": { targetRole: "ADVICE_SEEKER", templateKind: "COUNSELLOR_INVITE", recordKind: "app-user", recordRoles: ["asker"], loginArea: "app" }
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
  | "invite_create_failed"
  | "account_create_failed"
  | "account_credentials_mismatch"
  | "totp_store_failed"
  | "totp_setup_failed"
  | "totp_verification_failed";

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

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Generates the 32-character Base32 seed accepted by ORISO's app-TOTP API.
 * The seed is never returned to the browser; the caller persists it directly
 * in the linked Test Access record before activation.
 */
export function generateTotpSecret() {
  const bytes = randomBytes(20);
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let encoded = "";
  for (let offset = 0; offset < bits.length; offset += 5) {
    encoded += base32Alphabet[Number.parseInt(bits.slice(offset, offset + 5).padEnd(5, "0"), 2)];
  }
  return encoded;
}

export function recordRolesForProvisioningRole(role: OrisoProvisioningRole) {
  return [...roleContract[role].recordRoles];
}

export function provisioningRoleForRecord(record: Pick<TestAccessRecord, "roles">): OrisoProvisioningRole | null {
  return (Object.entries(roleContract) as Array<[OrisoProvisioningRole, typeof roleContract[OrisoProvisioningRole]]>)
    .find(([, contract]) => contract.recordRoles.join(",") === record.roles.join(","))?.[0] ?? null;
}

function directStateView(
  record: Pick<TestAccessRecord, "createdAt" | "updatedAt">,
  role: OrisoProvisioningRole,
  inviteStatus: "DIRECT_CREATED" | "DIRECT_RECONCILED"
): OrisoProvisioningStateView {
  return {
    state: "ready",
    role,
    targetRole: roleContract[role].targetRole,
    inviteId: 0,
    inviteStatus,
    emailVerificationStatus: "VERIFIED",
    twoFactorStatus: "ACTIVE",
    accessGateStatus: "READY",
    createdAt: record.createdAt,
    expiresAt: null,
    acceptedAt: record.updatedAt,
    nextStep: "none"
  };
}

export function readyStateForProvisionedRecord(
  record: Pick<TestAccessRecord, "roles" | "createdAt" | "updatedAt" | "provisioningStatus">
): OrisoProvisioningStateView | null {
  if (record.provisioningStatus !== "ready") return null;
  const role = provisioningRoleForRecord(record);
  if (!role) return null;
  return directStateView(record, role, "DIRECT_RECONCILED");
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
  environment?: OrisoProvisioningEnvironment;
}): TestAccessRecord {
  const contract = roleContract[input.role];
  const [localPart, domain] = input.email.trim().toLowerCase().split("@");
  const environment = input.environment ?? "pre-dev";
  const environmentLabel = environment === "pre-dev" ? "PreDev" : "Dev";
  const timestamp = input.now.toISOString();
  // Local parts repeat across the pool's mail domains; only the canonical
  // oriso.org identities get the short id, every other domain stays disjoint.
  const recordId = domain === "oriso.org" ? localPart : `${localPart}-${domain}`;
  return testAccessRecordSchema.parse({
    id: `oriso/${environment}/${recordId}`,
    project: "oriso",
    environment,
    kind: contract.recordKind,
    displayName: `${input.displayName} — ORISO ${environmentLabel} ${input.role}`,
    username: input.email.trim().toLowerCase(),
    email: input.email.trim().toLowerCase(),
    roles: [...contract.recordRoles],
    permissionsDescription: `Self-service provisioned ORISO ${environmentLabel} ${input.role}`,
    loginUrl: contract.loginArea === "admin" ? input.adminBaseUrl : input.appBaseUrl,
    secret: input.secret,
    responsiblePerson: input.responsiblePerson,
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: null,
    shared: true,
    rotationStatus: "current",
    provisioningStatus: "pending",
    documentationUrl: "https://dreambau.com/testmails/"
  });
}

export type ProvisioningFetch = (input: string | URL, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface OrisoProvisioningTarget {
  environment: OrisoProvisioningEnvironment;
  apiBaseUrl: string;
  tokenUrl: string;
  clientId: string;
  adminRecordId: string;
  adminBaseUrl: string;
  appBaseUrl: string;
  defaultTenantId: number;
  defaultAgencyId: number;
  defaultConsultingType: string;
  defaultPostcode: string;
  defaultMainTopicId: number;
}

interface ServiceOptions extends OrisoProvisioningTarget {
  registryProvider: RegistryProvider;
  fetch?: ProvisioningFetch;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  provisioningRetryDelaysMs?: readonly number[];
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
  provision(input: {
    record: TestAccessRecord;
    firstName: string;
    lastName: string;
    role: OrisoProvisioningRole;
    storeTotp(secret: string): Promise<void>;
  }): Promise<{ created: boolean; state: OrisoProvisioningStateView }>;
}

const defaultFetch: ProvisioningFetch = (input, init) =>
  globalThis.fetch(input, { ...init, signal: AbortSignal.timeout(15_000) });

export function createOrisoProvisioningService(options: ServiceOptions): OrisoProvisioningService {
  for (const url of [options.apiBaseUrl, options.tokenUrl]) {
    if (new URL(url).protocol !== "https:") throw new Error("ORISO provisioning endpoints must use HTTPS");
  }
  const fetch = options.fetch ?? defaultFetch;
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  // Current ORISO PreDev can need more than 30 seconds before a freshly
  // assigned consultant role is visible in newly issued tokens. Cap the tail
  // at eight seconds so the whole request stays below common proxy timeouts.
  const provisioningRetryDelaysMs = options.provisioningRetryDelaysMs
    ?? [1_000, 2_000, 4_000, 8_000, 8_000, 8_000, 8_000];
  const apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, "");
  const requestSignal = () => AbortSignal.timeout(15_000);
  let cachedToken: { value: string; expiresAt: number } | null = null;
  let pendingToken: Promise<string> | null = null;

  async function authenticate() {
    const record = await options.registryProvider.get(options.adminRecordId);
    if (!record || record.project !== "oriso" || record.environment !== options.environment) {
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
      body: form.toString(),
      signal: requestSignal()
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
      body: init?.body,
      signal: requestSignal()
    });
    return response;
  }

  async function credentialToken(record: TestAccessRecord, totpSecret?: string) {
    const form = new URLSearchParams({
      client_id: options.clientId,
      grant_type: "password",
      username: record.username,
      password: record.secret
    });
    if (totpSecret) form.set("otp", generateTotp(totpSecret, now()).code);
    const response = await fetch(options.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: requestSignal()
    });
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        return { kind: "rejected" as const, status: response.status };
      }
      throw new OrisoProvisioningError("oriso_authentication_failed");
    }
    try {
      return {
        kind: "authenticated" as const,
        token: tokenResponseSchema.parse(await response.json()).access_token
      };
    } catch {
      throw new OrisoProvisioningError("oriso_authentication_failed");
    }
  }

  async function userJson(accessTokenValue: string, path: string, init: { method: string; body?: string }) {
    return fetch(`${apiBaseUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${accessTokenValue}`,
        ...(init.body ? { "Content-Type": "application/json" } : {})
      },
      body: init.body,
      signal: requestSignal()
    });
  }

  async function retryAuthenticatedToken(record: TestAccessRecord, totpSecret?: string) {
    let probe = await credentialToken(record, totpSecret);
    for (const delay of provisioningRetryDelaysMs) {
      if (probe.kind === "authenticated") return probe.token;
      await sleep(delay);
      probe = await credentialToken(record, totpSecret);
    }
    return probe.kind === "authenticated" ? probe.token : null;
  }

  async function activateTotpWithRetry(record: TestAccessRecord, initialToken: string, totpSecret: string) {
    let userToken = initialToken;
    for (let attempt = 0; ; attempt += 1) {
      const activation = await userJson(userToken, "/users/2fa/app", {
        method: "PUT",
        body: JSON.stringify({
          secret: totpSecret,
          otp: generateTotp(totpSecret, now()).code
        })
      });
      if (activation.ok) return;
      if (
        (activation.status !== 401 && activation.status !== 404)
        || attempt >= provisioningRetryDelaysMs.length
      ) {
        throw new OrisoProvisioningError("totp_setup_failed");
      }
      await sleep(provisioningRetryDelaysMs[attempt]);
      const refreshed = await credentialToken(record);
      if (refreshed.kind === "authenticated") userToken = refreshed.token;
    }
  }

  function creationRequest(input: {
    record: TestAccessRecord;
    firstName: string;
    lastName: string;
    role: OrisoProvisioningRole;
  }) {
    const common = {
      username: input.record.username,
      password: input.record.secret,
      firstname: input.firstName,
      lastname: input.lastName,
      email: input.record.email ?? input.record.username
    };
    switch (input.role) {
      case "platform-admin":
        return { path: "/useradmin/tenantadmins", body: { ...common, tenantId: 0 } };
      case "tenant-admin":
        return { path: "/useradmin/tenantadmins", body: { ...common, tenantId: options.defaultTenantId } };
      case "agency-admin":
        return { path: "/useradmin/agencyadmins", body: { ...common, tenantId: options.defaultTenantId } };
      case "counsellor":
        return {
          path: "/useradmin/consultants",
          body: {
            ...common,
            formalLanguage: true,
            absent: false,
            tenantId: options.defaultTenantId,
            topicIds: [options.defaultMainTopicId]
          }
        };
      case "advice-seeker":
        return {
          path: "/users/askers/new",
          body: {
            username: input.record.username,
            password: encodeURIComponent(input.record.secret),
            postcode: options.defaultPostcode,
            agencyId: options.defaultAgencyId,
            termsAccepted: "true",
            consultingType: options.defaultConsultingType,
            mainTopicId: options.defaultMainTopicId
          }
        };
    }
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
    // ORISO resolves a template by id alone and never checks its kind against
    // the target role, so a matching kind is a preference and not a
    // requirement. Demanding one only blocks roles whose kind nobody has
    // created yet.
    const active = templates
      .filter((template) => template.active)
      .sort((left, right) => (right.updateDate ?? "").localeCompare(left.updateDate ?? ""));
    const candidate = active.find((template) => template.kind === templateKind) ?? active[0];
    if (!candidate) throw new OrisoProvisioningError("invite_template_missing");
    return candidate.id;
  }

  return {
    target: {
      apiBaseUrl,
      environment: options.environment,
      tokenUrl: options.tokenUrl,
      clientId: options.clientId,
      adminRecordId: options.adminRecordId,
      adminBaseUrl: options.adminBaseUrl,
      appBaseUrl: options.appBaseUrl,
      defaultTenantId: options.defaultTenantId,
      defaultAgencyId: options.defaultAgencyId,
      defaultConsultingType: options.defaultConsultingType,
      defaultPostcode: options.defaultPostcode,
      defaultMainTopicId: options.defaultMainTopicId
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
    },
    async provision(input) {
      const expectedRoles = roleContract[input.role].recordRoles;
      if (
        input.record.project !== "oriso"
        || input.record.environment !== options.environment
        || input.record.roles.join(",") !== expectedRoles.join(",")
      ) {
        throw new OrisoProvisioningError("account_create_failed");
      }

      // A successful login with the stored TOTP proves that the account is
      // already fully managed and makes repeated provisioning idempotent.
      if (input.record.totpSecret) {
        const verified = await credentialToken(input.record, input.record.totpSecret);
        if (verified.kind === "authenticated") {
          return { created: false, state: directStateView(input.record, input.role, "DIRECT_RECONCILED") };
        }
      }

      const initialProbe = await credentialToken(input.record);
      let userToken = initialProbe.kind === "authenticated" ? initialProbe.token : null;
      let created = false;
      if (!userToken) {
        const request = creationRequest(input);
        const createResponse = await authorizedJson(request.path, {
          method: "POST",
          body: JSON.stringify(request.body)
        });
        if (!createResponse.ok) {
          if (createResponse.status === 409) {
            throw new OrisoProvisioningError("account_credentials_mismatch");
          }
          throw new OrisoProvisioningError("account_create_failed");
        }
        if (input.role === "agency-admin" || input.role === "counsellor") {
          let createdId: string;
          try {
            createdId = z.object({
              _embedded: z.object({ id: z.string().min(1) }).passthrough()
            }).passthrough().parse(await createResponse.json())._embedded.id;
          } catch {
            throw new OrisoProvisioningError("account_create_failed");
          }
          const relation = input.role === "agency-admin"
            ? { path: `/useradmin/agencyadmins/${encodeURIComponent(createdId)}/agencies`, body: [{ agencyId: options.defaultAgencyId, role: "ADMIN_DEFAULT" }] }
            : { path: `/useradmin/consultants/${encodeURIComponent(createdId)}/agencies`, body: [{ agencyId: options.defaultAgencyId, roleSetKey: "CONSULTANT_DEFAULT" }] };
          const relationResponse = await authorizedJson(relation.path, {
            method: "PUT",
            body: JSON.stringify(relation.body)
          });
          if (!relationResponse.ok) throw new OrisoProvisioningError("account_create_failed");
        }
        created = true;
        const postCreateToken = await retryAuthenticatedToken(input.record);
        if (!postCreateToken) {
          throw new OrisoProvisioningError("account_credentials_mismatch");
        }
        userToken = postCreateToken;
      }

      if (input.role === "advice-seeker" && input.record.email) {
        const emailResponse = await userJson(userToken, "/users/email", {
          method: "PUT",
          body: JSON.stringify(input.record.email)
        });
        if (!emailResponse.ok && emailResponse.status !== 409) {
          throw new OrisoProvisioningError("account_create_failed");
        }
      }

      const totpSecret = input.record.totpSecret ?? generateTotpSecret();
      if (!input.record.totpSecret) {
        try {
          await input.storeTotp(totpSecret);
        } catch {
          throw new OrisoProvisioningError("totp_store_failed");
        }
      }
      await activateTotpWithRetry(input.record, userToken, totpSecret);

      const verifiedToken = await retryAuthenticatedToken(input.record, totpSecret);
      if (!verifiedToken) {
        throw new OrisoProvisioningError("totp_verification_failed");
      }
      return {
        created,
        state: directStateView(input.record, input.role, created ? "DIRECT_CREATED" : "DIRECT_RECONCILED")
      };
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
