import type { WorkspaceEnvironment, WorkspaceProject, WorkspaceSource } from "./workspace.js";
export interface WorkspacePreferences {
  rememberFilters: boolean;
  refreshMinutes: 0 | 15 | 60;
  filtersByProject: Partial<Record<WorkspaceProject, {
    source: WorkspaceSource | "all";
    environment: WorkspaceEnvironment | "all";
  }>>;
}
