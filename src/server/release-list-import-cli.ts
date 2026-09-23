import Database from "better-sqlite3";
import { ReleaseListError, ReleaseListStore, releaseSeedSchema } from "./release-list-store.js";

// The list content is team data and stays out of this public repository: it is
// piped in on stdin on the server, e.g.
//   docker exec -i <container> node dist/server/release-list-import-cli.js --list obp-2-1 --project oriso < seed.json
async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const listId = argument("list");
  const project = argument("project");
  if (!listId || !/^[a-z0-9-]{3,40}$/.test(listId) || !project) {
    process.stderr.write("Usage: release-list-import --list <id> --project <oriso|orimo|dreambau> [--replace] < seed.json\n");
    process.exitCode = 2;
    return;
  }
  const seed = releaseSeedSchema.parse(JSON.parse(await readStdin()));
  const sqlite = new Database(process.env.TESTMAILS_DATABASE_PATH ?? "/data/testmails.sqlite");
  sqlite.pragma("journal_mode = WAL"); sqlite.pragma("foreign_keys = ON");
  try {
    const result = new ReleaseListStore(sqlite).importSeed(listId, project, seed, { replace: process.argv.includes("--replace") });
    process.stdout.write(`Imported ${result.items} items into ${listId} (${project}).\n`);
  } catch (error) {
    if (error instanceof ReleaseListError && error.code === "list_exists") {
      process.stderr.write(`List ${listId} already exists. Pass --replace to overwrite it, which discards every edit made since.\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    sqlite.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Release list import failed"}\n`);
  process.exitCode = 1;
});
