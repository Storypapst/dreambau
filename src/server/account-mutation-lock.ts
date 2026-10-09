import { createHash } from "node:crypto";
import { mkdir, rmdir } from "node:fs/promises";

// All writers on this single-host Testmails deployment share the data volume.
// A crashed owner leaves the lock in place: recovery requires operator review.
export async function acquireAccountMutationLock(databasePath: string, key: string): Promise<(() => Promise<void>) | null> {
  if (databasePath === ":memory:") return async () => {};
  const directory = `${databasePath}.account-locks`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = `${directory}/${createHash("sha256").update(key).digest("hex")}`;
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return null;
    throw error;
  }
  return async () => { await rmdir(lock); };
}
