import { useCallback, useEffect, useRef, useState } from "react";
import { Clock3Icon, ExternalLinkIcon, GitPullRequestIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react";
import { getActiveViewer } from "@/api";
import type { Locale } from "@/i18n";
import { loadWorkspaceGithub, refreshWorkspaceGithub } from "@/workspace-github-client";
import { safeWorkspaceExternalUrl } from "@/workspace-client";
import type { WorkspaceRunDetail } from "../../shared/workspace.js";
import type { WorkspaceGithubFacts, WorkspaceGithubResponse, WorkspaceGithubSnapshot } from "../../shared/workspace-github.js";
import { workspaceDate } from "./evidence-workspace-labels";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
const deniedError=(error:unknown)=>error instanceof Error&&["scope_denied","viewer_mismatch","access_denied","HTTP 401","HTTP 403","run_not_found","strong_auth_required","passkey_required","user_session_required","user_disabled","unauthorized","session_changed","origin_denied"].includes(error.message);
function GithubLink({url,children}:{url:string;children:React.ReactNode}) {const href=safeWorkspaceExternalUrl(url);return href?<a href={href} target="_blank" rel="noopener noreferrer">{children}<ExternalLinkIcon/></a>:<span>{children}</span>;}
function githubState(state:WorkspaceGithubFacts["state"],kind:WorkspaceGithubFacts["kind"],locale:Locale) {
 const de=locale==="de";if(state==="merged")return kind==="pull-request"?(de?"Gemergt":"Merged"):(de?"Unbekannt":"Unknown");return state==="closed"?(de?"Geschlossen":"Closed"):(de?"Offen":"Open");
}
function SnapshotCard({snapshot,locale,forceStale}:{snapshot:WorkspaceGithubSnapshot;locale:Locale;forceStale:boolean}) {
 const de=locale==="de";const denied=snapshot.status==="denied";const unconfigured=snapshot.status==="unconfigured";
 const facts=!denied&&!unconfigured?snapshot.facts:null;const stale=forceStale||snapshot.stale||snapshot.status==="unavailable";const incomplete=stale||snapshot.status!=="ready";
 const merged=facts?.closingPullRequests.filter(pr=>pr.state==="merged").length??0;
 return <article className="workspace-github-card">
  <div className="workspace-github-card-heading"><GithubLink url={snapshot.url}><strong>{facts?.title||snapshot.url}</strong></GithubLink>{facts&&<Badge variant="outline">{facts.kind==="issue"?"Issue":"PR"} · {githubState(facts.state,facts.kind,locale)}</Badge>}{facts?.draft&&<Badge variant="secondary">{de?"Entwurf":"Draft"}</Badge>}{stale&&<Badge variant="secondary"><Clock3Icon data-icon="inline-start"/>{de?"Zuletzt bekannt":"Last known"}</Badge>}</div>
  {denied?<p className="workspace-hint">{de?"Repository-Zugriff ist nicht verfügbar. Der externe Link bleibt erhalten.":"Repository access is not available. The external link remains available."}</p>:unconfigured?<p className="workspace-hint">{de?"GitHub ist noch nicht verbunden.":"GitHub is not connected."}</p>:!facts?<p className="workspace-hint">{de?"Für diesen Link sind gerade keine GitHub-Fakten verfügbar.":"GitHub facts for this link are currently unavailable."}</p>:<>
   {facts.boards.length===0&&incomplete&&<p className="workspace-hint">{de?"Board-Status unbekannt":"Board status unknown"}</p>}
   {facts.boards.length>0&&<dl className="workspace-github-boards">{facts.boards.map((board,index)=><div key={board.url+":"+index}><dt><GithubLink url={board.url}>{board.title}</GithubLink></dt><dd>{board.status??(de?"Status unbekannt":"Status unknown")}</dd></div>)}</dl>}
   <dl className="workspace-github-releases"><div><dt>{de?"Release-Zuordnung":"Release assignments"}</dt><dd>{facts.releaseAssignments.length?facts.releaseAssignments.map((assignment,index)=><span key={assignment.url+":"+assignment.title+":"+index}><GithubLink url={assignment.url}>{assignment.title}</GithubLink><small>{assignment.source==="milestone"?(de?"Meilenstein":"Milestone"):(de?"Projektfeld":"Project field")}</small></span>):<span>{incomplete?(de?"Release-Zuordnung unbekannt":"Release assignments unknown"):(de?"Keine Zuordnung erfasst":"No assignment recorded")}</span>}</dd></div>
    {facts.kind==="pull-request"&&<div><dt>{de?"Verifiziertes veröffentlichtes Release":"Verified published release"}</dt><dd>{facts.publishedReleases.length?facts.publishedReleases.map(release=><span key={release.url}><GithubLink url={release.url}>{release.tag}{release.title&&release.title!==release.tag?" · "+release.title:""}</GithubLink><small>{workspaceDate(release.publishedAt,locale)}</small></span>):<span>{facts.releaseCoverage!=="complete"||incomplete?(de?"Veröffentlichte Release-Zuordnung unbekannt":"Published release inclusion unknown"):(de?"Keine veröffentlichte Version belegt":"No published version verified")}</span>}{facts.releaseCoverage!=="complete"&&<small>{de?"Release-Prüfung unvollständig":"Release check incomplete"}</small>}</dd></div>}
   </dl>
   {facts.kind==="issue"&&<div className="workspace-github-closing"><div className="workspace-github-progress">{facts.closingPullRequests.length>0&&<span>{facts.closingPullRequestsComplete?<>{merged} / {facts.closingPullRequests.length} {de?"zugeordnete PRs gemergt":"associated PRs merged"}</>:<>{de?"Bekannte gemergte PRs: ":"Known merged PRs: "}{merged}</>}</span>}{!facts.closingPullRequestsComplete&&<Badge variant="outline">{de?"Zuordnung unvollständig":"Association incomplete"}</Badge>}</div>{facts.closingPullRequests.map(pr=><div className="workspace-github-associated-pr" key={pr.url}><GitPullRequestIcon/><GithubLink url={pr.url}>{pr.title}</GithubLink><Badge variant="outline">{githubState(pr.state,"pull-request",locale)}</Badge></div>)}<p className="workspace-hint">{de?"Issue-Abschluss und einzelne gemergte PRs belegen für sich keine vollständige Auslieferung.":"Issue closure and individual merged PRs do not establish complete delivery."}</p></div>}
   {facts.kind==="pull-request"&&<p className="workspace-hint">{de?"Die Release-Zuordnung wird anhand des Merge-Commits geprüft. Eine Bereitstellung ist hier nicht nachgewiesen.":"Release inclusion is checked against the merge commit. Deployment is not verified here."}</p>}
  </>}
  {snapshot.status==="partial"&&<p className="workspace-hint">{de?"Ein Teil der GitHub-Angaben konnte nicht geprüft werden. Fehlende Werte sind unbekannt.":"Some GitHub details could not be checked. Missing values are unknown."}</p>}
  {snapshot.status==="unavailable"&&<p className="workspace-hint">{de?"Diese GitHub-Fakten konnten nicht aktualisiert werden.":"These GitHub facts could not be refreshed."}</p>}
  {!denied&&!unconfigured&&<div className="workspace-github-observed">{snapshot.observedAt?<span>{de?"Erfolgreich geprüft: ":"Last successful check: "}<time dateTime={snapshot.observedAt}>{workspaceDate(snapshot.observedAt,locale)}</time></span>:<span>{de?"Noch nicht erfolgreich geprüft":"No successful check yet"}</span>}{!snapshot.observedAt&&snapshot.lastAttemptAt&&<span>{de?"Letzter Versuch: ":"Last attempt: "}{workspaceDate(snapshot.lastAttemptAt,locale)}</span>}{snapshot.cached&&<span>{de?"Zwischengespeichert":"Cached"}</span>}</div>}
 </article>;
}
type GithubState={key:string;response:WorkspaceGithubResponse|null;loading:boolean;error:"denied"|"unavailable"|null};
export function EvidenceWorkspaceGithub({detail,locale,refreshMinutes}:{detail:WorkspaceRunDetail;locale:Locale;refreshMinutes:0|15|60}) {
 const de=locale==="de";
 const refs=detail.references.filter(reference=>(reference.kind==="issue"||reference.kind==="pull-request")&&reference.url);
 const fingerprint=JSON.stringify([...refs.map(reference=>reference.id+":"+reference.url),detail.pullRequestUrl??""].sort());
 const eligible=refs.length>0||Boolean(detail.pullRequestUrl);
 const scope=detail.project+":"+detail.source+":"+detail.id+":"+(getActiveViewer()??"")+":"+fingerprint;
 const [state,setState]=useState<GithubState>({key:scope,response:null,loading:true,error:null});
 const [manualLimit,setManualLimit]=useState({key:"",until:0});const [clock,setClock]=useState(Date.now);
 const generation=useRef(0);const request=useRef<AbortController|null>(null);const lastRequest=useRef(0);const retryLimit=useRef(0);
 const load=useCallback(async(force:boolean)=>{
  if(request.current)return;
  const token=generation.current;const controller=new AbortController();request.current=controller;
  lastRequest.current=Date.now();
  if(force)setManualLimit({key:scope,until:Date.now()+60000});
  setState(previous=>({key:scope,response:previous.key===scope?previous.response:null,loading:true,error:null}));
  try{
   const response=await (force?refreshWorkspaceGithub:loadWorkspaceGithub)(detail.source,detail.id,controller.signal);
   if(token===generation.current)setState({key:scope,response,loading:false,error:null});
  }catch(error){if(token===generation.current)setState(previous=>({key:scope,response:deniedError(error)?null:previous.key===scope?previous.response:null,loading:false,error:deniedError(error)?"denied":"unavailable"}));}
  finally{if(token===generation.current&&request.current===controller)request.current=null;}
 },[scope,detail.source,detail.id]);
 useEffect(()=>{
  generation.current++;request.current?.abort();request.current=null;
  if(eligible)void load(false);
  return()=>{generation.current++;request.current?.abort();request.current=null;};
 },[load,eligible]);
 const current=state.key===scope?state:{key:scope,response:null,loading:true,error:null};
 const remoteRetry=Date.parse(current.response?.retryAfter??"");
 const retryAt=Math.max(Number.isFinite(remoteRetry)?remoteRetry:0,manualLimit.key===scope?manualLimit.until:0);
 retryLimit.current=retryAt;
 useEffect(()=>{setClock(Date.now());if(retryAt<=Date.now())return;const timer=setTimeout(()=>setClock(Date.now()),Math.min(retryAt-Date.now(),2147483647));return()=>clearTimeout(timer);},[retryAt,scope]);
 useEffect(()=>{
  if(!eligible||refreshMinutes===0)return;
  const interval=refreshMinutes*60*1000;
  const poll=()=>{if(document.visibilityState==="visible"&&Date.now()-lastRequest.current>=interval&&Date.now()>=retryLimit.current)void load(false);};
  const timer=setInterval(poll,interval);document.addEventListener("visibilitychange",poll);
  return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",poll);};
 },[load,refreshMinutes,eligible]);
 if(!eligible)return null;
 const response=current.response;const status=current.error??response?.status;
 const cooldown=clock<retryAt;
 const showFacts=status!=="denied"&&status!=="unconfigured";
 return <section className="workspace-github" aria-label={de?"GitHub-Status":"GitHub status"}>
  <div className="workspace-section-heading"><h3>{de?"GitHub-Status":"GitHub status"}</h3><Button variant="outline" size="sm" aria-label={de?"GitHub-Status aktualisieren":"Refresh GitHub status"} disabled={current.loading||cooldown||current.error==="denied"} onClick={()=>void load(true)}>{current.loading?<LoaderCircleIcon data-icon="inline-start" className="animate-spin"/>:<RefreshCwIcon data-icon="inline-start"/>}{de?"Aktualisieren":"Refresh"}</Button></div>
  {current.loading&&!response?<div role="status" aria-label={de?"GitHub-Fakten werden geladen":"Loading GitHub facts"}><Skeleton className="h-16 w-full"/></div>:status==="unconfigured"?<Alert><AlertTitle>{de?"GitHub ist noch nicht verbunden":"GitHub is not connected"}</AlertTitle><AlertDescription>{de?"Status und Release-Zuordnungen wurden nicht abgerufen. Die vorhandenen externen Links bleiben nutzbar.":"Status and release assignments have not been fetched. Existing external links remain available."}</AlertDescription></Alert>:status==="denied"?<Alert><AlertTitle>{de?"GitHub-Zugriff ist nicht verfügbar":"GitHub access is not available"}</AlertTitle><AlertDescription>{de?"Für diese Auswahl können keine Repository-Fakten angezeigt werden. Die externen Links bleiben erhalten.":"Repository facts cannot be shown for this selection. External links remain available."}</AlertDescription></Alert>:status==="unavailable"?<Alert><AlertTitle>{de?"GitHub ist vorübergehend nicht erreichbar":"GitHub is temporarily unavailable"}</AlertTitle><AlertDescription>{de?"Vorhandene Angaben sind nur zuletzt bekannte Fakten. Testlauf und Belege bleiben nutzbar.":"Existing facts are last known values. The run and evidence remain available."}</AlertDescription></Alert>:null}
  {showFacts&&response?.items.map(snapshot=><SnapshotCard key={snapshot.referenceId+":"+snapshot.url} snapshot={snapshot} locale={locale} forceStale={Boolean(current.error)}/>)}
  {response?.limitReached&&<p className="workspace-hint">{de?"Weitere Verknüpfungen konnten in dieser Abfrage nicht geprüft werden.":"Additional links could not be checked in this request."}</p>}
  {cooldown&&<p className="workspace-hint" role="status">{de?"Erneut verfügbar ab ":"Available again after "}{workspaceDate(new Date(retryAt).toISOString(),locale)}</p>}
 </section>;
}
