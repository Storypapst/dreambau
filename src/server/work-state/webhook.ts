import { createHmac, timingSafeEqual } from "node:crypto";
import express from "express";
import { z } from "zod";
import { WorkStateError } from "./model.js";
import type { WorkStateStore } from "./store.js";
export function createDeliveryAcceptor(store: WorkStateStore, secret: string) {
  if (secret.length < 32) throw new Error("webhook_secret_too_short");
  return async function acceptDelivery(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
  ): Promise<string> {
    const signature = headers["x-hub-signature-256"],
      delivery = headers["x-github-delivery"],
      event = headers["x-github-event"];
    if (
      typeof signature !== "string" ||
      !/^sha256=[a-f0-9]{64}$/.test(signature)
    )
      throw new WorkStateError(401, "invalid_signature");
    const expected = createHmac("sha256", secret).update(rawBody).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex")))
      throw new WorkStateError(401, "invalid_signature");
    if (
      typeof delivery !== "string" ||
      !/^[-\w]{1,200}$/.test(delivery) ||
      typeof event !== "string" ||
      !/^[-\w]{1,100}$/.test(event)
    )
      throw new WorkStateError(400, "invalid_delivery");
    const pull = z
      .object({ number: z.number().int().positive().optional() })
      .passthrough();
    const check = z
      .object({
        pull_requests: z.array(pull).optional(),
        head_sha: z.string().optional(),
      })
      .passthrough();
    const payload = z
      .object({
        repository: z.object({ id: z.number().int().positive() }).passthrough(),
        number: z.number().int().positive().optional(),
        pull_request: pull.optional(),
        issue: z
          .object({
            number: z.number().int().positive(),
            pull_request: z.unknown().optional(),
          })
          .passthrough()
          .optional(),
        check_run: check.optional(),
        check_suite: check.optional(),
        sha: z.string().optional(),
      })
      .passthrough();
    let value: z.infer<typeof payload>;
    try {
      value = payload.parse(JSON.parse(rawBody.toString("utf8")));
    } catch {
      throw new WorkStateError(400, "invalid_payload");
    }
    const id = value?.repository?.id;
    if (!(typeof id === "number" && Number.isSafeInteger(id) && id > 0))
      throw new WorkStateError(400, "invalid_repository");
    const numbers = [
      value.number,
      value.pull_request?.number,
      value.issue?.pull_request ? value.issue.number : undefined,
      ...(value.check_run?.pull_requests ?? []).map((pr) => pr.number),
      ...(value.check_suite?.pull_requests ?? []).map((pr) => pr.number),
      ...store
        .collectorPulls(String(id))
        .filter((pr) =>
          [
            value.sha,
            value.check_run?.head_sha,
            value.check_suite?.head_sha,
          ].includes(pr.headSha),
        )
        .map((pr) => pr.number),
    ].filter(
      (number): number is number =>
        typeof number === "number" &&
        Number.isSafeInteger(number) &&
        number > 0,
    );
    return store.acceptEvent(delivery, String(id), event, Date.now(), numbers);
  };
}
export function createWorkStateWebhook(store: WorkStateStore, secret: string) {
  const router = express.Router(),
    acceptDelivery = createDeliveryAcceptor(store, secret);
  router.post(
    "/",
    express.raw({ type: "application/json", limit: "1mb" }),
    async (req, res) => {
      try {
        if (!Buffer.isBuffer(req.body))
          throw new WorkStateError(400, "raw_body_required");
        const deliveryId = await acceptDelivery(req.headers, req.body);
        res.status(202).json({ deliveryId });
      } catch (error) {
        res.status(error instanceof WorkStateError ? error.status : 500).json({
          error:
            error instanceof WorkStateError ? error.message : "delivery_failed",
        });
      }
    },
  );
  return router;
}
