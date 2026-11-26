import { describe, expect, it } from "vitest";
import {
  run,
  rolloutDone,
  ANNOTATION_FAILED,
  ANNOTATION_PENDING,
  ANNOTATION_PREVIOUS
} from "../k8s/autodeploy/autodeploy.mjs";

const DIGEST = "sha256:" + "a".repeat(64);
const REPO = "ghcr.io/storypapst/dreambau-testmails";
const DEP_URL = "https://kubernetes.default.svc/apis/apps/v1/namespaces/wcr/deployments/testmails";

type Dep = {
  metadata: { generation: number; annotations: Record<string, string> };
  spec: { replicas: number; template: { spec: { containers: { name: string; image: string; imagePullPolicy?: string }[] } } };
  status: Record<string, number>;
};

type Opts = {
  image: string;
  pullPolicy?: string;
  failed?: string;
  annotations?: Record<string, string>;
  rollout?: "ok" | "stuck";
  health?: "json" | "html" | "down";
  digest?: string;
};

function cluster(opts: Opts) {
  const dep: Dep = {
    metadata: {
      generation: 1,
      annotations: { ...(opts.failed ? { [ANNOTATION_FAILED]: opts.failed } : {}), ...(opts.annotations ?? {}) }
    },
    spec: { replicas: 1, template: { spec: { containers: [{ name: "testmails", image: opts.image, imagePullPolicy: opts.pullPolicy }] } } },
    status: { observedGeneration: 1, replicas: 1, updatedReplicas: 1, availableReplicas: 1 }
  };
  const patches: unknown[] = [];
  const calls: string[] = [];
  const state = { digest: opts.digest ?? DIGEST, failGetAfterPatch: false, patched: false };
  const json = (body: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

  const fetchImpl = async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push(`${method} ${input}`);
    if (input.startsWith("https://ghcr.io/token")) return json({ token: "anon" });
    if (input.startsWith("https://ghcr.io/v2/")) {
      return new Response(null, { status: 200, headers: { "docker-content-digest": state.digest } });
    }
    if (input === DEP_URL && method === "GET") {
      if (state.failGetAfterPatch && state.patched) return new Response("etcd leader changed", { status: 503 });
      return json(dep);
    }
    if (input === DEP_URL && method === "PATCH") {
      const patch = JSON.parse(String(init.body));
      patches.push(patch);
      state.patched = true;
      const c = patch.spec?.template.spec.containers[0];
      if (c) {
        dep.spec.template.spec.containers[0].image = c.image;
        dep.spec.template.spec.containers[0].imagePullPolicy = c.imagePullPolicy;
        dep.metadata.generation += 1;
      }
      for (const [k, v] of Object.entries(patch.metadata.annotations as Record<string, string | null>)) {
        if (v === null) delete dep.metadata.annotations[k];
        else dep.metadata.annotations[k] = v;
      }
      const isRevert = dep.spec.template.spec.containers[0].image === opts.image;
      if (opts.rollout === "stuck" && !isRevert) {
        dep.status = { observedGeneration: dep.metadata.generation, replicas: 1, updatedReplicas: 1, availableReplicas: 0, unavailableReplicas: 1 };
      } else {
        dep.status = { observedGeneration: dep.metadata.generation, replicas: 1, updatedReplicas: 1, availableReplicas: 1 };
      }
      return json(dep);
    }
    if (input === "https://dreambau.com/testmails/health/ready") {
      if (opts.health === "down") return new Response("bad gateway", { status: 502 });
      if (opts.health === "html") return new Response("<!doctype html>", { status: 200 });
      return json({ status: "ok" });
    }
    throw new Error(`unexpected request ${method} ${input}`);
  };

  let clock = 0;
  const deps = {
    env: { POLL_MS: "1000", ROLLOUT_TIMEOUT_SECONDS: "10" },
    fetchImpl,
    log: () => {},
    sleep: async (ms: number) => {
      clock += ms;
    },
    now: () => clock,
    readToken: async () => "sa-token\n"
  };
  return { dep, patches, calls, deps, state, advance: (ms: number) => (clock += ms) };
}

describe("autodeploy", () => {
  it("does nothing when the deployment already runs the digest of :main", async () => {
    const c = cluster({ image: `${REPO}@${DIGEST}` });
    expect(await run(c.deps)).toBe("current");
    expect(c.patches).toHaveLength(0);
  });

  it("pins the new digest, waits for the rollout and checks the public readiness endpoint", async () => {
    const c = cluster({ image: "dreambau-testmails:0.10.4-fixed-creds-6fc95bf" });
    expect(await run(c.deps)).toBe("deployed");
    expect(c.dep.spec.template.spec.containers[0].image).toBe(`${REPO}@${DIGEST}`);
    expect(c.dep.metadata.annotations[ANNOTATION_PREVIOUS]).toBe("dreambau-testmails:0.10.4-fixed-creds-6fc95bf");
    expect(c.patches[0]).toMatchObject({
      spec: { template: { spec: { containers: [{ name: "testmails", imagePullPolicy: "IfNotPresent" }] } } }
    });
    expect(c.calls).toContain("GET https://dreambau.com/testmails/health/ready");
  });

  it("reverts and remembers the digest when the rollout does not become available", async () => {
    const c = cluster({ image: "old:1", pullPolicy: "Never", rollout: "stuck" });
    expect(await run(c.deps)).toBe("reverted");
    expect(c.dep.spec.template.spec.containers[0].image).toBe("old:1");
    expect(c.dep.spec.template.spec.containers[0].imagePullPolicy).toBe("Never");
    expect(c.dep.metadata.annotations[ANNOTATION_FAILED]).toBe(DIGEST);
  });

  it("treats an HTML 200 from the public host as unhealthy and reverts", async () => {
    const c = cluster({ image: "old:1", health: "html" });
    expect(await run(c.deps)).toBe("reverted");
    expect(c.dep.spec.template.spec.containers[0].image).toBe("old:1");
  });

  it("does not retry a digest that already failed", async () => {
    const c = cluster({ image: "old:1", failed: DIGEST });
    expect(await run(c.deps)).toBe("skipped-failed");
    expect(c.patches).toHaveLength(0);
  });

  it("sends the ServiceAccount token without its trailing newline", async () => {
    const c = cluster({ image: `${REPO}@${DIGEST}` });
    const seen: string[] = [];
    const inner = c.deps.fetchImpl;
    c.deps.fetchImpl = async (input: string, init: RequestInit = {}) => {
      if (input === DEP_URL) seen.push(String((init.headers as Record<string, string>).Authorization));
      return inner(input, init);
    };
    await run(c.deps);
    expect(seen).toEqual(["Bearer sa-token"]);
  });

  it("resumes an interrupted rollout and reverts it once the deadline has passed", async () => {
    const c = cluster({ image: "old:1", pullPolicy: "Never", rollout: "stuck" });
    c.state.failGetAfterPatch = true;
    await expect(run(c.deps)).rejects.toThrow(/HTTP 503/);
    expect(c.dep.metadata.annotations[ANNOTATION_PENDING]).toBe(DIGEST);

    c.state.failGetAfterPatch = false;
    c.advance(60_000);
    expect(await run(c.deps)).toBe("reverted");
    expect(c.dep.spec.template.spec.containers[0]).toMatchObject({ image: "old:1", imagePullPolicy: "Never" });
    expect(c.dep.metadata.annotations[ANNOTATION_FAILED]).toBe(DIGEST);
    expect(c.dep.metadata.annotations[ANNOTATION_PENDING]).toBeUndefined();
  });

  it("resumes an interrupted rollout and clears the pending mark when it turns healthy", async () => {
    const c = cluster({ image: "old:1" });
    c.state.failGetAfterPatch = true;
    await expect(run(c.deps)).rejects.toThrow(/HTTP 503/);
    c.state.failGetAfterPatch = false;
    expect(await run(c.deps)).toBe("deployed");
    expect(c.dep.metadata.annotations[ANNOTATION_PENDING]).toBeUndefined();
    expect(await run(c.deps)).toBe("current");
  });

  it("keeps the last verified image as fallback when a newer build replaces an unverified one", async () => {
    const unverified = `${REPO}@sha256:${"b".repeat(64)}`;
    const c = cluster({
      image: unverified,
      annotations: { [ANNOTATION_PENDING]: "sha256:" + "b".repeat(64), [ANNOTATION_PREVIOUS]: "old:1" },
      rollout: "stuck"
    });
    expect(await run(c.deps)).toBe("reverted");
    expect(c.dep.spec.template.spec.containers[0].image).toBe("old:1");
  });

  it("counts a rollout as done only when every replica is updated and available", () => {
    const base = { metadata: { generation: 2 }, spec: { replicas: 1 } };
    expect(rolloutDone({ ...base, status: { observedGeneration: 1, replicas: 1, updatedReplicas: 1, availableReplicas: 1 } })).toBe(false);
    expect(rolloutDone({ ...base, status: { observedGeneration: 2, replicas: 1, updatedReplicas: 1, availableReplicas: 0, unavailableReplicas: 1 } })).toBe(false);
    expect(rolloutDone({ ...base, status: { observedGeneration: 2, replicas: 1, updatedReplicas: 1, availableReplicas: 1 } })).toBe(true);
  });
});
