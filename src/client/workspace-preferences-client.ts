import { api } from "./api";
import { teamProjects } from "./types";
import type { WorkspacePreferences } from "../shared/workspace-preferences.js";
export type WorkspaceFilters=NonNullable<WorkspacePreferences["filtersByProject"]["oriso"]>;
export const emptyWorkspaceFilters=():WorkspaceFilters=>({source:"all",environment:"all"});
export const defaultWorkspacePreferences=():WorkspacePreferences=>({rememberFilters:true,refreshMinutes:15,filtersByProject:{}});
export function isWorkspaceSource(value:unknown):value is WorkspaceFilters["source"] {return value==="all"||value==="test-run"||value==="evidence-run";}
export function isWorkspaceEnvironment(value:unknown):value is WorkspaceFilters["environment"] {return value==="all"||value==="local"||value==="pre-dev"||value==="dev"||value==="production-test";}
export function coerceWorkspacePreferences(value:unknown):WorkspacePreferences {
 const result=defaultWorkspacePreferences();
 if(!value||typeof value!=="object")return result;
 if("rememberFilters" in value&&typeof value.rememberFilters==="boolean")result.rememberFilters=value.rememberFilters;
 if("refreshMinutes" in value&&(value.refreshMinutes===0||value.refreshMinutes===15||value.refreshMinutes===60))result.refreshMinutes=value.refreshMinutes;
 if("filtersByProject" in value&&value.filtersByProject&&typeof value.filtersByProject==="object"){
  for(const project of teamProjects){
   const filters=Reflect.get(value.filtersByProject,project);
   if(filters&&typeof filters==="object"&&isWorkspaceSource(filters.source)&&isWorkspaceEnvironment(filters.environment))result.filtersByProject[project]={source:filters.source,environment:filters.environment};
  }
 }
 return result;
}
const endpoint="/auth/me/preferences/workspace-defaults";
export async function loadWorkspacePreferences(signal?:AbortSignal):Promise<WorkspacePreferences> {
 const response=await api<{key:string;value:unknown}>(endpoint,{signal});return coerceWorkspacePreferences(response.value);
}
export async function saveWorkspacePreferences(value:WorkspacePreferences):Promise<WorkspacePreferences> {
 const response=await api<{key:string;value:unknown}>(endpoint,{method:"PUT",body:JSON.stringify({value})});return coerceWorkspacePreferences(response.value);
}
