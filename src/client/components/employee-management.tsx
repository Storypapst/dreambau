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
import type { HumanUser } from "@/types";
import { createTeamMember, loadTeamMembers, setTeamMemberStatus } from "@/team-client";

const projects = ["oriso", "orimo", "dreambau"] as const;

export function EmployeeManagement({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<HumanUser[]>([]);
  const [email, setEmail] = useState(""); const [name, setName] = useState("");
  const [selected, setSelected] = useState<Array<(typeof projects)[number]>>([]);
  const [enrollmentCode, setEnrollmentCode] = useState(""); const [error, setError] = useState(false);
  async function load() { setUsers(await loadTeamMembers()); }
  async function create() {
    setError(false);
    try {
      const user = await createTeamMember({ email, name, projects: selected });
      setUsers((current) => [...current, user].sort((left, right) => left.email.localeCompare(right.email)));
      setEnrollmentCode(user.enrollmentCode); setEmail(""); setName(""); setSelected([]);
    } catch { setError(true); }
  }
  async function setStatus(user: HumanUser) {
    const updated = await setTeamMemberStatus(user.id, user.status === "active" ? "disabled" : "active");
    setUsers((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
  }
  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); setEnrollmentCode(""); if (value) void load(); }}>
    <DialogTrigger asChild><Button variant="outline"><UsersIcon />{locale === "de" ? "Mitarbeiter" : "Team"}</Button></DialogTrigger>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{locale === "de" ? "Mitarbeiterzugänge" : "Team access"}</DialogTitle><DialogDescription>{locale === "de" ? "Passkey-Konten werden hier angelegt. Effektive Projektzugriffe werden aus Infisical-Gruppen synchronisiert." : "Passkey accounts are created here. Effective project access is synchronized from Infisical groups."}</DialogDescription></DialogHeader>
      <FieldGroup>
        {error && <Alert variant="destructive"><AlertTitle>{locale === "de" ? "Anlegen fehlgeschlagen" : "Creation failed"}</AlertTitle></Alert>}
        {enrollmentCode && <Alert><AlertTitle>{locale === "de" ? "Enrollment-Code jetzt sicher übergeben" : "Share this enrollment code securely now"}</AlertTitle><AlertDescription>{locale === "de" ? "Der Code wird nach dem Schließen nicht erneut angezeigt." : "The code will not be shown again after closing."}</AlertDescription><pre className="mt-3 overflow-x-auto rounded bg-muted p-3">{enrollmentCode}</pre></Alert>}
        <div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="employee-name">Name</FieldLabel><Input id="employee-name" value={name} onChange={(event) => setName(event.target.value)} /></Field><Field><FieldLabel htmlFor="employee-email">E-Mail</FieldLabel><Input id="employee-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field></div>
        <div className="flex flex-wrap gap-4">{projects.map((project) => <label key={project} className="flex items-center gap-2 text-sm"><Checkbox checked={selected.includes(project)} onCheckedChange={(checked) => setSelected((current) => checked ? [...current, project] : current.filter((value) => value !== project))} />{project.toUpperCase()}</label>)}</div>
        <Button onClick={create} disabled={!name || !email || selected.length === 0}><UserPlusIcon />{locale === "de" ? "Mitarbeiter anlegen" : "Create team member"}</Button>
      </FieldGroup>
      <div className="mt-4 flex flex-col gap-2">{users.map((user) => <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><div className="font-medium">{user.name} <Badge variant="outline">{user.role}</Badge></div><div className="text-sm text-muted-foreground">{user.email} · {user.projects.join(", ")}</div></div><Button size="sm" variant={user.status === "active" ? "destructive" : "outline"} onClick={() => setStatus(user)}>{user.status === "active" ? (locale === "de" ? "Sperren" : "Disable") : (locale === "de" ? "Reaktivieren" : "Reactivate")}</Button></div>)}</div>
    </DialogContent>
  </Dialog>;
}
