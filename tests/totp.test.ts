import { describe, expect, it } from "vitest";
import { generateOrisoTotp, generateTotp } from "../src/server/totp.js";

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

  it("uses ORISO's raw UTF-8 secret instead of Base32 decoding it", () => {
    expect(generateOrisoTotp("aBcDeFgHiJkLmNoPqRsTuVwXyZ123456", new Date(59_000), 8)).toEqual({
      code: "26269634",
      generatedAt: "1970-01-01T00:00:59.000Z",
      expiresAt: "1970-01-01T00:01:00.000Z"
    });
  });

  it("rejects secrets outside ORISO's 32-character alphanumeric contract", () => {
    expect(() => generateOrisoTotp("not-an-oriso-secret!", new Date())).toThrow(/ORISO/i);
  });
});
