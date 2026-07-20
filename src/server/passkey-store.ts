import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { z } from "zod";

const projectSchema = z.enum(["oriso", "orimo", "dreambau"]);
const synchronizedProjectsSchema = z.array(projectSchema).max(3);
const userInputSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
  projects: z.array(projectSchema).min(1),
  role: z.enum(["admin", "member"]).default("member")
});
const credentialInputSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  publicKey: z.instanceof(Uint8Array),
  counter: z.number().int().nonnegative(),
  transports: z.array(z.string().min(1)),
  deviceType: z.string().min(1),
  backedUp: z.boolean()
});
const challengeSchema = z.object({
  sessionId: z.string().min(1),
  kind: z.enum(["registration", "authentication"]),
  challenge: z.string().min(1),
  userId: z.string().min(1).nullable(),
  expiresAt: z.iso.datetime()
});

export type HumanProject = z.infer<typeof projectSchema>;

export interface HumanUser {
  id: string;
  email: string;
  name: string;
  projects: HumanProject[];
  status: "active" | "disabled";
  role: "admin" | "member";
  createdAt: string;
}

export interface StoredCredential {
  id: string;
  userId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export function createPasskeyStore(path: string) {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS human_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      projects TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active','disabled')),
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS passkey_credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES human_users(id) ON DELETE CASCADE,
      public_key BLOB NOT NULL,
      counter INTEGER NOT NULL,
      transports TEXT NOT NULL,
      device_type TEXT NOT NULL,
      backed_up INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS webauthn_challenges (
      session_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('registration','authentication')),
      challenge TEXT NOT NULL,
      user_id TEXT,
      expires_at TEXT NOT NULL,
      PRIMARY KEY(session_id, kind)
    );
    CREATE TABLE IF NOT EXISTS recovery_codes (
      user_id TEXT NOT NULL REFERENCES human_users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      used_at TEXT,
      PRIMARY KEY(user_id, code_hash)
    );
  `);
  const userColumns = new Set((sqlite.prepare("PRAGMA table_info(human_users)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!userColumns.has("role")) sqlite.exec("ALTER TABLE human_users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");

  const rowToUser = (row: any): HumanUser => ({
    id: row.id,
    email: row.email,
    name: row.name,
    projects: z.array(projectSchema).parse(JSON.parse(row.projects)),
    status: row.status,
    role: row.role,
    createdAt: row.created_at
  });
  const rowToCredential = (row: any): StoredCredential => ({
    id: row.id,
    userId: row.user_id,
    publicKey: new Uint8Array(row.public_key),
    counter: row.counter,
    transports: z.array(z.string()).parse(JSON.parse(row.transports)),
    deviceType: row.device_type,
    backedUp: Boolean(row.backed_up),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at
  });

  return {
    createUser(input: z.input<typeof userInputSchema>) {
      const parsed = userInputSchema.parse(input);
      const user: HumanUser = {
        id: randomUUID(),
        email: parsed.email.toLowerCase(),
        name: parsed.name,
        projects: [...new Set(parsed.projects)],
        status: "active",
        role: parsed.role,
        createdAt: new Date().toISOString()
      };
      try {
        sqlite.prepare("INSERT INTO human_users(id,email,name,projects,status,role,created_at) VALUES(?,?,?,?,?,?,?)")
          .run(user.id, user.email, user.name, JSON.stringify(user.projects), user.status, user.role, user.createdAt);
      } catch {
        throw new Error("A user with this email already exists");
      }
      return user;
    },
    getUser(id: string) {
      const row = sqlite.prepare("SELECT * FROM human_users WHERE id=?").get(id);
      return row ? rowToUser(row) : null;
    },
    getUserByEmail(email: string) {
      const row = sqlite.prepare("SELECT * FROM human_users WHERE email=? COLLATE NOCASE").get(email);
      return row ? rowToUser(row) : null;
    },
    listUsers() {
      return (sqlite.prepare("SELECT * FROM human_users ORDER BY email COLLATE NOCASE").all() as any[]).map(rowToUser);
    },
    setUserStatus(id: string, status: "active" | "disabled") {
      const parsed = z.enum(["active", "disabled"]).parse(status);
      const result = sqlite.prepare("UPDATE human_users SET status=? WHERE id=?").run(parsed, id);
      if (result.changes !== 1) throw new Error("Human user not found");
      return rowToUser(sqlite.prepare("SELECT * FROM human_users WHERE id=?").get(id));
    },
    updateUserProjects(id: string, projects: HumanProject[]) {
      const parsed = [...new Set(synchronizedProjectsSchema.parse(projects))];
      const result = sqlite.prepare("UPDATE human_users SET projects=? WHERE id=?").run(JSON.stringify(parsed), id);
      if (result.changes !== 1) throw new Error("Human user not found");
      return rowToUser(sqlite.prepare("SELECT * FROM human_users WHERE id=?").get(id));
    },
    addCredential(input: z.input<typeof credentialInputSchema>) {
      const credential = credentialInputSchema.parse(input);
      const createdAt = new Date().toISOString();
      sqlite.prepare(`INSERT INTO passkey_credentials
        (id,user_id,public_key,counter,transports,device_type,backed_up,created_at,last_used_at)
        VALUES(?,?,?,?,?,?,?,?,NULL)`)
        .run(credential.id, credential.userId, Buffer.from(credential.publicKey), credential.counter,
          JSON.stringify(credential.transports), credential.deviceType, Number(credential.backedUp), createdAt);
    },
    getCredential(id: string) {
      const row = sqlite.prepare("SELECT * FROM passkey_credentials WHERE id=?").get(id);
      return row ? rowToCredential(row) : null;
    },
    getCredentialsForUser(userId: string) {
      return (sqlite.prepare("SELECT * FROM passkey_credentials WHERE user_id=? ORDER BY created_at").all(userId) as any[]).map(rowToCredential);
    },
    credentialCount() {
      return (sqlite.prepare("SELECT COUNT(*) AS count FROM passkey_credentials").get() as { count: number }).count;
    },
    updateCredentialCounter(id: string, counter: number, usedAt = new Date().toISOString()) {
      if (!Number.isInteger(counter) || counter < 0) throw new Error("Invalid passkey counter");
      const result = sqlite.prepare(`UPDATE passkey_credentials SET counter=?,last_used_at=?
        WHERE id=? AND (counter<? OR (counter=0 AND ?=0))`)
        .run(counter, usedAt, id, counter, counter);
      if (result.changes !== 1) throw new Error("Passkey counter did not advance");
    },
    putChallenge(input: z.input<typeof challengeSchema>) {
      const challenge = challengeSchema.parse(input);
      sqlite.prepare(`INSERT INTO webauthn_challenges(session_id,kind,challenge,user_id,expires_at) VALUES(?,?,?,?,?)
        ON CONFLICT(session_id,kind) DO UPDATE SET challenge=excluded.challenge,user_id=excluded.user_id,expires_at=excluded.expires_at`)
        .run(challenge.sessionId, challenge.kind, challenge.challenge, challenge.userId, challenge.expiresAt);
    },
    consumeChallenge(sessionId: string, kind: "registration" | "authentication", now = new Date()) {
      return sqlite.transaction(() => {
        const row = sqlite.prepare("SELECT * FROM webauthn_challenges WHERE session_id=? AND kind=?").get(sessionId, kind) as any;
        sqlite.prepare("DELETE FROM webauthn_challenges WHERE session_id=? AND kind=?").run(sessionId, kind);
        if (!row || new Date(row.expires_at) <= now) return null;
        return { sessionId: row.session_id, kind: row.kind, challenge: row.challenge, userId: row.user_id, expiresAt: row.expires_at };
      })();
    },
    replaceRecoveryCodeHashes(userId: string, hashes: string[]) {
      const parsed = z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).parse(hashes);
      sqlite.transaction(() => {
        sqlite.prepare("DELETE FROM recovery_codes WHERE user_id=?").run(userId);
        const insert = sqlite.prepare("INSERT INTO recovery_codes(user_id,code_hash,used_at) VALUES(?,?,NULL)");
        for (const hash of new Set(parsed)) insert.run(userId, hash);
      })();
    },
    consumeRecoveryCodeHash(userId: string, hash: string) {
      const parsed = z.string().regex(/^[a-f0-9]{64}$/).parse(hash);
      const result = sqlite.prepare("UPDATE recovery_codes SET used_at=? WHERE user_id=? AND code_hash=? AND used_at IS NULL")
        .run(new Date().toISOString(), userId, parsed);
      return result.changes === 1;
    },
    debugRecoveryCodes(userId: string) {
      return sqlite.prepare("SELECT code_hash,used_at FROM recovery_codes WHERE user_id=? ORDER BY code_hash").all(userId);
    },
    close() { sqlite.close(); }
  };
}

export type PasskeyStore = ReturnType<typeof createPasskeyStore>;
