import Database from "better-sqlite3";
import { releaseTranslationSchema, ReleaseListStore } from "./release-list-store.js";

async function main() {
  const listIndex = process.argv.indexOf("--list");
  const listId = listIndex >= 0 ? process.argv[listIndex + 1] : undefined;
  if (!listId || !/^[a-z0-9-]{3,40}$/.test(listId)) {
    process.stderr.write("Usage: release-list-translation --list <id> < translations.json\n");
    process.exitCode = 2;
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const seed = releaseTranslationSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  const sqlite = new Database(process.env.TESTMAILS_DATABASE_PATH ?? "/data/testmails.sqlite");
  sqlite.pragma("journal_mode = WAL"); sqlite.pragma("foreign_keys = ON");
  try {
    const result = new ReleaseListStore(sqlite).importTranslations(listId, seed);
    process.stdout.write(`Translated ${result.items} items and ${result.options} options in ${listId}.\n`);
  } finally { sqlite.close(); }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Translation import failed"}\n`);
  process.exitCode = 1;
});
