import { loadEvidenceConfig } from "../config.js";
import { createS3ObjectStore, MemoryObjectStore, type ObjectStore } from "../storage.js";
import { createEvidenceApp } from "./app.js";

async function main() {
  const config = loadEvidenceConfig();
  if (!config.storage && process.env.NODE_ENV === "production") {
    // In-memory storage silently loses every upload on restart, which is the
    // one failure mode evidence must never have.
    throw new Error("EVIDENCE_STORAGE=minio is required in production");
  }
  const objectStore: ObjectStore = config.storage
    ? await createS3ObjectStore(config.storage)
    : new MemoryObjectStore();
  if (!config.storage) {
    console.warn("EVIDENCE_STORAGE is not set to minio; running with in-memory object storage");
  }
  const { app } = createEvidenceApp({ config, objectStore });
  const port = Number(process.env.PORT ?? 3100);
  app.listen(port, "0.0.0.0", () => console.log(`evidence gateway listening on ${port}`));
}

void main();
