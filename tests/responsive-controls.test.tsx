import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineProjectSelect, InlineStatusSelect } from "../src/client/components/inline-metadata-controls.js";
import type { AccountView } from "../src/client/types.js";

const account: AccountView = {
  displayName: "Abe Simpson", email: "abe.simpson@dreambau.com", password: "secret", domain: "dreambau.com",
  imap: "imap", smtp: "smtp", jmap: "jmap", caldav: "caldav", carddav: "carddav", encryption: { state: "disabled" },
  metadata: { email: "abe.simpson@dreambau.com", shippedVersion: "", lifecycleStatus: "unused", project: "NONE", roles: [], topics: [], conversationTypes: [], fixtureQuality: "empty", sampleFileCount: 0, notes: "", updatedAt: new Date(0).toISOString() }
};

describe("responsive inline controls", () => {
  it("allows project and status selects to shrink and truncate", () => {
    const status = renderToStaticMarkup(<InlineStatusSelect account={account} locale="de" onSaved={() => undefined} />);
    const project = renderToStaticMarkup(<InlineProjectSelect account={account} locale="de" onSaved={() => undefined} />);
    expect(status).toContain("min-w-0");
    expect(project).toContain("min-w-0");
    expect(status).not.toContain("min-w-32");
    expect(project).not.toContain("min-w-28");
  });
});
