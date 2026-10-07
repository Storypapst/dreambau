// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  coerceFilters,
  countActiveFilters,
  domainList,
  toggleDomain,
  initialFilters,
  loadLastFilters,
  parseFilters,
  readFiltersFromLocation,
  saveLastFilters,
  serializeFilters,
  writeFiltersToLocation,
  type FilterState
} from "../src/client/filter-state.js";

const busy: FilterState = {
  query: "marge", domain: "oriso.org", status: "active", quality: "gold", project: "ORISO",
  versionAfter: "2.1", roles: ["consultant", "admin"], topics: ["debt"], conversations: ["chat"]
};

describe("filter state serialization", () => {
  it("round-trips every filter through URL parameters", () => {
    expect(parseFilters(serializeFilters(busy))).toEqual(busy);
    expect(serializeFilters(busy).toString()).toBe("q=marge&domain=oriso.org&status=active&quality=gold&project=ORISO&after=2.1&roles=consultant%2Cadmin&topics=debt&conversations=chat");
  });

  it("leaves defaults out of the URL and reads an empty query as the defaults", () => {
    expect(serializeFilters(DEFAULT_FILTERS).toString()).toBe("");
    expect(parseFilters(new URLSearchParams(""))).toEqual(DEFAULT_FILTERS);
  });

  it("drops unknown enum values instead of trusting the URL", () => {
    const parsed = parseFilters(new URLSearchParams("status=hacked&project=NOPE&domain=evil.example&roles=a,,a,%20b%20"));
    expect(parsed.status).toBe("all");
    expect(parsed.project).toBe("all");
    expect(parsed.domain).toBe("all");
    expect(parsed.roles).toEqual(["a", "b"]);
  });

  it("counts active filters", () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
    expect(countActiveFilters(busy)).toBe(9);
    expect(countActiveFilters({ ...DEFAULT_FILTERS, query: "x", roles: ["r"] })).toBe(2);
  });

  it("coerces loosely typed input such as a stored preset", () => {
    expect(coerceFilters({ query: 1, status: "archived", roles: ["a", 2, "b"], topics: "not-a-list" })).toEqual({
      ...DEFAULT_FILTERS, status: "archived", roles: ["a", "b"], topics: ["not-a-list"]
    });
    expect(coerceFilters(null)).toEqual(DEFAULT_FILTERS);
  });
});

describe("filter persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/testmails/");
  });

  it("remembers the last non-default state and forgets a reset", () => {
    saveLastFilters(busy);
    expect(loadLastFilters()).toEqual(busy);
    saveLastFilters(DEFAULT_FILTERS);
    expect(loadLastFilters()).toBeNull();
  });

  it("survives corrupted storage", () => {
    localStorage.setItem("testmails-filters", "{not json");
    expect(loadLastFilters()).toBeNull();
  });

  it("mirrors the state into the address bar and reads it back", () => {
    expect(readFiltersFromLocation()).toBeNull();
    writeFiltersToLocation(busy);
    expect(window.location.search).toBe(`?${serializeFilters(busy).toString()}`);
    expect(readFiltersFromLocation()).toEqual(busy);
    writeFiltersToLocation(DEFAULT_FILTERS);
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/testmails/");
  });

  it("prefers the URL over the remembered state over the defaults", () => {
    expect(initialFilters()).toEqual(DEFAULT_FILTERS);
    saveLastFilters({ ...DEFAULT_FILTERS, query: "remembered" });
    expect(initialFilters().query).toBe("remembered");
    window.history.replaceState(null, "", "/testmails/?q=from-url");
    expect(initialFilters().query).toBe("from-url");
  });

  it("keeps several domains in list order and drops unknown ones", () => {
    const parsed = parseFilters(new URLSearchParams("domain=oriso.org,nope.example,dreambau.com,oriso.org"));
    expect(parsed.domain).toBe("dreambau.com,oriso.org");
    expect(domainList(parsed.domain)).toEqual(["dreambau.com", "oriso.org"]);
    expect(parseFilters(new URLSearchParams("domain=nope.example")).domain).toBe("all");
    expect(parseFilters(new URLSearchParams("domain=oriso.org")).domain).toBe("oriso.org");
    expect(countActiveFilters({ ...DEFAULT_FILTERS, domain: "dreambau.com,oriso.org" })).toBe(1);
  });

  it("toggles single domains and treats an empty selection as all", () => {
    expect(toggleDomain("all", "oriso.org")).toBe("oriso.org");
    expect(toggleDomain("oriso.org", "trail.ist")).toBe("oriso.org,trail.ist");
    expect(toggleDomain("oriso.org,trail.ist", "oriso.org")).toBe("trail.ist");
    expect(toggleDomain("trail.ist", "trail.ist")).toBe("all");
    expect(toggleDomain("oriso.org", "all")).toBe("all");
  });

  it("still reads a preset saved with one domain", () => {
    expect(coerceFilters({ domain: "oriso.org", status: "active" }).domain).toBe("oriso.org");
  });
});
