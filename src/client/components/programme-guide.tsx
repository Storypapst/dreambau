import { useEffect, useState } from "react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProgrammeGuide as Guide } from "../../server/teamwork-guides";

export function ProgrammeGuide({ id, onLogout }: { id: string; onLogout: () => void }) {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true; setGuide(null); setError("");
    api<Guide>(`/teamwork/guides/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((value) => { if (current) setGuide(value); })
      .catch((reason) => { if (current) setError(reason instanceof Error && reason.message === "guide_not_found" ? "Diese Anleitung ist noch nicht verfügbar." : "Die Anleitung konnte nicht geladen werden. Bitte erneut versuchen."); });
    return () => { current = false; };
  }, [id, retry]);
  async function logout() {
    setGuide(null);
    // Clear the rendered content immediately, even if the network is unavailable.
    onLogout();
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
  }
  return <main className="programme-guide">
    <header className="guide-header"><Button variant="outline" asChild><a href="/teamwork/">‹ Teamwork</a></Button><Button variant="outline" onClick={() => void logout()}>Abmelden</Button></header>
    <p className="guide-eyebrow">TEAMWORK · ANLEITUNG</p>
    {error ? <Alert><AlertTitle>Anleitung nicht verfügbar</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={() => setRetry((n) => n + 1)}>Erneut versuchen</Button></AlertDescription></Alert> : !guide ? <div aria-label="Anleitung wird geladen" className="flex flex-col gap-4"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-24 w-full" /></div> : <>
      <h1>{guide.title}<span className="guide-caret" aria-hidden="true" /></h1>
      <p className="guide-summary">{guide.summary}</p>
      {(guide.useCases.length > 0 || guide.learnMore.length > 0) && <section className="guide-introduction" aria-label="Praktische Einsatzmöglichkeiten"><h2>Was kann das?</h2>
        <ul>{guide.useCases.map((useCase) => <li key={useCase}>{useCase}</li>)}</ul>
        <div className="guide-links">{guide.learnMore.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>)}</div>
      </section>}
      <Tabs defaultValue={guide.platforms[0].id} key={guide.id}>
        <TabsList variant="line" aria-label="Dein Gerät">{guide.platforms.map((platform) => <TabsTrigger key={platform.id} value={platform.id}>{platform.label}</TabsTrigger>)}</TabsList>
        {guide.platforms.map((platform) => <TabsContent key={platform.id} value={platform.id}>
          <ol className="guide-steps">
            {platform.downloads.length > 0 && <li><span className="guide-number">01</span><div><h2>App herunterladen</h2><div className="guide-downloads">{platform.downloads.map((link) => <Button variant="outline" key={link.url} asChild><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a></Button>)}</div></div></li>}
            {platform.steps.map((step, index) => <li key={index}><span className="guide-number">{String(index + (platform.downloads.length ? 2 : 1)).padStart(2, "0")}</span><div><h2>{step.title}</h2><p>{step.text}</p></div></li>)}
          </ol>
        </TabsContent>)}
      </Tabs>
      {guide.launchUrl && <Button variant="outline" asChild><a href={guide.launchUrl} target="_blank" rel="noopener noreferrer">Programm öffnen ↗</a></Button>}
      <p className="guide-access-note">Die Anmeldung hier gewährt keinen Zugang in anderen Programmen. Persönliche Schlüssel und Einladungen bleiben getrennt.</p>
    </>}
  </main>;
}
