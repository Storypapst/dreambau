// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EvidenceWorkspace } from "../src/client/components/evidence-workspace.js";
import { loadWorkspaceRuns, loadWorkspaceRun, loadWorkspaceDocuments } from "../src/client/workspace-client.js";
import { loadWorkspaceGithub, refreshWorkspaceGithub } from "../src/client/workspace-github-client.js";
import { loadWorkspacePreferences, saveWorkspacePreferences } from "../src/client/workspace-preferences-client.js";
import { setActiveViewer } from "../src/client/api.js";
import type { WorkspaceRunDetail } from "../src/shared/workspace.js";
import type { WorkspaceGithubFacts, WorkspaceGithubResponse, WorkspaceGithubSnapshot } from "../src/shared/workspace-github.js";
vi.mock("../src/client/workspace-client.js",async(original)=>({...await original<typeof import("../src/client/workspace-client.js")>(),loadWorkspaceRuns:vi.fn(),loadWorkspaceRun:vi.fn(),loadWorkspaceDocuments:vi.fn()}));
vi.mock("../src/client/workspace-github-client.js",()=>({loadWorkspaceGithub:vi.fn(),refreshWorkspaceGithub:vi.fn()}));
vi.mock("../src/client/workspace-preferences-client.js",async(original)=>({...await original<typeof import("../src/client/workspace-preferences-client.js")>(),loadWorkspacePreferences:vi.fn(),saveWorkspacePreferences:vi.fn()}));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const run:WorkspaceRunDetail={id:"run-1",source:"test-run",title:"Actual cohort details",project:"oriso",environment:"dev",createdAt:"2026-11-07T10:00:00Z",lifecycle:"released",result:"failed",commitSha:"a".repeat(40),applicationVersion:"1.2",repository:null,pullRequestUrl:null,filesCount:0,owner:"QA",files:[],events:[],evidenceStatus:"available",references:[{id:"issue-1",kind:"issue",label:"Tracked issue",url:"https://github.com/Storypapst/dreambau/issues/212"},{id:"pr-1",kind:"pull-request",label:"Tracked PR",url:"https://github.com/Storypapst/dreambau/pull/213"}]};
const issue:WorkspaceGithubFacts={kind:"issue",title:"Fetched issue title",state:"closed",stateReason:"completed",draft:false,mergedAt:null,releaseAssignments:[{title:"v2.4",url:"https://github.com/orgs/Storypapst/projects/1",source:"project-field"},{title:"v2.2",url:"https://github.com/Storypapst/dreambau/milestone/4",source:"milestone"}],boards:[{title:"Delivery",status:"In review",url:"https://github.com/orgs/Storypapst/projects/1"}],closingPullRequests:[{url:"https://github.com/Storypapst/dreambau/pull/213",title:"First part",state:"merged",draft:false},{url:"https://github.com/Storypapst/dreambau/pull/214",title:"Second part",state:"open",draft:false}],closingPullRequestsComplete:false,publishedReleases:[],releaseCoverage:"unknown"};
const pr:WorkspaceGithubFacts={...issue,kind:"pull-request",title:"Fetched PR title",state:"merged",mergedAt:"2026-11-07T11:00:00Z",closingPullRequests:[],closingPullRequestsComplete:true,publishedReleases:[{tag:"v2.3.1",title:"Released version",url:"https://github.com/Storypapst/dreambau/releases/tag/v2.3.1",publishedAt:"2026-11-07T11:30:00Z"}],releaseCoverage:"partial"};
const item=(referenceId:string,facts:WorkspaceGithubFacts|null):WorkspaceGithubSnapshot=>({referenceId,url:referenceId==="issue-1"?run.references[0].url!:run.references[1].url!,status:"ready",observedAt:"2026-11-07T12:00:00Z",lastAttemptAt:"2026-11-07T12:00:00Z",cached:true,stale:false,errorCode:null,facts});
const response=(items:WorkspaceGithubSnapshot[]=[]):WorkspaceGithubResponse=>({status:"ready",items,limitReached:false,retryAfter:null});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};}
describe("workspace GitHub facts",()=>{
 let root:Root;let container:HTMLDivElement;
 beforeEach(()=>{
  container=document.createElement("div");document.body.append(container);root=createRoot(container);setActiveViewer("viewer-a");history.replaceState(null,"","/testmails/runs?project=ORISO");
  vi.mocked(loadWorkspaceRuns).mockReset().mockResolvedValue({items:[run],nextCursor:null,evidenceStatus:"available"});
  vi.mocked(loadWorkspaceRun).mockReset().mockResolvedValue(run);vi.mocked(loadWorkspaceDocuments).mockReset().mockResolvedValue({items:[],nextCursor:null,evidenceStatus:"available"});
  vi.mocked(loadWorkspaceGithub).mockReset().mockResolvedValue(response([item("issue-1",issue),item("pr-1",pr)]));vi.mocked(refreshWorkspaceGithub).mockReset().mockResolvedValue(response([item("issue-1",issue)]));
  vi.mocked(loadWorkspacePreferences).mockReset().mockResolvedValue({rememberFilters:true,refreshMinutes:15,filtersByProject:{}});vi.mocked(saveWorkspacePreferences).mockReset().mockImplementation(async value=>value);
  Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});
 });
 afterEach(async()=>{await act(async()=>root.unmount());container.remove();setActiveViewer(null);vi.useRealTimers();vi.unstubAllGlobals();});
 const render=(locale:"de"|"en"="en",project:"oriso"|"orimo"="oriso")=>act(async()=>root.render(<EvidenceWorkspace locale={locale} project={project} onBack={()=>undefined}/>));
 it("does not block run detail on a delayed GitHub response and never reads other rows",async()=>{
  vi.mocked(loadWorkspaceRuns).mockResolvedValueOnce({items:[run,{...run,id:"other-run",title:"Unselected record"}],nextCursor:null,evidenceStatus:"available"});
  const pending=deferred<WorkspaceGithubResponse>();vi.mocked(loadWorkspaceGithub).mockReturnValueOnce(pending.promise);
  await render();expect(container.textContent).toContain(run.title);expect(container.querySelector('a[href="'+run.references[0].url+'"]')).not.toBeNull();
  expect(loadWorkspaceGithub).toHaveBeenCalledTimes(1);expect(loadWorkspaceGithub).toHaveBeenCalledWith("test-run","run-1",expect.any(AbortSignal));
  expect(container.querySelector('.workspace-github')?.textContent).not.toContain(issue.title);
  await act(async()=>pending.resolve(response([item("issue-1",issue)])));expect(container.textContent).toContain(issue.title);
 });
 it.each(["de","en"] as const)("separates observed issue/PR state, partial merges, release assignments and verified release (%s)",async(locale)=>{
  await render(locale);const panel=container.querySelector('.workspace-github');expect(panel?.textContent).toContain(issue.title);expect(panel?.textContent).toContain(pr.title);
  expect(panel?.textContent).toContain(locale==="de"?"Geschlossen":"Closed");expect(panel?.textContent).toContain(locale==="de"?"Gemergt":"Merged");
  expect(panel?.textContent).toContain("In review");expect(panel?.textContent).toContain("v2.4");expect(panel?.textContent).toContain("v2.2");expect(panel?.textContent).toContain("v2.3.1");
  expect(panel?.textContent).toContain(locale==="de"?"Release-Zuordnung":"Release assignments");expect(panel?.textContent).toContain(locale==="de"?"Verifiziertes veröffentlichtes Release":"Verified published release");
  expect(panel?.textContent).toContain(locale==="de"?"Zuordnung unvollständig":"Association incomplete");expect(panel?.textContent).not.toContain("Deployed v2.4");
 });
 it("keeps partial board and release coverage unknown and never completes an incomplete PR association",async()=>{
  const partialIssue={...issue,boards:[],releaseAssignments:[],closingPullRequests:issue.closingPullRequests.map(value=>({...value,state:"merged" as const})),closingPullRequestsComplete:false};
  const partialPr={...pr,boards:[],releaseAssignments:[],publishedReleases:[],releaseCoverage:"unknown" as const};
  vi.mocked(loadWorkspaceGithub).mockResolvedValueOnce({...response([{...item("issue-1",partialIssue),status:"partial"},{...item("pr-1",partialPr),status:"partial"}]),status:"partial"});
  await render();const panel=container.querySelector('.workspace-github')?.textContent;
  expect(panel).toContain("Release assignments unknown");expect(panel).toContain("Board status unknown");expect(panel).toContain("Published release inclusion unknown");
  expect(panel).toContain("Known merged PRs: 2");expect(panel).toContain("Association incomplete");expect(panel).not.toContain("2 / 2 associated PRs merged");
  expect(container.querySelector('a[href="'+run.references[0].url+'"]')).not.toBeNull();
 });
 it("keeps ordinary links for an unconfigured integration and hides denied cached metadata",async()=>{
  vi.mocked(loadWorkspaceGithub).mockResolvedValueOnce({...response(),status:"unconfigured"});await render();expect(container.textContent).toContain("GitHub is not connected");expect(container.querySelector('a[href="'+run.references[0].url+'"]')).not.toBeNull();
  vi.mocked(loadWorkspaceRun).mockResolvedValueOnce({...run,project:"orimo"});vi.mocked(loadWorkspaceGithub).mockResolvedValueOnce({...response([{...item("issue-1",issue),status:"denied"}]),status:"partial"});
  await render("en","orimo");expect(container.querySelector('.workspace-github')?.textContent).not.toContain(issue.title);expect(container.querySelector('.workspace-github')?.textContent).toContain("Repository access is not available");
 });
 it("ignores late metadata across project switches and keeps last known facts explicitly stale on refresh failure",async()=>{
  const pending=deferred<WorkspaceGithubResponse>();vi.mocked(loadWorkspaceGithub).mockReturnValueOnce(pending.promise);await render();
  vi.mocked(loadWorkspaceRun).mockResolvedValueOnce({...run,project:"orimo"});vi.mocked(loadWorkspaceGithub).mockResolvedValueOnce(response([item("pr-1",{...pr,title:"Current project facts"})]));await render("en","orimo");
  await act(async()=>pending.resolve(response([item("issue-1",{...issue,title:"PRIVATE STALE OTHER PROJECT"})])));
  expect(container.textContent).toContain("Current project facts");expect(container.textContent).not.toContain("PRIVATE STALE OTHER PROJECT");
  vi.mocked(refreshWorkspaceGithub).mockRejectedValueOnce(new Error("upstream_unavailable"));await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="Refresh GitHub status"]')!.click());
  expect(container.querySelector('.workspace-github')?.textContent).toContain("Current project facts");expect(container.querySelector('.workspace-github')?.textContent).toContain("Last known");
 });
 it("drops cached GitHub facts after a fresh authentication denial",async()=>{
  await render();expect(container.querySelector('.workspace-github')?.textContent).toContain(issue.title);
  vi.mocked(refreshWorkspaceGithub).mockRejectedValueOnce(new Error("strong_auth_required"));
  await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="Refresh GitHub status"]')!.click());
  expect(container.querySelector('.workspace-github')?.textContent).toContain("GitHub access is not available");
  expect(container.querySelector('.workspace-github')?.textContent).not.toContain(issue.title);expect(container.querySelector('.workspace-github')?.textContent).not.toContain(pr.title);
  expect(container.querySelector('a[href="'+run.references[0].url+'"]')).not.toBeNull();
 });
 it("polls only the visible selected record, supports manual cooldown, and cancels on unmount",async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));await render();
  await act(async()=>vi.advanceTimersByTimeAsync(15*60*1000));expect(loadWorkspaceGithub).toHaveBeenCalledTimes(2);
  Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});await act(async()=>vi.advanceTimersByTimeAsync(15*60*1000));expect(loadWorkspaceGithub).toHaveBeenCalledTimes(2);
  Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});
  const detailReads=vi.mocked(loadWorkspaceRun).mock.calls.length;
  vi.mocked(refreshWorkspaceGithub).mockResolvedValueOnce({...response([item("issue-1",issue)]),retryAfter:new Date(Date.now()+60000).toISOString()});
  await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="Refresh GitHub status"]')!.click());
  expect(refreshWorkspaceGithub).toHaveBeenCalledTimes(1);expect(loadWorkspaceRun).toHaveBeenCalledTimes(detailReads);expect(container.querySelector('[role="option"][aria-selected="true"]')).not.toBeNull();
  expect(container.querySelector<HTMLButtonElement>('button[aria-label="Refresh GitHub status"]')?.disabled).toBe(true);
  await act(async()=>vi.advanceTimersByTimeAsync(60000));expect(container.querySelector<HTMLButtonElement>('button[aria-label="Refresh GitHub status"]')?.disabled).toBe(false);
  await act(async()=>root.unmount());const calls=vi.mocked(loadWorkspaceGithub).mock.calls.length;await act(async()=>vi.advanceTimersByTimeAsync(60*60*1000));expect(loadWorkspaceGithub).toHaveBeenCalledTimes(calls);
  root=createRoot(container);
 });
 it("can retry a backend denied snapshot after its cooldown without retaining denied facts",async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
  vi.mocked(loadWorkspacePreferences).mockResolvedValueOnce({rememberFilters:true,refreshMinutes:0,filtersByProject:{}});
  vi.mocked(loadWorkspaceGithub).mockResolvedValueOnce({...response([{...item("issue-1",issue),status:"denied"}]),status:"denied",retryAfter:new Date(Date.now()+60000).toISOString()});
  await render();const refresh=container.querySelector<HTMLButtonElement>('button[aria-label="Refresh GitHub status"]')!;
  expect(refresh.disabled).toBe(true);expect(container.querySelector('.workspace-github')?.textContent).not.toContain(issue.title);
  await act(async()=>vi.advanceTimersByTimeAsync(60000));expect(refresh.disabled).toBe(false);
  vi.mocked(refreshWorkspaceGithub).mockResolvedValueOnce(response([item("issue-1",issue)]));
  await act(async()=>refresh.click());expect(refreshWorkspaceGithub).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.workspace-github')?.textContent).toContain(issue.title);expect(container.querySelector('[role="option"][aria-selected="true"]')).not.toBeNull();
 });
 it("does not poll when manual refresh is selected",async()=>{
  vi.useFakeTimers();vi.mocked(loadWorkspacePreferences).mockResolvedValueOnce({rememberFilters:true,refreshMinutes:0,filtersByProject:{}});await render();
  await act(async()=>vi.advanceTimersByTimeAsync(60*60*1000));expect(loadWorkspaceGithub).toHaveBeenCalledTimes(1);
 });
});
