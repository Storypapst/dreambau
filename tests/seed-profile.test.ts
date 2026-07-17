import { describe, expect, it } from "vitest";
import { parseSeedProfile, serializeDotenv } from "../src/server/seed-profile.js";

describe("seed profiles", () => {
  it("accepts a bounded map of uppercase environment variables", () => {
    expect(parseSeedProfile('{"BASE_URL":"https://pre-dev.example.test","TEST_ROLE":"consultant"}')).toEqual({
      BASE_URL: "https://pre-dev.example.test",
      TEST_ROLE: "consultant"
    });
  });

  it("rejects shell-shaped keys, nested data and oversized profiles", () => {
    expect(() => parseSeedProfile('{"BAD-KEY":"x"}')).toThrow(/seed profile/i);
    expect(() => parseSeedProfile('{"GOOD":{"nested":true}}')).toThrow(/seed profile/i);
    const oversized = Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`KEY_${index}`, "x"]));
    expect(() => parseSeedProfile(JSON.stringify(oversized))).toThrow(/seed profile/i);
  });

  it("serializes values as quoted dotenv without creating shell syntax", () => {
    expect(serializeDotenv({ SIMPLE: "value", DANGEROUS: "$(touch /tmp/nope)\nnext" })).toBe(
      "DANGEROUS='$(touch /tmp/nope)\\nnext'\nSIMPLE='value'\n"
    );
  });
});
