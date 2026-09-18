import { loadAccounts as loadAccountsFile, encryptionFor, validateAccounts, type AccountRecord } from "./accounts.js";
import type { RegistryProvider, TestAccessRecord } from "./infisical-provider.js";

// Infisical already holds every test mailbox as a `kind: "mailbox"` record, so
// the catalogue does not need its own copy. The secret file stays as a cold
// fallback: Infisical runs on the same host as this app, but a catalogue that
// disappears on a restart would take the whole hub with it.

const MAILBOX_ENVIRONMENT = "production-test";

export function accountFromMailboxRecord(record: TestAccessRecord): AccountRecord {
  if (!record.email) throw new Error(`Mailbox record without an address: ${record.id}`);
  const email = record.email.trim().toLowerCase();
  const domain = email.split("@").at(-1) ?? "";
  const encoded = encodeURIComponent(email);
  return {
    displayName: record.displayName,
    email,
    password: record.secret,
    domain,
    imap: "mail.dreambau.com:993",
    smtp: "mail.dreambau.com:465",
    jmap: "https://box.dreambau.com/.well-known/jmap",
    caldav: `https://box.dreambau.com/dav/cal/${encoded}/`,
    carddav: `https://box.dreambau.com/dav/card/${encoded}/`,
    // Derived, never stored. A stored flag is what drifted out of the secret
    // file: four OTP mailboxes were unencrypted in Stalwart for weeks while the
    // file still claimed otherwise.
    encryption: encryptionFor(email)
  };
}

export function accountsFromRecords(records: TestAccessRecord[]): AccountRecord[] {
  const mailboxes = records.filter(
    (record) => record.kind === "mailbox" && record.environment === MAILBOX_ENVIRONMENT
  );
  if (mailboxes.length === 0) throw new Error("Infisical returned no mailbox records");
  return validateAccounts(mailboxes.map(accountFromMailboxRecord));
}

export interface AccountSourceStatus {
  source: "infisical" | "file";
  count: number;
  lastRefreshAt: string | null;
  lastFailureAt: string | null;
  lastFailure: string | null;
}

export interface AccountSource {
  /** Synchronous because the catalogue is read on nearly every request. */
  load(): AccountRecord[];
  refresh(): Promise<void>;
  status(): AccountSourceStatus;
}

export function createInfisicalAccountSource(options: {
  registryProvider: RegistryProvider;
  fallbackPath: string;
  now?: () => Date;
}): AccountSource {
  const now = options.now ?? (() => new Date());
  let cached: AccountRecord[] | null = null;
  let lastRefreshAt: string | null = null;
  let lastFailureAt: string | null = null;
  let lastFailure: string | null = null;

  return {
    load() {
      if (cached) return cached;
      // Before the first successful pull, and only then, the file answers.
      return loadAccountsFile(options.fallbackPath);
    },
    async refresh() {
      try {
        const accounts = accountsFromRecords(await options.registryProvider.list());
        cached = accounts;
        lastRefreshAt = now().toISOString();
        lastFailure = null;
        lastFailureAt = null;
      } catch (error) {
        // A failed refresh never discards a good catalogue.
        lastFailureAt = now().toISOString();
        lastFailure = error instanceof Error ? error.message : "unknown error";
        throw error;
      }
    },
    status() {
      let count = 0;
      try { count = this.load().length; } catch { count = 0; }
      return {
        source: cached ? "infisical" : "file",
        count,
        lastRefreshAt,
        lastFailureAt,
        lastFailure
      };
    }
  };
}
