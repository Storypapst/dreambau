# Prompt: Komponente bauen — Graph → Storybook → Figma → Code

Für eine konkrete UI-Aufgabe einfügen (Komponente/Story-Name ersetzen):

---

Ich will die Komponente **<Name>** in **<ORISO-Frontend|ORISO-Admin>** bauen
bzw. ändern. Gehe streng in dieser Reihenfolge vor:

1. **Graph:** Suche in `.understand-anything/knowledge-graph.json` nach
   `<Name>` — bestehende Datei, Props, Verwendungsstellen (`imports`-Kanten).
   Sag, ob die Komponente schon existiert oder neu ist.
2. **Storybook:** Nutze den Storybook-MCP (`docs-list`,
   `docs-show` mit der gefundenen `{id}`, oder
   `docs-show-story`) für die verbindliche Prop-/Varianten-Doku.
   Rate niemals Props — wenn der MCP nichts liefert, sag das explizit statt
   zu improvisieren.
3. **Figma:** Falls ein Figma-Link vorliegt, hole Design-Kontext darüber
   (Figma-MCP) und gleiche mit der Storybook-Doku ab — bei Widerspruch: Figma
   ist das Bild, Storybook ist der Vertrag; beides im Report nennen.
4. **Implementieren:** Baue/ändere die Komponente entlang der M3-Regeln des
   Repos (`skills/oriso-frontend-component-discipline` falls vorhanden).
5. **Preview:** Führe `stories-preview` für die geänderte Story aus. Nimm die
   zurückgegebene URL **wörtlich** in deinen Abschlussbericht auf.
6. **ADRs:** Prüfe über die Graph-`governs`-Kanten, ob eine ADR diese
   Komponente/dieses Muster betrifft; nenne sie.

Abschluss immer mit: Datei(en) geändert, Storybook-Preview-URL, offene Fragen.
