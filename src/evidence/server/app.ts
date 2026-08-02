import express from "express";
import { loadMachineIdentities, type MachineIdentity } from "../../server/machine-access.js";
import { loadEvidenceConfig, type EvidenceConfig } from "../config.js";
import { createProcessor, type Processor } from "../processing.js";
import { MemoryObjectStore, type ObjectStore } from "../storage.js";
import { createEvidenceStore, type EvidenceStore } from "../store.js";
import { createEvidenceRouter } from "./router.js";
import { createEvidenceViewer } from "./viewer.js";
import { metrics } from "../metrics.js";
import { createFfmpegVideoProcessor, type VideoProcessor } from "../media.js";
import { spawnMediaTool } from "./media-runner.js";

export interface EvidenceAppOptions {
  config?: EvidenceConfig;
  store?: EvidenceStore;
  objectStore?: ObjectStore;
  processor?: Processor;
  video?: VideoProcessor;
  machineIdentities?: MachineIdentity[];
  machineIdentityLoader?: () => MachineIdentity[];
  now?: () => Date;
  createRunId?: () => string;
  createFileId?: () => string;
  createPublicId?: () => string;
}

export interface EvidenceApp {
  app: express.Express;
  store: EvidenceStore;
  objectStore: ObjectStore;
  processor: Processor;
  config: EvidenceConfig;
}

export function createEvidenceApp(options: EvidenceAppOptions = {}): EvidenceApp {
  const config = options.config ?? loadEvidenceConfig();
  const store = options.store ?? createEvidenceStore(config.databasePath, { publicBaseUrl: config.publicBaseUrl });
  const objectStore = options.objectStore ?? new MemoryObjectStore();
  const processor = options.processor ?? createProcessor({
    store,
    objectStore,
    video: options.video ?? createFfmpegVideoProcessor({ run: spawnMediaTool }),
    now: options.now
  });

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  // Health endpoints answer before authentication and expose status only.
  app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
  app.get("/health/ready", async (_req, res) => {
    try {
      // A point read, not a table scan: this is polled every few seconds.
      store.schemaVersion();
      await objectStore.head("health/ready");
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });

  // The public viewer is mounted before the API so a run page never sees a
  // JSON body parser, and it deliberately has no session or cookie middleware
  // anywhere in front of it.
  app.use(createEvidenceViewer({ store, objectStore }));

  // Scraped by SigNoz. Counts and durations only: no run, repository or file
  // ever appears as a label, so this stays safe to expose inside the cluster.
  app.get("/metrics", (_req, res) => {
    metrics.setGauge("evidence_storage_bytes", store.totalBytes());
    res.type("text/plain; version=0.0.4; charset=utf-8").send(metrics.render());
  });

  app.use("/api/v1", express.json({ limit: "256kb" }), createEvidenceRouter({
    store,
    objectStore,
    processor,
    identities: options.machineIdentityLoader
      ?? (options.machineIdentities ? () => options.machineIdentities! : () => loadMachineIdentities(config.machineIdentitiesPath)),
    now: options.now,
    createRunId: options.createRunId,
    createFileId: options.createFileId,
    createPublicId: options.createPublicId
  }));

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // Body-parser failures are the caller's problem and must not read as an
    // outage; anything else is reported without detail so nothing leaks.
    const type = (error as { type?: string }).type;
    if (type === "entity.too.large") return res.status(413).json({ error: "payload_too_large" });
    if (type === "entity.parse.failed" || type === "encoding.unsupported") {
      return res.status(400).json({ error: "invalid_body" });
    }
    // The client is told nothing, but an unexplained 500 must leave a trail.
    console.error("evidence gateway error:", error instanceof Error ? error.stack ?? error.message : error);
    return res.status(500).json({ error: "internal_error" });
  });

  return { app, store, objectStore, processor, config };
}
