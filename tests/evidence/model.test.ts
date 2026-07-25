import { describe, expect, it } from "vitest";
import {
  assertRunTransition,
  createRunInputSchema,
  githubReferenceSchema,
  initFileInputSchema,
  InvalidRunTransitionError,
  isPubliclyReachable,
  publishInputSchema,
  pullRequestUrl
} from "../../src/evidence/model.js";
import { createPublicId, isPublicId, publicIdEntropyBits, publicIdLength } from "../../src/evidence/ids.js";

const validRun = {
  project: "oriso",
  repository: "OpenResilienceInitiative/ORISO-Frontend",
  pullRequestNumber: 553,
  commitSha: "abc1234",
  environment: "pre-dev",
  title: "Invitation redirect verified",
  result: "PASS",
  source: "codex"
};

describe("createRunInputSchema", () => {
  it("accepts a complete run", () => {
    expect(createRunInputSchema.parse(validRun)).toMatchObject({ project: "oriso", pullRequestNumber: 553 });
  });

  it("defaults a missing pull request to null rather than guessing", () => {
    const { pullRequestNumber: _omitted, ...withoutPr } = validRun;
    expect(createRunInputSchema.parse(withoutPr).pullRequestNumber).toBeNull();
  });

  it("rejects a repository that is not owner/repo", () => {
    for (const repository of ["ORISO-Frontend", "https://github.com/a/b", "a/b/c"]) {
      expect(() => createRunInputSchema.parse({ ...validRun, repository }), repository).toThrow();
    }
  });

  it("rejects a commit that is not hexadecimal", () => {
    expect(() => createRunInputSchema.parse({ ...validRun, commitSha: "not-a-sha" })).toThrow();
  });

  it("rejects unknown enum values and unknown fields", () => {
    expect(() => createRunInputSchema.parse({ ...validRun, environment: "staging" })).toThrow();
    expect(() => createRunInputSchema.parse({ ...validRun, secret: "value" })).toThrow();
  });

  it("rejects control characters in the title", () => {
    expect(() => createRunInputSchema.parse({ ...validRun, title: `bad${String.fromCharCode(7)}title` })).toThrow();
  });
});

describe("initFileInputSchema", () => {
  const validFile = {
    kind: "screenshot",
    filename: "redirect.png",
    caption: "Redirect and landing page validated",
    contentType: "image/png",
    byteSize: 2048,
    sha256: "a".repeat(64)
  };

  it("accepts a complete file", () => {
    expect(initFileInputSchema.parse(validFile)).toMatchObject({ kind: "screenshot" });
  });

  it("requires a full sha256 digest", () => {
    expect(() => initFileInputSchema.parse({ ...validFile, sha256: "abc" })).toThrow();
  });

  it("rejects a byte size above the largest permitted upload", () => {
    expect(() => initFileInputSchema.parse({ ...validFile, byteSize: 3 * 1024 * 1024 * 1024 })).toThrow();
  });

  it("accepts a primary actor without any password material", () => {
    const parsed = initFileInputSchema.parse({
      ...validFile,
      primaryActor: {
        accountId: "oriso/pre-dev/e2e-consultant",
        username: "brave_otter",
        syntheticEmail: "brave.otter@oriso.org",
        role: "consultant"
      }
    });
    expect(parsed.primaryActor?.username).toBe("brave_otter");
  });

  it("rejects an actor carrying extra fields such as a password", () => {
    expect(() => initFileInputSchema.parse({
      ...validFile,
      primaryActor: {
        accountId: "a", username: "b", syntheticEmail: "b@oriso.org", role: "c", password: "hunter2"
      }
    })).toThrow();
  });
});

describe("publish and reference contracts", () => {
  it("requires repository, pull request and commit to publish", () => {
    expect(publishInputSchema.parse({
      repository: "OpenResilienceInitiative/ORISO-E2E",
      pullRequestNumber: 12,
      commitSha: "deadbee"
    })).toMatchObject({ pullRequestNumber: 12 });
    expect(() => publishInputSchema.parse({ repository: "a/b", commitSha: "deadbee" })).toThrow();
  });

  it("only accepts a github.com comment url", () => {
    expect(githubReferenceSchema.parse({
      githubCommentUrl: "https://github.com/a/b/pull/1#issuecomment-2"
    })).toBeTruthy();
    expect(() => githubReferenceSchema.parse({ githubCommentUrl: "https://evil.example/comment" })).toThrow();
  });

  it("derives the pull request url from repository and number", () => {
    expect(pullRequestUrl("a/b", 7)).toBe("https://github.com/a/b/pull/7");
    expect(pullRequestUrl("a/b", null)).toBeNull();
  });
});

describe("run state machine", () => {
  it("allows the documented transitions", () => {
    expect(() => assertRunTransition("draft", "processing")).not.toThrow();
    expect(() => assertRunTransition("processing", "published")).not.toThrow();
    expect(() => assertRunTransition("processing", "quarantined")).not.toThrow();
    expect(() => assertRunTransition("published", "archived")).not.toThrow();
    expect(() => assertRunTransition("quarantined", "archived")).not.toThrow();
  });

  it("refuses to publish a quarantined or archived run", () => {
    expect(() => assertRunTransition("quarantined", "published")).toThrow(InvalidRunTransitionError);
    expect(() => assertRunTransition("archived", "published")).toThrow(InvalidRunTransitionError);
    expect(() => assertRunTransition("draft", "published")).toThrow(InvalidRunTransitionError);
  });

  it("treats only published runs as publicly reachable", () => {
    expect(isPubliclyReachable("published")).toBe(true);
    for (const state of ["draft", "processing", "quarantined", "archived"] as const) {
      expect(isPubliclyReachable(state), state).toBe(false);
    }
  });
});

describe("public identifiers", () => {
  it("carries at least 128 bits of entropy", () => {
    expect(publicIdEntropyBits).toBeGreaterThanOrEqual(128);
  });

  it("produces ids of the documented shape", () => {
    const value = createPublicId();
    expect(value).toHaveLength(publicIdLength);
    expect(isPublicId(value)).toBe(true);
  });

  it("does not repeat and is not derived from anything guessable", () => {
    const values = new Set(Array.from({ length: 500 }, () => createPublicId()));
    expect(values.size).toBe(500);
  });

  it("uses every symbol of the alphabet without modulo bias", () => {
    const counts = new Map<string, number>();
    for (let byte = 0; byte < 256; byte += 1) {
      const value = createPublicId(() => Buffer.alloc(publicIdLength, byte));
      counts.set(value[0], (counts.get(value[0]) ?? 0) + 1);
    }
    expect(counts.size).toBe(32);
    expect([...counts.values()].every((count) => count === 8)).toBe(true);
  });

  it("rejects identifiers that are not in the alphabet", () => {
    expect(isPublicId("l".repeat(publicIdLength))).toBe(false);
    expect(isPublicId("abc")).toBe(false);
  });
});
