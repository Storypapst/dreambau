import { createOrisoAdminDeletionService, type OrisoAdminDeletionService } from "./oriso-admin-deletion.js";
import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { testAccessRecordSchema, type RegistryProvider, type TestAccessRecord } from "./infisical-provider.js";
import { generateCompatibleOrisoTotp } from "./totp.js";
import { completeBoundAccountSetup, type AccountSetupInput } from "./oriso-account-setup.js";

export const orisoProvisioningRoles = [
  "platform-admin",
  "tenant-admin",
  "agency-admin",
  "counsellor",
  "advice-seeker"
] as const;
export type OrisoProvisioningRole = typeof orisoProvisioningRoles[number];
export type OrisoProvisioningEnvironment = "pre-dev" | "dev";

// Which ORISO environment a mailbox domain belongs to. Being listed here does not
// make an account provisionable — viewProject still has to resolve to "oriso",
// which for getme.global and trail.ist means setting the account's project to
// ORISO by hand. That keeps the decision per mailbox instead of per domain.
// tests/oriso-domain-scope.test.ts fails if the client's copy disagrees.
export const orisoEnvironmentByDomain: Record<string, OrisoProvisioningEnvironment> = {
  "dreambau.com": "pre-dev",
  "dreambau.de": "pre-dev",
  "oriso.org": "dev",
  "openresilience.cc": "dev",
  "getme.global": "dev",
  "trail.ist": "dev"
};

export function environmentForOrisoEmail(email: string): OrisoProvisioningEnvironment | null {
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  if (
    separator < 1
    || separator !== normalized.indexOf("@")
    || separator === normalized.length - 1
  ) return null;
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
  | "account_setup_required"
  | "account_setup_binding_mismatch"
  | "account_setup_mail_unavailable"
  | "account_setup_store_failed"
  | "account_setup_outcome_unknown"
  | "account_creation_conflict"
  | "record_username_incompatible"
  | "provisioning_agency_unavailable"
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
  acceptedAt: z.string().nullable().optional(),
  onboardingPurpose: z.string().optional(),
  tenantId: z.number().nullable().optional(),
  provisionedUserId: z.string().nullable().optional()
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

const userDataSchema = z.object({
  twoFactorAuth: z.object({
    secret: z.string().regex(/^[A-Za-z0-9]{32}$/)
  }).passthrough()
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
  nextStep: "open-invitation-mail" | "complete-account-setup" | "complete-onboarding" | "store-totp" | "none";
}

/**
 * Reduces an ORISO invite to the fields the browser may see. The raw invite
 * response can carry `rawToken` and `acceptUrl`; both are onboarding
 * credentials that must only travel through the invitation mail.
 */
export function publicInviteState(invite: OrisoInvite): OrisoProvisioningStateView {
  const state = provisioningStateForInvite(invite);
  const nextStep = invite.onboardingPurpose === "EXISTING_ACCOUNT_SETUP" && invite.inviteStatus === "EMAIL_SENT"
    ? "complete-account-setup"
    : state === "invited" ? "open-invitation-mail"
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

function appRegistrationUsername(email: string) {
  return email
    .trim()
    .toLowerCase()
    .replace("@", "_at_")
    .replace(/[^a-z0-9=_\-./+]/g, "_");
}

/** Preserve existing identities: reject creation when the target API cannot use the stored username. */
export function isProvisioningUsernameCompatible(record: Pick<TestAccessRecord, "username" | "email">, role: OrisoProvisioningRole) {
  if (role === "counsellor") return /^[a-z0-9=_\-./+]+$/.test(record.username);
  if (role === "advice-seeker") return record.username === appRegistrationUsername(record.email ?? record.username);
  return true;
}

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
    username: contract.recordKind === "app-user"
      ? appRegistrationUsername(input.email)
      : input.email.trim().toLowerCase(),
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
  redirect?: "error";
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
  adminDeletion?: OrisoAdminDeletionService;
  target: OrisoProvisioningTarget;
  status(recipientEmail: string): Promise<OrisoProvisioningStateView | null>;
  completeAccountSetup?(input: AccountSetupInput): Promise<TestAccessRecord>;
  ensureInvite(input: {
    recipientEmail: string;
    firstName: string;
    lastName: string;
    role: OrisoProvisioningRole;
  }): Promise<{ created: boolean; state: OrisoProvisioningStateView; agencyNames?: string[] }>;
  provision(input: {
    record: TestAccessRecord;
    firstName: string;
    lastName: string;
    role: OrisoProvisioningRole;
    storeTotp(secret: string): Promise<void>;
    rejectExistingAccount?: boolean;
    existingAccountOnly?: boolean;
    // A dispatched mutation may have succeeded even if its response is lost.
    // Only an explicit conflict proves that this attempt made no change.
    onCreationAttempt?(state: "started" | "rejected"): void;
  }): Promise<{ created: boolean; state: OrisoProvisioningStateView; agencyNames?: string[] }>;
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
  const generateEnvironmentTotp = generateCompatibleOrisoTotp;
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
    if (record.totpSecret) form.set("otp", generateEnvironmentTotp(record.totpSecret, now()).code);
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

  async function authorizedJson(path: string, init?: { method?: string; body?: string }, beforeSend?: () => void) {
    const token = await accessToken();
    beforeSend?.();
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {})
      },
      body: init?.body,
      signal: requestSignal()
    });
    return response;
  }

  async function credentialToken(
    record: TestAccessRecord,
    totpSecret?: string,
    username = record.username
  ) {
    const form = new URLSearchParams({
      client_id: options.clientId,
      grant_type: "password",
      username,
      password: record.secret
    });
    if (totpSecret) form.set("otp", generateEnvironmentTotp(totpSecret, now()).code);
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

  async function verifyCreationAgency(role: OrisoProvisioningRole) {
    if (role !== "counsellor" && role !== "agency-admin" && role !== "advice-seeker") return;
    try {
      const response = await authorizedJson(`/agencyadmin/agencies/${options.defaultAgencyId}`);
      if (!response.ok) throw new Error("Agency lookup failed");
      const agency = z.object({
        _embedded: z.object({
          id: z.number().int(),
          name: z.string().trim().min(1).max(255).optional(),
          tenantId: z.number().int(),
          deleteDate: z.string().nullish(),
          consultingType: z.number().int(),
          topics: z.array(z.object({ id: z.number().int() }).passthrough())
        }).passthrough()
      }).passthrough().parse(await response.json())._embedded;
      if (agency.id !== options.defaultAgencyId || agency.tenantId !== options.defaultTenantId || (agency.deleteDate != null && agency.deleteDate !== "null")
        || (role !== "agency-admin" && (agency.consultingType !== Number(options.defaultConsultingType)
          || !agency.topics.some((topic) => topic.id === options.defaultMainTopicId)))) {
        throw new Error("Agency does not match the configured provisioning target");
      }
      return agency.name;
    } catch {
      throw new OrisoProvisioningError("provisioning_agency_unavailable");
    }
  }

  async function userJson(accessTokenValue: string, path: string, init: { method?: string; body?: string } = {}) {
    const method = init.method ?? "GET";
    const csrfToken = ["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)
      ? null
      : randomUUID();
    return fetch(`${apiBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessTokenValue}`,
        "X-U25-CSRF-TOKEN": "dreambau-test-access",
        ...(csrfToken
          ? {
              "X-CSRF-Token": csrfToken,
              Cookie: `CSRF-TOKEN=${csrfToken}`
            }
          : {}),
        ...(init.body ? { "Content-Type": "application/json" } : {})
      },
      body: init.body,
      signal: requestSignal()
    });
  }

  async function managedCredentialToken(record: TestAccessRecord, totpSecret: string) {
    const credential = await credentialToken(record, totpSecret);
    if (credential.kind === "rejected") return credential;
    const profile = await userJson(credential.token, "/users/data");
    if (profile.ok) return credential;
    // UserService represents a soft-deleted asker/consultant profile as 403:
    // retrieveValidatedUser()/retrieveValidatedConsultant() finds the row via
    // its deleteDate-aware lookup and raises ForbiddenException. That is a
    // definitive missing product profile even when Keycloak still authenticates.
    if (profile.status === 401 || profile.status === 403 || profile.status === 404) {
      return { kind: "rejected" as const, status: profile.status };
    }
    // A transient or unknown product-API failure must not trigger account
    // creation. Only a definitive missing/rejected profile is stale.
    throw new OrisoProvisioningError("oriso_authentication_failed");
  }

  async function publicRegistrationJson(
    path: string,
    agencyId: number,
    init: { method?: string; body?: string } = {},
    beforeSend?: () => void
  ) {
    const method = init.method ?? "GET";
    const csrfToken = ["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)
      ? null
      : randomUUID();
    beforeSend?.();
    return fetch(`${apiBaseUrl}${path}`, {
      method,
      headers: {
        agencyId: String(agencyId),
        "X-U25-CSRF-TOKEN": "dreambau-test-access",
        ...(csrfToken
          ? {
              "X-CSRF-Token": csrfToken,
              Cookie: `CSRF-TOKEN=${csrfToken}`
            }
          : {}),
        ...(init.body ? { "Content-Type": "application/json" } : {})
      },
      body: init.body,
      signal: requestSignal()
    });
  }

  async function retryCredentialProbe(probeCredential: () => ReturnType<typeof managedCredentialToken>) {
    let probe = await probeCredential();
    for (const delay of provisioningRetryDelaysMs) {
      if (probe.kind === "authenticated") return probe.token;
      await sleep(delay);
      probe = await probeCredential();
    }
    return probe.kind === "authenticated" ? probe.token : null;
  }

  async function retryAuthenticatedToken(
    record: TestAccessRecord,
    totpSecret?: string,
    username = record.username
  ) {
    return retryCredentialProbe(() => credentialToken(record, totpSecret, username));
  }

  async function retryManagedCredentialToken(record: TestAccessRecord, totpSecret: string) {
    return retryCredentialProbe(() => managedCredentialToken(record, totpSecret));
  }

  async function activateTotpWithRetry(record: TestAccessRecord, initialToken: string, totpSecret: string) {
    let userToken = initialToken;
    for (let attempt = 0; ; attempt += 1) {
      const activation = await userJson(userToken, "/users/2fa/app", {
        method: "PUT",
        body: JSON.stringify({
          secret: totpSecret,
          otp: generateEnvironmentTotp(totpSecret, now()).code
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
            username: appRegistrationUsername(input.record.email ?? input.record.username),
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

  async function findInvite(recipientEmail: string, requireUnique = false) {
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
    if (requireUnique && active.length !== 1) throw new OrisoProvisioningError("account_setup_binding_mismatch");
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
    adminDeletion: createOrisoAdminDeletionService({ environment: options.environment, adminRecordId: options.adminRecordId, registryProvider: options.registryProvider, request: authorizedJson }),
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
    async completeAccountSetup(input) {
      if (input.record.accountSetup) return input.record;
      const invite = await findInvite(input.record.email ?? "", true);
      return completeBoundAccountSetup({ ...input, invite, target: options, fetch, now });
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

      // Authentication can outlive the application user after deletion. A
      // ready record is idempotent only when both the stored credentials and
      // the ORISO user-profile endpoint are live.
      let staleManagedAccount = false;
      if (input.record.totpSecret) {
        const verified = await managedCredentialToken(input.record, input.record.totpSecret);
        if (verified.kind === "authenticated") {
          return { created: false, state: directStateView(input.record, input.role, "DIRECT_RECONCILED") };
        }
        // A previously ready asker can surface UserService's soft-deleted
        // state either as 401 (Keycloak identity disabled) or as 403 (token
        // still valid but the product profile deleted). Public creation would
        // collide with the retained identity in both cases. Recovery is
        // restricted to the privileged user-admin endpoint and is accepted
        // only after the product profile becomes readable again.
        if (
          (verified.status === 401 || verified.status === 403)
          && input.record.provisioningStatus === "ready"
          && input.role === "advice-seeker"
        ) {
          if (!input.record.email) throw new OrisoProvisioningError("account_create_failed");
          const reactivation = await authorizedJson("/useradmin/askers/deletion/reactivate", {
            method: "POST",
            body: JSON.stringify({
              username: input.record.username,
              email: input.record.email,
              tenantId: options.defaultTenantId,
              password: input.record.secret
            })
          }, () => input.onCreationAttempt?.("started"));
          if (!reactivation.ok) {
            if (reactivation.status === 409) {
              input.onCreationAttempt?.("rejected");
              throw new OrisoProvisioningError("account_credentials_mismatch");
            }
            throw new OrisoProvisioningError("account_create_failed");
          }
          const verifiedToken = await retryManagedCredentialToken(input.record, input.record.totpSecret);
          if (!verifiedToken) throw new OrisoProvisioningError("totp_verification_failed");
          return { created: false, state: directStateView(input.record, input.role, "DIRECT_RECONCILED") };
        }
        // A pending record may have stored its seed immediately before 2FA
        // activation; in that recovery state the password-only probe must
        // still be allowed to resume activation. Only a previously ready
        // record can represent the deleted-product-user stale state.
        staleManagedAccount = input.record.provisioningStatus === "ready";
      }

      // Do not let an orphaned authentication identity suppress creation after
      // the product profile probe proved stale.
      const initialProbe = staleManagedAccount
        ? { kind: "rejected" as const, status: 404 }
        : await credentialToken(input.record);
      if (input.rejectExistingAccount && initialProbe.kind === "authenticated") {
        return { created: false, state: directStateView(input.record, input.role, "DIRECT_RECONCILED") };
      }
      let userToken = initialProbe.kind === "authenticated" ? initialProbe.token : null;
      let created = false;
      let creationAgencyName: string | undefined;
      if (!userToken) {
        if (input.existingAccountOnly) throw new OrisoProvisioningError("account_setup_outcome_unknown");
        if (!isProvisioningUsernameCompatible(input.record, input.role)) throw new OrisoProvisioningError("record_username_incompatible");
        creationAgencyName = await verifyCreationAgency(input.role);
        const request = creationRequest(input);
        const createResponse = input.role === "advice-seeker"
          ? await publicRegistrationJson(request.path, options.defaultAgencyId, {
              method: "POST",
              body: JSON.stringify(request.body)
            }, () => input.onCreationAttempt?.("started"))
          : await authorizedJson(request.path, {
              method: "POST",
              body: JSON.stringify(request.body)
            }, () => input.onCreationAttempt?.("started"));
        if (!createResponse.ok) {
          if (createResponse.status === 409) {
            input.onCreationAttempt?.("rejected");
            throw new OrisoProvisioningError("account_creation_conflict");
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
        const postCreateUsername = input.role === "advice-seeker"
          ? appRegistrationUsername(input.record.email ?? input.record.username)
          : input.record.username;
        const postCreateToken = await retryAuthenticatedToken(input.record, input.record.totpSecret, postCreateUsername);
        if (!postCreateToken) {
          const setup = input.record.email && ["counsellor", "agency-admin"].includes(input.role)
            ? await findInvite(input.record.email) : null;
          if (setup?.onboardingPurpose === "EXISTING_ACCOUNT_SETUP" && setup.inviteStatus === "EMAIL_SENT") {
            throw new OrisoProvisioningError("account_setup_required");
          }
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

      let totpSecret = input.record.totpSecret;
      if (!input.record.totpSecret) {
        const userDataResponse = await userJson(userToken, "/users/data");
        if (!userDataResponse.ok) throw new OrisoProvisioningError("totp_setup_failed");
        try {
          totpSecret = userDataSchema.parse(await userDataResponse.json()).twoFactorAuth.secret;
        } catch {
          throw new OrisoProvisioningError("totp_setup_failed");
        }
        try {
          await input.storeTotp(totpSecret);
        } catch {
          throw new OrisoProvisioningError("totp_store_failed");
        }
      }
      if (!totpSecret) throw new OrisoProvisioningError("totp_setup_failed");
      await activateTotpWithRetry(input.record, userToken, totpSecret);

      const verifiedToken = await retryManagedCredentialToken(input.record, totpSecret);
      if (!verifiedToken) {
        throw new OrisoProvisioningError("totp_verification_failed");
      }
      return {
        created,
        ...(created && creationAgencyName ? { agencyNames: [creationAgencyName] } : {}),
        state: directStateView(input.record, input.role, created ? "DIRECT_CREATED" : "DIRECT_RECONCILED")
      };
    }
  };
}
