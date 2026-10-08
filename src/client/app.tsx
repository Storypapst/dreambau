import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, onUnauthorized } from "@/api";
import { ProgrammeGuide } from "@/components/programme-guide";
import { LoginForm } from "@/components/login-form";
import { AccountDirectory } from "@/components/account-directory";
import { Toaster } from "@/components/ui/sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AccountView, HumanUser, Taxonomies } from "@/types";
import type { Locale } from "@/i18n";
import { PasskeyEnrollment } from "@/components/passkey-enrollment";
import { clearRememberedLoginEmail } from "@/login-hint";

type Session = { authenticated: false } | { authenticated: true; method: "password-bootstrap" | "passkey" | "recovery" | "email-otp"; userId: string | null };

export function App() {
  const [guideId] = useState(() => /^\/testmails\/teamwork\/guide\/([a-z][a-z0-9-]{0,47})\/?$/.exec(window.location.pathname)?.[1] ?? null);
  useEffect(() => {
    if (!guideId) return;
    const originalTitle = document.title;
    document.title = "Teamwork · Anleitung";
    return () => { document.title = originalTitle; };
  }, [guideId]);
  const [session, setSession] = useState<Session | null>(null);
  const [locale, setLocaleState] = useState<Locale>(() => localStorage.getItem("testmails-locale") === "en" ? "en" : "de");
  const [accounts, setAccounts] = useState<AccountView[]>([]); const [taxonomies, setTaxonomies] = useState<Taxonomies>({ roles: [], topics: [], conversationTypes: [] });
  const [loadError, setLoadError] = useState(false);
  const [currentUser, setCurrentUser] = useState<HumanUser | null>(null);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  async function refreshSession() { setSession(await api<Session>("/auth/session").catch(() => ({ authenticated: false } as const))); }
  useEffect(() => { void refreshSession(); }, []);
  const sessionRef = useRef<Session | null>(null);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => onUnauthorized(() => {
    // Only a session that was live is worth reporting: an anonymous 401 on the
    // first load already lands on the login screen by itself.
    if (sessionRef.current?.authenticated) {
      toast.error(locale === "de"
        ? "Die Sitzung ist abgelaufen. Bitte erneut anmelden."
        : "The session has expired. Please sign in again.");
    }
    setSession({ authenticated: false });
    setAccounts([]);
    setCurrentUser(null);
    setAccountsLoaded(false);
  }), [locale]);
  useEffect(() => {
    let current = true;
    if (!guideId && session?.authenticated && (session.method === "passkey" || session.method === "email-otp")) {
      setAccounts([]); setCurrentUser(null); setAccountsLoaded(false); setLoadError(false);
      Promise.all([api<AccountView[]>("/accounts"), api<Taxonomies>("/taxonomies"), api<HumanUser>("/auth/me")])
        .then(([a, t, user]) => {
          if (!current) return;
          setAccounts(a); setTaxonomies(t); setCurrentUser(user); setAccountsLoaded(true);
        })
        .catch(() => { if (current) setLoadError(true); });
    }
    return () => { current = false; };
  }, [session, guideId]);
  function setLocale(locale: Locale) { localStorage.setItem("testmails-locale", locale); document.documentElement.lang = locale; setLocaleState(locale); }
  function loggedOut() { clearRememberedLoginEmail(); setSession({ authenticated: false }); setAccounts([]); setCurrentUser(null); setAccountsLoaded(false); }
  const needsEnrollment = session?.authenticated && session.method !== "passkey" && session.method !== "email-otp";
  if (guideId) return <TooltipProvider>
    <div className="teamwork-guide-theme">
      {needsEnrollment ? <PasskeyEnrollment locale={locale} onComplete={refreshSession} />
        : session?.authenticated ? <ProgrammeGuide id={guideId} onLogout={loggedOut} />
        : session?.authenticated === false ? <>
          <div className="guide-login-back"><Button variant="outline" asChild><a href="/teamwork/">‹ Teamwork</a></Button></div>
          <LoginForm locale={locale} onLocaleChange={setLocale} onAuthenticated={refreshSession}
            context={{ title: "Teamwork öffnen", description: "Melde dich mit deinem bestehenden Zugang an, um die Anleitung zu öffnen." }} />
        </> : <main className="programme-guide"><Skeleton className="h-12 w-2/3" /></main>}
      <Toaster />
    </div>
  </TooltipProvider>;
  return <TooltipProvider>{needsEnrollment ? <PasskeyEnrollment locale={locale} onComplete={refreshSession} /> : session?.authenticated && accountsLoaded && currentUser ? <AccountDirectory initialAccounts={accounts} initialTaxonomies={taxonomies} locale={locale} onLocaleChange={setLocale} isAdmin={currentUser.role === "admin"} canManagePasskeys={session.method === "passkey"} entitlements={currentUser.entitlements} onLogout={() => { clearRememberedLoginEmail(); setSession({ authenticated: false }); setAccounts([]); setCurrentUser(null); setAccountsLoaded(false); }} /> : session?.authenticated === false ? <LoginForm locale={locale} onLocaleChange={setLocale} onAuthenticated={refreshSession} /> : loadError ? <main className="grid min-h-screen place-items-center p-6"><Alert variant="destructive" className="max-w-lg"><AlertTitle>{locale === "de" ? "Konten konnten nicht geladen werden" : "Accounts could not be loaded"}</AlertTitle><AlertDescription>{locale === "de" ? "Bitte Seite neu laden oder den Serverstatus prüfen." : "Reload the page or check the server status."}</AlertDescription></Alert></main> : <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-8"><Skeleton className="h-16 w-2/3" /><Skeleton className="h-12 w-full" /><Skeleton className="h-72 w-full" /></main>}<Toaster /></TooltipProvider>;
}
