import express from "express";
import { z } from "zod";
import {
  authenticateMachineToken,
  machineCan,
  type MachineAction,
  type MachineIdentity
} from "../../server/machine-access.js";
import { createFileId, createPublicId, createRunId } from "../ids.js";
import {
  createRunInputSchema,
  githubReferenceSchema,
  initFileInputSchema,
  publishInputSchema,
  InvalidRunTransitionError,
  type EvidenceRun
} from "../model.js";
import type { Processor } from "../processing.js";
import { metrics } from "../metrics.js";
import { multipartChunkSize, preflightUpload } from "../security.js";
import { objectKey, type ObjectStore } from "../storage.js";
import type { EvidenceStore } from "../store.js";

/**
 * `head` carries the first bytes of the payload so magic-byte checks run before
 * the bucket sees anything. It is a transport detail and never stored.
 */
const initFileRequestSchema = initFileInputSchema.extend({
  head: z.string().max(16_384).optional()
});

const publishRequestSchema = publishInputSchema.extend({
  stage: z.enum(["prepare", "commit"]).default("commit"),
  githubCommentUrl: githubReferenceSchema.shape.githubCommentUrl.optional()
});

export interface EvidenceRouterOptions {
  store: EvidenceStore;
  objectStore: ObjectStore;
  processor: Processor;
  identities: () => MachineIdentity[];
  now?: () => Date;
  createRunId?: () => string;
  createFileId?: () => string;
  createPublicId?: () => string;
}

const bearer = (header: string | undefined) =>
  header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

export function createEvidenceRouter(options: EvidenceRouterOptions) {
  const router = express.Router();
  const now = () => (options.now?.() ?? new Date()).toISOString();
  const newRunId = options.createRunId ?? createRunId;
  const newFileId = options.createFileId ?? createFileId;
  const newPublicId = options.createPublicId ?? createPublicId;

  router.use((req, res, next) => {
    const identity = authenticateMachineToken(bearer(req.header("authorization")), options.identities(), options.now?.());
    if (!identity) return res.status(401).json({ error: "unauthenticated" });
    res.locals.machineIdentity = identity;
    next();
  });

  const identityOf = (res: express.Response) => res.locals.machineIdentity as MachineIdentity;
  const denied = (res: express.Response, action: MachineAction) => {
    if (machineCan(identityOf(res), action)) return false;
    res.status(403).json({ error: "action_denied" });
    return true;
  };

  /**
   * A run is only visible to identities scoped to both its project and its
   * environment. Checking the project alone would let a `pre-dev` identity read
   * and publish a `dev` run of the same project.
   */
  const runFor = (req: express.Request, res: express.Response): EvidenceRun | null => {
    const identity = identityOf(res);
    const run = options.store.getRun(String(req.params.runId));
    if (!run || !identity.projects.includes(run.project) || !identity.environments.includes(run.environment)) {
      res.status(404).json({ error: "run_not_found" });
      return null;
    }
    return run;
  };

  const invalid = (res: express.Response, error: unknown, code: string) => {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: code, fieldErrors: z.flattenError(error).fieldErrors });
    }
    throw error;
  };

  router.post("/runs", (req, res) => {
    if (denied(res, "evidence:upload")) return;
    const identity = identityOf(res);
    try {
      const input = createRunInputSchema.parse(req.body);
      if (!identity.projects.includes(input.project) || !identity.environments.includes(input.environment)) {
        return res.status(403).json({ error: "scope_denied" });
      }
      const at = now();
      const run = options.store.createRun(input, newRunId(), identity.id, at);
      options.store.appendEvent(run.id, "run_created", identity.id, at, { source: input.source });
      return res.status(201).json(run);
    } catch (error) {
      return invalid(res, error, "invalid_run");
    }
  });

  router.get("/runs/:runId", (req, res) => {
    if (denied(res, "evidence:read")) return;
    const run = runFor(req, res);
    if (!run) return;
    const files = options.store.listFiles(run.id).map((file) => ({
      ...file,
      receivedParts: options.store.listParts(file.id).map((part) => part.partNumber)
    }));
    return res.json({ ...run, files, findings: options.store.listFindings(run.id) });
  });

  router.post("/runs/:runId/files/init", async (req, res, next) => {
    if (denied(res, "evidence:upload")) return;
    const run = runFor(req, res);
    if (!run) return;
    if (run.state !== "draft" && run.state !== "processing") {
      return res.status(409).json({ error: "run_not_open" });
    }
    try {
      const { head: headBase64, ...input } = initFileRequestSchema.parse(req.body);
      const duplicate = options.store.findFileBySha(run.id, input.sha256);
      if (duplicate) return res.status(200).json({ file: duplicate, deduplicated: true });

      const head = headBase64 ? Buffer.from(headBase64, "base64") : Buffer.alloc(0);
      const preflight = preflightUpload({
        kind: input.kind,
        filename: input.filename,
        contentType: input.contentType,
        byteSize: input.byteSize,
        head,
        runBytesAlreadyStored: options.store.storedBytes(run.id)
      });
      if (!preflight.ok) {
        const at = now();
        options.store.addFindings(
          preflight.reasons.map((rule) => ({ runId: run.id, fileId: null, rule: `preflight:${rule}`, location: input.filename })),
          at
        );
        options.store.appendEvent(run.id, "upload_rejected", identityOf(res).id, at, { reasons: preflight.reasons });
        return res.status(422).json({ error: "upload_rejected", reasons: preflight.reasons });
      }

      const fileId = newFileId();
      const key = objectKey(run.id, fileId, "original");
      const expectedParts = Math.max(1, Math.ceil(input.byteSize / multipartChunkSize));
      const uploadId = await options.objectStore.createMultipartUpload(key, preflight.contentType);
      const file = options.store.createFile(run.id, fileId, {
        ...input,
        contentType: preflight.contentType,
        partSize: multipartChunkSize,
        expectedParts,
        uploadId
      }, now());
      return res.status(201).json({ file, partSize: multipartChunkSize, expectedParts, receivedParts: [] });
    } catch (error) {
      if (error instanceof z.ZodError) return invalid(res, error, "invalid_file");
      return next(error);
    }
  });

  router.put(
    "/runs/:runId/files/:fileId/parts/:partNumber",
    express.raw({ type: "application/octet-stream", limit: multipartChunkSize + 1024 }),
    async (req, res, next) => {
      if (denied(res, "evidence:upload")) return;
      const run = runFor(req, res);
      if (!run) return;
      const file = options.store.getFile(String(req.params.fileId));
      if (!file || file.runId !== run.id) return res.status(404).json({ error: "file_not_found" });
      const partNumber = Number(req.params.partNumber);
      if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
        return res.status(400).json({ error: "invalid_part_number" });
      }
      const uploadId = options.store.uploadIdFor(file.id);
      if (!uploadId) return res.status(409).json({ error: "upload_already_completed" });
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (body.length === 0) return res.status(400).json({ error: "empty_part" });
      try {
        const part = await options.objectStore.uploadPart(objectKey(run.id, file.id, "original"), uploadId, partNumber, body);
        options.store.recordPart(file.id, part, now());
        return res.json({ partNumber, byteSize: part.byteSize });
      } catch (error) {
        return next(error);
      }
    }
  );

  router.post("/runs/:runId/files/:fileId/complete", async (req, res, next) => {
    if (denied(res, "evidence:upload")) return;
    const run = runFor(req, res);
    if (!run) return;
    // A published, quarantined or archived run must not gain another file.
    if (run.state !== "draft" && run.state !== "processing") {
      return res.status(409).json({ error: "run_not_open" });
    }
    const file = options.store.getFile(String(req.params.fileId));
    if (!file || file.runId !== run.id) return res.status(404).json({ error: "file_not_found" });
    const uploadId = options.store.uploadIdFor(file.id);
    if (!uploadId) return res.status(409).json({ error: "upload_already_completed" });
    const parts = options.store.listParts(file.id);
    const received = parts.reduce((total, part) => total + part.byteSize, 0);
    if (received !== file.byteSize) {
      // Nothing more is coming for a size that can no longer add up, so the
      // multipart upload is abandoned instead of being left open in MinIO.
      await options.objectStore.abortMultipartUpload(objectKey(run.id, file.id, "original"), uploadId).catch(() => undefined);
      options.store.clearUploadId(file.id);
      return res.status(409).json({ error: "upload_incomplete", receivedBytes: received, expectedBytes: file.byteSize });
    }
    try {
      await options.objectStore.completeMultipartUpload(objectKey(run.id, file.id, "original"), uploadId, parts);
      // The upload id is dead once MinIO has completed it; keeping it would let
      // a later part upload address an upload that no longer exists.
      options.store.clearUploadId(file.id);
      options.store.completeFile(file.id, now());
      if (run.state === "draft") options.store.transitionRun(run.id, "processing", now());
      const result = await options.processor.processFile(file.id);
      const status = result.state === "ready" ? 200 : 422;
      return res.status(status).json({
        file: options.store.getFile(file.id),
        state: result.state,
        findings: result.findings.map((entry) => ({ rule: entry.rule, location: entry.location }))
      });
    } catch (error) {
      return next(error);
    }
  });

  /**
   * Two stages so a public address never exists before the pull request records
   * it. `prepare` fixes the public id and shows the addresses a publication
   * would create without exposing anything; `commit` flips the run to
   * `published` and stores the comment url in the same step. If GitHub fails in
   * between, the run stays unpublished and can simply be published again.
   */
  router.post("/runs/:runId/publish", (req, res) => {
    if (denied(res, "evidence:publish")) return;
    const run = runFor(req, res);
    if (!run) return;
    try {
      const { stage, githubCommentUrl, ...input } = publishRequestSchema.parse(req.body);
      if (input.repository !== run.repository) {
        metrics.increment("evidence_publish_failures_total", { reason: "repository_mismatch" });
        return res.status(409).json({ error: "repository_mismatch" });
      }
      if (input.commitSha.toLowerCase() !== run.commitSha.toLowerCase()) {
        metrics.increment("evidence_publish_failures_total", { reason: "commit_mismatch" });
        return res.status(409).json({ error: "commit_mismatch" });
      }
      const files = options.store.listFiles(run.id);
      if (files.length === 0) return res.status(409).json({ error: "no_evidence_files" });
      if (files.some((file) => file.processingState === "rejected") || run.state === "quarantined") {
        metrics.increment("evidence_publish_failures_total", { reason: "quarantined" });
        return res.status(409).json({ error: "run_quarantined", findings: options.store.listFindings(run.id) });
      }
      if (files.some((file) => file.processingState !== "ready")) {
        metrics.increment("evidence_publish_failures_total", { reason: "incomplete" });
        return res.status(409).json({ error: "processing_incomplete" });
      }

      if (stage === "prepare") {
        const reserved = options.store.reservePublicId(run.id, run.publicId ?? newPublicId());
        return res.json({ ...reserved, stage, files: options.store.previewFiles(run.id) });
      }

      const at = now();
      const published = options.store.publishRun(run.id, run.publicId ?? newPublicId(), input, at);
      if (githubCommentUrl) options.store.setGithubCommentUrl(run.id, githubCommentUrl);
      options.store.appendEvent(run.id, "run_published", identityOf(res).id, at, { publicId: published.publicId });
      return res.json({
        ...options.store.getRun(run.id)!,
        stage,
        files: options.store.listFiles(run.id)
      });
    } catch (error) {
      if (error instanceof InvalidRunTransitionError) return res.status(409).json({ error: "invalid_transition" });
      return invalid(res, error, "invalid_publish");
    }
  });

  router.patch("/runs/:runId/github-reference", (req, res) => {
    if (denied(res, "evidence:publish")) return;
    const run = runFor(req, res);
    if (!run) return;
    try {
      const { githubCommentUrl } = githubReferenceSchema.parse(req.body);
      const updated = options.store.setGithubCommentUrl(run.id, githubCommentUrl);
      options.store.appendEvent(run.id, "github_comment_linked", identityOf(res).id, now(), {});
      return res.json(updated);
    } catch (error) {
      return invalid(res, error, "invalid_github_reference");
    }
  });

  router.post("/runs/:runId/archive", (req, res) => {
    if (denied(res, "evidence:archive")) return;
    const run = runFor(req, res);
    if (!run) return;
    try {
      const at = now();
      const archived = options.store.archiveRun(run.id, at);
      options.store.appendEvent(run.id, "run_archived", identityOf(res).id, at, {});
      return res.json(archived);
    } catch (error) {
      if (error instanceof InvalidRunTransitionError) return res.status(409).json({ error: "invalid_transition" });
      throw error;
    }
  });

  return router;
}
