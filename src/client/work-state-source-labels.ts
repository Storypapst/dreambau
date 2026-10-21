import type {Locale} from "./i18n";
export function sourceStateLabel(locale:Locale,state:string){
 const labels:Record<string,[string,string]>={not_recorded:["Nicht erfasst","Not recorded"],ready:["Bereit laut Beleg","Ready per evidence"],not_ready:["Nicht bereit laut Beleg","Not ready per evidence"],passed:["Bestanden laut Beleg","Passed per evidence"],failed:["Fehlgeschlagen laut Beleg","Failed per evidence"],stale:["Beleg veraltet","Evidence stale"],revision_mismatch:["Andere Revision","Different revision"],deployment_unverified:["Passendes Deployment fehlt","Matching deployment missing"]};
 return labels[state]?.[locale==="de"?0:1]??(locale==="de"?"Unbekannt":"Unknown");
}
