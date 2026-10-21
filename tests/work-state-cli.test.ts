import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import {
  workStateFixture,
  fixturePull,
  seedPulls,
} from "./helpers/work-state-fixture.js";
import { hashMachineToken } from "../src/server/machine-access.js";
import {
  runWorkStateCli,
  inspectCheckout,
} from "../src/server/work-state/cli.js";
const cleanup: Array<() => void> = [];
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((f) => f()),
);
const cp = {
  expectedVersion: 1,
  goal: "Continue",
  branch: "feature",
  commit: "abc",
  lastVerifiedAction: "Read tests",
  nextAction: "Inspect PR",
  blockers: [],
  evidenceLinks: [],
};
async function setup() {
  const token = "dedicated-work-state-test-only";
  const f = workStateFixture({
    machineIdentities: [
      {
        id: "work-cli",
        tokenHash: hashMachineToken(token),
        projects: ["oriso"],
        environments: ["local"],
        actions: ["work-state:read", "work-state:checkpoint"],
        expiresAt: "2099-01-01T00:00:00Z",
        revokedAt: null,
      },
    ],
  });
  cleanup.push(f.close);
  f.store.setRepositoryGrant({
    project: "oriso",
    actorId: "work-cli",
    repositoryId: "A",
    allowed: true,
  });
  seedPulls(f.store, [fixturePull()]);
  const server = f.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  cleanup.push(() => server.close());
  const address = server.address() as { port: number };
  let output = "",
    error = "";
  return {
    ...f,
    token,
    read: () => ({ output, error }),
    clear: () => {
      output = "";
      error = "";
    },
    deps: {
      identity: "work-cli",
      baseUrl: `http://127.0.0.1:${address.port}/work-state/api/v1`,
      readKeychainToken: () => token,
      fetch,
      write: (v: string) => {
        output += v;
      },
      writeError: (v: string) => {
        error += v;
      },
    },
  };
}
it("supports help and rejects invalid commands before reading credentials", async () => {
  let reads = 0,
    output = "";
  const deps = {
    identity: "",
    baseUrl: "https://dreambau.com/work-state/api/v1",
    readKeychainToken: () => {
      reads++;
      throw Error("no");
    },
    fetch,
    write: (s: string) => {
      output += s;
    },
    writeError: () => {},
  };
  expect(await runWorkStateCli(["--help"], deps)).toBe(0);
  expect(output).toContain("resume");
  expect(await runWorkStateCli(["attention", "--limit", "26"], deps)).toBe(1);
  expect(reads).toBe(0);
});
it("uses the real scoped machine HTTP surface for ten small stored queries", async () => {
  const f = await setup();
  for (let n = 0; n < 10; n++) {
    f.clear();
    expect(
      await runWorkStateCli(
        ["attention", "--project", "oriso", "--limit", "25"],
        f.deps,
      ),
    ).toBe(0);
    expect(Buffer.byteLength(f.read().output)).toBeLessThanOrEqual(12289);
    expect(JSON.parse(f.read().output).items[0].number).toBe(1);
    expect(f.read().output).not.toContain(f.token);
  }
  console.log(
    "D repeated CLI summaries:10 real HTTP reads; lastBytes=" +
      Buffer.byteLength(f.read().output),
  );
});
it("reports failed writes and confirms an idempotent checkpoint by readback", async () => {
  const f = await setup(),
    i = f.store.createWorkItem(f.scope, {
      goal: "Continue",
      links: [{ repositoryId: "A", kind: "pull", number: 1 }],
    });
  const dir = mkdtempSync(join(tmpdir(), "work-cli-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "checkpoint.json");
  writeFileSync(file, JSON.stringify(cp));
  const args = [
    "checkpoint",
    i.id,
    "--input",
    file,
    "--idempotency-key",
    "same-key",
  ];
  expect(await runWorkStateCli(args, f.deps)).toBe(0);
  expect(JSON.parse(f.read().output).version).toBe(2);
  f.clear();
  expect(await runWorkStateCli(args, f.deps)).toBe(0);
  expect(f.store.getWorkItem(f.scope, i.id).history).toHaveLength(2);
  f.clear();
  expect(
    await runWorkStateCli([...args.slice(0, -1), "other-key"], f.deps),
  ).toBe(1);
  expect(f.read().error).toContain("409");
  expect(f.read().output).toBe("");
});
it("surfaces denied context as an error without secret response bodies", async () => {
  const f = await setup();
  expect(await runWorkStateCli(["resume", "forbidden"], f.deps)).toBe(1);
  expect(f.read().output).toBe("");
  expect(f.read().error).toContain("403");
  expect(f.read().error).not.toContain(f.token);
});
it("inspects a real checkout without changing branch, commit or uncommitted work", () => {
  const dir = mkdtempSync(join(tmpdir(), "work-resume-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "feature");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  writeFileSync(join(dir, "a.txt"), "saved");
  git("add", "a.txt");
  git("commit", "-qm", "fixture");
  git(
    "remote",
    "add",
    "origin",
    "git@github.com:OpenResilienceInitiative/repoA.git",
  );
  const head = git("rev-parse", "HEAD");
  writeFileSync(join(dir, "a.txt"), "unsaved");
  const result = inspectCheckout(dir, {
    branch: "feature",
    commit: head,
    pulls: [{ repository: "OpenResilienceInitiative/repoA" }],
  });
  expect(result.branch).toBe("feature");
  expect(result.commit).toBe(head);
  expect(result.dirty).toBe(true);
  expect(result.matches.repository).toBe(true);
  expect(git("status", "--porcelain")).toContain("a.txt");
  expect(git("rev-parse", "HEAD")).toBe(head);
});

it("continues in a fresh process using saved context and measures the actual dirty checkout", async () => {
  const f = await setup(),
    dir = mkdtempSync(join(tmpdir(), "work-cold-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "feature");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  writeFileSync(join(dir, "a"), "saved");
  git("add", "a");
  git("commit", "-qm", "fixture");
  git(
    "remote",
    "add",
    "origin",
    "https://github.com/OpenResilienceInitiative/repoA.git",
  );
  const head = git("rev-parse", "HEAD");
  writeFileSync(join(dir, "a"), "unsaved");
  const i = f.store.createWorkItem(f.scope, {
    goal: "Cold resume",
    links: [{ repositoryId: "A", kind: "pull", number: 1 }],
  });
  f.store.writeCheckpoint(f.scope, i.id, { ...cp, commit: head });
  const program = `import {runWorkStateCli} from './src/server/work-state/cli.ts';let input='';for await(const part of process.stdin)input+=part;const p=JSON.parse(input);process.exitCode=await runWorkStateCli(p.args,{identity:'work-cli',baseUrl:p.baseUrl,readKeychainToken:()=>p.token,fetch,write:s=>process.stdout.write(s),writeError:s=>process.stderr.write(s)});`;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", program],
    { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] },
  );
  let out = "",
    err = "";
  child.stdout.on("data", (b) => (out += b));
  child.stderr.on("data", (b) => (err += b));
  const done = once(child, "close");
  child.stdin.end(
    JSON.stringify({
      args: ["resume", i.id, "--checkout", dir],
      baseUrl: f.deps.baseUrl,
      token: f.token,
    }),
  );
  expect((await done)[0], err).toBe(0);
  const result = JSON.parse(out);
  expect(result.context.nextAction).toBe("Inspect PR");
  expect(result.checkout.matches).toEqual({
    repository: true,
    branch: true,
    commit: true,
  });
  expect(result.checkout.dirty).toBe(true);
  expect(git("status", "--porcelain")).toContain("a");
});

it.each([
  "https://evilgithub.com/OpenResilienceInitiative/repoA.git",
  "git@notgithub.com:OpenResilienceInitiative/repoA.git",
  "https://example.test/github.com/OpenResilienceInitiative/repoA.git",
])("does not verify a lookalike origin %s", (remote) => {
  const dir = mkdtempSync(join(tmpdir(), "work-origin-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "feature");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  writeFileSync(join(dir, "a"), "saved");
  git("add", "a");
  git("commit", "-qm", "fixture");
  git("remote", "add", "origin", remote);
  const result = inspectCheckout(dir, {
    branch: "feature",
    commit: git("rev-parse", "HEAD"),
    pulls: [{ repository: "OpenResilienceInitiative/repoA" }],
  });
  expect(result.matches.repository).not.toBe(true);
  expect(result.requiresInspection).toBe(true);
});
