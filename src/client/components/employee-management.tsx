import { useState } from "react";
import { UserPlusIcon, UsersIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n";
import type { HumanAccessSourceStatus, HumanUser } from "@/types";
import { createTeamMember, loadTeamMembers, setTeamMemberStatus } from "@/team-client";
import { CopyButton } from "./copy-button";

const projects = ["oriso", "orimo", "dreambau"] as const;

export function EmployeeManagement({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<HumanUser[]>([]);
  const [email, setEmail] = useState(""); const [name, setName] = useState("");
  const [selected, setSelected] = useState<Array<(typeof projects)[number]>>([]);
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [error, setError] = useState<"load" | "create" | "status" | null>(null);
  const [sourceStatus, setSourceStatus] = useState<HumanAccessSourceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const isDegraded = sourceStatus?.infisical === "degraded";
  const mutationsDisabled = loading || isDegraded;
  async function load() {
    setError(null);
    setLoading(true);
    try {
      const result = await loadTeamMembers();
      setUsers(result.users);
      setSourceStatus(result.sourceStatus);
    }
    catch { setError("load"); }
    finally { setLoading(false); }
  }
  async function create() {
    setError(null);
    try {
      const user = await createTeamMember({ email, name, projects: selected });
      setUsers((current) => [...current, user].sort((left, right) => left.email.localeCompare(right.email)));
      setEnrollmentCode(user.enrollmentCode); setEmail(""); setName(""); setSelected([]);
    } catch { setError("create"); }
  }
  async function setStatus(user: HumanUser) {
    setError(null);
    try {
      const updated = await setTeamMemberStatus(user.id, user.status === "active" ? "disabled" : "active");
      setUsers((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    } catch { setError("status"); }
  }
  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); setEnrollmentCode(""); if (value) void load(); }}>
    <DialogTrigger asChild><Button variant="outline"><UsersIcon />{locale === "de" ? "Mitarbeiter" : "Team"}</Button></DialogTrigger>
    <DialogContent className="max-h-[90vh] min-w-0 overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{locale === "de" ? "Mitarbeiterzugänge" : "Team access"}</DialogTitle><DialogDescription>{locale === "de" ? "Passkey-Konten werden hier angelegt. Effektive Projektzuordnungen werden aus Infisical-Mitgliedschaften mit No Access oder Admin synchronisiert." : "Passkey accounts are created here. Effective project assignments are synchronized from Infisical memberships with No Access or Admin."}</DialogDescription></DialogHeader>
      <FieldGroup className="min-w-0">
        {error && <Alert variant="destructive"><AlertTitle>{error === "load" ? (locale === "de" ? "Mitarbeiter konnten nicht geladen werden" : "Team members could not be loaded") : error === "status" ? (locale === "de" ? "Statusänderung fehlgeschlagen" : "Status update failed") : (locale === "de" ? "Anlegen fehlgeschlagen" : "Creation failed")}</AlertTitle></Alert>}
        {sourceStatus?.infisical === "degraded" && <Alert><AlertTitle>{locale === "de" ? "Infisical-Abgleich vorübergehend eingeschränkt" : "Infisical sync temporarily degraded"}</AlertTitle><AlertDescription>{locale === "de" ? "Lokal gespeicherte Mitarbeiterzugänge werden angezeigt. Änderungen sind bis zur Wiederherstellung des Abgleichs deaktiviert." : "Locally stored team access is shown. Changes are disabled until synchronization is restored."} {locale === "de" ? "Referenz" : "Reference"}: <code>{sourceStatus.correlationId}</code></AlertDescription></Alert>}
        {enrollmentCode && <Alert className="min-w-0"><AlertTitle>{locale === "de" ? "Enrollment-Code jetzt sicher übergeben" : "Share this enrollment code securely now"}</AlertTitle><AlertDescription className="min-w-0"><p>{locale === "de" ? "Der Code wird nach dem Schließen nicht erneut angezeigt." : "The code will not be shown again after closing."}</p><div className="mt-3 flex w-full min-w-0 items-start gap-2"><code className="min-w-0 flex-1 break-all rounded bg-muted p-3 font-mono text-sm">{enrollmentCode}</code><CopyButton value={enrollmentCode} label={locale === "de" ? "Enrollment-Code kopieren" : "Copy enrollment code"} /></div></AlertDescription></Alert>}
        <div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="employee-name">Name</FieldLabel><Input id="employee-name" value={name} onChange={(event) => setName(event.target.value)} /></Field><Field><FieldLabel htmlFor="employee-email">E-Mail</FieldLabel><Input id="employee-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field></div>
        <div className="flex flex-wrap gap-4">{projects.map((project) => <label key={project} className="flex items-center gap-2 text-sm"><Checkbox checked={selected.includes(project)} onCheckedChange={(checked) => setSelected((current) => checked ? [...current, project] : current.filter((value) => value !== project))} />{project.toUpperCase()}</label>)}</div>
        <Button onClick={create} disabled={mutationsDisabled || !name || !email || selected.length === 0}><UserPlusIcon />{locale === "de" ? "Mitarbeiter anlegen" : "Create team member"}</Button>
      </FieldGroup>
      <div className="mt-4 flex flex-col gap-2">{users.map((user) => <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><div className="font-medium">{user.name} <Badge variant="outline">{user.role}</Badge></div><div className="text-sm text-muted-foreground">{user.email} · {user.projects.join(", ")}</div></div><Button size="sm" variant={user.status === "active" ? "destructive" : "outline"} disabled={mutationsDisabled} onClick={() => setStatus(user)}>{user.status === "active" ? (locale === "de" ? "Sperren" : "Disable") : (locale === "de" ? "Reaktivieren" : "Reactivate")}</Button></div>)}</div>
    </DialogContent>
  </Dialog>;
}
