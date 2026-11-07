import { api, getActiveViewer, unauthorizedEvent } from "./api";
import type { WorkspaceDocument, WorkspaceEnvironment, WorkspaceFile, WorkspacePage, WorkspaceProject, WorkspaceReferenceInput, WorkspaceResult, WorkspaceRunDetail, WorkspaceRunSummary, WorkspaceSource } from "../shared/workspace.js";
export type { WorkspaceDocument, WorkspaceFile, WorkspaceRunDetail, WorkspaceRunSummary, WorkspaceSource } from "../shared/workspace.js";
export interface WorkspaceQuery { project: WorkspaceProject; source?: WorkspaceSource | "all"; environment?: WorkspaceEnvironment; result?: WorkspaceResult; q?: string; cursor?: string; limit?: number }
function queryString(query: WorkspaceQuery) {
  const parameters = new URLSearchParams();
  for (const [key,value] of Object.entries(query)) if (value !== undefined && value !== "") parameters.set(key,String(value));
  return parameters.toString();
}
export function loadWorkspaceRuns(query: WorkspaceQuery, signal?: AbortSignal) {
  return api<WorkspacePage<WorkspaceRunSummary>>("/workspace/runs?"+queryString(query),{signal});
}
export function loadWorkspaceRun(source: WorkspaceSource, id: string, signal?: AbortSignal) {
  return api<WorkspaceRunDetail>("/workspace/runs/"+source+"/"+encodeURIComponent(id),{signal});
}
export function loadWorkspaceDocuments(query: WorkspaceQuery, signal?: AbortSignal) {
  return api<WorkspacePage<WorkspaceDocument>>("/workspace/documents?"+queryString(query),{signal});
}
export function addWorkspaceReference(source: WorkspaceSource, id: string, reference: WorkspaceReferenceInput) {
  return api<WorkspaceRunDetail>("/workspace/runs/"+source+"/"+encodeURIComponent(id)+"/references",{method:"POST",body:JSON.stringify(reference)});
}
/** User-click navigation only. Never use an external artifact URL as an inline preview. */
export function safeWorkspaceExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try { const url=new URL(value); return url.protocol==="https:"&&!url.username&&!url.password?url.href:null; } catch { return null; }
}
/** Private media is bound to its exact ready file and current human session. */
export function safeWorkspaceContentUrl(file: WorkspaceFile, purpose: "preview"|"download"): string|null {
  const value=purpose==="preview"?file.previewUrl:file.downloadUrl;
  const viewer=getActiveViewer();
  if (!value || !viewer || file.processingState!=="ready") return null;
  try {
    const url=new URL(value,window.location.origin);
    const expected="/testmails/api/workspace/evidence/"+encodeURIComponent(file.runId)+"/files/"+encodeURIComponent(file.id)+"/content";
    if (url.origin!==window.location.origin || url.pathname!==expected || url.username || url.password || url.hash || url.searchParams.get("viewer")!==viewer) return null;
    if (purpose==="download" && url.searchParams.get("download")!=="1") return null;
    if (purpose==="preview" && url.searchParams.has("download")) return null;
    if ([...url.searchParams.keys()].some(key=>key!=="viewer"&&key!=="download")) return null;
    return url.pathname+url.search;
  } catch { return null; }
}
export async function loadWorkspaceDocumentText(file: WorkspaceFile, signal?: AbortSignal): Promise<string> {
  const url=safeWorkspaceContentUrl(file,"preview");
  if (!url || file.byteSize>2*1024*1024) throw new Error("preview_unavailable");
  const viewer=getActiveViewer();
  const response=await fetch(url,{signal,credentials:"same-origin",headers:{...(viewer?{"X-Testmails-Viewer":viewer}:{}),Accept:"text/plain, text/markdown, application/json"}});
  if (response.status===401 && getActiveViewer()===viewer) window.dispatchEvent(new Event(unauthorizedEvent));
  if (!response.ok) throw new Error(response.status===403?"scope_denied":"preview_unavailable");
  const type=(response.headers.get("Content-Type")??"").split(";")[0].trim().toLowerCase();
  if (!["text/plain","text/markdown","application/json"].includes(type)) throw new Error("preview_unavailable");
  const text=await response.text();
  if (text.length>2*1024*1024) throw new Error("preview_unavailable");
  return text;
}
