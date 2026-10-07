# Prompt: Story → eigenständige HTML-Ansicht (zum Teilen)

Um eine bestehende Story als HTML zu zeigen oder weiterzugeben
(Story-ID ersetzen, z. B. `components-button--primary`):

---

Ich brauche die Story **<story-id>** als eigenständige HTML-Ansicht zum
Teilen (z. B. für Frank/Design-Review, nicht für ein anderes Claude-Fenster).

1. **Für einen schnellen Link auf dem Dev-Server:** Öffne
   `<storybook-dev-url>/iframe.html?id=<story-id>&viewMode=story` — das
   rendert die Story isoliert ohne Storybook-Chrome, direkt teilbar per Link
   an alle mit Zugriff auf den Dev-Server (Basic-Auth gilt weiter).
2. **Zum Prüfen, ob die Story existiert/den Namen richtig hat:** vorher
   `docs-list` oder `docs-show-story`
   (Storybook-MCP) abfragen — nicht raten.
3. **Für einen statischen Export zum Weitergeben ohne laufenden Server:**
   `npm run build-storybook` (bzw. das Repo-eigene Skript) im Frontend/Admin-
   Repo, Ergebnis liegt unter `storybook-static/`; darin liegt dieselbe
   `iframe.html?id=...`-Route offline nutzbar. Das Verzeichnis nicht committen
   — nur lokal/temporär zum Teilen verwenden.
4. Nenne im Ergebnis immer die volle URL (Dev-Server-Variante) bzw. den
   Pfad zum Export-Ordner (Static-Variante).

Nie einen Screenshot statt der echten URL liefern, wenn die Story live läuft
— die URL ist interaktiv und lässt sich direkt prüfen.
