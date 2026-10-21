import { api } from "@/api";
import type {
  AttentionQuery,
  AttentionList,
  AttentionDetail,
} from "../server/work-state/attention.js";
export type {
  AttentionQuery,
  AttentionList,
  AttentionDetail,
  AttentionRow,
  AttentionView,
} from "../server/work-state/attention.js";
export function loadAttention(query: AttentionQuery, signal?: AbortSignal) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  return api<AttentionList>(`/work-state/attention?${params}`, { signal });
}
export function loadPullDetail(
  id: string,
  number: number,
  signal?: AbortSignal,
) {
  return api<AttentionDetail>(
    `/work-state/repositories/${encodeURIComponent(id)}/pulls/${number}`,
    { signal },
  );
}
export function refreshWorkState(id: string, number?: number) {
  return api<{ queued: boolean }>(
    `/work-state/repositories/${encodeURIComponent(id)}${number === undefined ? "" : `/pulls/${number}`}/refresh`,
    { method: "POST" },
  );
}
