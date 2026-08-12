import type { HumanGrantStore, TestEnvironment } from "./human-grants.js";
import type { HumanUser } from "./passkey-store.js";
import type { SessionPrincipal } from "./sessions.js";

export const ORISO_PROVISIONING_ENVIRONMENTS = ["pre-dev", "dev"] as const;
export type OrisoProvisioningEntitlementEnvironment = typeof ORISO_PROVISIONING_ENVIRONMENTS[number];

export interface HumanEntitlements {
  orisoProvisioning: {
    environments: OrisoProvisioningEntitlementEnvironment[];
  };
}

export function humanEntitlementsFor(
  user: HumanUser,
  grants: HumanGrantStore,
  sessionMethod: SessionPrincipal["method"]
): HumanEntitlements {
  const grantedEnvironments = user.status === "active" && sessionMethod === "passkey"
    ? grants.effective(user.id).find((grant) => grant.project === "oriso")?.environments ?? []
    : [];
  return {
    orisoProvisioning: {
      environments: ORISO_PROVISIONING_ENVIRONMENTS.filter((environment) =>
        grantedEnvironments.includes(environment as TestEnvironment)
      )
    }
  };
}

export function canProvisionOriso(
  entitlements: HumanEntitlements,
  environment: OrisoProvisioningEntitlementEnvironment
) {
  return entitlements.orisoProvisioning.environments.includes(environment);
}
