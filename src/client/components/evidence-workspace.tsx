import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowLeftIcon, ChevronDownIcon, ChevronRightIcon, ExternalLinkIcon, FileTextIcon, GitPullRequestIcon, ImageIcon, LanguagesIcon, LinkIcon, ListChecksIcon, LoaderCircleIcon, SearchIcon } from "lucide-react";
import type { Locale } from "@/i18n";
import { teamProjects, type TeamProject } from "@/types";
import { addWorkspaceReference, loadWorkspaceDocuments, loadWorkspaceRun, loadWorkspaceRuns, safeWorkspaceExternalUrl, type WorkspaceQuery } from "@/workspace-client";
import type { WorkspaceDocument, WorkspaceEvidenceStatus, WorkspaceFile, WorkspacePage, WorkspaceReference, WorkspaceResult, WorkspaceRunDetail, WorkspaceRunSummary, WorkspaceSource } from "../../shared/workspace.js";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Skeleton } from "./ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { EvidenceWorkspaceViewer, WorkspaceFileThumbnail } from "./evidence-workspace-viewer";
import { workspaceCopy, workspaceDate, workspaceEventCounts, workspaceEventLabel, workspaceLifecycle, workspaceResultLabel, WorkspaceResultBadge } from "./evidence-workspace-labels";
import { cn } from "@/lib/utils";
import "./evidence-workspace.css";

type LoadState="loading"|"ready"|"denied"|"unavailable"|"refine";
type Target=Pick<WorkspaceRunSummary,"source"|"id">;
interface PageState<T> extends WorkspacePage<T> { key:string; state:LoadState; moreBusy:boolean; moreError:boolean }
const runKey=(run:Target)=>run.source+":"+run.id;
const documentKey=(file:WorkspaceDocument)=>file.runId+":"+file.id;
const emptyPage=<T,>(key:string):PageState<T>=>({key,state:"loading",items:[],nextCursor:null,evidenceStatus:"available",moreBusy:false,moreError:false});
const loadFailure=(error:unknown):LoadState=>error instanceof Error&&["scope_denied","viewer_mismatch","access_denied","HTTP 403"].includes(error.message)?"denied":"unavailable";
const pageFailure=(error:unknown):LoadState=>error instanceof Error&&error.message==="reference_search_too_broad"?"refine":loadFailure(error);

/** Owns cancellation and cursor scope so late pages cannot cross filters or projects. */
function useWorkspacePage<T>(key:string,enabled:boolean,load:(cursor:string|undefined,signal:AbortSignal)=>Promise<WorkspacePage<T>>,identity:(item:T)=>string) {
 const [state,setState]=useState<PageState<T>>(()=>emptyPage(key));
 const generation=useRef(0);const requests=useRef(new Set<AbortController>());
 useEffect(()=>{
  const current=++generation.current;
  if(!enabled)return;
  const controller=new AbortController();requests.current.add(controller);let active=true;
  setState(emptyPage(key));
  void load(undefined,controller.signal).then(page=>{if(active&&generation.current===current)setState({...page,key,state:"ready",moreBusy:false,moreError:false});}).catch(error=>{if(active&&generation.current===current)setState({...emptyPage<T>(key),state:pageFailure(error)});}).finally(()=>requests.current.delete(controller));
  return()=>{active=false;for(const pending of requests.current)pending.abort();requests.current.clear();};
 },[key,enabled,load]);
 const current=state.key===key?state:emptyPage<T>(key);
 async function more() {
  if(!enabled||!current.nextCursor||current.moreBusy||current.state!=="ready")return;
  const token=generation.current;const cursor=current.nextCursor;const controller=new AbortController();requests.current.add(controller);
  setState(previous=>({...previous,moreBusy:true,moreError:false}));
  try {
   const page=await load(cursor,controller.signal);
   if(token!==generation.current)return;
   setState(previous=>{
    if(previous.key!==key)return previous;
    const seen=new Set(previous.items.map(identity));
    return {...previous,items:[...previous.items,...page.items.filter(item=>!seen.has(identity(item)))],nextCursor:page.nextCursor,evidenceStatus:page.evidenceStatus,moreBusy:false};
   });
  }catch(error){if(token===generation.current){const failure=pageFailure(error);setState(previous=>failure==="denied"||failure==="refine"?{...emptyPage<T>(key),state:failure}:{...previous,moreBusy:false,moreError:true});}}
  finally{requests.current.delete(controller);}
 }
 return {page:current,more};
}
function WorkspaceLoadError({state,locale,retry,refine}:{state:"denied"|"unavailable"|"refine";locale:Locale;retry:()=>void;refine?:()=>void}) {
 const text=workspaceCopy[locale];
 const title=state==="refine"?text.refineSearch:state==="denied"?text.denied:text.unavailable;
 const hint=state==="refine"?text.refineSearchHint:state==="denied"?text.deniedHint:text.unavailableHint;
 return <Alert variant={state==="refine"?"default":"destructive"}><AlertTitle>{title}</AlertTitle><AlertDescription>{hint}</AlertDescription><Button variant="outline" size="sm" onClick={state==="refine"?refine??retry:retry}>{state==="refine"?text.editSearch:text.retry}</Button></Alert>;
}
function EvidenceAvailability({status,locale}:{status:WorkspaceEvidenceStatus;locale:Locale}) {
 if(status==="available")return null;
 const text=workspaceCopy[locale];
 return <Alert><AlertTitle>{status==="unconfigured"?text.evidenceUnconfigured:text.evidenceUnavailable}</AlertTitle><AlertDescription>{status==="unconfigured"?text.evidenceUnconfiguredHint:text.evidenceUnavailableHint}</AlertDescription></Alert>;
}
function WorkspacePager({page,onMore,locale}:{page:{nextCursor:string|null;moreBusy:boolean;moreError:boolean;items:unknown[]};onMore:()=>void;locale:Locale}) {
 const text=workspaceCopy[locale];
 return <div className="workspace-pagination"><span>{page.items.length} {locale==="de"?"Einträge geladen":"entries loaded"}</span>{page.moreError&&<span role="alert">{text.pageError}</span>}{page.nextCursor&&<Button variant="outline" size="sm" disabled={page.moreBusy} onClick={onMore}>{page.moreBusy?<LoaderCircleIcon data-icon="inline-start" className="animate-spin"/>:<ChevronDownIcon data-icon="inline-start"/>}{page.moreBusy?text.loadingMore:text.more}</Button>}</div>;
}
function ReferenceLink({reference,onTarget,onFile,files}:{reference:WorkspaceReference;onTarget:(target:Target)=>void;onFile:(file:WorkspaceFile)=>void;files:WorkspaceFile[]}) {
 const file=reference.fileId?files.find(item=>item.id===reference.fileId&&(!reference.target||(reference.target.source==="evidence-run"&&reference.target.id===item.runId))):null;
 if(file)return <Button variant="ghost" size="sm" onClick={()=>onFile(file)}><FileTextIcon data-icon="inline-start"/>{reference.label}</Button>;
 if(reference.target)return <Button variant="ghost" size="sm" onClick={()=>onTarget(reference.target!)}><ListChecksIcon data-icon="inline-start"/>{reference.label}</Button>;
 const url=safeWorkspaceExternalUrl(reference.url);
 return url?<a className="workspace-reference" href={url} target="_blank" rel="noopener noreferrer">{reference.kind==="pull-request"?<GitPullRequestIcon/>:<LinkIcon/>}{reference.label}<ExternalLinkIcon/></a>:<span className="workspace-reference text-muted-foreground">{reference.label}</span>;
}
function AddReferenceDialog({detail,locale,onClose,onSaved}:{detail:WorkspaceRunDetail;locale:Locale;onClose:()=>void;onSaved:(detail:WorkspaceRunDetail)=>void}) {
 const text=workspaceCopy[locale];const [kind,setKind]=useState<"issue"|"pull-request">("issue");const [url,setUrl]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function submit(event:FormEvent) {
  event.preventDefault();if(busy)return;
  const value=url.trim();const pattern=kind==="issue"?/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9]\d*\/?$/:/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9]\d*\/?$/;
  if(!pattern.test(value)){setError(text.invalidLink);return;}
  setBusy(true);setError(null);
  try{const saved=await addWorkspaceReference(detail.source,detail.id,{kind,url:value});if(alive.current){onSaved(saved);onClose();}}catch(failure){if(alive.current)setError(loadFailure(failure)==="denied"?text.denied:text.linkError);}finally{if(alive.current)setBusy(false);}
 }
 return <Dialog open onOpenChange={open=>!open&&onClose()}><DialogContent><DialogHeader><DialogTitle>{text.addLink}</DialogTitle><DialogDescription>{text.linkDescription}</DialogDescription></DialogHeader><form onSubmit={event=>void submit(event)}><FieldGroup><Field><FieldLabel htmlFor="workspace-link-kind">{text.linkKind}</FieldLabel><Select value={kind} onValueChange={value=>setKind(value as typeof kind)} disabled={busy}><SelectTrigger id="workspace-link-kind"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="issue">{text.issue}</SelectItem><SelectItem value="pull-request">{text.pullRequest}</SelectItem></SelectGroup></SelectContent></Select></Field><Field data-invalid={Boolean(error)}><FieldLabel htmlFor="workspace-link-url">{text.githubUrl}</FieldLabel><Input id="workspace-link-url" aria-label={text.githubUrl} value={url} onChange={event=>{setUrl(event.target.value);setError(null);}} type="url" autoFocus required disabled={busy} aria-invalid={Boolean(error)}/></Field>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>{text.cancel}</Button><Button type="submit" disabled={busy}>{busy?text.saving:text.saveLink}</Button></div></FieldGroup></form></DialogContent></Dialog>;
}
function RunDetail({detail,locale,onFile,onTarget,onAdd}:{detail:WorkspaceRunDetail;locale:Locale;onFile:(file:WorkspaceFile)=>void;onTarget:(target:Target)=>void;onAdd:()=>void}) {
 const text=workspaceCopy[locale];const primaryPr=safeWorkspaceExternalUrl(detail.pullRequestUrl);
 return <article className="workspace-detail">
  <div className="workspace-detail-meta"><Badge variant="secondary">{detail.environment=== "dev"?"Dev":detail.environment==="pre-dev"?"PreDev":detail.environment}</Badge><span>{detail.source==="test-run"?text.testRun:text.evidenceRun}</span><time dateTime={detail.createdAt}>{workspaceDate(detail.createdAt,locale)}</time></div>
  <div className="workspace-detail-title"><h2>{detail.title}</h2><WorkspaceResultBadge result={detail.result} locale={locale}/></div>
  <p className="workspace-lifecycle">{workspaceLifecycle(detail,locale)}</p>
  {detail.source==="evidence-run"&&<p className="workspace-source-explanation">{text.evidenceOnly}</p>}
  <dl className="workspace-metadata"><div><dt>{text.repository}</dt><dd>{detail.repository||"—"}</dd></div><div><dt>{text.commit}</dt><dd><code title={detail.commitSha}>{detail.commitSha.slice(0,12)||"—"}</code></dd></div><div><dt>{text.version}</dt><dd>{detail.applicationVersion||"—"}</dd></div><div><dt>{text.owner}</dt><dd>{detail.owner||"—"}</dd></div></dl>
  <section aria-label={text.links}><div className="workspace-section-heading"><h3>{text.links}</h3><Button variant="outline" size="sm" onClick={onAdd}><LinkIcon data-icon="inline-start"/>{text.addLink}</Button></div><p className="workspace-hint">{text.referenceHint}</p><div className="workspace-references">{detail.references.map(reference=><ReferenceLink key={reference.id} reference={reference} onTarget={onTarget} onFile={onFile} files={detail.files}/>)}{primaryPr&&!detail.references.some(reference=>reference.url===primaryPr)&&<a className="workspace-reference" href={primaryPr} target="_blank" rel="noopener noreferrer"><GitPullRequestIcon/>{text.pullRequest}<ExternalLinkIcon/></a>}{!detail.references.length&&!primaryPr&&<span className="workspace-hint">{text.noLinks}</span>}</div></section>
  <section aria-label={text.files}><div className="workspace-section-heading"><h3>{text.files}</h3><span>{detail.filesCount===null?text.unknownCount:detail.filesCount+" "+text.fileCount}</span></div><EvidenceAvailability status={detail.evidenceStatus} locale={locale}/>{detail.files.length>0?<div className="workspace-files">{detail.files.map(file=><WorkspaceFileThumbnail key={file.runId+":"+file.id} file={file} locale={locale} onOpen={()=>onFile(file)}/>)}</div>:detail.evidenceStatus==="available"?<p className="workspace-hint">{text.noFiles}</p>:null}</section>
  <section aria-label={text.activity}><div className="workspace-section-heading"><h3>{text.activity}</h3></div>{detail.events.length?<ol className="workspace-events">{detail.events.map((event,index)=><li key={event.type+":"+event.createdAt+":"+index}><span className="workspace-event-marker"/><div><strong>{workspaceEventLabel(event,locale)}</strong><span>{workspaceDate(event.createdAt,locale)}{event.actor?" · "+event.actor:""}</span>{workspaceEventCounts(event,locale)&&<span className="workspace-event-counts">{workspaceEventCounts(event,locale)}</span>}</div></li>)}</ol>:<p className="workspace-hint">{text.noEvents}</p>}</section>
 </article>;
}
export function EvidenceWorkspace({locale,project,onBack,onLocaleChange,projects,onProjectChange}:{locale:Locale;project:TeamProject;onBack:()=>void;onLocaleChange?:(locale:Locale)=>void;projects?:TeamProject[];onProjectChange?:(project:TeamProject)=>void}) {
 const searchInput=useRef<HTMLInputElement>(null);
 const text=workspaceCopy[locale];const [tab,setTab]=useState("runs");const [search,setSearch]=useState("");const [query,setQuery]=useState("");const [source,setSource]=useState<WorkspaceSource|"all">("all");const [environment,setEnvironment]=useState("all");const [result,setResult]=useState<WorkspaceResult|"all">("all");const [retry,setRetry]=useState(0);
 const [selection,setSelection]=useState<{scope:string;target:Target}|null>(null);
 const [detailState,setDetailState]=useState<{key:string;state:LoadState;value:WorkspaceRunDetail|null}>({key:"",state:"loading",value:null});
 const [viewer,setViewer]=useState<{scope:string;file:WorkspaceFile}|null>(null);const [adding,setAdding]=useState<string|null>(null);
 useEffect(()=>{const timer=setTimeout(()=>setQuery(search.trim()),250);return()=>clearTimeout(timer);},[search]);
 const commonQuery=useMemo<WorkspaceQuery>(()=>({project,environment:environment==="all"?undefined:environment as WorkspaceQuery["environment"],q:query,limit:20}),[project,environment,query]);
 const runsQuery=useMemo<WorkspaceQuery>(()=>({...commonQuery,source,result:result==="all"?undefined:result}),[commonQuery,source,result]);
 const runsScope=JSON.stringify([runsQuery,retry]);const documentsScope=JSON.stringify([commonQuery,retry]);const viewScope=tab+":"+(tab==="runs"?runsScope:documentsScope);
 const fetchRuns=useCallback((cursor:string|undefined,signal:AbortSignal)=>loadWorkspaceRuns({...runsQuery,cursor},signal),[runsQuery]);
 const fetchDocuments=useCallback((cursor:string|undefined,signal:AbortSignal)=>loadWorkspaceDocuments({...commonQuery,cursor},signal),[commonQuery]);
 const runData=useWorkspacePage(runsScope,tab==="runs",fetchRuns,runKey);
 const documentData=useWorkspacePage(documentsScope,tab==="documents",fetchDocuments,documentKey);
 const currentSelection=selection?.scope===runsScope?selection.target:null;
 const detailKey=currentSelection?project+":"+runKey(currentSelection):"";
 useEffect(()=>{
  if(tab!=="runs"||runData.page.state!=="ready")return;
  if(selection?.scope===runsScope)return;
  setSelection(runData.page.items[0]?{scope:runsScope,target:runData.page.items[0]}:null);
 },[tab,runData.page.state,runData.page.items,runsScope,selection?.scope]);
 useEffect(()=>{
  if(!currentSelection||tab!=="runs")return;
  let active=true;const controller=new AbortController();setDetailState({key:detailKey,state:"loading",value:null});
  void loadWorkspaceRun(currentSelection.source,currentSelection.id,controller.signal).then(value=>{if(active)setDetailState({key:detailKey,state:"ready",value});}).catch(error=>{if(active)setDetailState({key:detailKey,state:loadFailure(error),value:null});});
  return()=>{active=false;controller.abort();};
 },[detailKey,tab]);
 const detail=detailState.key===detailKey&&detailState.state==="ready"?detailState.value:null;
 function choose(target:Target){setViewer(null);setAdding(null);setSelection({scope:runsScope,target});}
 function openFile(file:WorkspaceFile){setViewer({scope:viewScope,file});}
 function resetFilters(){setSearch("");setQuery("");setSource("all");setEnvironment("all");setResult("all");}
 function listKey(event:KeyboardEvent<HTMLButtonElement>,index:number){
  const rows=runData.page.items;let next=index;
  if(event.key==="ArrowDown")next=Math.min(rows.length-1,index+1);else if(event.key==="ArrowUp")next=Math.max(0,index-1);else if(event.key==="Home")next=0;else if(event.key==="End")next=rows.length-1;else return;
  event.preventDefault();choose(rows[next]);event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="option"]')[next]?.focus();
 }
 const activePage=tab==="runs"?runData.page:documentData.page;
 const allowedProjects=teamProjects.filter(value=>(projects??[project]).includes(value));
 const hasFilters=Boolean(search||source!=="all"||environment!=="all"||result!=="all");
 return <main className="evidence-workspace">
  <header className="workspace-header"><div className="workspace-header-left"><Button variant="outline" size="sm" onClick={onBack}><ArrowLeftIcon data-icon="inline-start"/>{text.back}</Button>{allowedProjects.length>1&&onProjectChange?<Select value={project} onValueChange={value=>onProjectChange(value as TeamProject)}><SelectTrigger aria-label={text.project}><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{allowedProjects.map(value=><SelectItem key={value} value={value}>{value.toUpperCase()}</SelectItem>)}</SelectGroup></SelectContent></Select>:<strong>{project.toUpperCase()}</strong>}</div>{onLocaleChange&&<Button variant="ghost" size="sm" aria-label={text.language} onClick={()=>onLocaleChange(locale==="de"?"en":"de")}><LanguagesIcon data-icon="inline-start"/>{locale.toUpperCase()}</Button>}</header>
  <div className="workspace-body"><div className="workspace-page-heading"><h1>{text.title}</h1><p>{text.subtitle}</p></div>
   <Tabs value={tab} onValueChange={value=>{setTab(value);setViewer(null);setAdding(null);}}><TabsList variant="line"><TabsTrigger value="runs"><ListChecksIcon/>{text.runs}</TabsTrigger><TabsTrigger value="documents"><FileTextIcon/>{text.documents}</TabsTrigger></TabsList>
    <div className="workspace-toolbar"><div className="workspace-search"><SearchIcon/><Input ref={searchInput} value={search} onChange={event=>setSearch(event.target.value)} aria-label={tab==="runs"?text.search:text.documentSearch} placeholder={tab==="runs"?text.placeholder:text.documentPlaceholder}/></div>
     {tab==="runs"&&<Select value={source} onValueChange={value=>setSource(value as typeof source)}><SelectTrigger className="workspace-source-filter" aria-label={text.source}><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">{text.allSources}</SelectItem><SelectItem value="test-run">{text.testRuns}</SelectItem><SelectItem value="evidence-run">{text.evidenceRuns}</SelectItem></SelectGroup></SelectContent></Select>}
     <Select value={environment} onValueChange={setEnvironment}><SelectTrigger aria-label={text.environment}><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">{text.allEnvironments}</SelectItem><SelectItem value="dev">Dev</SelectItem><SelectItem value="pre-dev">PreDev</SelectItem><SelectItem value="local">{locale==="de"?"Lokal":"Local"}</SelectItem><SelectItem value="production-test">{locale==="de"?"Produktionstest":"Production test"}</SelectItem></SelectGroup></SelectContent></Select>
     {tab==="runs"&&<Select value={result} onValueChange={value=>setResult(value as typeof result)}><SelectTrigger aria-label={text.result}><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">{text.allResults}</SelectItem>{(["passed","failed","flaky","blocked","informational"] as const).map(value=><SelectItem key={value} value={value}>{workspaceResultLabel(value,locale)}</SelectItem>)}</SelectGroup></SelectContent></Select>}
     {hasFilters&&<Button variant="ghost" size="sm" onClick={resetFilters}>{text.clear}</Button>}
    </div>
    <div aria-live="polite" className="workspace-service-state">{activePage.state==="ready"&&<EvidenceAvailability status={activePage.evidenceStatus} locale={locale}/>}</div>
    {activePage.state==="denied"||activePage.state==="unavailable"||activePage.state==="refine"?<WorkspaceLoadError state={activePage.state} locale={locale} retry={()=>setRetry(value=>value+1)} refine={()=>{searchInput.current?.focus();searchInput.current?.select();}}/>:activePage.state==="loading"?<div className="workspace-loading" role="status" aria-label={text.loading}><Skeleton className="h-12 w-full"/><Skeleton className="h-48 w-full"/></div>:activePage.items.length===0?(activePage.evidenceStatus==="available"?<Empty><EmptyHeader><EmptyTitle>{tab==="runs"?text.empty:text.emptyDocuments}</EmptyTitle><EmptyDescription>{tab==="runs"?text.emptyHint:text.emptyDocumentsHint}</EmptyDescription></EmptyHeader>{hasFilters&&<Button variant="outline" onClick={resetFilters}>{text.clear}</Button>}</Empty>:null):<>
     <TabsContent value="runs"><div className="workspace-split"><aside className="workspace-run-list" aria-label={text.runs}><div className="workspace-list-heading">{runData.page.items.length} {locale==="de"?"Einträge geladen":"entries loaded"}</div><div role="listbox" aria-label={text.runs}>{runData.page.items.map((run,index)=>{const selected=Boolean(currentSelection&&runKey(run)===runKey(currentSelection));return <button type="button" role="option" aria-selected={selected} tabIndex={selected||(!currentSelection&&index===0)?0:-1} key={runKey(run)} className={cn("workspace-run-row",selected&&"is-selected")} onClick={()=>choose(run)} onKeyDown={event=>listKey(event,index)}><span className="workspace-run-date">{workspaceDate(run.createdAt,locale)}<Badge variant="secondary">{run.environment==="dev"?"Dev":run.environment==="pre-dev"?"PreDev":run.environment}</Badge></span><strong>{run.title}</strong><span className="workspace-run-source">{run.source==="test-run"?text.testRun:text.evidenceRun}</span><span className="workspace-run-result"><WorkspaceResultBadge result={run.result} locale={locale}/><ChevronRightIcon/></span></button>;})}</div></aside>
      {currentSelection?(detail?<RunDetail detail={detail} locale={locale} onFile={openFile} onTarget={choose} onAdd={()=>setAdding(detailKey)}/>:detailState.key===detailKey&&(detailState.state==="denied"||detailState.state==="unavailable")?<div className="workspace-detail"><WorkspaceLoadError state={detailState.state} locale={locale} retry={()=>{setSelection(null);setRetry(value=>value+1);}}/></div>:<div className="workspace-detail workspace-loading" role="status" aria-label={text.loadingDetail}><Skeleton className="h-9 w-2/3"/><Skeleton className="h-48 w-full"/></div>):<div className="workspace-detail"><p className="workspace-hint">{text.choose}</p></div>}
     </div><WorkspacePager page={runData.page} onMore={()=>void runData.more()} locale={locale}/></TabsContent>
     <TabsContent value="documents"><div className="workspace-documents">{documentData.page.items.map(file=><article key={documentKey(file)} className="workspace-document-row"><FileTextIcon/><div><button type="button" className="workspace-doc-open" onClick={()=>openFile(file)}>{file.caption||file.filename}</button><p>{file.runTitle} · {file.filename}</p><span>{workspaceDate(file.createdAt,locale)} · {file.environment==="dev"?"Dev":file.environment}</span></div><Button variant="outline" size="sm" aria-label={text.openDocument+": "+(file.caption||file.filename)} onClick={()=>openFile(file)}><ExternalLinkIcon/></Button></article>)}</div><WorkspacePager page={documentData.page} onMore={()=>void documentData.more()} locale={locale}/></TabsContent>
    </>}
   </Tabs>
  </div>
  <EvidenceWorkspaceViewer file={activePage.state==="ready"&&viewer?.scope===viewScope?viewer.file:null} locale={locale} onClose={()=>setViewer(null)}/>
  {adding===detailKey&&detail&&<AddReferenceDialog key={detailKey} detail={detail} locale={locale} onClose={()=>setAdding(null)} onSaved={value=>setDetailState(previous=>previous.key===detailKey?{...previous,value}:previous)}/>}
 </main>;
}
