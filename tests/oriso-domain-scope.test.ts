import { describe, expect, it } from "vitest";
import { orisoEnvironmentByDomain, environmentForOrisoEmail } from "../src/server/oriso-provisioning.js";
import { ORISO_ENVIRONMENT_BY_DOMAIN, orisoEnvironment } from "../src/client/components/otp-access";
import type { AccountView } from "../src/client/types";

// The server decides whether provisioning is allowed and the client decides
// whether to offer the button. When the two disagree the button either never
// appears or leads straight to a 422.
describe("ORISO domain scope", () => {
  it("keeps the client and server maps identical", () => {
    expect(ORISO_ENVIRONMENT_BY_DOMAIN).toEqual(orisoEnvironmentByDomain);
  });

  it("puts getme.global and trail.ist on dev", () => {
    expect(environmentForOrisoEmail("abe.simpson@getme.global")).toBe("dev");
    expect(environmentForOrisoEmail("bart.simpson@trail.ist")).toBe("dev");
  });

  it("leaves the domains that already worked alone", () => {
    expect(environmentForOrisoEmail("abe.simpson@dreambau.de")).toBe("pre-dev");
    expect(environmentForOrisoEmail("abe.simpson@dreambau.com")).toBe("pre-dev");
    expect(environmentForOrisoEmail("mona.simpson@oriso.org")).toBe("dev");
    expect(environmentForOrisoEmail("mona.simpson@openresilience.cc")).toBe("dev");
  });
});

function account(domain: string, project: string): AccountView {
  return { domain, email: `abe.simpson@${domain}`, metadata: { project } } as unknown as AccountView;
}

describe("the button follows the account's project, not its domain", () => {
  it("offers provisioning on getme.global and trail.ist once the project says ORISO", () => {
    expect(orisoEnvironment(account("getme.global", "ORISO"))).toBe("dev");
    expect(orisoEnvironment(account("trail.ist", "ORISO"))).toBe("dev");
  });

  it("stays out of the way while the project is unset", () => {
    // Deliberate: the domain alone must not move an account into ORISO scope,
    // because that would also move it out of everyone's dreambau project view.
    expect(orisoEnvironment(account("getme.global", "NONE"))).toBeNull();
    expect(orisoEnvironment(account("trail.ist", "NONE"))).toBeNull();
  });

  it("honours an explicit opt-out", () => {
    expect(orisoEnvironment(account("trail.ist", "TRAIL.IST"))).toBeNull();
    expect(orisoEnvironment(account("getme.global", "DREAMBAU"))).toBeNull();
  });

  it("still offers the domains that were always ORISO", () => {
    expect(orisoEnvironment(account("oriso.org", "NONE"))).toBe("dev");
    expect(orisoEnvironment(account("dreambau.de", "ORISO"))).toBe("pre-dev");
  });
});
