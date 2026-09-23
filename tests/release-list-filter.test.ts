import { describe, expect, it } from "vitest";
import { filterItems } from "../src/client/components/release-list.js";
import type { ReleaseItem } from "../src/client/release-list-client.js";

const item = (overrides: Partial<ReleaseItem>): ReleaseItem => ({
  id: "i", listId: "l", parentId: null, position: 1, name: "", areas: [], description: "", crossReferences: "", crossReferenceIds: [],
  devStatus: null, functional: [], statusComment: "", notes: "", releaseNotes: "", completed: false, createdAt: "", createdBy: "", updatedAt: "", updatedBy: "",
  commentCount: 0, ...overrides
});

const items = [
  item({ id: "a", name: "Live chat queue", areas: ["chat"], devStatus: "built", functional: ["yes"] }),
  item({ id: "b", name: "Two-factor authentication", areas: ["auth", "chat"], devStatus: "unclear", functional: ["unclear", "adjust"], statusComment: "Does not work via email." }),
  item({ id: "c", name: "Unique persistent links", areas: ["chat"], devStatus: null })
];
const none = { query: "", areas: [], devStatus: [], functional: [] };

describe("release list filters", () => {
  it("searches names and status comments case-insensitively", () => {
    expect(filterItems(items, { ...none, query: "EMAIL" }).map((entry) => entry.id)).toEqual(["b"]);
  });

  it("matches any selected value within a field and requires every active field", () => {
    expect(filterItems(items, { ...none, functional: ["yes", "adjust"] }).map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(filterItems(items, { ...none, areas: ["chat"], devStatus: ["unclear"] }).map((entry) => entry.id)).toEqual(["b"]);
  });

  it("leaves items without a status out once a status filter is set", () => {
    expect(filterItems(items, { ...none, devStatus: ["built", "unclear"] }).map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});
