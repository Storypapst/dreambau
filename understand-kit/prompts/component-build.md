# Prompt: Komponente bauen — Graph → Storybook → Figma → Code

Für eine konkrete UI-Aufgabe einfügen (Komponente/Story-Name ersetzen):

---

Ich will die Komponente **<Name>** in **<ORISO-Frontend|ORISO-Admin>** bauen
bzw. ändern. Gehe streng in dieser Reihenfolge vor:

1. **Graph:** Suche in `.understand-anything/knowledge-graph.json` nach
   `<Name>` — bestehende Datei, Props, Verwendungsstellen (`imports`-Kanten).
   Sag, ob die Komponente schon existiert oder neu ist.
2. **Storybook:** Hole den Vertrag lokal aus dem Repo:
   `npx storybook tools docs list` (alle Komponenten, eine Zeile je Eintrag),
   dann `npx storybook tools docs show --id <id>` für jede Komponente, die du
   verwendest, und für die Design-Token-Seiten (Farben, Radien, Abstände).
   Baue aus vorhandenen Komponenten und Tokens zusammen — nie aus Screenshots
   nachbauen. Rate niemals Props — wenn nichts passt, sag das explizit und
   schlag die kleinste neue Komponente mit eigener Story vor.
3. **Figma:** Falls ein Figma-Link vorliegt, hole Design-Kontext darüber
   (Figma-MCP) und gleiche mit der Storybook-Doku ab — bei Widerspruch: Figma
   ist das Bild, Storybook ist der Vertrag; beides im Report nennen.
4. **Implementieren:** Baue/ändere die Komponente entlang der M3-Regeln des
   Repos (`skills/oriso-frontend-component-discipline` falls vorhanden).
5. **Story + Prüfung:** Jede neue Variante bekommt eine Story (`write-stories`),
   danach `test-stories` und die Lint-/Typ-/Test-Gates des Repos. Zeig das
   Ergebnis als Story (`ui-review` oder `npx storybook tools stories preview`
   mit lokalem `npm run storybook`) und nenne die Story-ID im Bericht.
6. **ADRs:** Prüfe über die Graph-`governs`-Kanten, ob eine ADR diese
   Komponente/dieses Muster betrifft; nenne sie.

Abschluss immer mit: Datei(en) geändert, Story-IDs, offene Fragen.
