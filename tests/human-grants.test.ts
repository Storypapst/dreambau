import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createHumanGrantStore, migrateLegacyProjectGrants, ALL_TEST_ENVIRONMENTS } from "../src/server/human-grants.js";
import { createPasskeyStore } from "../src/server/passkey-store.js";

function freshDatabase() {
  const root = mkdtempSync(path.join(tmpdir(), "human-grants-"));
  const file = path.join(root, "auth.sqlite");
  const store = createPasskeyStore(file);
  return { file, store };
}

function grant(userId: string, project: "oriso" | "orimo" | "dreambau", source: "local" | "infisical") {
  return { userId, project, environments: [...ALL_TEST_ENVIRONMENTS], source, status: "active" as const };
}

describe("human project grants", () => {
  it("keeps local and Infisical grants for the same project as separate rows", () => {
    const { file, store } = freshDatabase();
    const user = store.createUser({ email: "dual@dreambau.com", name: "Dual", projects: ["oriso"] });
    const grants = createHumanGrantStore(new Database(file));

    grants.replaceLocal(user.id, [grant(user.id, "oriso", "local")]);
    grants.replaceInfisical(user.id, [grant(user.id, "oriso", "infisical")]);

    expect(grants.list(user.id)).toHaveLength(2);
    expect(new Set(grants.list(user.id).map((row) => row.source))).toEqual(new Set(["local", "infisical"]));
  });

  it("does not remove an active local grant when Infisical reports no membership", () => {
    const { file, store } = freshDatabase();
    const user = store.createUser({ email: "local-only@dreambau.com", name: "Local", projects: ["oriso"] });
    const grants = createHumanGrantStore(new Database(file));
    grants.replaceLocal(user.id, [grant(user.id, "oriso", "local")]);
    grants.replaceInfisical(user.id, [grant(user.id, "dreambau", "infisical")]);

    // This is the production incident: the sync runs, Infisical returns nothing,
    // and the employee must keep the grant an administrator gave them locally.
    grants.replaceInfisical(user.id, []);

    expect(grants.effective(user.id).map((row) => row.project)).toEqual(["oriso"]);
    expect(grants.list(user.id).filter((row) => row.source === "local")).toHaveLength(1);
  });

  it("returns a deduplicated union of both sources", () => {
    const { file, store } = freshDatabase();
    const user = store.createUser({ email: "union@dreambau.com", name: "Union", projects: ["oriso"] });
    const grants = createHumanGrantStore(new Database(file));

    grants.replaceLocal(user.id, [grant(user.id, "oriso", "local"), grant(user.id, "dreambau", "local")]);
    grants.replaceInfisical(user.id, [grant(user.id, "oriso", "infisical"), grant(user.id, "orimo", "infisical")]);

    expect(grants.effective(user.id).map((row) => row.project).sort()).toEqual(["dreambau", "orimo", "oriso"]);
  });

  it("keeps the other source active when one source is revoked", () => {
    const { file, store } = freshDatabase();
    const user = store.createUser({ email: "revoke@dreambau.com", name: "Revoke", projects: ["oriso"] });
    const grants = createHumanGrantStore(new Database(file));
    grants.replaceLocal(user.id, [grant(user.id, "oriso", "local")]);
    grants.replaceInfisical(user.id, [grant(user.id, "oriso", "infisical")]);

    grants.revoke(user.id, "local");

    expect(grants.effective(user.id).map((row) => row.project)).toEqual(["oriso"]);
    expect(grants.effective(user.id).every((row) => row.source === "infisical")).toBe(true);

    grants.revoke(user.id, "infisical");
    expect(grants.effective(user.id)).toEqual([]);
  });

  it("reports the union of environments when both sources grant the same project", () => {
    const { file, store } = freshDatabase();
    const user = store.createUser({ email: "envs@dreambau.com", name: "Envs", projects: ["oriso"] });
    const grants = createHumanGrantStore(new Database(file));

    grants.replaceLocal(user.id, [{ ...grant(user.id, "oriso", "local"), environments: ["local"] }]);
    grants.replaceInfisical(user.id, [{ ...grant(user.id, "oriso", "infisical"), environments: ["pre-dev"] }]);

    const effective = grants.effective(user.id);
    expect(effective).toHaveLength(1);
    expect(effective[0].environments.sort()).toEqual(["local", "pre-dev"]);
  });
});

describe("legacy project migration", () => {
  it("converts stored projects into active local grants exactly once", () => {
    const { file, store } = freshDatabase();
    const user = store.createUser({ email: "legacy@dreambau.com", name: "Legacy", projects: ["oriso", "dreambau"] });
    const sqlite = new Database(file);

    migrateLegacyProjectGrants(sqlite);
    migrateLegacyProjectGrants(sqlite);
    migrateLegacyProjectGrants(sqlite);

    const grants = createHumanGrantStore(sqlite);
    const local = grants.list(user.id).filter((row) => row.source === "local");
    expect(local.map((row) => row.project).sort()).toEqual(["dreambau", "oriso"]);
    expect(local).toHaveLength(2);
  });

  it("does not invent a grant for a user whose projects are already empty", () => {
    const { file, store } = freshDatabase();
    const user = store.createUser({ email: "empty@dreambau.com", name: "Empty", projects: ["oriso"] });
    const sqlite = new Database(file);
    sqlite.prepare("UPDATE human_users SET projects=? WHERE id=?").run("[]", user.id);

    migrateLegacyProjectGrants(sqlite);

    // The four live employees in this state are genuinely ungranted. Migration
    // must not paper over that by fabricating access.
    expect(createHumanGrantStore(sqlite).effective(user.id)).toEqual([]);
  });

  it("does not overwrite grants that already exist", () => {
    const { file, store } = freshDatabase();
    const user = store.createUser({ email: "existing@dreambau.com", name: "Existing", projects: ["oriso"] });
    const sqlite = new Database(file);
    const grants = createHumanGrantStore(sqlite);
    grants.replaceLocal(user.id, [{ ...grant(user.id, "oriso", "local"), environments: ["pre-dev"] }]);

    migrateLegacyProjectGrants(sqlite);

    const local = grants.list(user.id).filter((row) => row.source === "local");
    expect(local).toHaveLength(1);
    expect(local[0].environments).toEqual(["pre-dev"]);
  });
});
