import argon2 from "argon2";
import type { NextFunction, Request, Response, Router } from "express";
import { cookieName, cookieOptions, SessionStore } from "./sessions.js";

interface FailureWindow { count: number; startedAt: number }

export function installAuth(router: Router, passwordHash: string, sessionSecret: string, secureCookies: boolean, passwordLoginAllowed: () => boolean = () => true) {
  const sessions = new SessionStore(sessionSecret || "test-only-session-secret");
  const failures = new Map<string, FailureWindow>();
  const windowMs = 15 * 60 * 1000;

  const requireSession = (req: Request, res: Response, next: NextFunction) => {
    const principal = sessions.get(req.cookies?.[cookieName]);
    if (!principal) return res.status(401).json({ error: "unauthorized" });
    res.locals.session = principal;
    next();
  };
  const requireStrongSession = (req: Request, res: Response, next: NextFunction) => {
    const principal = sessions.get(req.cookies?.[cookieName]);
    if (!principal) return res.status(401).json({ error: "unauthorized" });
    if (principal.method !== "passkey") return res.status(403).json({ error: "passkey_required" });
    res.locals.session = principal;
    next();
  };

  router.post("/auth/login", async (req, res) => {
    if (!passwordLoginAllowed()) return res.status(410).json({ error: "bootstrap_disabled" });
    const ip = req.ip ?? "unknown";
    const now = Date.now();
    const current = failures.get(ip);
    const state = !current || now - current.startedAt >= windowMs ? { count: 0, startedAt: now } : current;
    if (state.count >= 5) return res.status(429).json({ error: "rate_limited" });
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const valid = Boolean(passwordHash) && await argon2.verify(passwordHash, password).catch(() => false);
    if (!valid) {
      state.count += 1; failures.set(ip, state);
      return res.status(401).json({ error: "invalid_password" });
    }
    failures.delete(ip);
    sessions.destroy(req.cookies?.[cookieName]);
    res.cookie(cookieName, sessions.create(), cookieOptions(secureCookies));
    return res.json({ authenticated: true });
  });
  router.get("/auth/bootstrap-status", (_req, res) => res.json({ enabled: passwordLoginAllowed() }));

  router.post("/auth/logout", (req, res) => {
    sessions.destroy(req.cookies?.[cookieName]);
    res.clearCookie(cookieName, cookieOptions(secureCookies));
    res.json({ authenticated: false });
  });
  router.get("/auth/session", (req, res) => {
    const principal = sessions.get(req.cookies?.[cookieName]);
    res.json(principal ?? { authenticated: false });
  });
  return { requireSession, requireStrongSession, sessions };
}
