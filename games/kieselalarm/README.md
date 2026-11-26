# Kieselalarm

Ein deutschsprachiger Top-down-Scroller für Rechtschreibung. Die Ameise sammelt Buchstaben zu Fuß, wechselt für seitliche Schüsse ins Dosenkart und verbindet nach dem Aussteigen die Buchstaben zu einer Linie. Ein gepanzerter Käfer braucht drei Treffer. Eine falsche Buchstabenwahl kostet zehn Punkte und zwei Sekunden. Pause, Tabwechsel und Rundenende sperren weitere Treffer.

## Spielen und Stile vergleichen

- [Spiel öffnen](https://kieselalarm.recentgem8.chatgpt.site/)
- [Asphalt ausprobieren](https://kieselalarm.recentgem8.chatgpt.site/prototype.html?variant=A) · [Siebdruck ausprobieren](https://kieselalarm.recentgem8.chatgpt.site/prototype.html?variant=B) · [Nachtglas ausprobieren](https://kieselalarm.recentgem8.chatgpt.site/prototype.html?variant=C)
- Das [Konzeptbild](concepts/stilrichtungen.png) zeigt die drei visuellen Richtungen. Die [Browseraufnahmen](concepts/spielansichten.jpg) zeigen die prozedural gezeichneten Prototypen. Die Auswahl für das Hauptspiel ist offen.
- Für die drei Vergleichsszenen liegt [Matt Pococks Prototyping-Skill](https://github.com/mattpocock/skills/tree/main/skills/engineering/prototype) mit seiner MIT-Lizenz in `.agents/skills/prototype/`. Die Szenen speichern keine Lerndaten.

## Lokal starten

Im Verzeichnis dieses Spiels genügt Python 3 für Web-Spiel und gespeicherte Lernprofile.

```sh
python3 backend/server.py --port 8000
```

Im Browser [das Spiel](http://127.0.0.1:8000/) oder [die drei Stilvarianten](http://127.0.0.1:8000/prototype.html?variant=A) öffnen. Auf der privaten veröffentlichten Version liegen die Profildaten in Cloudflare D1. Beim lokalen Server liegen sie in SQLite. Die Profildatei unter „Profil übertragen“ ermöglicht den Wechsel auf ein anderes Gerät. Sie enthält den Zugang zum eigenen Speicherstand.

## Lernstand

188 Wörter mit deutscher Sprachaufnahme, drei Stufen und Hinweisen zu konkreten Stolperstellen. Die Lernlogik führt Buch über selbstständig gelöste Wörter, tatsächliche Buchstabenverwechslungen und fällige Wiederholungen. Eine Kollision mit einem Stein verändert die Rechtschreibstatistik nicht. „Meine Wörter“ zeigt den Stand pro Profil. Zum Rundenende lassen sich Fehlerwörter erneut anhören und legen. Wer vier beim ersten Versuch legt, erhält 40 Sekunden Startbonus. Bei fünf sind es 75 Sekunden.

## Bauen und prüfen

```sh
npm ci
npm run build
npm test
python3 -B -m unittest discover -s backend -v
node --test backend/worker.node.mjs
```

Der Web-Build erzeugt `dist/index.html` mit allen Wortaufnahmen und `mobile/catalog.json`. Mit Node 24 lässt sich auch der SQLite-Adapter für den Worker testen. [API und lokaler Betrieb](backend/README.md) · [Native Projekte](mobile/README.md)

Die deutsche Stimme ist Thorsten (Piper). Die Clips sind fertig eingebettet. Das optionale Werkzeug `tools/generate-speech.py` erzeugt die zusätzlichen Aufnahmen aus der Wortliste mit Piper und ffmpeg erneut.
