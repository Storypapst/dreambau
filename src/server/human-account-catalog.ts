import type { HumanProject } from "./passkey-store.js";
import type { HumanGrantSource, TestEnvironment } from "./human-grants.js";

/** The Springfield mailbox pool is a fixed set. Anything else is a fault. */
export const EXPECTED_ACCOUNT_TOTAL = 180;

export interface CatalogScope {
  projects: HumanProject[];
  environments: TestEnvironment[];
  sources: HumanGrantSource[];
}

export interface CatalogIntegrity {
  status: "complete" | "incomplete";
  expectedTotal: typeof EXPECTED_ACCOUNT_TOTAL;
  actualTotal: number;
  checkedAt: string;
}

export interface HumanAccountCatalogResponse<TAccount> {
  catalog: CatalogIntegrity;
  scope: CatalogScope;
  visibleTotal: number;
  accounts: TAccount[];
  degradedSources?: HumanGrantSource[];
}

/**
 * Raised when the global mailbox pool is not exactly 180 unique identities.
 *
 * Carries counts only. Reporting which address is missing or duplicated would
 * leak the pool to a caller who may be scoped to none of it.
 */
export class CatalogIntegrityError extends Error {
  readonly code = "account_catalog_incomplete";
  constructor(readonly actualTotal: number, readonly uniqueTotal: number) {
    super("account catalog integrity check failed");
    this.name = "CatalogIntegrityError";
  }

  details() {
    return { error: this.code, expectedTotal: EXPECTED_ACCOUNT_TOTAL, actualTotal: this.actualTotal, uniqueTotal: this.uniqueTotal };
  }
}

/**
 * Validates the global pool before any scoping happens, so a caller can never
 * infer global integrity from the size of their own visible slice.
 */
export function catalogIntegrity(allEmails: string[]) {
  const actualTotal = allEmails.length;
  const uniqueTotal = new Set(allEmails.map((email) => email.trim().toLowerCase())).size;
  if (actualTotal !== EXPECTED_ACCOUNT_TOTAL || uniqueTotal !== EXPECTED_ACCOUNT_TOTAL) {
    throw new CatalogIntegrityError(actualTotal, uniqueTotal);
  }
  return { actualTotal, uniqueTotal };
}

export function buildHumanAccountCatalog<TAccount>(input: {
  allEmails: string[];
  accounts: TAccount[];
  scope: CatalogScope;
  checkedAt: Date;
  degradedSources?: HumanGrantSource[];
}): HumanAccountCatalogResponse<TAccount> {
  const { actualTotal } = catalogIntegrity(input.allEmails);
  return {
    catalog: {
      status: "complete",
      expectedTotal: EXPECTED_ACCOUNT_TOTAL,
      actualTotal,
      checkedAt: input.checkedAt.toISOString()
    },
    scope: input.scope,
    visibleTotal: input.accounts.length,
    accounts: input.accounts,
    ...(input.degradedSources?.length ? { degradedSources: input.degradedSources } : {})
  };
}
