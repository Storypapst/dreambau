import type { TeamProject } from "./types";

export function directoryRoute(pathname: string): "accounts" | "runs" | "releases" {
  if (/^\/testmails\/runs(?:\/|$)/.test(pathname)) return "runs";
  if (/^\/testmails\/releases(?:\/|$)/.test(pathname)) return "releases";
  return "accounts";
}

export function workspaceProject(search: string, allowed: TeamProject[]): TeamProject | undefined {
  const requested = new URLSearchParams(search).get("project")?.toLowerCase();
  return allowed.find((project) => project === requested) ?? allowed[0];
}

export function accountFromHash(hash: string): string | undefined {
  const match = /^#account=(.+)$/.exec(hash);
  try { return match ? decodeURIComponent(match[1]) : undefined; } catch { return undefined; }
}
