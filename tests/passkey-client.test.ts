import { describe, expect, it, vi } from "vitest";
import { authenticateWithPasskey, onlyHybridTransports, registerBootstrapPasskey, registerPasskey } from "../src/client/passkey-client.js";

describe("passkey browser client", () => {
  it("runs authentication options, browser assertion and verification in order", async () => {
    const calls: string[] = [];
    const api = vi.fn(async (path: string, init?: RequestInit) => {
      calls.push(path);
      if (path.endsWith("/options")) return { flowId: "flow", options: { challenge: "challenge" } };
      expect(JSON.parse(String(init?.body))).toEqual({ flowId: "flow", response: { id: "credential" }, remember: false });
      return { verified: true };
    });
    const startAuthentication = vi.fn(async ({ optionsJSON }) => {
      expect(optionsJSON.challenge).toBe("challenge");
      return { id: "credential" };
    });
    await authenticateWithPasskey("frank@dreambau.com", { api, startAuthentication });
    expect(calls).toEqual(["/auth/passkeys/authentication/options", "/auth/passkeys/authentication/verify"]);
  });

  it("forwards the stay-signed-in choice to the verification request", async () => {
    const api = vi.fn(async (path: string, init?: RequestInit) => path.endsWith("/options")
      ? { flowId: "flow", options: { challenge: "challenge" } }
      : (expect(JSON.parse(String(init?.body))).toEqual({ flowId: "flow", response: { id: "credential" }, remember: true }), { verified: true, remember: true }));
    const startAuthentication = vi.fn(async () => ({ id: "credential" }));
    await authenticateWithPasskey("frank@dreambau.com", { api, startAuthentication }, { remember: true });
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("does not open the password manager when the account has no registered passkey", async () => {
    const api = vi.fn(async () => ({ flowId: "flow", options: { challenge: "challenge", allowCredentials: [] } }));
    const startAuthentication = vi.fn();

    await expect(authenticateWithPasskey("shazia@example.com", { api, startAuthentication }))
      .rejects.toThrow("passkey_not_registered");
    expect(startAuthentication).not.toHaveBeenCalled();
  });

  it("announces a hybrid-only passkey set before the ceremony and still runs it", async () => {
    const api = vi.fn(async (path: string) => path.endsWith("/options")
      ? { flowId: "flow", options: { challenge: "challenge", allowCredentials: [{ id: "a", transports: ["hybrid"] }, { id: "b", transports: ["hybrid"] }] } }
      : { verified: true });
    const order: string[] = [];
    const startAuthentication = vi.fn(async () => { order.push("ceremony"); return { id: "a" }; });
    await authenticateWithPasskey("frank@dreambau.com", { api, startAuthentication }, { onHybridOnly: () => order.push("hint") });
    expect(order).toEqual(["hint", "ceremony"]);
  });

  it("stays quiet when at least one passkey is usable on this device", async () => {
    expect(onlyHybridTransports([{ id: "a", transports: ["hybrid"] }, { id: "b", transports: ["internal", "hybrid"] }])).toBe(false);
    expect(onlyHybridTransports([{ id: "a", transports: [] }])).toBe(false);
    expect(onlyHybridTransports([])).toBe(false);
    expect(onlyHybridTransports([{ id: "a", transports: ["hybrid"] }])).toBe(true);
  });

  it("sends a trimmed passkey name only when one was given", async () => {
    const bodies: unknown[] = [];
    const api = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/options")) return { flowId: "flow", options: { challenge: "register" } };
      bodies.push(JSON.parse(String(init?.body)));
      return { verified: true };
    });
    const startRegistration = vi.fn(async () => ({ id: "new-credential" }));
    await registerPasskey({ api, startRegistration }, { name: "  MacBook Safari " });
    await registerPasskey({ api, startRegistration }, { name: "   " });
    expect(bodies).toEqual([
      { flowId: "flow", response: { id: "new-credential" }, name: "MacBook Safari" },
      { flowId: "flow", response: { id: "new-credential" } }
    ]);
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
