import { createHmac, randomInt, randomUUID } from "node:crypto";
import type { Router } from "express";
import nodemailer from "nodemailer";
import { z } from "zod";
import type { HumanUser, PasskeyStore } from "./passkey-store.js";
import { cookieName, cookieOptions, type SessionStore } from "./sessions.js";

export interface EmailOtpMessage {
  to: string;
  code: string;
  expiresAt: string;
}

export interface EmailOtpSender {
  send(message: EmailOtpMessage): Promise<void>;
}

export interface SmtpEmailOtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
}

export function createSmtpEmailOtpSender(config: SmtpEmailOtpConfig): EmailOtpSender {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: { user: config.username, pass: config.password }
  });
  return {
    async send({ to, code }) {
      await transport.sendMail({
        from: { name: config.fromName, address: config.fromAddress },
        to,
        subject: "Dein Dreambau-Anmeldecode",
        text: `Dein einmaliger Anmeldecode für Dreambau Testkonten lautet: ${code}\n\nDer Code ist 10 Minuten gültig. Wenn du ihn nicht angefordert hast, ignoriere diese Nachricht.`,
        html: `<p>Dein einmaliger Anmeldecode für <strong>Dreambau Testkonten</strong> lautet:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Der Code ist 10 Minuten gültig. Wenn du ihn nicht angefordert hast, ignoriere diese Nachricht.</p>`
      });
    }
  };
}

const requestSchema = z.object({ email: z.email() });
const verifySchema = z.object({ email: z.email(), code: z.string().regex(/^\d{6}$/) });

export function installEmailOtpAuth(router: Router, options: {
  store: PasskeyStore;
  sessions: SessionStore;
  secureCookies: boolean;
  sender?: EmailOtpSender;
  hmacKey?: string;
  now?: () => Date;
  syncHumanUser?: (user: HumanUser) => Promise<HumanUser>;
}) {
  const now = () => options.now?.() ?? new Date();
  const hmac = (userId: string, code: string) => createHmac("sha256", options.hmacKey!).update(`${userId}:${code}`).digest("hex");

  router.post("/auth/email-otp/request", async (req, res) => {
    const accepted = () => res.status(202).json({ accepted: true });
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success || !options.sender || !options.hmacKey) return accepted();
    let user = options.store.getUserByEmail(parsed.data.email.toLowerCase());
    if (!user || user.status !== "active") return accepted();
    try {
      if (options.syncHumanUser) user = await options.syncHumanUser(user);
      if (user.role !== "admin" && user.projects.length === 0) return accepted();
      const requestedAt = now();
      const previous = options.store.latestEmailOtpRequestedAt(user.id);
      if (previous && requestedAt.getTime() - new Date(previous).getTime() < 60_000) return accepted();
      const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
      const expiresAt = new Date(requestedAt.getTime() + 10 * 60_000).toISOString();
      await options.sender.send({ to: user.email, code, expiresAt });
      options.store.putEmailOtpChallenge({
        id: randomUUID(), userId: user.id, codeHmac: hmac(user.id, code), expiresAt,
        attemptsRemaining: 5, requestedAt: requestedAt.toISOString()
      });
    } catch {
      // Always return the same response; delivery and membership are intentionally private.
    }
    return accepted();
  });

  router.post("/auth/email-otp/verify", async (req, res) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success || !options.hmacKey) return res.status(401).json({ error: "invalid_email_otp" });
    let user = options.store.getUserByEmail(parsed.data.email.toLowerCase());
    if (!user || user.status !== "active" || !options.store.verifyEmailOtpChallenge(user.id, hmac(user.id, parsed.data.code), now())) {
      return res.status(401).json({ error: "invalid_email_otp" });
    }
    try {
      if (options.syncHumanUser) user = await options.syncHumanUser(user);
      if (user.role !== "admin" && user.projects.length === 0) return res.status(403).json({ error: "scope_denied" });
    } catch {
      return res.status(503).json({ error: "human_access_unavailable" });
    }
    options.sessions.destroy(req.cookies?.[cookieName]);
    res.cookie(cookieName, options.sessions.create({ authenticated: true, method: "email-otp", userId: user.id }), cookieOptions(options.secureCookies));
    res.set("Cache-Control", "no-store");
    return res.json({ authenticated: true, method: "email-otp", userId: user.id });
  });
}
