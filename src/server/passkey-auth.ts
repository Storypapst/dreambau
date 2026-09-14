import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { RequestHandler, Router } from "express";
import { ALL_TEST_ENVIRONMENTS } from "./human-grants.js";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";
import { z } from "zod";
import type { PasskeyStore } from "./passkey-store.js";
import type { HumanEntitlements } from "./human-entitlements.js";
import { cookieName, cookieOptions, type SessionPrincipal, type SessionStore } from "./sessions.js";

export interface WebAuthnAdapter {
  generateRegistrationOptions(options: any): Promise<any>;
  verifyRegistrationResponse(options: any): Promise<any>;
  generateAuthenticationOptions(options: any): Promise<any>;
  verifyAuthenticationResponse(options: any): Promise<any>;
}

const defaultWebAuthn: WebAuthnAdapter = {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
};

const flowSchema = z.object({
  flowId: z.uuid(),
  response: z.object({ id: z.string().min(1) }).passthrough(),
  remember: z.boolean().optional(),
  name: z.string().trim().min(1).max(60).optional()
});

/**
 * Hints steer the browser towards the authenticator that actually holds the
 * passkey. "client-device" first keeps Touch ID / Windows Hello ahead of the
 * QR-code hybrid flow; hybrid stays listed so a phone-held passkey still works.
 */
const AUTHENTICATION_HINTS = ["client-device", "hybrid"] as const;

/** A readable default label when the browser gave none. */
function defaultPasskeyName(deviceType: string, transports: string[]) {
  const hybridOnly = transports.length > 0 && transports.every((transport) => transport === "hybrid");
  if (hybridOnly) return "Hybrid passkey (phone)";
  if (transports.includes("usb") || transports.includes("nfc")) return "Security key";
  return deviceType === "multiDevice" ? "Synced passkey" : "Device passkey";
}

export function installPasskeyAuth(router: Router, options: {
  store: PasskeyStore;
  sessions: SessionStore;
  requireSession: RequestHandler;
  requireStrongSession: RequestHandler;
  secureCookies: boolean;
  rpId: string;
  expectedOrigin: string;
  rpName?: string;
  webauthn?: WebAuthnAdapter;
  now?: () => Date;
  bootstrapUser: { email: string; name: string; projects: Array<"oriso" | "orimo" | "dreambau">; role: "admin" };
  syncHumanUser?: (user: import("./passkey-store.js").HumanUser, deadlineAt?: number) => Promise<import("./passkey-store.js").HumanUser>;
  serializeHumanAccess: <T>(operation: (deadlineAt: number) => Promise<T>) => Promise<T>;
  entitlementsFor?: (user: import("./passkey-store.js").HumanUser, principal: SessionPrincipal) => HumanEntitlements;
}) {
  const webauthn = options.webauthn ?? defaultWebAuthn;
  const now = options.now ?? (() => new Date());
  const expiresAt = () => new Date(now().getTime() + 5 * 60 * 1000).toISOString();

  router.post("/auth/passkeys/registration/options", options.requireSession, async (req, res, next) => {
    try {
      const principal = res.locals.session as SessionPrincipal;
      let user = principal.userId ? options.store.getUser(principal.userId) : null;
      if (principal.method === "password-bootstrap") {
        user = options.store.getUserByEmail(options.bootstrapUser.email)
          ?? options.store.createUser(options.bootstrapUser);
      }
      if (!user || user.status !== "active") return res.status(404).json({ error: "user_not_found" });
      const credentials = options.store.getCredentialsForUser(user.id);
      const generated = await webauthn.generateRegistrationOptions({
        rpName: options.rpName ?? "Dreambau Test Access",
        rpID: options.rpId,
        userID: Buffer.from(user.id),
        userName: user.email,
        userDisplayName: user.name,
        attestationType: "none",
        excludeCredentials: credentials.map((credential) => ({ id: credential.id, transports: credential.transports })),
        // A discoverable credential on the local device is what makes Touch ID
        // appear without the QR-code detour in other browsers on the same Mac.
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        preferredAuthenticatorType: "localDevice",
        supportedAlgorithmIDs: [-7, -257]
      });
      const flowId = randomUUID();
      options.store.putChallenge({ sessionId: flowId, kind: "registration", challenge: generated.challenge, userId: user.id, expiresAt: expiresAt() });
      res.json({ flowId, options: generated });
    } catch (error) { next(error); }
  });

  router.post("/auth/passkeys/registration/verify", options.requireSession, async (req, res) => {
    const parsed = flowSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request" });
    const challenge = options.store.consumeChallenge(parsed.data.flowId, "registration", now());
    if (!challenge?.userId) return res.status(400).json({ error: "invalid_or_expired_challenge" });
    const principal = res.locals.session as SessionPrincipal;
    const ownerId = principal.method === "password-bootstrap"
      ? options.store.getUserByEmail(options.bootstrapUser.email)?.id
      : principal.userId;
    if (!ownerId || ownerId !== challenge.userId) {
      return res.status(403).json({ error: "scope_denied" });
    }
    try {
      const result = await webauthn.verifyRegistrationResponse({
        response: parsed.data.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: options.expectedOrigin,
        expectedRPID: options.rpId,
        requireUserVerification: true
      });
      if (!result.verified || !result.registrationInfo) return res.status(400).json({ error: "verification_failed" });
      const info = result.registrationInfo;
      const transports: string[] = info.credential.transports ?? (parsed.data.response as any).response?.transports ?? [];
      options.store.addCredential({
        id: info.credential.id,
        userId: challenge.userId,
        publicKey: info.credential.publicKey,
        counter: info.credential.counter,
        transports,
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        name: parsed.data.name ?? defaultPasskeyName(info.credentialDeviceType, transports)
      });
      // Adding a further passkey from a live passkey session keeps that session,
      // including its "stay signed in" lifetime. Weaker sessions are upgraded.
      if (principal.method !== "passkey") {
        options.sessions.destroy(req.cookies?.[cookieName]);
        res.cookie(cookieName, options.sessions.create({ authenticated: true, method: "passkey", userId: challenge.userId }), cookieOptions(options.secureCookies));
      }
      const user = options.store.getUser(challenge.userId);
      res.json({ verified: true, email: user?.email, passkeyId: info.credential.id });
    } catch {
      res.status(400).json({ error: "verification_failed" });
    }
  });

  router.post("/auth/passkeys/authentication/options", async (req, res, next) => {
    try {
      const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase() : "";
      const user = options.store.getUserByEmail(email);
      const credentials = user?.status === "active" ? options.store.getCredentialsForUser(user.id) : [];
      const generated = await webauthn.generateAuthenticationOptions({
        rpID: options.rpId,
        userVerification: "required",
        allowCredentials: credentials.map((credential) => ({ id: credential.id, transports: credential.transports }))
      });
      const flowId = randomUUID();
      options.store.putChallenge({ sessionId: flowId, kind: "authentication", challenge: generated.challenge, userId: user?.status === "active" ? user.id : null, expiresAt: expiresAt() });
      res.json({ flowId, options: { ...generated, hints: [...AUTHENTICATION_HINTS] } });
    } catch (error) { next(error); }
  });

  // Per-user preferences (currently: saved filter presets). Any user-bound
  // session may read and write its own; the value is validated per key so the
  // table never becomes a dumping ground.
  const preferenceKeySchema = z.enum(["filter-presets"]);
  const filterStateSchema = z.object({
    query: z.string().max(200).default(""),
    domain: z.string().max(60).default("all"),
    status: z.string().max(40).default("all"),
    quality: z.string().max(40).default("all"),
    project: z.string().max(40).default("all"),
    versionAfter: z.string().max(40).default(""),
    roles: z.array(z.string().max(80)).max(50).default([]),
    topics: z.array(z.string().max(80)).max(50).default([]),
    conversations: z.array(z.string().max(80)).max(50).default([])
  });
  const preferenceValueSchemas: Record<z.infer<typeof preferenceKeySchema>, z.ZodTypeAny> = {
    "filter-presets": z.array(z.object({ id: z.string().min(1).max(64), name: z.string().trim().min(1).max(60), filters: filterStateSchema })).max(50)
  };
  const preferenceOwner = (res: any): string | null => {
    const principal = res.locals.session as SessionPrincipal;
    return principal.userId ?? null;
  };

  router.get("/auth/me/preferences/:key", options.requireSession, (req, res) => {
    const key = preferenceKeySchema.safeParse(req.params.key);
    const userId = preferenceOwner(res);
    if (!key.success) return res.status(404).json({ error: "preference_not_found" });
    if (!userId) return res.status(403).json({ error: "user_session_required" });
    res.set("Cache-Control", "no-store");
    res.json({ key: key.data, value: options.store.getPreference(userId, key.data) });
  });

  router.put("/auth/me/preferences/:key", options.requireSession, (req, res) => {
    const key = preferenceKeySchema.safeParse(req.params.key);
    const userId = preferenceOwner(res);
    if (!key.success) return res.status(404).json({ error: "preference_not_found" });
    if (!userId) return res.status(403).json({ error: "user_session_required" });
    const value = preferenceValueSchemas[key.data].safeParse(req.body?.value);
    if (!value.success || JSON.stringify(value.data).length > 16 * 1024) return res.status(400).json({ error: "invalid_request" });
    options.store.setPreference(userId, key.data, value.data);
    res.json({ key: key.data, value: value.data });
  });

  router.delete("/auth/me/preferences/:key", options.requireSession, (req, res) => {
    const key = preferenceKeySchema.safeParse(req.params.key);
    const userId = preferenceOwner(res);
    if (!key.success) return res.status(404).json({ error: "preference_not_found" });
    if (!userId) return res.status(403).json({ error: "user_session_required" });
    options.store.deletePreference(userId, key.data);
    res.json({ key: key.data, value: null });
  });

  // Passkey management for the signed-in owner. Strong session only: a
  // recovery-code session may add its first passkey through registration, but
  // must not delete or rename the ones that exist.
  router.get("/auth/passkeys", options.requireStrongSession, (_req, res) => {
    const principal = res.locals.session as SessionPrincipal;
    if (!principal.userId) return res.status(403).json({ error: "passkey_required" });
    res.set("Cache-Control", "no-store");
    res.json({ passkeys: options.store.listPasskeys(principal.userId) });
  });

  router.patch("/auth/passkeys/:id", options.requireStrongSession, (req, res) => {
    const principal = res.locals.session as SessionPrincipal;
    const parsed = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request" });
    if (!principal.userId || !options.store.renamePasskey(principal.userId, String(req.params.id), parsed.data.name)) {
      return res.status(404).json({ error: "passkey_not_found" });
    }
    res.json({ passkeys: options.store.listPasskeys(principal.userId) });
  });

  router.delete("/auth/passkeys/:id", options.requireStrongSession, (req, res) => {
    const principal = res.locals.session as SessionPrincipal;
    if (!principal.userId) return res.status(403).json({ error: "passkey_required" });
    const outcome = options.store.deletePasskey(principal.userId, String(req.params.id));
    if (outcome === "not_found") return res.status(404).json({ error: "passkey_not_found" });
    if (outcome === "last_passkey") return res.status(409).json({ error: "last_passkey" });
    res.json({ passkeys: options.store.listPasskeys(principal.userId) });
  });

  router.post("/auth/passkeys/authentication/verify", async (req, res) => {
    const parsed = flowSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request" });
    const challenge = options.store.consumeChallenge(parsed.data.flowId, "authentication", now());
    if (!challenge?.userId) return res.status(400).json({ error: "invalid_or_expired_challenge" });
    const credential = options.store.getCredential(parsed.data.response.id);
    if (!credential || credential.userId !== challenge.userId) return res.status(400).json({ error: "verification_failed" });
    try {
      const result = await webauthn.verifyAuthenticationResponse({
        response: parsed.data.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: options.expectedOrigin,
        expectedRPID: options.rpId,
        credential: {
          id: credential.id,
          publicKey: credential.publicKey,
          counter: credential.counter,
          transports: credential.transports
        },
        requireUserVerification: true
      });
      if (!result.verified) return res.status(400).json({ error: "verification_failed" });
      options.store.updateCredentialCounter(credential.id, result.authenticationInfo.newCounter, now().toISOString());
      options.sessions.destroy(req.cookies?.[cookieName]);
      // "Stay signed in" is a passkey-only privilege: recovery codes and email
      // codes are weaker factors and keep the 12 hour default.
      const cookie = options.sessions.create({ authenticated: true, method: "passkey", userId: challenge.userId }, { remember: parsed.data.remember === true });
      res.cookie(cookieName, cookie, cookieOptions(options.secureCookies, options.sessions.maxAgeOf(cookie)));
      res.json({ verified: true, remember: parsed.data.remember === true });
    } catch {
      res.status(400).json({ error: "verification_failed" });
    }
  });

  router.post("/auth/recovery-codes", options.requireSession, (req, res) => {
    const principal = res.locals.session as SessionPrincipal;
    if (principal.method !== "passkey" || !principal.userId) return res.status(403).json({ error: "passkey_required" });
    const codes = Array.from({ length: 10 }, () => randomBytes(16).toString("base64url"));
    const hashes = codes.map((code) => createHash("sha256").update(code).digest("hex"));
    options.store.replaceRecoveryCodeHashes(principal.userId, hashes);
    res.set("Cache-Control", "no-store");
    res.json({ codes });
  });

  router.post("/auth/recovery", (req, res) => {
    const parsed = z.object({ email: z.email(), code: z.string().min(20).max(64) }).safeParse(req.body);
    if (!parsed.success) return res.status(401).json({ error: "invalid_recovery_code" });
    const user = options.store.getUserByEmail(parsed.data.email.toLowerCase());
    const hash = createHash("sha256").update(parsed.data.code).digest("hex");
    if (!user || user.status !== "active" || !options.store.consumeRecoveryCodeHash(user.id, hash)) {
      return res.status(401).json({ error: "invalid_recovery_code" });
    }
    options.sessions.destroy(req.cookies?.[cookieName]);
    res.cookie(cookieName, options.sessions.create({ authenticated: true, method: "recovery", userId: user.id }), cookieOptions(options.secureCookies));
    res.json({ authenticated: true, method: "recovery", userId: user.id });
  });

  const requireAdmin = (req: any, res: any, next: any) => options.requireStrongSession(req, res, () => {
    const principal = res.locals.session as SessionPrincipal;
    const user = principal.userId ? options.store.getUser(principal.userId) : null;
    if (!user || user.status !== "active" || user.role !== "admin") return res.status(403).json({ error: "admin_required" });
    res.locals.humanUser = user;
    next();
  });

  /** Which sources an administrator granted access from: local, Infisical or both. */
  const accessSourcesFor = (userId: string) =>
    [...new Set(options.store.grants.list(userId).filter((grant) => grant.status === "active").map((grant) => grant.source))].sort();
  const listWithAccessSources = (users: import("./passkey-store.js").HumanUser[]) =>
    users.map((user) => ({ ...user, accessSources: accessSourcesFor(user.id) }));
  type TeamMembersResponsePayload = {
    users: ReturnType<typeof listWithAccessSources>;
    sourceStatus:
      | { infisical: "available" }
      | { infisical: "degraded"; correlationId: string };
  };

  const degradedEmployeeList = (
    users: ReturnType<typeof listWithAccessSources>,
    error: unknown
  ) => {
    const correlationId = randomUUID();
    const errorType = error instanceof DOMException && error.name === "AbortError"
      ? "abort"
      : error instanceof Error && error.message === "human_access_timeout"
        ? "timeout"
        : "lookup";
    console.warn("human_access_employee_list_degraded", {
      correlationId,
      errorType,
      message: "human access synchronization failed"
    });
    return {
      users,
      sourceStatus: { infisical: "degraded" as const, correlationId }
    };
  };

  const synchronizeHumanUser = (user: import("./passkey-store.js").HumanUser) => {
    const sync = options.syncHumanUser;
    return sync ? options.serializeHumanAccess((deadlineAt) => sync(user, deadlineAt)) : Promise.resolve(user);
  };

  router.get("/auth/users", requireAdmin, async (_req, res) => {
    const locallyStored = options.store.listUsers();
    const localSnapshot = listWithAccessSources(locallyStored);
    let payload: TeamMembersResponsePayload;
    try {
      payload = await options.serializeHumanAccess(async (deadlineAt) => {
        const infisicalSnapshots = new Map(locallyStored.map((user) => [
          user.id,
          options.store.grants.list(user.id)
            .filter((grant) => grant.source === "infisical")
            .map(({ userId, project, environments, source, status }) => ({ userId, project, environments, source, status }))
        ]));
        try {
          let synchronized = locallyStored;
          if (options.syncHumanUser) {
            const outcomes = await Promise.allSettled(locallyStored.map((user) => options.syncHumanUser!(user, deadlineAt)));
            const rejected = outcomes.find((outcome) => outcome.status === "rejected");
            if (rejected) throw rejected.reason;
            synchronized = (outcomes as PromiseFulfilledResult<import("./passkey-store.js").HumanUser>[])
              .map((outcome) => outcome.value);
          }
          return { users: listWithAccessSources(synchronized), sourceStatus: { infisical: "available" as const } };
        } catch (error) {
          for (const user of locallyStored) {
            options.store.grants.replaceInfisical(user.id, infisicalSnapshots.get(user.id) ?? []);
          }
          return degradedEmployeeList(listWithAccessSources(locallyStored), error);
        }
      });
    } catch (error) {
      payload = degradedEmployeeList(localSnapshot, error);
    }
    res.set("Cache-Control", "no-store");
    res.json(payload);
  });
  router.post("/auth/users", requireAdmin, (req, res) => {
    const parsed = z.object({
      email: z.string().trim().pipe(z.email()),
      name: z.string().min(1),
      projects: z.array(z.enum(["oriso", "orimo", "dreambau"])).min(1)
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_user" });
    const email = parsed.data.email.toLowerCase();
    const localGrants = (userId: string) => [...new Set(parsed.data.projects)].map((project) => ({
      userId,
      project,
      environments: [...ALL_TEST_ENVIRONMENTS],
      source: "local" as const
    }));

    // Re-inviting an address updates its local grants rather than failing or
    // creating a second identity. Infisical-derived grants are untouched.
    const existing = options.store.getUserByEmail(email);
    if (existing) {
      if (existing.status !== "active") return res.status(409).json({ error: "user_disabled" });
      options.store.grants.replaceLocal(existing.id, localGrants(existing.id));
      res.set("Cache-Control", "no-store");
      // A fresh enrollment code is only issued while enrollment is still
      // pending; re-inviting an enrolled employee must not reset their
      // recovery material.
      if (options.store.getCredentialsForUser(existing.id).length > 0) {
        return res.status(200).json(options.store.getUser(existing.id));
      }
      const enrollmentCode = randomBytes(16).toString("base64url");
      options.store.replaceRecoveryCodeHashes(existing.id, [createHash("sha256").update(enrollmentCode).digest("hex")]);
      return res.status(200).json({ ...options.store.getUser(existing.id), enrollmentCode });
    }

    try {
      const user = options.store.createUser({ ...parsed.data, email, role: "member" });
      const enrollmentCode = randomBytes(16).toString("base64url");
      options.store.replaceRecoveryCodeHashes(user.id, [createHash("sha256").update(enrollmentCode).digest("hex")]);
      res.set("Cache-Control", "no-store");
      res.status(201).json({ ...user, enrollmentCode });
    } catch {
      res.status(409).json({ error: "user_exists" });
    }
  });
  router.patch("/auth/users/:id/status", requireAdmin, (req, res) => {
    const parsed = z.object({ status: z.enum(["active", "disabled"]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_status" });
    try { res.json(options.store.setUserStatus(String(req.params.id), parsed.data.status)); }
    catch { res.status(404).json({ error: "user_not_found" }); }
  });
  router.get("/auth/me", options.requireSession, async (_req, res) => {
    const principal = res.locals.session as SessionPrincipal;
    if (principal.method !== "passkey" && principal.method !== "email-otp") {
      return res.status(403).json({ error: "strong_auth_required" });
    }
    let user = principal.userId ? options.store.getUser(principal.userId) : null;
    if (!user || user.status !== "active") return res.status(403).json({ error: "user_disabled" });
    try { user = await synchronizeHumanUser(user); }
    catch { return res.status(503).json({ error: "human_access_unavailable" }); }
    res.json({ ...user, entitlements: options.entitlementsFor?.(user, principal) });
  });
}
