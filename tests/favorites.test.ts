import { describe, expect, it } from "vitest";
import { coerceFavorites, toggleFavorite } from "../src/client/favorites.js";

describe("favorite accounts", () => {
  it("keeps only unique, non-empty addresses from the server value", () => {
    expect(coerceFavorites(["a@oriso.org", "a@oriso.org", "", 7, null, "b@dreambau.com"])).toEqual(["a@oriso.org", "b@dreambau.com"]);
    expect(coerceFavorites(null)).toEqual([]);
    expect(coerceFavorites({ value: 1 })).toEqual([]);
  });

  it("adds and removes an address without touching the others", () => {
    expect(toggleFavorite(["a@oriso.org"], "b@oriso.org")).toEqual(["a@oriso.org", "b@oriso.org"]);
    expect(toggleFavorite(["a@oriso.org", "b@oriso.org"], "a@oriso.org")).toEqual(["b@oriso.org"]);
  });
});
