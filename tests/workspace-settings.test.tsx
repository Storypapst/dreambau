// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EvidenceWorkspace } from "../src/client/components/evidence-workspace.js";
import { loadWorkspaceRuns, loadWorkspaceRun, loadWorkspaceDocuments } from "../src/client/workspace-client.js";
import { loadWorkspacePreferences, saveWorkspacePreferences } from "../src/client/workspace-preferences-client.js";
import { setActiveViewer } from "../src/client/api.js";
import type { WorkspacePreferences } from "../src/shared/workspace-preferences.js";
import type { WorkspaceRunDetail } from "../src/shared/workspace.js";
vi.mock("../src/client/workspace-client.js",async(original)=>({...await original<typeof import("../src/client/workspace-client.js")>(),loadWorkspaceRuns:vi.fn(),loadWorkspaceRun:vi.fn(),loadWorkspaceDocuments:vi.fn()}));
vi.mock("../src/client/workspace-preferences-client.js",async(original)=>({...await original<typeof import("../src/client/workspace-preferences-client.js")>(),loadWorkspacePreferences:vi.fn(),saveWorkspacePreferences:vi.fn()}));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const run:WorkspaceRunDetail={id:"run-1",source:"test-run",title:"Recorded run",project:"oriso",environment:"dev",createdAt:"2026-11-07T10:00:00Z",lifecycle:"released",result:null,commitSha:"a".repeat(40),applicationVersion:null,repository:null,pullRequestUrl:null,filesCount:0,owner:null,files:[],events:[],references:[],evidenceStatus:"available"};
const defaults=():WorkspacePreferences=>({rememberFilters:true,refreshMinutes:15,filtersByProject:{}});
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};};
describe("personal workspace settings",()=>{
 let root:Root;let container:HTMLDivElement;let stored:WorkspacePreferences;
 beforeEach(()=>{
  stored=defaults();container=document.createElement("div");document.body.append(container);root=createRoot(container);setActiveViewer("viewer-a");history.replaceState(null,"","/testmails/runs?project=ORISO");
  vi.mocked(loadWorkspaceRuns).mockReset().mockResolvedValue({items:[run],nextCursor:null,evidenceStatus:"available"});vi.mocked(loadWorkspaceRun).mockReset().mockResolvedValue(run);vi.mocked(loadWorkspaceDocuments).mockReset().mockResolvedValue({items:[],nextCursor:null,evidenceStatus:"available"});
  vi.mocked(loadWorkspacePreferences).mockReset().mockImplementation(async()=>structuredClone(stored));vi.mocked(saveWorkspacePreferences).mockReset().mockImplementation(async value=>{stored=structuredClone(value);return structuredClone(stored);});
  vi.stubGlobal("ResizeObserver",class{observe(){}unobserve(){}disconnect(){}});Element.prototype.scrollIntoView=vi.fn();
 });
 afterEach(async()=>{await act(async()=>root.unmount());container.remove();setActiveViewer(null);vi.unstubAllGlobals();});
 const render=(project:"oriso"|"orimo"="oriso")=>act(async()=>root.render(<EvidenceWorkspace locale="en" project={project} projects={["oriso","orimo"]} onProjectChange={()=>undefined} onBack={()=>undefined}/>));
 // Flush React work while observing the saved API value or rendered query, not a guessed debounce duration.
 const waitFor=async(assertion:()=>void)=>{
  const deadline=Date.now()+6000;
  for(;;){
   await act(async()=>new Promise(resolve=>setTimeout(resolve,25)));
   try{assertion();return;}catch(error){if(Date.now()>=deadline)throw error;}
  }
 };
 const choose=async(label:string,value:string)=>{
  const trigger=document.querySelector<HTMLElement>('[role="combobox"][aria-label="'+label+'"]')!;expect(trigger).toBeTruthy();
  await act(async()=>trigger.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})));
  const option=[...document.querySelectorAll<HTMLElement>('[data-slot="select-item"]')].find(node=>node.textContent===value)!;expect(option).toBeTruthy();await act(async()=>option.click());
 };
 it("remembers only source/environment per project and restores them on reload",async()=>{
  await render();await choose("Source","Evidence entries");await choose("Environment","Dev");
  await waitFor(()=>expect(stored.filtersByProject.oriso).toEqual({source:"evidence-run",environment:"dev"}));
  const saves=vi.mocked(saveWorkspacePreferences).mock.calls.length;
  const search=container.querySelector<HTMLInputElement>('input')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(search,"PRIVATE SEARCH");search.dispatchEvent(new Event("input",{bubbles:true}));});
  await choose("Result","Failed");
  await waitFor(()=>expect(loadWorkspaceRuns).toHaveBeenLastCalledWith(expect.objectContaining({q:"PRIVATE SEARCH",result:"failed"}),expect.any(AbortSignal)));
  expect(saveWorkspacePreferences).toHaveBeenCalledTimes(saves);expect(JSON.stringify(stored)).not.toContain("PRIVATE SEARCH");expect(stored).not.toHaveProperty("result");
  await act(async()=>root.unmount());root=createRoot(container);await render();
  expect(loadWorkspaceRuns).toHaveBeenLastCalledWith(expect.objectContaining({project:"oriso",source:"evidence-run",environment:"dev",q:"",result:undefined}),expect.any(AbortSignal));
 },15000);
 it("persists a pending project's filter revision across an immediate project switch and reload",async()=>{
  await render();await choose("Source","Evidence entries");
  history.replaceState(null,"","/testmails/runs?project=ORIMO");await render("orimo");
  await waitFor(()=>expect(stored.filtersByProject.oriso).toEqual({source:"evidence-run",environment:"all"}));
  await choose("Source","Test-account runs");await choose("Environment","Dev");
  await waitFor(()=>expect(stored.filtersByProject.orimo).toEqual({source:"test-run",environment:"dev"}));
  expect(stored.filtersByProject.oriso).toEqual({source:"evidence-run",environment:"all"});
  await act(async()=>root.unmount());root=createRoot(container);history.replaceState(null,"","/testmails/runs?project=ORISO");await render();
  expect(loadWorkspaceRuns).toHaveBeenLastCalledWith(expect.objectContaining({project:"oriso",source:"evidence-run",environment:undefined}),expect.any(AbortSignal));
 },15000);
 it("gives explicit URL filters priority and never applies stale defaults from another project",async()=>{
  stored={...defaults(),filtersByProject:{oriso:{source:"evidence-run",environment:"pre-dev"},orimo:{source:"test-run",environment:"dev"}}};
  history.replaceState(null,"","/testmails/runs?project=ORISO&source=test-run&environment=local");
  await render();expect(loadWorkspaceRuns).toHaveBeenLastCalledWith(expect.objectContaining({project:"oriso",source:"test-run",environment:"local"}),expect.any(AbortSignal));
  const pending=deferred<WorkspacePreferences>();vi.mocked(loadWorkspacePreferences).mockReturnValueOnce(pending.promise);
  await act(async()=>root.unmount());root=createRoot(container);await render();await render("orimo");
  await act(async()=>pending.resolve(stored));
  expect(loadWorkspaceRuns).toHaveBeenLastCalledWith(expect.objectContaining({project:"orimo",source:"test-run",environment:"dev"}),expect.any(AbortSignal));
  expect(document.querySelector('[aria-label="Environment"]')?.textContent).not.toContain("PreDev");
 });
 it("keeps a user's current filter choice when defaults arrive late",async()=>{
  const pending=deferred<WorkspacePreferences>();vi.mocked(loadWorkspacePreferences).mockReturnValueOnce(pending.promise);await render();
  await choose("Source","Test-account runs");await act(async()=>pending.resolve({...defaults(),filtersByProject:{oriso:{source:"evidence-run",environment:"pre-dev"}}}));
  await waitFor(()=>expect(stored.filtersByProject.oriso?.source).toBe("test-run"));
  expect(loadWorkspaceRuns).toHaveBeenLastCalledWith(expect.objectContaining({source:"test-run"}),expect.any(AbortSignal));
  expect(stored.filtersByProject.oriso?.source).toBe("test-run");
 },15000);
 it("saves basic settings, disables remembered filters, and reloads manual refresh honestly",async()=>{
  await render();await choose("Source","Evidence entries");
  await waitFor(()=>expect(stored.filtersByProject.oriso?.source).toBe("evidence-run"));
  await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="Workspace settings"]')!.click());
  await choose("Display refresh","Manual only");
  await act(async()=>document.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click());
  await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(node=>node.textContent==="Save settings")!.click());
  expect(stored.refreshMinutes).toBe(0);expect(stored.rememberFilters).toBe(false);
  const saves=vi.mocked(saveWorkspacePreferences).mock.calls.length;await choose("Source","Test-account runs");await choose("Environment","PreDev");
  // Negative assertion: allow queued writes to run before confirming that remembering is disabled.
  await act(async()=>new Promise(resolve=>setTimeout(resolve,350)));
  expect(saveWorkspacePreferences).toHaveBeenCalledTimes(saves);
  await act(async()=>root.unmount());root=createRoot(container);await render();expect(loadWorkspaceRuns).toHaveBeenLastCalledWith(expect.objectContaining({source:"all",environment:undefined}),expect.any(AbortSignal));
  await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="Workspace settings"]')!.click());expect(document.querySelector('[aria-label="Display refresh"]')?.textContent).toBe("Manual only");
 },15000);
 it("keeps run details usable when settings cannot be loaded and avoids overwriting unknown defaults",async()=>{
  vi.mocked(loadWorkspacePreferences).mockRejectedValueOnce(new Error("HTTP 503"));await render();expect(container.textContent).toContain(run.title);
  await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="Workspace settings"]')!.click());expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Settings could not be loaded");
  expect([...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(node=>node.textContent==="Save settings")?.disabled).toBe(true);
  expect(saveWorkspacePreferences).not.toHaveBeenCalled();
 });
});
