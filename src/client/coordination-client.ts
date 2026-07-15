import { api } from "@/api";

export type CoordinationProject = "oriso" | "orimo" | "dreambau";
export type CoordinationResourceKind = "prompt" | "rule" | "adr" | "observability" | "tool";

export interface CoordinationProjectView {
  id: CoordinationProject;
  name: string;
  description: string;
}

export interface CoordinationResourceView {
  kind: CoordinationResourceKind;
  title: string;
  description: string;
  url?: string;
}

export interface CoordinationDiscussionView {
  label: string;
  url: string;
}

export interface CoordinationItemView {
  id: string;
  title: string;
  summary: string;
  problem: string;
  projects: CoordinationProject[];
  diagram?: string;
  details: Array<{ title: string; description: string }>;
  resources: CoordinationResourceView[];
  tags: string[];
  discussions: CoordinationDiscussionView[];
}

export interface CoordinationCatalog {
  projects: CoordinationProjectView[];
  items: CoordinationItemView[];
  resourceKinds: CoordinationResourceKind[];
}

export type RuntimeState = "healthy" | "degraded" | "offline" | "unavailable";

export interface RuntimeStatusView {
  id: string;
  name: string;
  project: CoordinationProject;
  environment: "pre-dev" | "dev" | "platform";
  state: RuntimeState;
  checkedAt: string;
  latencyMs: number | null;
  url: string;
}

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

export function loadCoordination(request: Request = api) {
  return request<CoordinationCatalog>("/coordination");
}

export function loadRuntimeStatuses(request: Request = api) {
  return request<RuntimeStatusView[]>("/coordination/runtime");
}

export function addCoordinationTag(itemId: string, tag: string, request: Request = api) {
  return request<{ tags: string[]; discussions: CoordinationDiscussionView[] }>(
    `/coordination/items/${encodeURIComponent(itemId)}/tags`,
    { method: "POST", body: JSON.stringify({ tag }) }
  );
}

export function addCoordinationDiscussion(
  itemId: string,
  discussion: CoordinationDiscussionView,
  request: Request = api
) {
  return request<{ tags: string[]; discussions: CoordinationDiscussionView[] }>(
    `/coordination/items/${encodeURIComponent(itemId)}/discussions`,
    { method: "POST", body: JSON.stringify(discussion) }
  );
}
