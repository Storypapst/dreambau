import { useState } from "react";
import { KeyRoundIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { api } from "@/api";
import { registerPasskey } from "@/passkey-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { t, type Locale } from "@/i18n";

export interface PasskeySummary {
  id: string;
  name: string | null;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export function isHybridOnly(passkey: Pick<PasskeySummary, "transports">) {
  return passkey.transports.length > 0 && passkey.transports.every((transport) => transport === "hybrid");
}

function formatDate(locale: Locale, value: string | null) {
  if (!value) return "–";
  return new Date(value).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { year: "numeric", month: "short", day: "numeric" });
}

export function PasskeyManager({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"load" | "add" | "rename" | "delete" | "last" | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [newName, setNewName] = useState("");

  async function load() {
    setError(null);
    try { setPasskeys((await api<{ passkeys: PasskeySummary[] }>("/auth/passkeys")).passkeys); }
    catch { setError("load"); }
  }
  async function add() {
    setBusy(true); setError(null);
    try { await registerPasskey(undefined, { name: newName }); setNewName(""); await load(); }
    catch { setError("add"); }
    finally { setBusy(false); }
  }
  async function rename() {
    if (!editing) return;
    setBusy(true); setError(null);
    try {
      const result = await api<{ passkeys: PasskeySummary[] }>(`/auth/passkeys/${encodeURIComponent(editing.id)}`, { method: "PATCH", body: JSON.stringify({ name: editing.name }) });
      setPasskeys(result.passkeys); setEditing(null);
    } catch { setError("rename"); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true); setError(null);
    try {
      const result = await api<{ passkeys: PasskeySummary[] }>(`/auth/passkeys/${encodeURIComponent(id)}`, { method: "DELETE" });
      setPasskeys(result.passkeys);
    } catch (reason) { setError(reason instanceof Error && reason.message === "last_passkey" ? "last" : "delete"); }
    finally { setBusy(false); }
  }

  const hybridOnly = passkeys.length > 0 && passkeys.every(isHybridOnly);
  const errorText = error === "load" ? t(locale, "passkeys.errorLoad")
    : error === "add" ? t(locale, "passkeys.errorAdd")
    : error === "rename" ? t(locale, "passkeys.errorRename")
    : error === "last" ? t(locale, "passkeys.errorLast")
    : error === "delete" ? t(locale, "passkeys.errorDelete") : "";

  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); setEditing(null); if (value) void load(); }}>
    <DialogTrigger asChild><Button variant="outline"><KeyRoundIcon data-icon="inline-start" />{t(locale, "passkeys.button")}</Button></DialogTrigger>
    <DialogContent className="max-h-[90vh] min-w-0 overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>{t(locale, "passkeys.title")}</DialogTitle><DialogDescription>{t(locale, "passkeys.description")}</DialogDescription></DialogHeader>
      {errorText && <Alert variant="destructive"><AlertTitle>{t(locale, "passkeys.errorTitle")}</AlertTitle><AlertDescription>{errorText}</AlertDescription></Alert>}
      {hybridOnly && <Alert data-testid="hybrid-only-hint"><AlertTitle>{t(locale, "passkeys.hybridOnlyTitle")}</AlertTitle><AlertDescription>{t(locale, "passkeys.hybridOnlyBody")}</AlertDescription></Alert>}
      <ul className="flex flex-col gap-2" data-testid="passkey-list">
        {passkeys.map((passkey) => <li key={passkey.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          {editing?.id === passkey.id
            ? <form className="flex flex-1 items-center gap-2" onSubmit={(event) => { event.preventDefault(); void rename(); }}>
              <Input aria-label={t(locale, "passkeys.nameLabel")} value={editing.name} maxLength={60} onChange={(event) => setEditing({ id: passkey.id, name: event.target.value })} autoFocus />
              <Button type="submit" size="sm" disabled={busy || !editing.name.trim()}>{t(locale, "passkeys.save")}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>{t(locale, "passkeys.cancel")}</Button>
            </form>
            : <div className="flex flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{passkey.name ?? t(locale, "passkeys.unnamed")}</span>{isHybridOnly(passkey) ? <Badge variant="secondary">{t(locale, "passkeys.badgeHybrid")}</Badge> : <Badge variant="outline">{t(locale, "passkeys.badgeDevice")}</Badge>}{passkey.backedUp && <Badge variant="outline">{t(locale, "passkeys.badgeSynced")}</Badge>}</div>
              <div className="text-xs text-muted-foreground">{t(locale, "passkeys.created")}: {formatDate(locale, passkey.createdAt)} · {t(locale, "passkeys.lastUsed")}: {formatDate(locale, passkey.lastUsedAt)}</div>
            </div>}
          {editing?.id !== passkey.id && <div className="flex gap-1">
            <Button type="button" size="sm" variant="ghost" aria-label={t(locale, "passkeys.rename")} onClick={() => setEditing({ id: passkey.id, name: passkey.name ?? "" })}><PencilIcon /></Button>
            <Button type="button" size="sm" variant="ghost" aria-label={t(locale, "passkeys.delete")} disabled={busy || passkeys.length <= 1} onClick={() => void remove(passkey.id)}><Trash2Icon /></Button>
          </div>}
        </li>)}
      </ul>
      <form className="flex flex-wrap items-end gap-2 border-t pt-4" onSubmit={(event) => { event.preventDefault(); void add(); }}>
        <div className="flex min-w-48 flex-1 flex-col gap-1"><label className="text-sm" htmlFor="new-passkey-name">{t(locale, "passkeys.newNameLabel")}</label><Input id="new-passkey-name" value={newName} maxLength={60} placeholder={t(locale, "passkeys.newNamePlaceholder")} onChange={(event) => setNewName(event.target.value)} /></div>
        <Button type="submit" disabled={busy}><PlusIcon data-icon="inline-start" />{t(locale, "passkeys.add")}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}
