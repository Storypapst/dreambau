import { describe, expect, it } from "vitest";
import {
  candidateFiles,
  defaultWatchOptions,
  emptyWatchState,
  runWatch,
  type UploadOutcome,
  type WatchDependencies,
  type WatchState
} from "../../src/evidence/cli/watch.js";

interface FakeFile {
  size: number;
  mtimeMs: number;
}

/**
 * A recorder that grows a file across ticks and only then stops, which is the
 * behaviour the watcher has to wait out.
 */
function harness(files: Record<string, FakeFile>, upload?: (path: string) => Promise<UploadOutcome>) {
  let clock = 0;
  let saved: WatchState = emptyWatchState;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const uploaded: string[] = [];

  const dependencies: WatchDependencies = {
    listFiles: () => Object.keys(files).map((path) => path.replace(/^\/rec\//, "")),
    statFile: (path) => files[path] ?? null,
    now: () => clock,
    sleep: async (milliseconds) => { clock += milliseconds; },
    upload: upload ?? (async (path) => {
      uploaded.push(path);
      return { ok: true, publicUrl: `https://evidence.dreambau.com/e/x/y/${path.split("/").pop()}`, runId: "run-1" };
    }),
    loadState: () => saved,
    saveState: (state) => { saved = state; },
    write: (value) => { stdout.push(value); },
    writeError: (value) => { stderr.push(value); }
  };
  return {
    dependencies,
    uploaded,
    stdout: () => stdout.join(""),
    stderr: () => stderr.join(""),
    state: () => saved,
    advance: (milliseconds: number) => { clock += milliseconds; },
    setSize: (path: string, size: number) => { files[path] = { size, mtimeMs: clock }; }
  };
}

const options = {
  directory: "/rec",
  stableMs: 5_000,
  pollMs: 2_000,
  extensions: defaultWatchOptions.extensions
};

describe("candidateFiles", () => {
  it("ignores partial and hidden names a recorder leaves behind", () => {
    const value = harness({
      "/rec/flow.mp4": { size: 10, mtimeMs: 0 },
      "/rec/flow.mp4.part": { size: 10, mtimeMs: 0 },
      "/rec/.hidden.mp4": { size: 10, mtimeMs: 0 },
      "/rec/notes.txt": { size: 10, mtimeMs: 0 }
    });
    expect(candidateFiles("/rec", value.dependencies, defaultWatchOptions.extensions).map((file) => file.path))
      .toEqual(["/rec/flow.mp4"]);
  });

  it("accepts the recording and screenshot formats OBS and Cap produce", () => {
    const value = harness({
      "/rec/a.mov": { size: 1, mtimeMs: 0 },
      "/rec/b.webm": { size: 1, mtimeMs: 0 },
      "/rec/c.png": { size: 1, mtimeMs: 0 }
    });
    expect(candidateFiles("/rec", value.dependencies, defaultWatchOptions.extensions)).toHaveLength(3);
  });
});

describe("runWatch", () => {
  it("does not upload on the sweep that first sees a file", async () => {
    const value = harness({ "/rec/flow.mp4": { size: 4_096, mtimeMs: 0 } });
    // One sweep only: the size has been observed once, so the stability window
    // has not even started.
    const code = await runWatch({ ...options, maxTicks: 1 }, value.dependencies);
    expect(value.uploaded).toEqual([]);
    expect(code).toBe(0);
  });

  it("uploads once the size has been stable for the whole window", async () => {
    const value = harness({ "/rec/flow.mp4": { size: 4_096, mtimeMs: 0 } });
    await runWatch({ ...options, maxTicks: 5 }, value.dependencies);
    expect(value.uploaded).toEqual(["/rec/flow.mp4"]);
    expect(value.stdout()).toContain("https://evidence.dreambau.com/e/x/y/flow.mp4");
  });

  it("does not upload a file that is still growing", async () => {
    const files: Record<string, FakeFile> = { "/rec/flow.mp4": { size: 1_000, mtimeMs: 0 } };
    let clock = 0;
    const value = harness(files, async (path) => {
      value.uploaded.push(path);
      return { ok: true, publicUrl: null, runId: "run-1" };
    });
    const original = value.dependencies.sleep;
    value.dependencies.sleep = async (milliseconds) => {
      clock += milliseconds;
      // A real filesystem stamps a fresh mtime on every write, which is what
      // tells the watcher the recorder is still going.
      files["/rec/flow.mp4"] = { size: files["/rec/flow.mp4"].size + 1_000, mtimeMs: clock };
      await original(milliseconds);
    };
    await runWatch({ ...options, maxTicks: 8 }, value.dependencies);
    expect(value.uploaded).toEqual([]);
  });

  it("uploads a recording that was already finished before it started", async () => {
    // mtime well in the past: the recorder closed this file long ago, so a
    // single sweep is enough.
    const value = harness({ "/rec/earlier.mp4": { size: 4_096, mtimeMs: -600_000 } });
    const code = await runWatch({ ...options, maxTicks: 1 }, value.dependencies);
    expect(value.uploaded).toEqual(["/rec/earlier.mp4"]);
    expect(code).toBe(0);
  });

  it("skips an empty file", async () => {
    const value = harness({ "/rec/flow.mp4": { size: 0, mtimeMs: 0 } });
    await runWatch({ ...options, maxTicks: 6 }, value.dependencies);
    expect(value.uploaded).toEqual([]);
  });

  it("never uploads the same recording twice, even across restarts", async () => {
    const files = { "/rec/flow.mp4": { size: 4_096, mtimeMs: 0 } };
    const first = harness(files);
    await runWatch({ ...options, maxTicks: 5 }, first.dependencies);
    expect(first.uploaded).toEqual(["/rec/flow.mp4"]);

    const carried = first.state();
    const second = harness(files);
    second.dependencies.loadState = () => carried;
    await runWatch({ ...options, maxTicks: 5 }, second.dependencies);
    expect(second.uploaded).toEqual([]);
  });

  it("keeps a failed recording pending and retries it", async () => {
    let attempts = 0;
    const value = harness({ "/rec/flow.mp4": { size: 4_096, mtimeMs: 0 } }, async (path) => {
      attempts += 1;
      if (attempts === 1) return { ok: false, message: "could not reach the evidence gateway", retryable: true };
      return { ok: true, publicUrl: "https://evidence.dreambau.com/e/a/b/flow.mp4", runId: "run-2" };
    });
    const code = await runWatch({ ...options, maxTicks: 12 }, value.dependencies);
    expect(attempts).toBeGreaterThanOrEqual(2);
    expect(code).toBe(0);
    expect(value.state().failed).toEqual({});
  });

  it("stops retrying a recording the gateway quarantined", async () => {
    let attempts = 0;
    const value = harness({ "/rec/flow.mp4": { size: 4_096, mtimeMs: 0 } }, async () => {
      attempts += 1;
      return { ok: false, message: "flow.mp4 was quarantined (secret:private_key_block)", retryable: false };
    });
    const code = await runWatch({ ...options, maxTicks: 12 }, value.dependencies);
    expect(attempts).toBe(1);
    expect(code).toBe(1);
    expect(value.stderr()).toContain("quarantined");
    expect(Object.keys(value.state().failed)).toEqual(["/rec/flow.mp4"]);
  });

  it("reports how many recordings are still pending when it stops", async () => {
    const value = harness({ "/rec/flow.mp4": { size: 4_096, mtimeMs: 0 } }, async () => ({
      ok: false, message: "gateway timeout", retryable: true
    }));
    const code = await runWatch({ ...options, maxTicks: 6 }, value.dependencies);
    expect(code).toBe(1);
    expect(value.stderr()).toContain("still pending");
  });

  it("picks up a recording that appears after it started", async () => {
    const files: Record<string, FakeFile> = {};
    const value = harness(files);
    const original = value.dependencies.sleep;
    let tick = 0;
    value.dependencies.sleep = async (milliseconds) => {
      tick += 1;
      if (tick === 2) files["/rec/late.mp4"] = { size: 2_048, mtimeMs: 0 };
      await original(milliseconds);
    };
    await runWatch({ ...options, maxTicks: 10 }, value.dependencies);
    expect(value.uploaded).toEqual(["/rec/late.mp4"]);
  });
});
