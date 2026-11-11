import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { WorkspaceAccountLinks } from "../src/server/workspace-account-links.js";

it("keeps an explicit evidence account link without secrets and normalizes email", () => {
  const sqlite = new Database(":memory:");
  try {
    const links = new WorkspaceAccountLinks(sqlite);
    links.attach("proof", "oriso", "dev", " Simone.DeBeauvoir@ORISO.org ", "viewer", "2026-11-11T12:00:00Z");
    expect(links.forRun("proof")).toEqual([{ runId: "proof", project: "oriso", environment: "dev",
      email: "simone.debeauvoir@oriso.org", actorId: "viewer", createdAt: "2026-11-11T12:00:00Z" }]);
    expect(links.forEmail("SIMONE.DEBEAUVOIR@oriso.org")).toHaveLength(1);
    links.detach("proof", "simone.debeauvoir@oriso.org");
    expect(links.forRun("proof")).toEqual([]);
    expect((sqlite.prepare("SELECT action,actor_id FROM workspace_account_link_events ORDER BY id").all()))
      .toEqual([{ action: "attached", actor_id: "viewer" }, { action: "detached", actor_id: "system" }]);
  } finally { sqlite.close(); }
});
