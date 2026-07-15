import { describe, expect, it, vi } from "vitest";
import {
  addCoordinationDiscussion,
  addCoordinationTag,
  loadCoordination
} from "../src/client/coordination-client.js";

describe("coordination client", () => {
  it("loads the scoped coordination catalog", async () => {
    const request = vi.fn(async () => ({ projects: [], items: [], resourceKinds: [] }));

    await loadCoordination(request);

    expect(request).toHaveBeenCalledWith("/coordination");
  });

  it("adds tags and discussion links through JSON API calls", async () => {
    const request = vi.fn(async () => ({ tags: ["quality-gate"], discussions: [] }));

    await addCoordinationTag("oriso-delivery", "quality-gate", request);
    await addCoordinationDiscussion(
      "oriso-delivery",
      { label: "Bugfix Channel", url: "https://sunflowercare.slack.com/archives/C0BHAEENLE7" },
      request
    );

    expect(request).toHaveBeenNthCalledWith(1, "/coordination/items/oriso-delivery/tags", {
      method: "POST",
      body: JSON.stringify({ tag: "quality-gate" })
    });
    expect(request).toHaveBeenNthCalledWith(2, "/coordination/items/oriso-delivery/discussions", {
      method: "POST",
      body: JSON.stringify({
        label: "Bugfix Channel",
        url: "https://sunflowercare.slack.com/archives/C0BHAEENLE7"
      })
    });
  });
});
