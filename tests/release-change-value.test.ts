import { describe, expect, it } from "vitest";
import { releaseChangeValue } from "../src/client/release-change-value.js";

const option = (id: string) => id === "OptDev" ? "Auf Dev" : id;
const label = (field: string) => field === "description" ? "Beschreibung" : field === "releaseNotes" ? "Release-Notizen" : field;
describe("release change history", () => {
  it("shows each changed German field and its text instead of an object placeholder", () => {
    expect(releaseChangeValue(JSON.stringify({ description: "Korrigierter Text", releaseNotes: "Neue Hinweise" }), "translations", option, label))
      .toBe("Beschreibung: Korrigierter Text; Release-Notizen: Neue Hinweise");
  });
  it("keeps option labels and text readable", () => {
    expect(releaseChangeValue('["OptDev"]', "areas", option, label)).toBe("Auf Dev");
    expect(releaseChangeValue('"Text"', "notes", option, label)).toBe("Text");
    expect(releaseChangeValue("OptDev", "devStatus", option, label)).toBe("Auf Dev");
  });
});

it("shows only changed translated fields, so unchanged descriptions do not hide new release notes", () => {
  const previous = { name: "Feature", description: "Existing description ".repeat(20) };
  expect(releaseChangeValue(JSON.stringify({ ...previous, releaseNotes: "New note" }), "translations", (id) => id, (field) => field, JSON.stringify(previous))).toBe("releaseNotes: New note");
});
