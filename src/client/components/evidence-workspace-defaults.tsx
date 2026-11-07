import { useCallback, useEffect, useRef, useState } from "react";
import { getActiveViewer } from "@/api";
import { teamProjects, type TeamProject } from "@/types";
import type { WorkspacePreferences } from "../../shared/workspace-preferences.js";
import { defaultWorkspacePreferences, emptyWorkspaceFilters, isWorkspaceEnvironment, isWorkspaceSource, loadWorkspacePreferences, saveWorkspacePreferences, type WorkspaceFilters } from "@/workspace-preferences-client";

type DefaultsState={owner:string|null;status:"loading"|"ready"|"error";value:WorkspacePreferences;saving:boolean;saveError:boolean};
type FilterEntry={filters:WorkspaceFilters;revision:number};
type SessionFilters={owner:string|null;values:Partial<Record<TeamProject,FilterEntry>>};
const outstandingWrites=new Map<string,Promise<void>>();
function explicitFilters(project:TeamProject):Partial<WorkspaceFilters> {
 const params=new URLSearchParams(window.location.search);const requested=params.get("project");
 if(requested&&requested.toLowerCase()!==project)return {};
 const source=params.get("source"),environment=params.get("environment");
 return {...(isWorkspaceSource(source)?{source}:{}),...(isWorkspaceEnvironment(environment)?{environment}:{})};
}
/** Per-viewer defaults; writes are ordered and never carry search, result or selected IDs. */
export function useWorkspaceDefaults(project:TeamProject) {
 const viewer=getActiveViewer();
 const [state,setState]=useState<DefaultsState>(()=>({owner:viewer,status:"loading",value:defaultWorkspacePreferences(),saving:false,saveError:false}));
 const [sessionFilters,setSessionFilters]=useState<SessionFilters>(()=>({owner:viewer,values:{}}));
 const [retry,setRetry]=useState(0);
 const current=useRef(state);const local=useRef(sessionFilters);const serial=useRef(Promise.resolve());const session=useRef<object|null>(null);const sequence=useRef(0);const acknowledged=useRef<Partial<Record<TeamProject,number>>>({});
 current.current=state;local.current=sessionFilters;
 const ready=state.owner===viewer&&state.status==="ready";
 const preferences=ready?state.value:defaultWorkspacePreferences();
 const remembered=preferences.rememberFilters?preferences.filtersByProject[project]:undefined;
 const filters={...emptyWorkspaceFilters(),...remembered,...explicitFilters(project),...(sessionFilters.owner===viewer?sessionFilters.values[project]?.filters:undefined)};
 const effective=useRef({project,filters});effective.current={project,filters};
 useEffect(()=>{
  const token={};session.current=token;let active=true;const controller=new AbortController();
  setState({owner:viewer,status:"loading",value:defaultWorkspacePreferences(),saving:false,saveError:false});
  if(local.current.owner!==viewer){const reset={owner:viewer,values:{}};local.current=reset;setSessionFilters(reset);acknowledged.current={};}
  if(!viewer){setState(previous=>({...previous,status:"error"}));return()=>{session.current=null;};}
  void (async()=>{
   await outstandingWrites.get(viewer)?.catch(()=>undefined);
   if(!active||getActiveViewer()!==viewer)return;
   const value=await loadWorkspacePreferences(controller.signal);
   if(active&&session.current===token&&getActiveViewer()===viewer){const next={owner:viewer,status:"ready" as const,value,saving:false,saveError:false};current.current=next;setState(next);}
  })().catch(()=>{if(active&&session.current===token)setState(previous=>({...previous,status:"error"}));});
  return()=>{active=false;controller.abort();if(session.current===token)session.current=null;};
 },[viewer,retry]);
 function rememberLocally(target:TeamProject,next:WorkspaceFilters) {
  const entry={filters:next,revision:++sequence.current};
  const snapshot={owner:viewer,values:{...(local.current.owner===viewer?local.current.values:{}),[target]:entry}};
  local.current=snapshot;setSessionFilters(snapshot);return entry;
 }
 function setFilters(patch:Partial<WorkspaceFilters>) {
  const before=local.current.owner===viewer?local.current.values[project]?.filters:undefined;
  rememberLocally(project,{...(before??effective.current.filters),...patch});
 }
 const enqueue=useCallback((update:(value:WorkspacePreferences)=>WorkspacePreferences,reconcile?:{project:TeamProject;entry:FilterEntry}):Promise<boolean>=>{
  const token=session.current;
  if(!token||!viewer||current.current.owner!==viewer||current.current.status!=="ready")return Promise.resolve(false);
  setState(previous=>({...previous,saving:true,saveError:false}));
  const operation=serial.current.then(async()=>{
   if(session.current!==token||getActiveViewer()!==viewer)return false;
   const value=update(current.current.value);
   if(value===current.current.value)return true;
   try{
    const saved=await saveWorkspacePreferences(value);
    if(session.current!==token||getActiveViewer()!==viewer)return false;
    const next={owner:viewer,status:"ready" as const,value:saved,saving:false,saveError:false};current.current=next;setState(next);
    if(reconcile&&local.current.owner===viewer&&local.current.values[reconcile.project]?.revision===reconcile.entry.revision&&saved.rememberFilters){
     const filters=saved.filtersByProject[reconcile.project]??emptyWorkspaceFilters();
     const snapshot={...local.current,values:{...local.current.values,[reconcile.project]:{filters,revision:reconcile.entry.revision}}};local.current=snapshot;setSessionFilters(snapshot);
    }
    return true;
   }catch{
    if(session.current===token&&getActiveViewer()===viewer)setState(previous=>({...previous,saving:false,saveError:true}));return false;
   }
  });
  const tail=operation.then(()=>undefined);serial.current=tail;outstandingWrites.set(viewer,tail);
  void tail.finally(()=>{if(outstandingWrites.get(viewer)===tail)outstandingWrites.delete(viewer);if(session.current===token)setState(previous=>({...previous,saving:false}));});
  return operation;
 },[viewer]);
 useEffect(()=>{
  if(!ready||!preferences.rememberFilters||sessionFilters.owner!==viewer)return;
  const pending=teamProjects.flatMap(target=>{
   const entry=sessionFilters.values[target];
   return entry&&entry.revision>(acknowledged.current[target]??0)?[{project:target,entry}]:[];
  });
  if(!pending.length)return;
  // Pending revisions belong to their originating project, not the current view.
  const timer=setTimeout(()=>{
   for(const {project:target,entry} of pending){
    acknowledged.current[target]=entry.revision;
    void enqueue(value=>value.rememberFilters?{...value,filtersByProject:{...value.filtersByProject,[target]:entry.filters}}:value,{project:target,entry});
   }
  },250);
  return()=>clearTimeout(timer);
 },[sessionFilters,viewer,ready,preferences.rememberFilters,enqueue]);
 async function saveSettings(value:Pick<WorkspacePreferences,"rememberFilters"|"refreshMinutes">) {
  const snapshot={...effective.current.filters};const target=effective.current.project;
  const entry=rememberLocally(target,snapshot);acknowledged.current[target]=entry.revision;
  return enqueue(previous=>({...previous,...value,filtersByProject:value.rememberFilters?{...previous.filtersByProject,[target]:snapshot}:previous.filtersByProject}),{project:target,entry});
 }
 return {preferences,filters,setFilters,saveSettings,ready,loading:state.owner!==viewer||state.status==="loading",loadError:state.owner===viewer&&state.status==="error",saveError:state.owner===viewer&&state.saveError,saving:state.owner===viewer&&state.saving,refreshMinutes:ready?preferences.refreshMinutes:0,retry:()=>setRetry(value=>value+1)};
}
export type WorkspaceDefaults=ReturnType<typeof useWorkspaceDefaults>;
