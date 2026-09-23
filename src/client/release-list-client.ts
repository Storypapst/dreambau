import { api, unauthorizedEvent } from "@/api";

export type ReleaseSelectField = "areas" | "devStatus" | "functional";
export const optionColors = ["blue", "amber", "violet", "green", "rose", "slate", "teal", "orange"] as const;
export type OptionColor = typeof optionColors[number];

export interface ReleaseOption { id: string; label: string; color: OptionColor; position: number }
export type ReleaseOptions = Record<ReleaseSelectField, ReleaseOption[]>;
export interface ReleaseListSummary { id: string; project: string; title: string; intro: string; updatedAt: string; itemCount: number }
export interface ReleaseList { id: string; project: string; title: string; intro: string; updatedAt: string }

export interface ReleaseItem {
  id: string;
  listId: string;
  parentId: string | null;
  position: number;
  name: string;
  areas: string[];
  description: string;
  crossReferences: string;
  crossReferenceIds: string[];
  devStatus: string | null;
  functional: string[];
  statusComment: string;
  notes: string;
  releaseNotes: string;
  completed: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  commentCount: number;
}

export type ItemPatch = Partial<Pick<ReleaseItem, "name" | "areas" | "description" | "crossReferences" | "crossReferenceIds" | "devStatus" | "functional" | "statusComment" | "notes" | "releaseNotes" | "completed">>;
export interface ReleaseComment { id: number; itemId: string; authorName: string; body: string; createdAt: string }
export interface ReleaseChange { id: number; itemId: string; field: string; oldValue: string; newValue: string; actorName: string; changedAt: string }
export interface ReleaseListDetail { list: ReleaseList; options: ReleaseOptions; items: ReleaseItem[] }

const base = "/release-lists";
const json = (body: unknown, method = "POST"): RequestInit => ({ method, body: JSON.stringify(body) });

export const loadReleaseLists = () => api<ReleaseListSummary[]>(base);
export const loadReleaseList = (listId: string) => api<ReleaseListDetail>(`${base}/${listId}`);
export const createReleaseItem = (listId: string, name: string, parentId: string | null = null) =>
  api<ReleaseItem>(`${base}/${listId}/items`, json({ name, parentId }));
export const updateReleaseItem = (listId: string, itemId: string, patch: ItemPatch) =>
  api<ReleaseItem>(`${base}/${listId}/items/${itemId}`, json(patch, "PATCH"));
export async function archiveReleaseItem(listId: string, itemId: string) {
  // Not routed through api(): a 204 has no JSON body. The 401 signal still has to fire.
  const response = await fetch(`/testmails/api${base}/${listId}/items/${itemId}`, { method: "DELETE" });
  if (response.status === 401) window.dispatchEvent(new Event(unauthorizedEvent));
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? `HTTP ${response.status}`);
}
export const loadReleaseActivity = (listId: string, itemId: string) =>
  api<{ comments: ReleaseComment[]; changes: ReleaseChange[] }>(`${base}/${listId}/items/${itemId}/activity`);
export const addReleaseComment = (listId: string, itemId: string, body: string) =>
  api<ReleaseComment>(`${base}/${listId}/items/${itemId}/comments`, json({ body }));
export const addReleaseOption = (listId: string, field: ReleaseSelectField, label: string, color: OptionColor) =>
  api<ReleaseOption>(`${base}/${listId}/options/${field}`, json({ label, color }));
export const releaseCsvUrl = (listId: string) => `/testmails/api${base}/${listId}/export.csv`;
