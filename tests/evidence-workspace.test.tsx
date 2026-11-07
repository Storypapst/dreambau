// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveViewer } from "../src/client/api.js";
import { loadWorkspacePreferences, saveWorkspacePreferences } from "../src/client/workspace-preferences-client.js";
import { EvidenceWorkspace } from "../src/client/components/evidence-workspace.js";
import { loadWorkspaceRuns, loadWorkspaceRun, loadWorkspaceDocuments, addWorkspaceReference } from "../src/client/workspace-client.js";
import type { WorkspaceRunSummary, WorkspaceRunDetail, WorkspacePage, WorkspaceDocument } from "../src/shared/workspace.js";
vi.mock("../src/client/workspace-client.js", async (original) => ({ ...await original<typeof import("../src/client/workspace-client.js")>(), loadWorkspaceRuns: vi.fn(), loadWorkspaceRun: vi.fn(), loadWorkspaceDocuments: vi.fn(), addWorkspaceReference: vi.fn() }));
vi.mock("../src/client/workspace-preferences-client.js", async (original) => ({ ...await original<typeof import("../src/client/workspace-preferences-client.js")>(), loadWorkspacePreferences: vi.fn(), saveWorkspacePreferences: vi.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const cohort: WorkspaceRunSummary = { id: "same-id", source: "test-run", title: "Released failing cohort", project: "oriso", environment: "dev", createdAt: "2026-11-07T10:00:00Z", lifecycle: "released", result: "failed", commitSha: "a".repeat(40), applicationVersion: "1.2", repository: "Storypapst/dreambau", pullRequestUrl: null, filesCount: 0, owner: "QA" };
const evidence: WorkspaceRunSummary = { ...cohort, source: "evidence-run", title: "Actual visual evidence", lifecycle: "published", result: "informational", filesCount: 1 };
const details = (run: WorkspaceRunSummary): WorkspaceRunDetail => ({ ...run, events: [], files: [], references: [], evidenceStatus: "available" });
const page = (items: WorkspaceRunSummary[], nextCursor: string|null = null): WorkspacePage<WorkspaceRunSummary> => ({ items, nextCursor, evidenceStatus: "available" });
function deferred<T>() { let resolve!: (value:T)=>void; let reject!: (error:unknown)=>void; const promise = new Promise<T>((done,fail)=>{resolve=done;reject=fail;}); return {promise, resolve, reject}; }
describe("EvidenceWorkspace", () => {
 let root:Root; let container:HTMLDivElement;
 beforeEach(()=>{
  container=document.createElement("div"); document.body.append(container); root=createRoot(container); setActiveViewer("viewer-a");
  vi.mocked(loadWorkspacePreferences).mockReset().mockResolvedValue({rememberFilters:true,refreshMinutes:15,filtersByProject:{}});
  vi.mocked(saveWorkspacePreferences).mockReset().mockImplementation(async value=>value);
  vi.mocked(loadWorkspaceRuns).mockReset().mockResolvedValue(page([cohort,evidence]));
  vi.mocked(loadWorkspaceRun).mockReset().mockImplementation(async(source)=>details(source==="test-run"?cohort:evidence));
  vi.mocked(loadWorkspaceDocuments).mockReset().mockResolvedValue({items:[],nextCursor:null,evidenceStatus:"available"});
  vi.mocked(addWorkspaceReference).mockReset();
  vi.stubGlobal("ResizeObserver",class{observe(){}unobserve(){}disconnect(){}}); Element.prototype.scrollIntoView=vi.fn();
 });
 afterEach(async()=>{await act(async()=>root.unmount());container.remove();document.querySelectorAll('[data-slot="dialog-portal"],[data-slot="select-portal"]').forEach(node=>node.remove());setActiveViewer(null);vi.unstubAllGlobals();});
 const render=(locale:"de"|"en"="en",project:"oriso"|"orimo"="oriso")=>act(async()=>root.render(<EvidenceWorkspace locale={locale} project={project} onBack={()=>undefined}/>));
 const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(node=>node.textContent===label)!;
 it.each(["de","en"] as const)("separates source, released lifecycle and measured result (%s)",async(locale)=>{
  await render(locale);
  expect(container.textContent).toContain(locale==="de"?"Fehlgeschlagen":"Failed");
  expect(container.textContent).toContain(locale==="de"?"Konten freigegeben":"Accounts released");
  expect(container.textContent).not.toContain(locale==="de"?"Bestanden":"Passed");
  const options=[...container.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  expect(options).toHaveLength(2);
  await act(async()=>options[1].click());
  expect(loadWorkspaceRun).toHaveBeenLastCalledWith("evidence-run","same-id",expect.any(AbortSignal));
  expect(container.querySelector(".workspace-detail")?.textContent).toContain(locale==="de"?"Evidence-Eintrag":"Evidence entry");
  expect(container.querySelector(".workspace-detail")?.textContent).toContain(locale==="de"?"Kein Testlauf mit Testkonten":"No test-account run");
 });
 it("shows genuine empty, denied, and partial outage states without fabricating rows",async()=>{
  vi.mocked(loadWorkspaceRuns).mockResolvedValueOnce(page([]));await render();
  expect(container.textContent).toContain("No runs or evidence found");expect(container.querySelectorAll('[role="option"]')).toHaveLength(0);
  vi.mocked(loadWorkspaceRuns).mockRejectedValueOnce(new Error("scope_denied"));await render("en","orimo");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Access denied");
  vi.mocked(loadWorkspaceRuns).mockResolvedValueOnce({...page([cohort]),evidenceStatus:"unavailable"});await render();
  expect(container.textContent).toContain("Evidence is temporarily unavailable");expect(container.textContent).toContain(cohort.title);
 });
 it.each(["de","en"] as const)("asks to refine broad reference searches without claiming an outage or empty catalog (%s)",async(locale)=>{
  await render(locale);
  vi.mocked(loadWorkspaceRuns).mockRejectedValueOnce(new Error("reference_search_too_broad"));
  const input=container.querySelector<HTMLInputElement>("input")!;
  const type=async(value:string)=>{
   await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));});
   await act(async()=>new Promise(resolve=>setTimeout(resolve,300)));
  };
  await type("broad reference");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(locale==="de"?"Suche eingrenzen":"Refine your search");
  expect(container.textContent).not.toContain(locale==="de"?"gerade nicht erreichbar":"temporarily unavailable");
  expect(container.textContent).not.toContain(locale==="de"?"Keine Testläufe oder Belege gefunden":"No runs or evidence found");
  expect(container.textContent).not.toContain(locale==="de"?"0 Einträge geladen":"0 entries loaded");
  expect(input.value).toBe("broad reference");expect(input.disabled).toBe(false);
  await act(async()=>button(locale==="de"?"Suchbegriff bearbeiten":"Edit search").click());
  expect(document.activeElement).toBe(input);expect(input.selectionStart).toBe(0);expect(input.selectionEnd).toBe(input.value.length);
  vi.mocked(loadWorkspaceRuns).mockResolvedValueOnce(page([evidence]));
  await type("narrow reference");
  expect(loadWorkspaceRuns).toHaveBeenLastCalledWith(expect.objectContaining({q:"narrow reference"}),expect.any(AbortSignal));
  expect(container.querySelectorAll('[role="option"]')).toHaveLength(1);
 });
 it("keeps pagination source-aware and never applies a late response from another project",async()=>{
  vi.mocked(loadWorkspaceRuns).mockResolvedValueOnce(page([cohort],"opaque-cursor")).mockResolvedValueOnce(page([evidence]));
  await render();await act(async()=>button("Load more").click());
  expect(loadWorkspaceRuns).toHaveBeenLastCalledWith(expect.objectContaining({project:"oriso",cursor:"opaque-cursor"}),expect.any(AbortSignal));
  expect(container.querySelectorAll('[role="option"]')).toHaveLength(2);
  const old=deferred<WorkspacePage<WorkspaceRunSummary>>();vi.mocked(loadWorkspaceRuns).mockReturnValueOnce(old.promise);await render("en","orimo");
  vi.mocked(loadWorkspaceRuns).mockResolvedValueOnce(page([{...cohort,title:"Current project"}]));await render();
  await act(async()=>old.resolve(page([{...cohort,title:"STALE PRIVATE ROW",project:"orimo"}])));
  expect(container.textContent).toContain("Current project");expect(container.textContent).not.toContain("STALE PRIVATE ROW");
 });
 it("sends search and filters to the server and resets pagination",async()=>{
  await render();
  const choose=async(name:string,value:string)=>{
   const trigger=container.querySelector<HTMLElement>('[role="combobox"][aria-label="'+name+'"]')!;
   await act(async()=>trigger.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})));
   const option=[...document.querySelectorAll<HTMLElement>('[data-slot="select-item"]')].find(node=>node.textContent===value)!;
   expect(option).toBeTruthy();await act(async()=>option.click());
  };
  await choose("Source","Evidence entries");await choose("Environment","Dev");await choose("Result","Failed");
  const input=container.querySelector<HTMLInputElement>('input[aria-label="Search runs and evidence"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"issue 212");input.dispatchEvent(new Event("input",{bubbles:true}));});
  await act(async()=>new Promise(resolve=>setTimeout(resolve,300)));
  expect(loadWorkspaceRuns).toHaveBeenLastCalledWith(expect.objectContaining({project:"oriso",source:"evidence-run",environment:"dev",result:"failed",q:"issue 212",cursor:undefined}),expect.any(AbortSignal));
 });
 it("loads actual document artifacts and safely renders an untrusted text body",async()=>{
  const artifact:WorkspaceDocument={id:"doc-1",runId:"evidence-1",kind:"document",filename:"guide.txt",caption:"Actual guide",contentType:"text/plain",byteSize:40,sha256:"b".repeat(64),publicUrl:null,viewerUrl:null,previewUrl:"/testmails/api/workspace/evidence/evidence-1/files/doc-1/content?viewer=viewer-a",downloadUrl:null,processingState:"ready",project:"oriso",environment:"dev",createdAt:cohort.createdAt,runTitle:"Guide upload"};
  vi.mocked(loadWorkspaceDocuments).mockResolvedValue({items:[artifact],nextCursor:null,evidenceStatus:"available"});
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response('<script>alert("x")</script> Useful guide',{headers:{"content-type":"text/plain"}})));
  await render();await act(async()=>[...container.querySelectorAll<HTMLElement>('[role="tab"]')].find(node=>node.textContent?.includes("Documents"))!.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})));
  expect(loadWorkspaceDocuments).toHaveBeenCalledWith(expect.objectContaining({project:"oriso"}),expect.any(AbortSignal));
  await act(async()=>button("Actual guide").click());
  expect(document.querySelector('[role="dialog"] pre')?.textContent).toContain('<script>alert("x")</script>');
  expect(document.querySelector('[role="dialog"] script')).toBeNull();
 });
 it("closes an open preview when a fresh scope check denies pagination",async()=>{
  const later=deferred<WorkspacePage<WorkspaceRunSummary>>();
  vi.mocked(loadWorkspaceRuns).mockResolvedValueOnce(page([cohort],"next-page")).mockReturnValueOnce(later.promise);
  vi.mocked(loadWorkspaceRun).mockResolvedValueOnce({...details(cohort),files:[{id:"scope-file",runId:"scope-run",kind:"screenshot",filename:"scope.png",caption:"Scope proof",contentType:"image/png",byteSize:1024,sha256:"a".repeat(64),publicUrl:null,viewerUrl:null,previewUrl:"/testmails/api/workspace/evidence/scope-run/files/scope-file/content?viewer=viewer-a",downloadUrl:null,processingState:"ready"}]});
  await render();await act(async()=>button("Load more").click());
  await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="Open evidence: Scope proof"]')!.click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async()=>later.reject(new Error("scope_denied")));
  expect(container.textContent).toContain("Access denied");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
 });
 it("shows measured event counts without inventing missing counts or rendering arbitrary payload",async()=>{
  vi.mocked(loadWorkspaceRun).mockResolvedValueOnce({...details(cohort),events:[{type:"run_failed",createdAt:cohort.createdAt,actor:"QA",payload:{checks:3,failures:1,privateDebug:"INTERNAL PRIVATE DATA"}},{type:"run_released",createdAt:cohort.createdAt,actor:"QA",payload:{}}]});
  await render();const activity=container.querySelector(".workspace-events")?.textContent;
  expect(activity).toContain("Checks: 3");expect(activity).toContain("Failures: 1");expect(activity).not.toContain("INTERNAL PRIVATE DATA");
  expect(container.querySelectorAll(".workspace-event-counts")).toHaveLength(1);
 });
 it("opens an explicitly attached document in its viewer without navigating away from the test run",async()=>{
  const artifact:WorkspaceDocument={id:"attached-doc",runId:"evidence-doc-run",kind:"document",filename:"verification.txt",caption:"Linked verification",contentType:"text/plain",byteSize:12,sha256:"c".repeat(64),publicUrl:null,viewerUrl:null,previewUrl:"/testmails/api/workspace/evidence/evidence-doc-run/files/attached-doc/content?viewer=viewer-a",downloadUrl:null,processingState:"ready",project:"oriso",environment:"dev",createdAt:cohort.createdAt,runTitle:"Verification evidence"};
  vi.mocked(loadWorkspaceRun).mockResolvedValue({...details(cohort),files:[artifact],references:[{id:"doc-ref",kind:"document",label:"verification.txt",url:null,target:{source:"evidence-run",id:artifact.runId},fileId:artifact.id}]});
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("Actual verification text",{headers:{"content-type":"text/plain"}})));
  await render();
  await act(async()=>button("verification.txt").click());
  expect(document.querySelector('[role="dialog"] pre')?.textContent).toContain("Actual verification text");
  expect(loadWorkspaceRun).toHaveBeenCalledTimes(1);
  expect(loadWorkspaceRun).toHaveBeenLastCalledWith("test-run",cohort.id,expect.any(AbortSignal));
 });
 it("adds explicit Issue/PR links only after a real server response",async()=>{
  vi.mocked(addWorkspaceReference).mockResolvedValue({...details(cohort),references:[{id:"reference-1",kind:"issue",label:"Issue 212",url:"https://github.com/Storypapst/dreambau/issues/212"}]});
  await render();await act(async()=>button("Add link").click());
  const input=document.querySelector<HTMLInputElement>('input[aria-label="GitHub URL"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"https://github.com/Storypapst/dreambau/issues/212");input.dispatchEvent(new Event("input",{bubbles:true}));});
  await act(async()=>document.querySelector('[role="dialog"] form')!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(addWorkspaceReference).toHaveBeenCalledWith("test-run","same-id",{kind:"issue",url:"https://github.com/Storypapst/dreambau/issues/212"});
  expect(container.querySelector('a[href="https://github.com/Storypapst/dreambau/issues/212"]')).not.toBeNull();
 });
});
