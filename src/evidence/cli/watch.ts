import { basename, join } from "node:path";

/**
 * Folder watching for OBS and Cap. A recorder writes a file over many seconds
 * and only then closes it, so the watcher waits for the size to stop moving
 * rather than reacting to the first write. Polling is deliberate: a filesystem
 * event tells you a write happened, not that the writer is finished.
 */

export interface WatchedFile {
  path: string;
  size: number;
  mtimeMs: number;
}

export type UploadOutcome =
  | { ok: true; publicUrl: string | null; runId: string }
  | { ok: false; message: string; retryable: boolean };

export interface WatchDependencies {
  listFiles(directory: string): string[];
  statFile(path: string): { size: number; mtimeMs: number } | null;
  now(): number;
  sleep(milliseconds: number): Promise<void>;
  upload(path: string): Promise<UploadOutcome>;
  loadState(): WatchState;
  saveState(state: WatchState): void;
  write(value: string): void;
  writeError(value: string): void;
}

export interface WatchState {
  /** Absolute paths already published, so a restart does not re-upload them. */
  done: string[];
  /** Paths whose upload failed; retried on later ticks. */
  failed: Record<string, string>;
}

export const emptyWatchState: WatchState = { done: [], failed: {} };

export interface WatchOptions {
  directory: string;
  /** How long a file's size must stay unchanged before it counts as finished. */
  stableMs: number;
  pollMs: number;
  /** Bounded so the command is testable and can be scripted; undefined = forever. */
  maxTicks?: number;
  extensions: string[];
}

export const defaultWatchOptions = {
  stableMs: 5_000,
  pollMs: 2_000,
  extensions: ["mp4", "mov", "webm", "m4v", "png", "jpg", "jpeg", "webp"]
};

const hasWatchedExtension = (path: string, extensions: string[]) =>
  extensions.includes(path.slice(path.lastIndexOf(".") + 1).toLowerCase());

/**
 * A recorder often writes to a temporary or partial name first. Anything that
 * looks unfinished is skipped until it is renamed.
 */
const looksPartial = (path: string) => /(\.part|\.tmp|\.crdownload|\.download|~)$/i.test(path)
  || basename(path).startsWith(".");

export function candidateFiles(directory: string, dependencies: WatchDependencies, extensions: string[]): WatchedFile[] {
  return dependencies.listFiles(directory)
    .map((name) => join(directory, name))
    .filter((path) => hasWatchedExtension(path, extensions) && !looksPartial(path))
    .flatMap((path) => {
      const stat = dependencies.statFile(path);
      return stat ? [{ path, size: stat.size, mtimeMs: stat.mtimeMs }] : [];
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

export async function runWatch(options: WatchOptions, dependencies: WatchDependencies): Promise<number> {
  const state = dependencies.loadState();
  const done = new Set(state.done);
  const failed = { ...state.failed };
  /** path -> {size, since}: when this size was first observed. */
  const settling = new Map<string, { size: number; since: number }>();
  let uploaded = 0;
  let ticks = 0;

  dependencies.writeError(`watching ${options.directory} for new recordings; stop with Ctrl-C\n`);

  for (;;) {
    for (const file of candidateFiles(options.directory, dependencies, options.extensions)) {
      if (done.has(file.path)) continue;

      const seen = settling.get(file.path);
      if (!seen || seen.size !== file.size) {
        // First sighting or still growing: anchor on the file's own last-write
        // time rather than on when this watcher happened to start. A recording
        // that finished ten minutes ago is finished, and a single `--once`
        // sweep has to be able to see that.
        settling.set(file.path, { size: file.size, since: Math.min(dependencies.now(), file.mtimeMs) });
      }
      const anchor = settling.get(file.path)!;
      if (dependencies.now() - anchor.since < options.stableMs) continue;
      if (file.size === 0) continue;

      dependencies.writeError(`${basename(file.path)}: settled at ${file.size} bytes, uploading\n`);
      const result = await dependencies.upload(file.path);
      if (result.ok) {
        done.add(file.path);
        delete failed[file.path];
        uploaded += 1;
        if (result.publicUrl) dependencies.write(`${result.publicUrl}\n`);
        else dependencies.write(`${result.runId}\n`);
      } else {
        // The file stays on disk and is tried again on a later tick, so a
        // gateway outage does not lose a recording.
        failed[file.path] = result.message;
        dependencies.writeError(`${basename(file.path)}: ${result.message}\n`);
        if (!result.retryable) done.add(file.path);
        settling.delete(file.path);
      }
      dependencies.saveState({ done: [...done], failed });
    }

    ticks += 1;
    if (options.maxTicks !== undefined && ticks >= options.maxTicks) break;
    await dependencies.sleep(options.pollMs);
  }

  const outstanding = Object.keys(failed).length;
  if (outstanding > 0) {
    dependencies.writeError(`${outstanding} recording(s) still pending; they stay on disk and are retried\n`);
  }
  dependencies.writeError(`uploaded ${uploaded} recording(s)\n`);
  return outstanding > 0 ? 1 : 0;
}
