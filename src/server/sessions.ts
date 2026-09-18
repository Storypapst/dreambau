import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Default session lifetime without "stay signed in". */
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** Lifetime with "stay signed in" ticked at login. Absolute, never extended. */
export const REMEMBERED_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionPrincipal {
  authenticated: true;
  method: "password-bootstrap" | "passkey" | "recovery" | "email-otp";
  userId: string | null;
}

export interface SessionRecord {
  id: string;
  principal: SessionPrincipal;
  remember: boolean;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
}

/**
 * Where session rows live. The in-memory backend is the test default; the
 * production app wires the SQLite backend from the passkey store so a session
 * survives a pod restart or a deployment.
 */
export interface SessionBackend {
  get(id: string): SessionRecord | null;
  put(record: SessionRecord): void;
  touch(id: string, lastSeenAt: number): void;
  delete(id: string): void;
  deleteExpired(now: number): number;
}

export class MemorySessionBackend implements SessionBackend {
  private readonly sessions = new Map<string, SessionRecord>();
  get(id: string) { return this.sessions.get(id) ?? null; }
  put(record: SessionRecord) { this.sessions.set(record.id, record); }
  touch(id: string, lastSeenAt: number) { const record = this.sessions.get(id); if (record) record.lastSeenAt = lastSeenAt; }
  delete(id: string) { this.sessions.delete(id); }
  deleteExpired(now: number) {
    let removed = 0;
    for (const [id, record] of this.sessions) if (record.expiresAt <= now) { this.sessions.delete(id); removed += 1; }
    return removed;
  }
}

export interface CreateSessionOptions {
  /** Keep the session for 30 days instead of 12 hours. Only passkey logins may set this. */
  remember?: boolean;
}

export class SessionStore {
  constructor(
    private readonly secret: string,
    private readonly backend: SessionBackend = new MemorySessionBackend(),
    private readonly now: () => number = () => Date.now()
  ) {}

  create(principal: SessionPrincipal = { authenticated: true, method: "password-bootstrap", userId: null }, options: CreateSessionOptions = {}) {
    const id = randomBytes(32).toString("base64url");
    const remember = options.remember === true && principal.method === "passkey";
    const createdAt = this.now();
    this.backend.put({
      id, principal, remember, createdAt,
      expiresAt: createdAt + (remember ? REMEMBERED_SESSION_MAX_AGE_MS : SESSION_MAX_AGE_MS),
      lastSeenAt: createdAt
    });
    return `${id}.${this.sign(id)}`;
  }

  validate(cookie: string | undefined) {
    return this.get(cookie) !== null;
  }

  get(cookie: string | undefined): SessionPrincipal | null {
    return this.record(cookie)?.principal ?? null;
  }

  /**
   * Total lifetime granted at creation, in milliseconds, for the cookie's
   * Max-Age. Deliberately not the remaining time: the cookie is set in the
   * same request that created the session, and a constant value keeps the
   * header exact instead of drifting by the milliseconds in between.
   */
  maxAgeOf(cookie: string | undefined) {
    const record = this.record(cookie);
    return record ? record.expiresAt - record.createdAt : SESSION_MAX_AGE_MS;
  }

  destroy(cookie: string | undefined) {
    const id = cookie?.split(".")[0];
    if (id) this.backend.delete(id);
  }

  /** Remove expired rows. Called at startup and periodically by the app. */
  prune() {
    return this.backend.deleteExpired(this.now());
  }

  private record(cookie: string | undefined): SessionRecord | null {
    if (!cookie) return null;
    const [id, signature] = cookie.split(".");
    if (!id || !signature || !this.equal(signature, this.sign(id))) return null;
    const record = this.backend.get(id);
    const now = this.now();
    if (!record) return null;
    if (record.expiresAt <= now) { this.backend.delete(id); return null; }
    if (now - record.lastSeenAt > 60 * 1000) this.backend.touch(id, now);
    return record;
  }

  private sign(value: string) { return createHmac("sha256", this.secret).update(value).digest("base64url"); }
  private equal(a: string, b: string) {
    const left = Buffer.from(a); const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}

export const cookieName = "dreambau_testmails_session";
export const cookieOptions = (secure: boolean, maxAge: number = SESSION_MAX_AGE_MS) => ({
  httpOnly: true, secure, sameSite: "strict" as const, path: "/testmails", maxAge
});
