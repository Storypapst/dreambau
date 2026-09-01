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
  action: "catalog_sync" | "secret_requested" | "mail_requested" | "otp_requested" | "environment_requested" | "browser_session_opened" | "totp_enrolled" | "record_linked" | "application_password_updated" | "oriso_invite_requested" | "oriso_account_provisioned";
  createdAt: string; context: { runId?: string; applicationVersion?: string; environment?: "local" | "pre-dev" | "dev" | "production-test" };
}
export type OrisoProvisioningRole = "platform-admin" | "tenant-admin" | "agency-admin" | "counsellor" | "advice-seeker";
export type OrisoOnboardingState = "invited" | "onboarding-pending" | "two-factor-pending" | "ready";
export interface OrisoProvisioningStateView {
  state: OrisoOnboardingState; role: OrisoProvisioningRole | null; targetRole: string;
  inviteId: number; inviteStatus: string; emailVerificationStatus: string | null; twoFactorStatus: string | null;
  accessGateStatus: string | null; createdAt: string | null; expiresAt: string | null; acceptedAt: string | null;
  nextStep: "open-invitation-mail" | "complete-onboarding" | "store-totp" | "none";
}
export interface OrisoProvisioningView {
  configured: boolean; supportedRoles: OrisoProvisioningRole[]; environment: "pre-dev" | "dev";
  state: OrisoProvisioningStateView | null; provisioningRole: OrisoProvisioningRole | null;
  linked: LinkedTestAccount | null; requiresApplicationPassword: boolean;
}
export interface OrisoProvisioningResult {
  created: boolean; recordCreated: boolean; state: OrisoProvisioningStateView | null;
  provisioningRole: OrisoProvisioningRole; linked: LinkedTestAccount; requiresApplicationPassword: boolean;
}
export interface AccountAccessSummary { latest: AccountAccessEvent | null; events: AccountAccessEvent[] }
export type OtpResponse = ({ source: "totp"; generatedAt: string; expiresAt: string } | { source: "mail"; receivedAt: string; messageId: string; subject: string }) & { accountId: string; code: string };
export interface Taxonomies { roles: string[]; topics: string[]; conversationTypes: string[] }
export interface HumanUser {
  id: string; email: string; name: string; projects: Array<"oriso" | "orimo" | "dreambau">;
  role: "admin" | "member"; status: "active" | "disabled"; createdAt: string;
  entitlements: HumanEntitlements;
}
export interface HumanEntitlements {
  orisoProvisioning: { environments: Array<"pre-dev" | "dev"> };
}
