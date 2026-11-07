import { useEffect, useState } from "react";
import type { Locale } from "@/i18n";
import type { WorkspacePreferences } from "../../shared/workspace-preferences.js";
import type { WorkspaceDefaults } from "./evidence-workspace-defaults";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
export function EvidenceWorkspaceSettings({locale,defaults,onClose}:{locale:Locale;defaults:WorkspaceDefaults;onClose:()=>void}) {
 const de=locale==="de";
 const [dirty,setDirty]=useState(false);
 const [remember,setRemember]=useState(defaults.preferences.rememberFilters);
 const [refresh,setRefresh]=useState<WorkspacePreferences["refreshMinutes"]>(defaults.preferences.refreshMinutes);
 useEffect(()=>{if(defaults.ready&&!dirty){setRemember(defaults.preferences.rememberFilters);setRefresh(defaults.preferences.refreshMinutes);}},[defaults.ready,defaults.preferences.rememberFilters,defaults.preferences.refreshMinutes,dirty]);
 async function save(){if(await defaults.saveSettings({rememberFilters:remember,refreshMinutes:refresh}))onClose();}
 return <Dialog open onOpenChange={open=>!open&&onClose()}><DialogContent className="workspace-settings"><DialogHeader><DialogTitle>{de?"Arbeitsbereich-Einstellungen":"Workspace settings"}</DialogTitle><DialogDescription>{de?"Diese Einstellungen gelten für deinen Zugang. Das aktuelle Projekt bleibt unverändert.":"These settings belong to your account. Your current project stays selected."}</DialogDescription></DialogHeader>
 {defaults.loading?<p role="status">{de?"Einstellungen werden geladen …":"Loading settings …"}</p>:defaults.loadError?<Alert variant="destructive"><AlertTitle>{de?"Einstellungen konnten nicht geladen werden":"Settings could not be loaded"}</AlertTitle><AlertDescription>{de?"Die Testläufe bleiben nutzbar. Vorhandene Einstellungen werden nicht überschrieben.":"Test runs remain available. Existing settings are not overwritten."}</AlertDescription><Button variant="outline" size="sm" onClick={defaults.retry}>{de?"Erneut laden":"Retry"}</Button></Alert>:null}
 <FieldGroup><Field orientation="horizontal"><Checkbox id="workspace-remember-filters" checked={remember} onCheckedChange={checked=>{setDirty(true);setRemember(checked===true);}} disabled={!defaults.ready||defaults.saving}/><div><FieldLabel htmlFor="workspace-remember-filters">{de?"Quelle und Umgebung je Projekt merken":"Remember source and environment for each project"}</FieldLabel><FieldDescription>{de?"Suchbegriffe, Ergebnisfilter und ausgewählte Einträge werden nicht gespeichert.":"Search terms, result filters and selected records are not saved."}</FieldDescription></div></Field><Field><FieldLabel htmlFor="workspace-refresh-frequency">{de?"Anzeige aktualisieren":"Display refresh"}</FieldLabel><Select value={String(refresh)} onValueChange={value=>{setDirty(true);setRefresh(value==="0"?0:value==="60"?60:15);}} disabled={!defaults.ready||defaults.saving}><SelectTrigger id="workspace-refresh-frequency" aria-label={de?"Anzeige aktualisieren":"Display refresh"}><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="0">{de?"Nur manuell":"Manual only"}</SelectItem><SelectItem value="15">{de?"Alle 15 Minuten":"Every 15 minutes"}</SelectItem><SelectItem value="60">{de?"Alle 60 Minuten":"Every 60 minutes"}</SelectItem></SelectGroup></SelectContent></Select><FieldDescription>{de?"GitHub-Fakten werden nur für den ausgewählten Eintrag und bei sichtbarer Seite geprüft.":"GitHub facts are checked only for the selected record while the page is visible."}</FieldDescription></Field>
 {defaults.saveError&&<p role="alert" className="text-sm text-destructive">{de?"Einstellungen konnten nicht gespeichert werden. Bitte erneut versuchen.":"Settings could not be saved. Please try again."}</p>}
 <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={onClose}>{de?"Abbrechen":"Cancel"}</Button><Button disabled={!defaults.ready||defaults.saving} onClick={()=>void save()}>{defaults.saving?(de?"Speichert …":"Saving …"):(de?"Einstellungen speichern":"Save settings")}</Button></div></FieldGroup>
 </DialogContent></Dialog>;
}
