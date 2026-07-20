import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export class SessionStore {
  private readonly sessions = new Map<string, { expiresAt: number; principal: SessionPrincipal }>();
  constructor(private readonly secret: string) {}

  create(principal: SessionPrincipal = { authenticated: true, method: "password-bootstrap", userId: null }) {
    const id = randomBytes(32).toString("base64url");
    this.sessions.set(id, { expiresAt: Date.now() + MAX_AGE_MS, principal });
    return `${id}.${this.sign(id)}`;
  }

  validate(cookie: string | undefined) {
    return this.get(cookie) !== null;
  }

  get(cookie: string | undefined): SessionPrincipal | null {
    if (!cookie) return null;
    const [id, signature] = cookie.split(".");
    if (!id || !signature || !this.equal(signature, this.sign(id))) return null;
    const session = this.sessions.get(id);
    if (!session || session.expiresAt < Date.now()) { this.sessions.delete(id); return null; }
    return session.principal;
  }

  destroy(cookie: string | undefined) {
    const id = cookie?.split(".")[0];
    if (id) this.sessions.delete(id);
  }

  private sign(value: string) { return createHmac("sha256", this.secret).update(value).digest("base64url"); }
  private equal(a: string, b: string) {
    const left = Buffer.from(a); const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}

export interface SessionPrincipal {
  authenticated: true;
  method: "password-bootstrap" | "passkey" | "recovery" | "email-otp";
  userId: string | null;
}

export const cookieName = "dreambau_testmails_session";
export const cookieOptions = (secure: boolean) => ({
  httpOnly: true, secure, sameSite: "strict" as const, path: "/testmails", maxAge: MAX_AGE_MS
});
