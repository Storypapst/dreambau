export type LifecycleStatus = "unused" | "active" | "needs_review" | "delete_candidate" | "archived";
export type FixtureQuality = "empty" | "synthetic" | "realistic" | "gold";
export type Project = "NONE" | "ORI" | "ORISO" | "ORIMO" | "TRAIL.IST" | "DREAMBAU" | "OTHER";
export interface AccountMetadata {
  email: string; shippedVersion: string; lifecycleStatus: LifecycleStatus; project: Project; roles: string[]; topics: string[];
  conversationTypes: string[]; fixtureQuality: FixtureQuality; sampleFileCount: number; notes: string; updatedAt: string;
}
export interface AccountView {
  displayName: string; email: string; password: string; domain: string; imap: string; smtp: string; jmap: string; caldav: string; carddav: string;
  encryption: { state: "disabled" } | { state: "encrypted"; format: "S/MIME"; symmetricMode: "AES-256"; encryptOnAppend: true; allowSpamTraining: false };
  metadata: AccountMetadata;
  linkedAccess?: LinkedTestAccount[];
  access?: AccountAccessSummary;
}
export interface LinkedTestAccount {
  id: string; project: "oriso" | "orimo" | "dreambau"; environment: "local" | "pre-dev" | "dev" | "production-test";
  kind: "mailbox" | "app-user" | "admin" | "seed-profile"; displayName: string; username: string; email: string;
  roles: string[]; loginUrl: string; hasTotp: boolean;
}
export interface AccountAccessEvent {
  id: number; accountId: string; email: string; actorId: string;
  action: "catalog_sync" | "secret_requested" | "mail_requested" | "otp_requested" | "environment_requested" | "browser_session_opened";
  createdAt: string; context: { runId?: string; applicationVersion?: string; environment?: "local" | "pre-dev" | "dev" | "production-test" };
}
export interface AccountAccessSummary { latest: AccountAccessEvent | null; events: AccountAccessEvent[] }
export type OtpResponse = ({ source: "totp"; generatedAt: string; expiresAt: string } | { source: "mail"; receivedAt: string; messageId: string; subject: string }) & { accountId: string; code: string };
export interface Taxonomies { roles: string[]; topics: string[]; conversationTypes: string[] }
export interface HumanUser {
  id: string; email: string; name: string; projects: Array<"oriso" | "orimo" | "dreambau">;
  role: "admin" | "member"; status: "active" | "disabled"; createdAt: string;
}
