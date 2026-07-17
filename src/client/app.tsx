import { useEffect, useState } from "react";
import { api } from "@/api";
import { LoginForm } from "@/components/login-form";
import { AccountDirectory } from "@/components/account-directory";
import { Toaster } from "@/components/ui/sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AccountView, HumanUser, Taxonomies } from "@/types";
import type { Locale } from "@/i18n";
import { PasskeyEnrollment } from "@/components/passkey-enrollment";
import { clearRememberedLoginEmail } from "@/login-hint";

type Session = { authenticated: false } | { authenticated: true; method: "password-bootstrap" | "passkey" | "recovery"; userId: string | null };

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [locale, setLocaleState] = useState<Locale>(() => localStorage.getItem("testmails-locale") === "en" ? "en" : "de");
  const [accounts, setAccounts] = useState<AccountView[]>([]); const [taxonomies, setTaxonomies] = useState<Taxonomies>({ roles: [], topics: [], conversationTypes: [] });
  const [loadError, setLoadError] = useState(false);
  const [currentUser, setCurrentUser] = useState<HumanUser | null>(null);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  async function refreshSession() { setSession(await api<Session>("/auth/session").catch(() => ({ authenticated: false } as const))); }
  useEffect(() => { void refreshSession(); }, []);
  useEffect(() => {
    let current = true;
    if (session?.authenticated && session.method === "passkey") {
      setAccounts([]); setCurrentUser(null); setAccountsLoaded(false); setLoadError(false);
      Promise.all([api<AccountView[]>("/accounts"), api<Taxonomies>("/taxonomies"), api<HumanUser>("/auth/me")])
        .then(([a, t, user]) => {
          if (!current) return;
          setAccounts(a); setTaxonomies(t); setCurrentUser(user); setAccountsLoaded(true);
        })
        .catch(() => { if (current) setLoadError(true); });
    }
    return () => { current = false; };
  }, [session]);
  function setLocale(locale: Locale) { localStorage.setItem("testmails-locale", locale); document.documentElement.lang = locale; setLocaleState(locale); }
  return <TooltipProvider>{session?.authenticated && session.method !== "passkey" ? <PasskeyEnrollment locale={locale} onComplete={refreshSession} /> : session?.authenticated && accountsLoaded && currentUser ? <AccountDirectory initialAccounts={accounts} initialTaxonomies={taxonomies} locale={locale} onLocaleChange={setLocale} isAdmin={currentUser.role === "admin"} onLogout={() => { clearRememberedLoginEmail(); setSession({ authenticated: false }); setAccounts([]); setCurrentUser(null); setAccountsLoaded(false); }} /> : session?.authenticated === false ? <LoginForm locale={locale} onLocaleChange={setLocale} onAuthenticated={refreshSession} /> : loadError ? <main className="grid min-h-screen place-items-center p-6"><Alert variant="destructive" className="max-w-lg"><AlertTitle>{locale === "de" ? "Konten konnten nicht geladen werden" : "Accounts could not be loaded"}</AlertTitle><AlertDescription>{locale === "de" ? "Bitte Seite neu laden oder den Serverstatus prüfen." : "Reload the page or check the server status."}</AlertDescription></Alert></main> : <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-8"><Skeleton className="h-16 w-2/3" /><Skeleton className="h-12 w-full" /><Skeleton className="h-72 w-full" /></main>}<Toaster /></TooltipProvider>;
}
