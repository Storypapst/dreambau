export type LifecycleStatus = "active" | "needs_review" | "delete_candidate" | "archived";
export type FixtureQuality = "empty" | "synthetic" | "realistic" | "gold";
export interface AccountMetadata {
  email: string; shippedVersion: string; lifecycleStatus: LifecycleStatus; roles: string[]; topics: string[];
  conversationTypes: string[]; fixtureQuality: FixtureQuality; sampleFileCount: number; notes: string; updatedAt: string;
}
export interface AccountView {
  displayName: string; email: string; password: string; domain: string; imap: string; smtp: string; jmap: string; caldav: string; carddav: string;
  encryption: { state: "disabled" } | { state: "encrypted"; format: "S/MIME"; symmetricMode: "AES-256"; encryptOnAppend: true; allowSpamTraining: false };
  metadata: AccountMetadata;
}
export interface Taxonomies { roles: string[]; topics: string[]; conversationTypes: string[] }
