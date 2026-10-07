// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MetadataEditor } from "../src/client/components/metadata-editor.js";
import type { AccountView } from "../src/client/types.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const account: AccountView = {
  displayName: "Ned Flanders",
  email: "ned.flanders@dreambau.de",
  password: "mailbox-password",
  domain: "dreambau.de",
  imap: "mail.dreambau.com:993",
  smtp: "mail.dreambau.com:465",
  jmap: "https://box.dreambau.com/.well-known/jmap",
  caldav: "https://box.dreambau.com/dav/cal/",
  carddav: "https://box.dreambau.com/dav/card/",
  encryption: { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false },
  metadata: {
    email: "ned.flanders@dreambau.de",
    shippedVersion: "2.03",
    lifecycleStatus: "active",
    project: "ORISO",
    roles: ["Träger"],
    topics: [],
    conversationTypes: [],
    fixtureQuality: "empty",
    sampleFileCount: 0,
    notes: "",
    updatedAt: "2026-08-13T00:00:00.000Z"
  }
};

describe("MetadataEditor", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.querySelectorAll("[data-slot=sheet-portal]").forEach((node) => node.remove());
    container.remove();
  });

  it("places the save action before the first editable field", async () => {
    await act(async () => root.render(
      <MetadataEditor
        account={account}
        taxonomies={{ roles: ["Träger"], topics: [], conversationTypes: [] }}
        locale="de"
        open
        onOpenChange={() => undefined}
        onSaved={() => undefined}
      />
    ));

    const form = document.querySelector("[data-slot=sheet-content] form");
    const saveButton = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
    const firstField = form?.querySelector<HTMLInputElement>("#version");

    expect(form).not.toBeNull();
    expect(saveButton).not.toBeNull();
    expect(firstField).not.toBeNull();
    expect(saveButton?.compareDocumentPosition(firstField!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
