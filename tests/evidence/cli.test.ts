import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createHash } from "node:crypto";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEvidenceConfig } from "../../src/evidence/config.js";
import { commentMarker } from "../../src/evidence/cli/comment.js";
import {
  contentTypeFor,
  detectKind,
  positionals,
  readFileChunk,
  runEvidenceCommand,
  type CliDependencies
} from "../../src/evidence/cli/index.js";
import { createProcessor } from "../../src/evidence/processing.js";
import { createEvidenceApp } from "../../src/evidence/server/app.js";
import { MemoryObjectStore } from "../../src/evidence/storage.js";
import { createEvidenceStore, type EvidenceStore } from "../../src/evidence/store.js";
import { makePng } from "./fixtures.js";

const token = "evidence-cli-token";
const headSha = "1111111111111111111111111111111111111111";

let server: Server;
let store: EvidenceStore;
let workingDirectory: string;
let comments: Array<{ id: number; body: string }>;
let stdout: string[];
let stderr: string[];

const listPullRequests = JSON.stringify([
  { number: 42, url: "https://github.com/OpenResilienceInitiative/ORISO-E2E/pull/42", state: "OPEN", headRefOid: headSha }
]);

function startGateway(): Promise<string> {
  store = createEvidenceStore(
    path.join(mkdtempSync(path.join(tmpdir(), "evidence-cli-")), "evidence.sqlite"),
    { publicBaseUrl: "https://evidence.dreambau.com" }
  );
  const objectStore = new MemoryObjectStore();
  let publicIds = 0;
  const { app } = createEvidenceApp({
    config: loadEvidenceConfig({ EVIDENCE_PUBLIC_BASE_URL: "https://evidence.dreambau.com" }),
    store,
    objectStore,
    processor: createProcessor({ store, objectStore, now: () => new Date("2026-07-22T09:00:00.000Z") }),
    createPublicId: () => { publicIds += 1; return String(publicIds).padStart(32, "a"); },
    machineIdentities: [{
      id: "evidence-m4-oriso",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      projects: ["oriso"],
      environments: ["pre-dev"],
      actions: ["evidence:upload", "evidence:publish", "evidence:read", "evidence:archive"],
      expiresAt: "2027-01-01T00:00:00.000Z",
      revokedAt: null
    }]
  });
  return new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`);
    });
  });
}

function dependencies(baseUrl: string, overrides: Partial<CliDependencies> = {}): CliDependencies {
  return {
    baseUrl,
    publicBaseUrl: "https://evidence.dreambau.com",
    identity: "evidence-m4-oriso",
    readKeychainToken: () => token,
    fetch,
    runCommand: (command, args) => {
      if (command === "git" && args[1] === "HEAD") return { code: 0, stdout: `${headSha}\n`, stderr: "" };
      if (command === "git") return { code: 0, stdout: "feat/pr-evidence\n", stderr: "" };
      if (command === "gh" && args[0] === "repo") {
        return { code: 0, stdout: "OpenResilienceInitiative/ORISO-E2E\n", stderr: "" };
      }
      if (command === "gh" && args[0] === "pr") return { code: 0, stdout: listPullRequests, stderr: "" };
      if (command === "gh" && args[0] === "auth") return { code: 0, stdout: "signed in\n", stderr: "" };
      return { code: 1, stdout: "", stderr: "unexpected" };
    },
    gh: (args, input) => {
      if (args[1] === "--paginate") {
        return {
          code: 0,
          stdout: comments
            .map((comment) => JSON.stringify({ ...comment, html_url: `https://github.com/a/b#issuecomment-${comment.id}` }))
            .join("\n"),
          stderr: ""
        };
      }
      const body = JSON.parse(String(input)).body as string;
      const method = args[args.indexOf("--method") + 1];
      if (method === "POST") {
        const created = { id: comments.length + 1, body };
        comments.push(created);
        return { code: 0, stdout: JSON.stringify({ ...created, html_url: `https://github.com/a/b#issuecomment-${created.id}` }), stderr: "" };
      }
      const id = Number(args.find((argument) => argument.includes("/comments/"))?.split("/").pop());
      const existing = comments.find((comment) => comment.id === id)!;
      existing.body = body;
      return { code: 0, stdout: JSON.stringify({ ...existing, html_url: `https://github.com/a/b#issuecomment-${id}` }), stderr: "" };
    },
    readChunk: readFileChunk,
    fileSize: (filePath) => statSync(filePath).size,
    write: (value) => { stdout.push(value); },
    writeError: (value) => { stderr.push(value); },
    ...overrides
  };
}

function writeScreenshot(name = "redirect.png", bytes = makePng()) {
  const filePath = path.join(workingDirectory, name);
  writeFileSync(filePath, bytes);
  return filePath;
}

const uploadArgs = (filePath: string, extra: string[] = []) => [
  "upload", filePath,
  "--project", "oriso",
  "--environment", "pre-dev",
  "--result", "PASS",
  "--source", "codex",
  "--title", "Invitation redirect verified",
  "--caption", "Redirect and landing page validated",
  ...extra
];

let baseUrl: string;

beforeEach(async () => {
  baseUrl = await startGateway();
  workingDirectory = mkdtempSync(path.join(tmpdir(), "evidence-cli-files-"));
  comments = [];
  stdout = [];
  stderr = [];
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  store.close();
});

describe("argument parsing", () => {
  it("separates positionals from options", () => {
    expect(positionals(uploadArgs("/tmp/a.png", ["--publish"]))).toEqual(["upload", "/tmp/a.png"]);
  });

  it("refuses an unknown option instead of ignoring it", () => {
    expect(() => positionals(["upload", "a.png", "--unknown", "x"])).toThrow(/unknown option/);
  });

  it("derives the evidence kind and content type from the filename", () => {
    expect(detectKind("redirect.png")).toBe("screenshot");
    expect(detectKind("flow.mp4")).toBe("video");
    expect(detectKind("run.log")).toBe("log");
    expect(detectKind("playwright-report.zip")).toBe("playwright-report");
    expect(detectKind("trace.zip")).toBe("trace");
    expect(contentTypeFor("redirect.PNG")).toBe("image/png");
    expect(contentTypeFor("unknown.bin")).toBe("application/octet-stream");
  });
});

describe("upload and publish", () => {
  it("uploads a screenshot, publishes it and writes the pull request comment", async () => {
    const filePath = writeScreenshot();
    const code = await runEvidenceCommand(uploadArgs(filePath, ["--publish"]), dependencies(baseUrl));

    expect(code).toBe(0);
    expect(comments).toHaveLength(1);
    const body = comments[0].body;
    expect(body).toContain("## Verification evidence");
    expect(body).toContain("| PASS | Pre-Dev | `1111111` | Codex |");
    expect(body).toMatch(/!\[Redirect and landing page validated\]\(https:\/\/evidence\.dreambau\.com\/e\//);
    expect(stdout.join("")).toContain("https://github.com/a/b#issuecomment-1");

    const [run] = store.listRuns({ state: "published" });
    expect(run.githubCommentUrl).toBe("https://github.com/a/b#issuecomment-1");
  });

  it("updates the same comment when the run is published again", async () => {
    const filePath = writeScreenshot();
    await runEvidenceCommand(uploadArgs(filePath, ["--publish"]), dependencies(baseUrl));
    const [run] = store.listRuns({ state: "published" });

    stdout = [];
    const code = await runEvidenceCommand(["publish", run.id], dependencies(baseUrl));
    expect(code).toBe(0);
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toContain(commentMarker(run.id));
    expect(stderr.join("")).toContain("updated the evidence comment");
  });

  it("adds a second comment for a different run on the same pull request", async () => {
    await runEvidenceCommand(uploadArgs(writeScreenshot("first.png"), ["--publish"]), dependencies(baseUrl));
    await runEvidenceCommand(
      uploadArgs(writeScreenshot("second.png", makePng({ text: "second" })), ["--publish"]),
      dependencies(baseUrl)
    );
    expect(comments).toHaveLength(2);
    expect(comments[0].body).not.toBe(comments[1].body);
  });

  it("uploads without publishing and prints the run id", async () => {
    const code = await runEvidenceCommand(uploadArgs(writeScreenshot()), dependencies(baseUrl));
    expect(code).toBe(0);
    expect(comments).toHaveLength(0);
    expect(store.listRuns({ state: "processing" })).toHaveLength(1);
    expect(stderr.join("")).toContain("publish with: dreambau-evidence publish");
  });
});

describe("refusals", () => {
  it("stops when the branch has no open pull request", async () => {
    const noPullRequests = dependencies(baseUrl, {
      runCommand: (command, args) => {
        if (command === "gh" && args[0] === "pr") return { code: 0, stdout: "[]", stderr: "" };
        return dependencies(baseUrl).runCommand(command, args);
      }
    });
    const code = await runEvidenceCommand(uploadArgs(writeScreenshot(), ["--publish"]), noPullRequests);
    expect(code).toBe(1);
    expect(stderr.join("")).toContain("--draft");
    expect(store.listRuns()).toHaveLength(0);
  });

  it("keeps a draft upload private when no pull request exists", async () => {
    const noPullRequests = dependencies(baseUrl, {
      runCommand: (command, args) => {
        if (command === "gh" && args[0] === "pr") return { code: 0, stdout: "[]", stderr: "" };
        return dependencies(baseUrl).runCommand(command, args);
      }
    });
    const code = await runEvidenceCommand(uploadArgs(writeScreenshot(), ["--draft"]), noPullRequests);
    expect(code).toBe(0);
    expect(comments).toHaveLength(0);
    expect(store.listRuns()[0].pullRequestNumber).toBeNull();
    expect(store.listFiles(store.listRuns()[0].id)[0].publicUrl).toBeNull();
  });

  it("refuses to upload against a pull request whose head has moved on", async () => {
    const moved = dependencies(baseUrl, {
      runCommand: (command, args) => {
        if (command === "gh" && args[0] === "pr") {
          return {
            code: 0,
            stdout: JSON.stringify([{ number: 42, url: "u", state: "OPEN", headRefOid: "2".repeat(40) }]),
            stderr: ""
          };
        }
        return dependencies(baseUrl).runCommand(command, args);
      }
    });
    const code = await runEvidenceCommand(uploadArgs(writeScreenshot(), ["--publish"]), moved);
    expect(code).toBe(1);
    expect(stderr.join("")).toContain("--allow-older-commit");
  });

  it("reports a quarantined file and writes no comment", async () => {
    const logPath = path.join(workingDirectory, "run.log");
    writeFileSync(logPath, "start\n-----BEGIN OPENSSH PRIVATE KEY-----\n");
    const code = await runEvidenceCommand([
      "upload", logPath, "--project", "oriso", "--environment", "pre-dev",
      "--result", "PASS", "--source", "codex", "--title", "Run log", "--publish"
    ], dependencies(baseUrl));

    expect(code).toBe(1);
    expect(stderr.join("")).toContain("quarantined");
    expect(comments).toHaveLength(0);
    expect(store.listRuns()[0].state).toBe("quarantined");
  });

  it("leaves the run unpublished when GitHub refuses the comment", async () => {
    const failingGitHub = dependencies(baseUrl, {
      gh: (args) => args[1] === "--paginate"
        ? { code: 0, stdout: "", stderr: "" }
        : { code: 1, stdout: "", stderr: "HTTP 403: Resource not accessible" }
    });
    const code = await runEvidenceCommand(uploadArgs(writeScreenshot(), ["--publish"]), failingGitHub);

    expect(code).toBe(1);
    expect(stderr.join("")).toContain("GitHub rejected the evidence comment");
    const [run] = store.listRuns();
    expect(run.state).not.toBe("published");
    expect(run.githubCommentUrl).toBeNull();
    // No public address exists for a run that never made it onto the PR.
    expect(store.listFiles(run.id).every((file) => file.publicUrl === null)).toBe(true);
  });

  it("publishes on a retry after GitHub recovers", async () => {
    const failingGitHub = dependencies(baseUrl, {
      gh: (args) => args[1] === "--paginate"
        ? { code: 0, stdout: "", stderr: "" }
        : { code: 1, stdout: "", stderr: "HTTP 403" }
    });
    await runEvidenceCommand(uploadArgs(writeScreenshot(), ["--publish"]), failingGitHub);
    const [run] = store.listRuns();

    const code = await runEvidenceCommand(["publish", run.id], dependencies(baseUrl));
    expect(code).toBe(0);
    expect(comments).toHaveLength(1);
    expect(store.getRun(run.id)?.state).toBe("published");
    expect(store.listFiles(run.id)[0].publicUrl).toContain("/e/");
  });

  it("explains a missing token instead of contacting the gateway", async () => {
    const code = await runEvidenceCommand(
      uploadArgs(writeScreenshot()),
      dependencies(baseUrl, { readKeychainToken: () => "" })
    );
    expect(code).toBe(1);
    expect(stderr.join("")).toContain("Keychain token missing");
  });

  it("explains a rejected token", async () => {
    const code = await runEvidenceCommand(
      uploadArgs(writeScreenshot()),
      dependencies(baseUrl, { readKeychainToken: () => "wrong-token" })
    );
    expect(code).toBe(1);
    expect(stderr.join("")).toContain("token was rejected");
  });

  it("names the missing options rather than failing obscurely", async () => {
    const code = await runEvidenceCommand(["upload", writeScreenshot()], dependencies(baseUrl));
    expect(code).toBe(1);
    expect(stderr.join("")).toContain("invalid options");
  });
});

describe("status, archive and doctor", () => {
  it("shows a run with its files and findings", async () => {
    await runEvidenceCommand(uploadArgs(writeScreenshot(), ["--publish"]), dependencies(baseUrl));
    const [run] = store.listRuns({ state: "published" });
    stdout = [];
    await runEvidenceCommand(["status", run.id], dependencies(baseUrl));
    const parsed = JSON.parse(stdout.join(""));
    expect(parsed).toMatchObject({ id: run.id, state: "published" });
    expect(parsed.files).toHaveLength(1);
  });

  it("archives a run and reports the new state", async () => {
    await runEvidenceCommand(uploadArgs(writeScreenshot(), ["--publish"]), dependencies(baseUrl));
    const [run] = store.listRuns({ state: "published" });
    stdout = [];
    await runEvidenceCommand(["archive", run.id], dependencies(baseUrl));
    expect(stdout.join("").trim()).toBe("archived");
    expect(store.listFiles(run.id)[0].publicUrl).toBeNull();
  });

  it("checks the local prerequisites without needing a run", async () => {
    const code = await runEvidenceCommand(["doctor"], dependencies(baseUrl));
    expect(code).toBe(0);
    const report = stdout.join("");
    expect(report).toContain("git repository");
    expect(report).toContain("gh authentication");
    expect(report).toContain("keychain token");
  });

  it("watches a folder, uploads a finished recording and publishes it", async () => {
    writeScreenshot("recording-still.png");
    const code = await runEvidenceCommand([
      "watch", workingDirectory,
      "--project", "oriso", "--environment", "pre-dev",
      "--result", "PASS", "--source", "obs",
      "--title", "Session recording",
      "--stable-seconds", "0",
      "--once"
    ], dependencies(baseUrl));

    expect(code).toBe(0);
    // It announces what it is about to attach before uploading anything.
    expect(stderr.join("")).toContain("pull request #42");
    expect(stderr.join("")).toContain("OpenResilienceInitiative/ORISO-E2E");
    const [run] = store.listRuns({ state: "published" });
    expect(run.title).toContain("recording-still.png");
    expect(comments).toHaveLength(1);
  }, 30_000);

  it("refuses to watch without a pull request unless it is a draft", async () => {
    const noPullRequests = dependencies(baseUrl, {
      runCommand: (command, args) => {
        if (command === "gh" && args[0] === "pr") return { code: 0, stdout: "[]", stderr: "" };
        return dependencies(baseUrl).runCommand(command, args);
      }
    });
    writeScreenshot("recording-still.png");
    const code = await runEvidenceCommand([
      "watch", workingDirectory, "--project", "oriso", "--environment", "pre-dev",
      "--result", "PASS", "--source", "obs", "--once"
    ], noPullRequests);
    expect(code).toBe(1);
    expect(stderr.join("")).toContain("--draft");
    expect(store.listRuns()).toHaveLength(0);
  });
});

describe("token handling", () => {
  it("never puts the token into an argument list", async () => {
    const gh = vi.fn(dependencies(baseUrl).gh);
    await runEvidenceCommand(uploadArgs(writeScreenshot(), ["--publish"]), dependencies(baseUrl, { gh }));
    for (const [args] of gh.mock.calls) {
      expect(args.join(" ")).not.toContain(token);
    }
  });
});

describe("findings raised by review", () => {
  it("rejects a --pr value that is not a number", async () => {
    const code = await runEvidenceCommand(
      uploadArgs(writeScreenshot(), ["--pr", "abc"]),
      dependencies(baseUrl)
    );
    expect(code).toBe(1);
    expect(stderr.join("")).toContain('--pr expects a pull request number, got "abc"');
  });

  it("reports an unreachable gateway in doctor instead of passing", async () => {
    const unreachable = dependencies("http://127.0.0.1:1/api/v1");
    const code = await runEvidenceCommand(["doctor"], unreachable);
    expect(code).toBe(1);
    expect(stdout.join("")).toMatch(/fail gateway|fail {2}gateway/);
  });

  it("reports a reachable gateway in doctor", async () => {
    const code = await runEvidenceCommand(["doctor"], dependencies(baseUrl));
    expect(code).toBe(0);
    expect(stdout.join("")).toContain("reachable");
  });

  it("fails doctor on an empty keychain entry rather than staying silent", async () => {
    const code = await runEvidenceCommand(
      ["doctor"],
      dependencies(baseUrl, { readKeychainToken: () => "" })
    );
    expect(code).toBe(1);
    expect(stdout.join("")).toContain("empty entry");
  });

  it("explains a gateway that answers with something other than JSON", async () => {
    const htmlFetch: typeof fetch = async () =>
      new Response("<html>gateway error</html>", { status: 502, headers: { "content-type": "text/html" } });
    const code = await runEvidenceCommand(
      uploadArgs(writeScreenshot()),
      dependencies(baseUrl, { fetch: htmlFetch })
    );
    expect(code).toBe(1);
    expect(stderr.join("")).toContain("non-JSON body");
  });
});
