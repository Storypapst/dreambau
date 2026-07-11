import { afterEach, describe, expect, it, vi } from "vitest";
import { saveMetadataPatch } from "../src/client/components/inline-metadata-controls.js";

afterEach(() => vi.unstubAllGlobals());

describe("inline metadata persistence", () => {
  it("patches only the selected metadata field for the encoded mailbox", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ email: "homer.simpson@dreambau.com", project: "ORISO" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await saveMetadataPatch("homer.simpson@dreambau.com", { project: "ORISO" });

    expect(fetchMock).toHaveBeenCalledWith("/testmails/api/accounts/homer.simpson%40dreambau.com", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ project: "ORISO" })
    }));
  });

  it("surfaces API errors so the caller can roll back optimistic state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "validation_failed" }), { status: 400, headers: { "Content-Type": "application/json" } })));
    await expect(saveMetadataPatch("bart.simpson@dreambau.com", { project: "UNKNOWN" as never })).rejects.toThrow("validation_failed");
  });
});
