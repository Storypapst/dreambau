import { api } from "./api";
import type { WorkspaceSource } from "../shared/workspace.js";
import type { WorkspaceGithubResponse } from "../shared/workspace-github.js";
export function loadWorkspaceGithub(source:WorkspaceSource,id:string,signal?:AbortSignal) {
 return api<WorkspaceGithubResponse>("/workspace/runs/"+source+"/"+encodeURIComponent(id)+"/github",{signal});
}
export function refreshWorkspaceGithub(source:WorkspaceSource,id:string,signal?:AbortSignal) {
 return api<WorkspaceGithubResponse>("/workspace/runs/"+source+"/"+encodeURIComponent(id)+"/github/refresh",{method:"POST",signal});
}
