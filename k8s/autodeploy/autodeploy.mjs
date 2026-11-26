// autodeploy.mjs — pull-based rollout of the Dreambau app (testmails deployment).
//
// Runs as a CronJob inside the cluster. Nothing outside the cluster can reach in: the
// job looks up the digest of `ghcr.io/storypapst/dreambau-testmails:main` (pushed by
// .github/workflows/image.yml only after CI passed on main), and when the deployment
// runs a different image it pins the deployment to that digest, waits for the rollout
// and checks the public readiness endpoint. A failed rollout is reverted to the previous
// image and that digest is remembered, so a broken build is not retried every run.
//
// The ServiceAccount may only get and patch deployments/testmails in wcr (see rbac.yaml).
// No dependencies: Node 20's fetch, the pod's ServiceAccount token, and the cluster CA
// (NODE_EXTRA_CA_CERTS, set in cronjob.yaml).

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const ANNOTATION_FAILED = "dreambau.com/autodeploy-failed-digest";
export const ANNOTATION_PREVIOUS = "dreambau.com/autodeploy-previous-image";
export const ANNOTATION_DEPLOYED_AT = "dreambau.com/autodeploy-deployed-at";
export const ANNOTATION_PENDING = "dreambau.com/autodeploy-pending-digest";
export const ANNOTATION_PREVIOUS_PULL = "dreambau.com/autodeploy-previous-pull-policy";

const MANIFEST_ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json"
].join(", ");

export function configFromEnv(env) {
  const repo = env.IMAGE_REPOSITORY ?? "ghcr.io/storypapst/dreambau-testmails";
  const [registry, ...path] = repo.split("/");
  return {
    repo,
    registry,
    repoPath: path.join("/"),
    tag: env.IMAGE_TAG ?? "main",
    namespace: env.TARGET_NAMESPACE ?? "wcr",
    deployment: env.TARGET_DEPLOYMENT ?? "testmails",
    container: env.TARGET_CONTAINER ?? "testmails",
    apiBase: env.KUBERNETES_API ?? "https://kubernetes.default.svc",
    tokenFile: env.SA_TOKEN_FILE ?? "/var/run/secrets/kubernetes.io/serviceaccount/token",
    healthUrl: env.HEALTH_URL ?? "https://dreambau.com/testmails/health/ready",
    rolloutTimeoutMs: Number(env.ROLLOUT_TIMEOUT_SECONDS ?? 300) * 1000,
    pollMs: Number(env.POLL_MS ?? 5000)
  };
}

// Digest of <repo>:<tag>. Anonymous pull token: the package is public, like the repository.
export async function resolveDigest(cfg, fetchImpl) {
  const tokenRes = await fetchImpl(
    `https://${cfg.registry}/token?scope=repository:${cfg.repoPath}:pull&service=${cfg.registry}`
  );
  if (!tokenRes.ok) throw new Error(`registry token request failed: HTTP ${tokenRes.status}`);
  const { token } = await tokenRes.json();
  const res = await fetchImpl(`https://${cfg.registry}/v2/${cfg.repoPath}/manifests/${cfg.tag}`, {
    method: "HEAD",
    headers: { Authorization: `Bearer ${token}`, Accept: MANIFEST_ACCEPT }
  });
  if (!res.ok) throw new Error(`manifest ${cfg.repo}:${cfg.tag} not found: HTTP ${res.status}`);
  const digest = res.headers.get("docker-content-digest");
  if (!/^sha256:[0-9a-f]{64}$/.test(digest ?? "")) throw new Error(`registry returned no valid digest for ${cfg.repo}:${cfg.tag}`);
  return digest;
}

function kube(cfg, fetchImpl, token) {
  const url = `${cfg.apiBase}/apis/apps/v1/namespaces/${cfg.namespace}/deployments/${cfg.deployment}`;
  const call = async (method, body) => {
    const res = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/strategic-merge-patch+json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error(`${method} deployment ${cfg.namespace}/${cfg.deployment}: HTTP ${res.status} ${await res.text()}`);
    return res.json();
  };
  return { get: () => call("GET"), patch: (body) => call("PATCH", body) };
}

function containerOf(dep, name) {
  const c = dep.spec?.template?.spec?.containers?.find((x) => x.name === name);
  if (!c) throw new Error(`deployment has no container named ${name}`);
  return c;
}

function imagePatch(cfg, image, pullPolicy, annotations) {
  return {
    metadata: { annotations },
    spec: { template: { spec: { containers: [{ name: cfg.container, image, imagePullPolicy: pullPolicy }] } } }
  };
}

export function rolloutDone(dep) {
  const s = dep.status ?? {};
  const want = dep.spec?.replicas ?? 1;
  return (
    (s.observedGeneration ?? 0) >= (dep.metadata?.generation ?? 0) &&
    (s.updatedReplicas ?? 0) === want &&
    (s.replicas ?? 0) === want &&
    (s.availableReplicas ?? 0) === want &&
    !s.unavailableReplicas
  );
}

async function waitForRollout(cfg, api, sleep, now, deadline) {
  for (;;) {
    const dep = await api.get();
    if (rolloutDone(dep)) return true;
    if (now() >= deadline) return false;
    await sleep(cfg.pollMs);
  }
}

async function healthy(cfg, fetchImpl) {
  try {
    const res = await fetchImpl(cfg.healthUrl, { headers: { Accept: "application/json" } });
    if (!res.ok) return false;
    // The public host answers unknown paths with an HTML page and HTTP 200: only JSON counts.
    await res.json();
    return true;
  } catch {
    return false;
  }
}

// One reconciliation pass. Returns a short status word. An error (registry, API) leaves
// the pending annotation in place, so the next run resumes the verification instead of
// mistaking an unverified rollout for the current state.
export async function run({ env = process.env, fetchImpl = fetch, log = console.log, sleep, now = Date.now, readToken } = {}) {
  const cfg = configFromEnv(env);
  const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const token = (await (readToken ? readToken(cfg.tokenFile) : readFile(cfg.tokenFile, "utf8"))).trim();
  const api = kube(cfg, fetchImpl, token);

  const digest = await resolveDigest(cfg, fetchImpl);
  const target = `${cfg.repo}@${digest}`;
  const dep = await api.get();
  const { image: current, imagePullPolicy: currentPullPolicy = "IfNotPresent" } = containerOf(dep, cfg.container);
  const annotations = dep.metadata?.annotations ?? {};
  const pending = annotations[ANNOTATION_PENDING];

  let previous, previousPull, startedAt;
  if (current === target) {
    if (pending !== digest) {
      log(`autodeploy: current — ${cfg.namespace}/${cfg.deployment} runs ${target}`);
      return "current";
    }
    // An earlier run patched the image but did not finish verifying it.
    previous = annotations[ANNOTATION_PREVIOUS];
    previousPull = annotations[ANNOTATION_PREVIOUS_PULL] ?? "IfNotPresent";
    startedAt = Date.parse(annotations[ANNOTATION_DEPLOYED_AT] ?? "") || now();
    log(`autodeploy: resuming verification of ${target} (started ${new Date(startedAt).toISOString()})`);
  } else {
    if (annotations[ANNOTATION_FAILED] === digest) {
      log(`autodeploy: skipped — ${digest} failed its rollout before; waiting for a newer build on ${cfg.tag}`);
      return "skipped-failed";
    }
    // While a rollout is unverified, the image to fall back to stays the last verified one.
    previous = pending ? annotations[ANNOTATION_PREVIOUS] : current;
    previousPull = pending ? (annotations[ANNOTATION_PREVIOUS_PULL] ?? "IfNotPresent") : currentPullPolicy;
    startedAt = now();
    log(`autodeploy: rolling out ${target} (was ${current})`);
    await api.patch(
      // A digest is immutable: pull it once.
      imagePatch(cfg, target, "IfNotPresent", {
        [ANNOTATION_PENDING]: digest,
        [ANNOTATION_PREVIOUS]: previous ?? null,
        [ANNOTATION_PREVIOUS_PULL]: previousPull,
        [ANNOTATION_DEPLOYED_AT]: new Date(startedAt).toISOString(),
        [ANNOTATION_FAILED]: null
      })
    );
  }

  const rolled = await waitForRollout(cfg, api, wait, now, startedAt + cfg.rolloutTimeoutMs);
  const ok = rolled && (await healthy(cfg, fetchImpl));
  if (ok) {
    await api.patch({ metadata: { annotations: { [ANNOTATION_PENDING]: null } } });
    log(`autodeploy: deployed — ${target} is available and ${cfg.healthUrl} answers`);
    return "deployed";
  }

  const reason = rolled ? "health check failed" : "rollout timed out";
  if (!previous) {
    await api.patch({ metadata: { annotations: { [ANNOTATION_FAILED]: digest, [ANNOTATION_PENDING]: null } } });
    log(`autodeploy: FAILED — ${reason}; no earlier image recorded, nothing to revert to`);
    return "failed";
  }
  log(`autodeploy: FAILED — ${reason}; reverting to ${previous}`);
  // Restore exactly what ran before, including its pull policy (a locally imported image
  // runs with Never).
  await api.patch(
    imagePatch(cfg, previous, previousPull, {
      [ANNOTATION_FAILED]: digest,
      [ANNOTATION_PENDING]: null,
      [ANNOTATION_DEPLOYED_AT]: null
    })
  );
  await waitForRollout(cfg, api, wait, now, now() + cfg.rolloutTimeoutMs);
  return "reverted";
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  run().then(
    (status) => process.exit(status === "reverted" || status === "failed" ? 1 : 0),
    (err) => {
      console.error(`autodeploy: error — ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  );
}
