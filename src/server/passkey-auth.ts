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

const flowSchema = z.object({ flowId: z.uuid(), response: z.object({ id: z.string().min(1) }).passthrough() });

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
  syncHumanUser?: (user: import("./passkey-store.js").HumanUser) => Promise<import("./passkey-store.js").HumanUser>;
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
        authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
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
      options.store.addCredential({
        id: info.credential.id,
        userId: challenge.userId,
        publicKey: info.credential.publicKey,
        counter: info.credential.counter,
        transports: info.credential.transports ?? (parsed.data.response as any).response?.transports ?? [],
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp
      });
      options.sessions.destroy(req.cookies?.[cookieName]);
      res.cookie(cookieName, options.sessions.create({ authenticated: true, method: "passkey", userId: challenge.userId }), cookieOptions(options.secureCookies));
      const user = options.store.getUser(challenge.userId);
      res.json({ verified: true, email: user?.email });
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
      res.json({ flowId, options: generated });
    } catch (error) { next(error); }
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
      res.cookie(cookieName, options.sessions.create({ authenticated: true, method: "passkey", userId: challenge.userId }), cookieOptions(options.secureCookies));
      res.json({ verified: true });
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

  router.get("/auth/users", requireAdmin, async (_req, res) => {
    const locallyStored = options.store.listUsers();
    const infisicalSnapshots = new Map(locallyStored.map((user) => [
      user.id,
      options.store.grants.list(user.id)
        .filter((grant) => grant.source === "infisical")
        .map(({ userId, project, environments, source, status }) => ({ userId, project, environments, source, status }))
    ]));
    try {
      let synchronized = locallyStored;
      if (options.syncHumanUser) {
        const outcomes = await Promise.allSettled(locallyStored.map(options.syncHumanUser));
        const rejected = outcomes.find((outcome) => outcome.status === "rejected");
        if (rejected) throw rejected.reason;
        synchronized = outcomes.map((outcome) => {
          if (outcome.status === "rejected") throw outcome.reason;
          return outcome.value;
        });
      }
      res.set("Cache-Control", "no-store");
      res.json({ users: listWithAccessSources(synchronized), sourceStatus: { infisical: "available" } });
    } catch {
      for (const user of locallyStored) {
        options.store.grants.replaceInfisical(user.id, infisicalSnapshots.get(user.id) ?? []);
      }
      const correlationId = randomUUID();
      console.warn("human_access_employee_list_degraded", { correlationId });
      res.set("Cache-Control", "no-store");
      res.json({
        users: listWithAccessSources(locallyStored),
        sourceStatus: { infisical: "degraded", correlationId }
      });
    }
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
    try { if (options.syncHumanUser) user = await options.syncHumanUser(user); }
    catch { return res.status(503).json({ error: "human_access_unavailable" }); }
    res.json({ ...user, entitlements: options.entitlementsFor?.(user, principal) });
  });
}
