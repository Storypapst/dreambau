import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SelectedTags } from "../src/client/components/selected-tags.js";

describe("selected taxonomy tags", () => {
  it("renders formatted values as colored pills with accessible remove actions", () => {
    const html = renderToStaticMarkup(<SelectedTags values={["debt", "pregnancy"]} formatOption={(value) => value === "debt" ? "Schulden" : "Schwangerschaft"} tone="topic" onRemove={vi.fn()} />);
    expect(html).toContain("Schulden");
    expect(html).toContain("Schwangerschaft");
    expect(html).toContain("tag-topic");
    expect(html).toContain('aria-label="Schulden entfernen"');
  });

  it("renders nothing for an empty selection", () => {
    expect(renderToStaticMarkup(<SelectedTags values={[]} formatOption={(value) => value} tone="role" />)).toBe("");
  });
});
