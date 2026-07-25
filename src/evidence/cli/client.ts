import { z } from "zod";
import type { EvidenceFile, EvidenceRun } from "../model.js";

export class GatewayError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export interface GatewayClientOptions {
  baseUrl: string;
  token: string;
  fetch: typeof fetch;
}

const runSchema = z.object({ id: z.string(), publicId: z.string().nullable() }).passthrough();
const fileSchema = z.object({ id: z.string() }).passthrough();

export interface RunDetail extends EvidenceRun {
  files: Array<EvidenceFile & { receivedParts: number[] }>;
  findings: Array<{ rule: string; location: string }>;
}

export interface InitFileResult {
  file: EvidenceFile;
  partSize: number;
  expectedParts: number;
  receivedParts: number[];
  deduplicated?: boolean;
}

export function createGatewayClient(options: GatewayClientOptions) {
  const base = options.baseUrl.replace(/\/$/, "");

  async function call<T>(path: string, init: RequestInit & { expect?: number[]; binary?: boolean } = {}): Promise<T> {
    const { expect: _expect, binary, ...request } = init;
    const response = await options.fetch(`${base}${path}`, {
      ...request,
      headers: {
        authorization: `Bearer ${options.token}`,
        ...(init.body ? { "content-type": binary ? "application/octet-stream" : "application/json" } : {}),
        ...(init.headers ?? {})
      }
    });
    const text = await response.text();
    const payload: unknown = text ? JSON.parse(text) : {};
    const acceptable = init.expect ?? [200, 201];
    if (!acceptable.includes(response.status)) {
      const code = (payload as { error?: string }).error ?? "gateway_error";
      throw new GatewayError(response.status, code, describe(response.status, code, payload));
    }
    return payload as T;
  }

  return {
    async createRun(input: Record<string, unknown>): Promise<EvidenceRun> {
      const run = await call<EvidenceRun>("/runs", { method: "POST", body: JSON.stringify(input), expect: [201] });
      runSchema.parse(run);
      return run;
    },
    getRun(runId: string): Promise<RunDetail> {
      return call<RunDetail>(`/runs/${runId}`, { expect: [200] });
    },
    async initFile(runId: string, input: Record<string, unknown>): Promise<InitFileResult> {
      const result = await call<InitFileResult>(`/runs/${runId}/files/init`, {
        method: "POST",
        body: JSON.stringify(input),
        expect: [200, 201]
      });
      fileSchema.parse(result.file);
      return {
        ...result,
        receivedParts: result.receivedParts ?? [],
        partSize: result.partSize ?? 0,
        expectedParts: result.expectedParts ?? 1
      };
    },
    uploadPart(runId: string, fileId: string, partNumber: number, body: Uint8Array): Promise<{ byteSize: number }> {
      return call(`/runs/${runId}/files/${fileId}/parts/${partNumber}`, {
        method: "PUT",
        body: new Uint8Array(body).buffer as ArrayBuffer,
        binary: true,
        expect: [200]
      });
    },
    /** 422 is an expected outcome: the file was quarantined and carries findings. */
    completeFile(runId: string, fileId: string): Promise<{ file: EvidenceFile; state: string; findings: Array<{ rule: string; location: string }> }> {
      return call(`/runs/${runId}/files/${fileId}/complete`, { method: "POST", expect: [200, 422] });
    },
    /** `prepare` reserves the addresses, `commit` makes them reachable. */
    publish(runId: string, input: Record<string, unknown>): Promise<EvidenceRun & { files: EvidenceFile[] }> {
      return call(`/runs/${runId}/publish`, { method: "POST", body: JSON.stringify(input), expect: [200] });
    },
    setGithubReference(runId: string, githubCommentUrl: string): Promise<EvidenceRun> {
      return call(`/runs/${runId}/github-reference`, {
        method: "PATCH",
        body: JSON.stringify({ githubCommentUrl }),
        expect: [200]
      });
    },
    archive(runId: string): Promise<EvidenceRun> {
      return call(`/runs/${runId}/archive`, { method: "POST", expect: [200] });
    }
  };
}

export type GatewayClient = ReturnType<typeof createGatewayClient>;

function describe(status: number, code: string, payload: unknown): string {
  if (code === "upload_rejected") {
    const reasons = (payload as { reasons?: string[] }).reasons ?? [];
    return `the gateway refused the upload (${reasons.join(", ")})`;
  }
  if (code === "run_quarantined") {
    const findings = (payload as { findings?: Array<{ rule: string }> }).findings ?? [];
    return `the run is quarantined (${findings.map((finding) => finding.rule).join(", ")}); it has no public URL`;
  }
  if (code === "commit_mismatch") return "the gateway run was created for a different commit";
  if (code === "unauthenticated") return "the evidence token was rejected; check the Keychain entry";
  if (code === "action_denied" || code === "scope_denied") return "this machine identity may not perform that action";
  return `evidence gateway returned HTTP ${status} (${code})`;
}
