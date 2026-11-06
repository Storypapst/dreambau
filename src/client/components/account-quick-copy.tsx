import { useEffect, useRef, useState } from "react";
import { CheckIcon, KeyRoundIcon, LoaderCircleIcon, MailIcon, ShieldIcon, UserRoundIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n";
import { requestSafeOtp, TOTP_SAFETY_MARGIN_MS } from "@/safe-otp";
import { testUsernameFromEmail } from "@/test-fixture-names";
import type { AccountView, OtpResponse } from "@/types";

type CopyKind = "username" | "mail" | "app" | "otp";

// The most recent click owns the clipboard, even when the previous row is still waiting for an OTP.
let pendingCopy: AbortController | undefined;

export function cancelPendingAccountCopy() {
  pendingCopy?.abort();
}

async function writeFromClick(load: () => Promise<string>) {
  if (!navigator.clipboard) throw new Error("Clipboard unavailable");
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    // Safari requires the write call during the click. The value can arrive later.
    const blob = load().then((value) => new Blob([value], { type: "text/plain" }));
    void blob.catch(() => {});
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
    return;
  }
  await navigator.clipboard.writeText(await load());
}

export function AccountQuickCopy({ account, locale }: { account: AccountView; locale: Locale }) {
  const de = locale === "de";
  const linked = account.linkedAccess?.[0];
  const accountId = linked && !linked.deleted && !linked.deletionPending ? linked.id : undefined;
  const mailOtp = account.metadata.otpDelivery === "mail";
  const [state, setState] = useState<{ kind: CopyKind; phase: "working" | "copied" }>();
  const operation = useRef<AbortController | undefined>(undefined);
  const reset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    setState(undefined);
    return () => {
      operation.current?.abort();
      clearTimeout(reset.current);
    };
  }, [accountId, mailOtp]);

  async function copy(kind: CopyKind) {
    cancelPendingAccountCopy();
    clearTimeout(reset.current);
    const controller = new AbortController();
    pendingCopy = controller;
    operation.current = controller;
    const { signal } = controller;
    setState({ kind, phase: "working" });
    try {
      await writeFromClick(async () => {
        signal.throwIfAborted();
        if (kind === "username") return testUsernameFromEmail(account.email);
        if (kind === "mail") return account.password;
        const path = `/accounts/${encodeURIComponent(account.email)}`;
        const target = `?accountId=${encodeURIComponent(accountId!)}`;
        if (kind === "app") {
          const response = await api<{ accountId: string; secret: string }>(`${path}/application-secret${target}`, { signal });
          signal.throwIfAborted();
          if (response.accountId !== accountId || !response.secret) throw new Error("Application secret unavailable");
          return response.secret;
        }
        const response = await requestSafeOtp(() => {
          signal.throwIfAborted();
          return api<OtpResponse>(`${path}/otp${target}`, { signal });
        });
        signal.throwIfAborted();
        if (response.accountId !== accountId || response.source !== "totp" ||
          !(Date.parse(response.expiresAt) - Date.now() >= TOTP_SAFETY_MARGIN_MS) || !response.code) throw new Error("OTP unavailable");
        return response.code;
      });
      if (signal.aborted) return;
      setState({ kind, phase: "copied" });
      toast.success(de ? "Kopiert" : "Copied");
      reset.current = setTimeout(() => setState(undefined), 1800);
    } catch {
      if (!signal.aborted) toast.error(de ? "Kopieren fehlgeschlagen. Bitte erneut versuchen." : "Copy failed. Try again.");
    } finally {
      if (pendingCopy === controller) pendingCopy = undefined;
      if (operation.current === controller) {
        setState((current) => current?.phase === "working" ? undefined : current);
        operation.current = undefined;
      }
    }
  }

  function action(kind: CopyKind, label: string, Icon: typeof KeyRoundIcon) {
    const working = state?.kind === kind && state.phase === "working";
    const copied = state?.kind === kind && state.phase === "copied";
    return (
      <Button type="button" variant="ghost" size="icon-sm" aria-label={label}
        title={copied ? (de ? "Kopiert" : "Copied") : label}
        aria-busy={working || undefined} data-copied={copied || undefined} disabled={working} onClick={() => void copy(kind)}>
        {working ? <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" /> : copied ? <CheckIcon /> : <Icon />}
      </Button>
    );
  }

  return <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label={de ? "Zugangsdaten kopieren" : "Copy credentials"}>
    {action("username", de ? "Benutzernamen erzeugen und kopieren" : "Generate and copy username", UserRoundIcon)}
    {account.password && action("mail", de ? "Mail-Passwort kopieren" : "Copy mailbox password", MailIcon)}
    {accountId && action("app", de ? "App-Passwort kopieren" : "Copy app password", KeyRoundIcon)}
    {accountId && (mailOtp ? <Button asChild variant="ghost" size="icon-sm">
      <a href="https://mail.dreambau.com/" target="_blank" rel="noreferrer"
        aria-label={de ? "Mail-2FA im Webmail öffnen" : "Open Mail 2FA in webmail"}
        title={de ? "Mail-2FA im Webmail öffnen" : "Open Mail 2FA in webmail"}><ShieldIcon /></a>
    </Button> : linked?.hasTotp && action("otp", de ? "2FA-Code kopieren" : "Copy 2FA code", ShieldIcon))}
  </div>;
}
