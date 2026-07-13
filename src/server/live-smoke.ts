export type LiveSmokeResult = {
  ok: true;
  checks: ["liveness", "readiness", "v1-auth-boundary", "jmap-boundary"];
};

type LiveSmokeOptions = {
  baseUrl?: string;
  jmapUrl?: string;
  fetchImpl?: typeof fetch;
};

async function request(
  fetchImpl: typeof fetch,
  name: string,
  url: string,
): Promise<{ response: Response; contentType: string }> {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  const contentType = response.headers.get("content-type")?.split(";", 1)[0] ?? "missing content-type";
  return { response, contentType };
}

async function requireJsonHealth(fetchImpl: typeof fetch, name: string, url: string): Promise<void> {
  const { response, contentType } = await request(fetchImpl, name, url);
  if (response.status !== 200 || contentType !== "application/json") {
    throw new Error(`${name} returned ${contentType} with status ${response.status}`);
  }
  const body = (await response.json()) as { status?: unknown };
  if (body.status !== "ok") {
    throw new Error(`${name} did not report status ok`);
  }
}

async function requireProtectedJson(fetchImpl: typeof fetch, name: string, url: string): Promise<void> {
  const { response, contentType } = await request(fetchImpl, name, url);
  if (![401, 403].includes(response.status) || contentType !== "application/json") {
    throw new Error(`${name} returned ${contentType} with status ${response.status}`);
  }
}

async function requireJmapBoundary(fetchImpl: typeof fetch, url: string): Promise<void> {
  const { response, contentType } = await request(fetchImpl, "jmap-boundary", url);
  const expectedStatus = response.status === 200 || response.status === 401 || response.status === 403;
  if (!expectedStatus || contentType !== "application/json") {
    throw new Error(`jmap-boundary returned ${contentType} with status ${response.status}`);
  }
}

export async function checkLiveTestAccess(options: LiveSmokeOptions = {}): Promise<LiveSmokeResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? "https://dreambau.com/testmails").replace(/\/$/, "");
  const jmapUrl = options.jmapUrl ?? "https://box.dreambau.com/.well-known/jmap";

  await requireJsonHealth(fetchImpl, "liveness", `${baseUrl}/health/live`);
  await requireJsonHealth(fetchImpl, "readiness", `${baseUrl}/health/ready`);
  await requireProtectedJson(fetchImpl, "v1-auth-boundary", `${baseUrl}/api/v1/accounts`);
  await requireJmapBoundary(fetchImpl, jmapUrl);

  return {
    ok: true,
    checks: ["liveness", "readiness", "v1-auth-boundary", "jmap-boundary"],
  };
}
