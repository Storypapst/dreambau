import { useEffect, useState } from "react";
import { api } from "@/api";
import { LoginForm } from "@/components/login-form";
import { AccountDirectory } from "@/components/account-directory";
import { Toaster } from "@/components/ui/sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AccountView, Taxonomies } from "@/types";

export function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<AccountView[]>([]); const [taxonomies, setTaxonomies] = useState<Taxonomies>({ roles: [], topics: [], conversationTypes: [] });
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { api<{ authenticated: boolean }>("/auth/session").then((value) => setAuthenticated(value.authenticated)).catch(() => setAuthenticated(false)); }, []);
  useEffect(() => { if (authenticated) { setLoadError(false); Promise.all([api<AccountView[]>("/accounts"), api<Taxonomies>("/taxonomies")]).then(([a,t]) => { setAccounts(a); setTaxonomies(t); }).catch(() => setLoadError(true)); } }, [authenticated]);
  return <TooltipProvider>{authenticated && accounts.length ? <AccountDirectory initialAccounts={accounts} initialTaxonomies={taxonomies} onLogout={() => { setAuthenticated(false); setAccounts([]); }} /> : authenticated === false ? <LoginForm onAuthenticated={() => setAuthenticated(true)} /> : loadError ? <main className="grid min-h-screen place-items-center p-6"><Alert variant="destructive" className="max-w-lg"><AlertTitle>Konten konnten nicht geladen werden</AlertTitle><AlertDescription>Bitte Seite neu laden oder den Serverstatus prüfen.</AlertDescription></Alert></main> : <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-8"><Skeleton className="h-16 w-2/3" /><Skeleton className="h-12 w-full" /><Skeleton className="h-72 w-full" /></main>}<Toaster /></TooltipProvider>;
}
