import { loadEvidenceConfig } from "../config.js";
import { probePublicLinks, runIntegrityCheck, runRetention } from "../retention.js";
import { createS3ObjectStore, MemoryObjectStore, type ObjectStore } from "../storage.js";
import { createEvidenceStore } from "../store.js";

/**
 * The CronJob entrypoint. Retention and the integrity sweep run here rather
 * than inside the gateway, so a long sweep can never compete with an upload for
 * the request path.
 *
 * Everything it prints is a count or an identifier — never a caption, a
 * repository name or anything else that belongs to a run.
 */

const usage = `usage: node dist/evidence/server/maintenance.js <retention|integrity|probe|all> [--verify-digests]`;

async function main(): Promise<number> {
  const command = process.argv[2] ?? "all";
  if (!["retention", "integrity", "probe", "all"].includes(command)) {
    console.error(usage);
    return 1;
  }
  const config = loadEvidenceConfig();
  const objectStore: ObjectStore = config.storage
    ? await createS3ObjectStore(config.storage)
    : new MemoryObjectStore();
  if (!config.storage) {
    console.error("EVIDENCE_STORAGE is not set to minio; refusing to run maintenance against in-memory storage");
    return 1;
  }
  const store = createEvidenceStore(config.databasePath, { publicBaseUrl: config.publicBaseUrl });
  let failures = 0;

  try {
    if (command === "retention" || command === "all") {
      const report = await runRetention({
        store,
        objectStore,
        draftRetentionDays: config.draftRetentionDays,
        originalVideoRetentionDays: config.originalVideoRetentionDays
      });
      console.log(`retention: expired ${report.expiredDrafts.length} draft run(s), `
        + `pruned ${report.prunedVideoOriginals.length} video original(s), `
        + `removed ${report.removedObjects} object(s), storage now ${report.storageBytes} bytes`);
    }

    if (command === "integrity" || command === "all") {
      const report = await runIntegrityCheck({
        store,
        objectStore,
        verifyDigests: process.argv.includes("--verify-digests")
      });
      console.log(`integrity: checked ${report.checked} published file(s), ${report.findings.length} finding(s)`);
      for (const finding of report.findings) {
        console.error(`integrity finding: ${finding.problem} for file ${finding.fileId} in run ${finding.runId}`);
      }
      failures += report.findings.length;
    }

    if (command === "probe" || command === "all") {
      const report = await probePublicLinks({ store, publicBaseUrl: config.publicBaseUrl, fetch });
      console.log(`probe: ${report.probed} published run(s), ${report.failures.length} unreachable`);
      for (const publicId of report.failures) console.error(`probe failure: ${publicId}`);
      failures += report.failures.length;
    }
  } finally {
    store.close();
  }

  // A non-zero exit is what makes the CronJob show up as failed, which is the
  // signal an alert is built on.
  return failures > 0 ? 1 : 0;
}

main().then(
  (code) => { process.exitCode = code; },
  (error) => {
    console.error(`maintenance failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
);
