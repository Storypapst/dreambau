import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export class SessionStore {
  private readonly sessions = new Map<string, number>();
  constructor(private readonly secret: string) {}

  create() {
    const id = randomBytes(32).toString("base64url");
    this.sessions.set(id, Date.now() + MAX_AGE_MS);
    return `${id}.${this.sign(id)}`;
  }

  validate(cookie: string | undefined) {
    if (!cookie) return false;
    const [id, signature] = cookie.split(".");
    if (!id || !signature || !this.equal(signature, this.sign(id))) return false;
    const expires = this.sessions.get(id);
    if (!expires || expires < Date.now()) { this.sessions.delete(id); return false; }
    return true;
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

export const cookieName = "dreambau_testmails_session";
export const cookieOptions = (secure: boolean) => ({
  httpOnly: true, secure, sameSite: "strict" as const, path: "/testmails", maxAge: MAX_AGE_MS
});
