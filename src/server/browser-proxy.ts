export interface BrowserProxy {
  server: string;
  bypass: string;
}

/** Local callers retain direct transport; cloud callers must select it explicitly. */
export function resolveBrowserProxy(mode: string | undefined, proxyUrl: string | undefined, requireExplicit = false): BrowserProxy | undefined {
  if (mode === "direct" || (mode === undefined && !requireExplicit)) return undefined;
  if (mode !== "network-proxy") throw new Error("an explicit browser proxy decision (direct or network-proxy) is required");
  let proxy: URL;
  try { proxy = new URL(proxyUrl ?? ""); } catch { throw new Error("browser network-proxy requires valid HTTPS_PROXY"); }
  if (!["http:", "https:"].includes(proxy.protocol) || proxy.username || proxy.password || proxy.pathname !== "/" || proxy.search || proxy.hash) {
    throw new Error("browser network-proxy requires an HTTP(S) proxy without credentials or a path");
  }
  return { server: proxy.href, bypass: "<-loopback>" };
}
