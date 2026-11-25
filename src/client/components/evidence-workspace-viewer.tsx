import { useEffect, useState } from "react";
import { CopyIcon, DownloadIcon, ExternalLinkIcon, FileTextIcon, ImageIcon } from "lucide-react";
import type { Locale } from "@/i18n";
import { loadWorkspaceDocumentText, safeWorkspaceContentUrl, safeWorkspaceExternalUrl, type WorkspaceFile } from "@/workspace-client";
import { renderMarkdown } from "@/safe-markdown";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Skeleton } from "./ui/skeleton";
const imageTypes=new Set(["image/png","image/jpeg","image/webp","image/gif"]);
const videoTypes=new Set(["video/mp4","video/webm"]);
const textTypes=new Set(["text/plain","text/markdown","application/json"]);
export function workspaceFileType(file:WorkspaceFile) {return file.contentType.split(";",1)[0].trim().toLowerCase();}
export function WorkspaceFileThumbnail({file,locale,onOpen}:{file:WorkspaceFile;locale:Locale;onOpen:()=>void}) {
 const [failed,setFailed]=useState(false);
 const preview=safeWorkspaceContentUrl(file,"preview");
 const isImage=imageTypes.has(workspaceFileType(file));
 const title=file.caption||file.filename;
 return <button type="button" className="workspace-file" disabled={file.processingState!=="ready"} onClick={onOpen} aria-label={(locale==="de"?"Beleg öffnen: ":"Open evidence: ")+title}>
  <span className="workspace-file-preview">{preview&&isImage&&!failed?<img loading="lazy" src={preview} alt={title} onError={()=>setFailed(true)}/>:isImage?<ImageIcon/>:<FileTextIcon/>}</span>
  <strong>{title}</strong><span className="workspace-file-meta">{file.filename} · {file.processingState==="ready"?Math.max(1,Math.ceil(file.byteSize/1024))+" KB":locale==="de"?"Noch nicht verfügbar":"Not available yet"}</span>
 </button>;
}
export function EvidenceWorkspaceViewer({file,locale,onClose}:{file:WorkspaceFile|null;locale:Locale;onClose:()=>void}) {
 const de=locale==="de";
 const [text,setText]=useState<{key:string;state:"loading"|"ready"|"error";value:string}>({key:"",state:"loading",value:""});
 const [failedMedia,setFailedMedia]=useState<string|null>(null);
 const [copyState,setCopyState]=useState<"idle"|"copied"|"error">("idle");
 const key=file?file.runId+":"+file.id+":"+(file.previewUrl??""):"";
 const preview=file?safeWorkspaceContentUrl(file,"preview"):null;
 const type=file?workspaceFileType(file):"";
 const isText=textTypes.has(type);
 useEffect(()=>{
  setCopyState("idle");
  if(!file||!preview||!isText||file.byteSize>2*1024*1024)return;
  let active=true;const controller=new AbortController();setText({key,state:"loading",value:""});
  void loadWorkspaceDocumentText(file,controller.signal).then(value=>{if(active)setText({key,state:"ready",value});}).catch(()=>{if(active)setText({key,state:"error",value:""});});
  return()=>{active=false;controller.abort();};
 },[key,preview,isText]);
 const download=file?safeWorkspaceContentUrl(file,"download"):null;
 const publicUrl=file?.processingState==="ready"?safeWorkspaceExternalUrl(file.publicUrl):null;
 const reportUrl=file?.processingState==="ready"?safeWorkspaceExternalUrl(file.viewerUrl):null;
 const canImage=Boolean(preview)&&imageTypes.has(type);
 const canVideo=Boolean(preview)&&videoTypes.has(type);
 const canText=Boolean(preview)&&isText&&Boolean(file&&file.byteSize<=2*1024*1024);
 const failed=failedMedia===key||(canText&&text.key===key&&text.state==="error");
 async function copyLink() {
  if(!publicUrl)return;
  try{await navigator.clipboard.writeText(publicUrl);setCopyState("copied");}catch{setCopyState("error");}
 }
 return <Dialog open={Boolean(file)} onOpenChange={open=>!open&&onClose()}><DialogContent className="workspace-viewer"><DialogHeader><DialogTitle>{file?.caption||file?.filename}</DialogTitle><DialogDescription>{file?.filename}{file&&" · Dreambau Evidence"}</DialogDescription></DialogHeader>{file&&<>
  {failed?<Alert variant="destructive"><AlertTitle>{de?"Vorschau nicht verfügbar":"Preview unavailable"}</AlertTitle><AlertDescription>{de?"Die Datei ist nicht mehr erreichbar oder die Berechtigung hat sich geändert. Bitte den Eintrag erneut laden.":"The file is unavailable or access has changed. Reload the entry to check its current state."}</AlertDescription></Alert>:canImage?<div className="workspace-media"><img src={preview!} alt={file.caption||file.filename} onError={()=>setFailedMedia(key)}/></div>:canVideo?<div className="workspace-media"><video src={preview!} controls preload="metadata" onError={()=>setFailedMedia(key)} aria-label={file.caption||file.filename}/></div>:canText?(text.key!==key||text.state==="loading"?<Skeleton className="h-48 w-full"/>:type==="text/markdown"?<div className="workspace-markdown" dangerouslySetInnerHTML={{__html:renderMarkdown(text.value)}}/>:<pre className="workspace-document-text">{text.value}</pre>):<p className="text-sm text-muted-foreground">{de?"Für diese Datei gibt es keine sichere Vorschau. Verfügbare Originale kannst du separat öffnen.":"This file has no supported safe preview. Available originals can be opened separately."}</p>}
  {file.caption&&<p className="workspace-caption">{file.caption}</p>}
  <div className="workspace-viewer-actions">{download&&<Button variant="outline" size="sm" asChild><a href={download} download rel="noreferrer"><DownloadIcon data-icon="inline-start"/>{de?"Datei herunterladen":"Download file"}</a></Button>}{reportUrl&&<Button variant="outline" size="sm" asChild><a href={reportUrl} target="_blank" rel="noopener noreferrer"><ExternalLinkIcon data-icon="inline-start"/>{de?"Bericht öffnen":"Open report"}</a></Button>}{publicUrl&&<><Button variant="outline" size="sm" asChild><a href={publicUrl} target="_blank" rel="noopener noreferrer">{de?"Veröffentlichten Beleg öffnen":"Open published evidence"}</a></Button><Button variant="outline" size="sm" onClick={()=>void copyLink()}><CopyIcon data-icon="inline-start"/>{copyState==="copied"?(de?"Kopiert":"Copied"):(de?"Evidence-Link kopieren":"Copy evidence link")}</Button></>}</div>{copyState==="error"&&<p role="alert" className="text-sm text-destructive">{de?"Der Link konnte nicht in die Zwischenablage kopiert werden.":"The link could not be copied to the clipboard."}</p>}
 </>}</DialogContent></Dialog>;
}
