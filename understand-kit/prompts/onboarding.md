# Prompt: Onboarding-Tour für neue Entwickler:innen

Am ersten Tag in einem ORISO-Repo in Claude Code einfügen:

---

Ich bin neu in diesem Repo. Gib mir eine Onboarding-Tour über
Understand-Anything.

1. Führe `/understand-onboard` aus (kein Build nötig, Plugin-Skill).
2. Lies zusätzlich `.understand-anything/platform-graph.json`, falls
   vorhanden, für den Cross-Service-Blick: welche Services gibt es, wer ruft
   wen (`calls`/`depends_on`), wer besitzt welche Tabellen (`owns`), welche
   ADRs (`governs`/`documents`) sind für dieses Repo bindend.
3. Nenne die Graph-Freshness in einer Zeile (Datum aus `meta.json`,
   Tiefe aus `depth.json` falls vorhanden).
4. Produziere daraus **eine Seite** "Wie ORISO zusammenhängt":
   - Dieses Repo: Zweck, wichtigste Module/Ordner, wichtigste Endpunkte
   - Die 3–5 Services, mit denen dieses Repo am engsten verzahnt ist
     (höchstes `depends_on`-Gewicht) und wofür
   - Die wichtigsten ADRs, die für dieses Repo gelten (Name + Pfad, keine
     Nummern raten — die Nummerierung driftet zwischen Repos)
   - Wo die UI-Komponenten herkommen (Storybook-MCP, nicht raten)
5. Verweise am Ende auf `skills/oriso-graph/SKILL.md` (falls im Repo
   vorhanden) für die volle Arbeitsregel.

Halte die Ausgabe auf einer Bildschirmseite — Stichpunkte, keine Prosa-Wand.
