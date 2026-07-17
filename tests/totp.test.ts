import { describe, expect, it } from "vitest";
import { generateTotp } from "../src/server/totp.js";

describe("TOTP", () => {
  it("matches the RFC 6238 SHA-1 test vector", () => {
    expect(generateTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", new Date(59_000), 8)).toEqual({
      code: "94287082",
      generatedAt: "1970-01-01T00:00:59.000Z",
      expiresAt: "1970-01-01T00:01:00.000Z"
    });
  });

  it("rejects malformed Base32 instead of producing a weak code", () => {
    expect(() => generateTotp("not-a-base32-secret!", new Date())).toThrow(/base32/i);
  });
});
