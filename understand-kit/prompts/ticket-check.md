# Prompt: Ticket-Check gegen den Graph

Vor dem Start eines Tickets in Claude Code einfügen (Ticket-ID/-Link ersetzen):

---

Prüfe das Ticket **<TICKET-ID/URL>** gegen den Understand-Anything-Graph, bevor
ich Code schreibe.

1. Lies `.understand-anything/meta.json` (Repo-Graph) und ggf.
   `.understand-anything/platform-graph.json` (Cross-Service). Nenne
   Branch, Commit und Alter in einer Zeile (oder nutze `/oriso-graph`, falls
   installiert).
2. Falls der Graph älter als 24h ist: sag das explizit und schlage
   `ua-pull` vor, statt einfach weiterzumachen.
3. Führe `/understand-diff` (falls das Ticket bereits Diff-relevant ist) oder
   eine Graph-Query für den Scope des Tickets aus: welche Dateien, Funktionen,
   Endpunkte und Services sind betroffen?
4. Liste konkret:
   - **Betroffene Endpunkte** (METHOD /path + Service)
   - **Betroffene Tabellen** (über `owns`-Kanten)
   - **Betroffene Services** und deren `depends_on`-Nachbarn
   - **Governing ADRs** (über `governs`/`documents`-Kanten, mit Dateipfad)
5. Wenn ein ADR dem widerspricht, was das Ticket verlangt: stoppe und melde
   den Konflikt, statt ihn stillschweigend zu übergehen.
5a. **UI-Ticket (Frontend/Admin):** Finde die betroffenen Stories über den
   Storybook-MCP — `stories-find-by-component` für jede betroffene Komponente,
   `docs-show` für die verbindlichen Props. Nach Änderungen: `stories-changed`
   zeigt, welche Stories dein Diff berührt; `stories-preview` liefert die URL
   für den Bericht.
6. Schließe mit einem klaren **Go / No-Go**:
   - **Go**, wenn Scope + ADRs eindeutig sind → kurze Umsetzungsskizze.
   - **No-Go**, wenn der Graph fehlt/veraltet ist, ein ADR-Konflikt offen ist,
     oder der Scope aus dem Graph nicht eindeutig hervorgeht — sag genau,
     was fehlt.

Nenne explizit, wenn der Graph für einen Endpunkt keine Caller-Kante hat
(nicht raten, sondern "keine Kante gefunden" sagen).
