# Brief: Jagged Intelligence (the four cuts Kante, Tragwerk, Schlucht, Signal)

Theme given with the run: **Jagged Intelligence. KI hat Kanten. Wir bauen Brücken.** The text below is the brief as it was
stored with the original run (fork `Storypapst/morphdemo-benchmark`, branch `codex/jagged-intelligence`,
`dreambau-landing/docs/DREAMBAU-SONDERAUFGABE.md`). It asked for a separate web page; on 2026-11-12 the four cuts were moved
into the start page pool as full-screen productions without that page (PR #234). New themes use `theme.md` instead.

---

# Sonderaufgabe für Dreambau

Erzeuge zu einem Thema eine statische Webseite mit mehreren prozeduralen Filmfassungen. Beim Öffnen startet genau
eine zufällig gewählte Fassung. „Andere Fassung“ lädt direkt eine aus den übrigen Fassungen. Die festen Adressen
mit `?anim=<id>` bleiben für Tests und zum Teilen verfügbar. Auf der Seite steht höchstens der bestätigte Modellname
als Urheberhinweis, auf dem Desktop unten. Die internen Fassungsnamen und Größenklassen brauchen keine Knöpfe.

## Quelltext und Build

Liefere lesbaren Quelltext für Bild, Musik und Text. Verwende die gemeinsame Laufzeit und den Build unter
`dreambau-landing/`. Beim Beispiel Jagged Intelligence setzt `tools/build.mjs --jagged` die gemeinsame Zeichenlogik
und jede Produktion aus `src/jagged/` zusammen, kompaktiert die Shader, minifiziert das Ergebnis und prüft die
unkomprimierten Bytes. Lade auf der Webseite nur die gewählte Produktion.

Wenn eine Veröffentlichung eine Quelltextansicht braucht, erzeuge sie aus dem tatsächlich ausgelieferten
Build. Die Dreambau-Startseite verpackt das geladene `p/<id>.js` beim Apex-Build als `p/<id>.src.js` und schreibt
die Dateigrößen in `source-facts.js`. Die Ansicht zeigt so dieselben Bytes, die der Browser ausführt. Der lesbare
Quelltext bleibt zusätzlich im Repository.

## Abnahme

- Jede Fassung läuft ungefähr eine Minute. Musik und Bild werden im Browser erzeugt.
- Der Build zählt Shader und Musik zur Fassung. Nutze 4.096, 16.384 und 65.536 Byte als Obergrenzen,
  bei einer zusätzlich beauftragten 60-KB-Fassung höchstens 60.000 Byte.
- Die Seite startet beim Laden, respektiert reduzierte Bewegung und hat einen statischen Rückfall.
- Prüfe die Bedienung am Handy und Desktop unter der Dreambau-Sicherheitsrichtlinie. Prüfe auch, dass „Andere Fassung“
  nie dieselbe Fassung auswählt.
- Liefere den fertigen statischen Ordner, die Build-Anleitung und den Modellnamen, der tatsächlich eingesetzt wurde.
