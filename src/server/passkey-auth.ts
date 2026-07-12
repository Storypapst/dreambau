import { randomUUID } from "node:crypto";
import type { RequestHandler, Router } from "express";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";
import { z } from "zod";
import type { PasskeyStore } from "./passkey-store.js";
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

const flowSchema = z.object({ flowId: z.string().uuid(), response: z.object({ id: z.string().min(1) }).passthrough() });

export function installPasskeyAuth(router: Router, options: {
  store: PasskeyStore;
  sessions: SessionStore;
  requireSession: RequestHandler;
  secureCookies: boolean;
  rpId: string;
  expectedOrigin: string;
  rpName?: string;
  webauthn?: WebAuthnAdapter;
  now?: () => Date;
  bootstrapUser: { email: string; name: string; projects: Array<"oriso" | "orimo" | "dreambau"> };
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
    if (principal.method !== "password-bootstrap" && principal.userId !== challenge.userId) {
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
      res.json({ verified: true });
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
}
