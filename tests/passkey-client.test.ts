import { describe, expect, it, vi } from "vitest";
import { authenticateWithPasskey, registerBootstrapPasskey } from "../src/client/passkey-client.js";

describe("passkey browser client", () => {
  it("runs authentication options, browser assertion and verification in order", async () => {
    const calls: string[] = [];
    const api = vi.fn(async (path: string, init?: RequestInit) => {
      calls.push(path);
      if (path.endsWith("/options")) return { flowId: "flow", options: { challenge: "challenge" } };
      expect(JSON.parse(String(init?.body))).toEqual({ flowId: "flow", response: { id: "credential" } });
      return { verified: true };
    });
    const startAuthentication = vi.fn(async ({ optionsJSON }) => {
      expect(optionsJSON.challenge).toBe("challenge");
      return { id: "credential" };
    });
    await authenticateWithPasskey("frank@dreambau.com", { api, startAuthentication });
    expect(calls).toEqual(["/auth/passkeys/authentication/options", "/auth/passkeys/authentication/verify"]);
  });

  it("does not open the password manager when the account has no registered passkey", async () => {
    const api = vi.fn(async () => ({ flowId: "flow", options: { challenge: "challenge", allowCredentials: [] } }));
    const startAuthentication = vi.fn();

    await expect(authenticateWithPasskey("shazia@example.com", { api, startAuthentication }))
      .rejects.toThrow("passkey_not_registered");
    expect(startAuthentication).not.toHaveBeenCalled();
  });

  it("runs bootstrap registration options, browser creation and verification", async () => {
    const api = vi.fn(async (path: string, init?: RequestInit) => path.endsWith("/options")
      ? { flowId: "flow", options: { challenge: "register" } }
      : (expect(JSON.parse(String(init?.body))).toEqual({ flowId: "flow", response: { id: "new-credential" } }), { verified: true }));
    const startRegistration = vi.fn(async () => ({ id: "new-credential" }));
    await registerBootstrapPasskey({ api, startRegistration });
    expect(api).toHaveBeenCalledTimes(2);
  });
});
