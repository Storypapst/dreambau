import { spawn } from "node:child_process";

export type MachineAuthMode = "machine-token" | "network-proxy";
export interface MachineAuthOptions {
  authMode?: string;
  /** Explicitly injectable for callers/tests; CLI entry points use HTTPS_PROXY. */
  proxyUrl?: string;
}
interface TransportOptions extends MachineAuthOptions {
  baseUrl: string;
  service: "test-access" | "evidence";
  fetch: typeof fetch;
}
export interface MachineHttpDependencies extends TransportOptions {
  identity: string;
  readKeychainToken: (identity: string) => string;
}

export function machineAuthMode(value: string | undefined): MachineAuthMode {
  if (value === undefined) return "machine-token";
  if (value === "machine-token" || value === "network-proxy") return value;
  throw new Error("machine auth mode must be machine-token or network-proxy");
}

export function machineAuthHeaders(mode: MachineAuthMode, token: string): Record<string, string> {
  return mode === "network-proxy" ? {} : { authorization: `Bearer ${token}` };
}

function approvedUrl(value: string, service: TransportOptions["service"], isBase = false): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("unapproved machine gateway URL"); }
  const origin = service === "test-access" ? "https://dreambau.com" : "https://evidence.dreambau.com";
  const prefix = service === "test-access" ? "/testmails/api/v1" : "/api/v1";
  let decodedPath = url.pathname;
  try {
    // Gateways may decode account ids (which legitimately contain %2F). Check
    // the normalized decoded path too so encoded traversal cannot escape scope.
    for (let depth = 0; depth < 5 && /%[0-9a-f]{2}/i.test(decodedPath); depth += 1) decodedPath = decodeURIComponent(decodedPath);
    if (/%[0-9a-f]{2}/i.test(decodedPath)) throw new Error();
  } catch { throw new Error("unapproved machine gateway URL"); }
  const path = new URL(decodedPath, url.origin).pathname.replace(/\/$/, "");
  const allowedPath = isBase ? path === prefix : path === prefix || path.startsWith(`${prefix}/`)
    || (service === "evidence" && ["/health/live", "/health/ready"].includes(path));
  if (url.origin !== origin || url.username || url.password || url.hash || !allowedPath || (isBase && url.search)) {
    throw new Error("unapproved machine gateway URL");
  }
  return url;
}

function proxyAddress(value: string | undefined): string {
  let url: URL;
  try { url = new URL(value ?? ""); } catch { throw new Error("network-proxy requires a valid HTTPS_PROXY proxy URL"); }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password
    || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("network-proxy requires an HTTP(S) proxy URL without credentials or a path");
  }
  return url.href;
}

const maxResponseBytes = 8 * 1024 * 1024;

/** Curl is deliberate: Node 20's built-in fetch does not honor HTTPS_PROXY. */
export function createMachineTransport(options: TransportOptions): typeof fetch {
  const mode = machineAuthMode(options.authMode);
  if (mode === "machine-token") return options.fetch;
  approvedUrl(options.baseUrl, options.service, true);
  const proxy = proxyAddress(options.proxyUrl);
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    if (input instanceof Request) throw new Error("machine proxy transport requires a gateway URL");
    const url = approvedUrl(String(input), options.service);
    if (init.redirect && init.redirect !== "error") throw new Error("machine proxy transport forbids redirects");
    const headers = new Headers(init.headers);
    const headerArgs: string[] = [];
    for (const [name, value] of headers) {
      // Only public representation metadata belongs in argv. Credentials and
      // arbitrary headers cannot be supplied by a proxy-mode application.
      if (!["accept", "content-type"].includes(name) || /[\r\n\0]/.test(value)) {
        throw new Error("machine proxy transport forbids this request header");
      }
      headerArgs.push("--header", `${name}: ${value}`);
    }
    const method = init.method ?? "GET";
    if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(method)) throw new Error("unsupported machine proxy method");
    let body: Buffer | undefined;
    if (init.body != null) {
      if (typeof init.body === "string") body = Buffer.from(init.body);
      else if (init.body instanceof Uint8Array) body = Buffer.from(init.body.buffer, init.body.byteOffset, init.body.byteLength);
      else if (init.body instanceof ArrayBuffer) body = Buffer.from(init.body);
      else if (init.body instanceof Blob) body = Buffer.from(await init.body.arrayBuffer());
      else throw new Error("unsupported machine proxy request body");
    }
    if (init.signal?.aborted) throw new DOMException("machine proxy request aborted", "AbortError");
    return new Promise<Response>((resolve, reject) => {
      // --disable must be first: a user curlrc must not change TLS, redirects,
      // proxy selection or logging. --noproxy overrides inherited NO_PROXY=*.
      const child = spawn("curl", ["--disable", "--silent", "--show-error", "--proxy", proxy,
        "--noproxy", "", "--proto", "=https", "--proto-redir", "=https", "--max-redirs", "0",
        "--connect-timeout", "30", "--max-time", "600", "--request", method,
        ...headerArgs, ...(body === undefined ? [] : ["--data-binary", "@-"]),
        "--write-out", "\n%{http_code}", "--url", url.href], { stdio: ["pipe", "pipe", "ignore"] });
      const chunks: Buffer[] = [];
      let size = 0;
      let settled = false;
      const finishError = (error: Error) => {
        if (settled) return;
        settled = true;
        init.signal?.removeEventListener("abort", abort);
        child.kill();
        reject(error);
      };
      const abort = () => finishError(new DOMException("machine proxy request aborted", "AbortError"));
      init.signal?.addEventListener("abort", abort, { once: true });
      // The signal may have changed between the preflight and listener setup.
      if (init.signal?.aborted) abort();
      child.stdout.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxResponseBytes) finishError(new Error("machine proxy response exceeded size limit"));
        else chunks.push(chunk);
      });
      child.stdin.on("error", () => {}); // EPIPE is reported by curl's exit status.
      child.on("error", () => finishError(new Error("machine proxy transport could not start curl")));
      child.on("close", (code) => {
        if (settled) return;
        if (code !== 0) {
          finishError(code === 28 ? new DOMException("machine proxy request timed out", "AbortError")
            : new Error("machine proxy transport failed"));
          return;
        }
        const bytes = Buffer.concat(chunks);
        const split = bytes.lastIndexOf(10);
        const statusText = bytes.subarray(split + 1).toString();
        const status = Number(statusText);
        if (split < 0 || !/^[2-5][0-9]{2}$/.test(statusText)) { finishError(new Error("invalid machine proxy response")); return; }
        if (status >= 300 && status < 400) { finishError(new Error("machine proxy redirect refused")); return; }
        settled = true;
        init.signal?.removeEventListener("abort", abort);
        resolve(new Response([204, 205, 304].includes(status) || method === "HEAD" ? null : bytes.subarray(0, split), { status }));
      });
      // No request payload, password, OTP or token ever enters process argv.
      child.stdin.end(body);
    });
  }) as typeof fetch;
}

export function createMachineHttp(options: MachineHttpDependencies) {
  const authMode = machineAuthMode(options.authMode);
  const transport = createMachineTransport(options);
  const token = authMode === "network-proxy" ? "" : options.readKeychainToken(options.identity);
  if (authMode === "machine-token" && !token) throw new Error(`Keychain token missing for identity ${options.identity}`);
  const authenticatedFetch = ((input: string | URL | Request, init: RequestInit = {}) => {
    const headers = Object.fromEntries(new Headers(init.headers));
    return transport(input, { ...init, headers: { ...headers, ...machineAuthHeaders(authMode, token) } });
  }) as typeof fetch;
  return { authMode, token, fetch: authenticatedFetch };
}
