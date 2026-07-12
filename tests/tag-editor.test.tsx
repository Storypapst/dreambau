import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TagEditor, addUniqueTag } from "../src/client/components/tag-editor.js";

describe("taxonomy tag editor", () => {
  it("adds trimmed unique values and ignores empty or duplicate input", () => {
    expect(addUniqueTag(["Admin"], "  Berater  ")).toEqual(["Admin", "Berater"]);
    expect(addUniqueTag(["Admin"], "Admin")).toEqual(["Admin"]);
    expect(addUniqueTag(["Admin"], "   ")).toEqual(["Admin"]);
  });

  it("renders localized values as removable pills instead of raw keys", () => {
    const html = renderToStaticMarkup(<TagEditor label="Themengebiete" values={["debt"]} formatOption={() => "Schulden"} tone="topic" onChange={() => undefined} />);
    expect(html).toContain("Schulden");
    expect(html).not.toContain(">debt<");
    expect(html).toContain("Neues Themengebiete-Tag");
  });
});
