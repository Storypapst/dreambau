# dreambau.com – Landing Page mit drei Animationen

Bei jedem Aufruf von dreambau.com startet **eine von drei Animationen, zufällig gewählt**. Jede dauert rund eine Minute,
hat eigene Bilder und eigene Musik (beides wird erst im Browser erzeugt, es gibt keine Bild-, Video- oder Audiodateien),
und endet auf einem ruhigen Schlussbild:

> Jeht nich…
> jibs nich…
> **dreambau.com**
>
> <sub>info@dreambau.com (nich warten, quatschen)</sub>

Der Ton startet mit der Seite, sobald der Browser es erlaubt. Es gibt immer einen **Ton-aus-Knopf** (oben rechts, Taste **M**),
und mit **Esc** oder „überspringen“ springt man direkt zum Schlussbild.

**Ort:** Dieser Ordner (`apps/landing`) gehört zum Monorepo `Storypapst/dreambau` und hat sein eigenes `package.json`: Alle
Befehle unten gelten im Ordner (`cd apps/landing && npm ci`), nicht im Wurzelordner, in dem die Testmails-Registry liegt.
Entstanden ist er im Fork [Storypapst/morphdemo-benchmark](https://github.com/Storypapst/morphdemo-benchmark) (Ordner
`dreambau-landing/`); dort liegen die vollständige Historie und die Besprechung der Pull Requests.

Das Projekt überträgt die Anforderung des [MorphDemo-Benchmarks](https://github.com/TheMorpheus407/morphdemo-benchmark)
(drei Programme in 4 KB, 16 KB und 64 KB, Thema „From Noise to Order“, Bild und Ton im Takt, rund eine Minute) auf eine
Webseite. Die vollständige, übertragene Anforderung steht in [`SPEC.md`](SPEC.md) (englisch, im Aufbau des Originals).

## Die drei Animationen

| Datei | Größenklasse | Titel | Idee | Musik |
|---|---|---|---|---|
| `p/4k.js` | höchstens 4 KB | **Rohbau** | Aus Fernsehrauschen wächst eine isometrische Stadt: erst Raster, dann Geschosse im Takt, dann leuchten die Fenster. | Minimal Techno, 122 BPM, a-Moll |
| `p/16k.js` | höchstens 16 KB | **Traumhaus** | Eine Wolke aus Lichtpunkten baut ein Haus, das Haus löst sich in den Schriftzug auf. | Dream-Pop, 100 BPM, cis-Moll nach E-Dur |
| `p/64k.js` | höchstens 64 KB | **Skyline** | Eine Baustelle in der blauen Stunde wird bei Sonnenaufgang zur Skyline (3D, Licht, Nebel). | Filmmusik, 90 BPM, d-Moll nach D-Dur |

Die Größenklassen sind Obergrenzen für die fertige (minifizierte) Datei einer Animation inklusive Shader und Musik.
Geladen wird nur die gewählte Animation, nicht alle drei.

## Ausprobieren

```sh
npm install          # einmalig (esbuild für den Build, Playwright für die Prüfungen)
npm run build        # src/p/*.js → site/p/*.js (minifiziert) + Prüfung der Größenbudgets
npm run serve        # Vorschau auf http://localhost:8080/
```

Eine bestimmte Animation erzwingen: `http://localhost:8080/?anim=4k`, `?anim=16k` oder `?anim=64k`.
`site/index.html` lässt sich auch direkt aus dem Dateisystem öffnen.

## Auf dreambau.com veröffentlichen

Die Startseite von dreambau.com kommt nicht aus einem normalen Webverzeichnis, sondern aus einem nginx-Pod im
Kubernetes-Cluster, mit strenger Sicherheitsrichtlinie (keine Inline-Stile) und nur wenigen Routen. **`site/` so, wie es
ist, und `dist/index.html` lassen sich dort nicht hochladen.** Dafür gibt es zwei Befehle:

```sh
npm run build:apex    # dist/apex/ + dist/apex.json: die Seite mit ausgelagerten Stilen, unter /landing-assets/, ladefertig für die Startseite
npm run check:apex    # lädt den Build mit den Routen und der Richtlinie der Startseite; mit BASE_URL=https://dreambau.com die Abnahme danach
```

Die Änderung am Server, der Ablauf und die Abnahme stehen in
[`docs/NEXT-STEPS.md`, Abschnitt 4.5](docs/NEXT-STEPS.md#45-veröffentlichen-auf-dreambaucom).

Für eine Vorschau oder einen anderen Webserver ohne diese Regeln (nicht dreambau.com) gilt: Der Inhalt von **`site/`** (also
`index.html`, `shell.js` und der Ordner `p/`) ist die ganze Seite, statische Dateien ohne Serverlogik. Über **HTTPS**
ausliefern (Browser sind dort bei Ton und Autoplay am großzügigsten); lokal: `npm run serve`. `npm run bundle` erzeugt
**eine einzige Datei** `dist/index.html` (alles eingebettet, rund 90 KB), praktisch für eine Vorschau. Die Richtlinie in
`tools/serve.mjs` (Variable `CSP`) ist weniger streng als die der Startseite: Sie erlaubt Inline-Stile.

## Texte und Aussehen ändern

* **Die drei Zeilen im Schriftzug:** `site/index.html`, Attribut `data-lines="Jeht nich…|jibs nich…|dreambau.com"` an der
  Überschrift (die Zeilen sind durch `|` getrennt; der Text steht dort auch als normale Überschrift für Screenreader).
* **Die Schlusszeile:** ebenfalls `site/index.html`, Absatz `<p id="cta">`. Die E-Mail-Adresse ist ein echter `mailto:`-Link.
* **Schrift des Schriftzugs:** die Systemschrift des Besuchers (fett). Es wird keine Schriftdatei geladen.
* **Farben, Takt, Ablauf** jeder Animation: `src/p/<id>.js`, danach `npm run build`.

## Wie sich die Seite verhält

* **Ton:** Browser erlauben Ton erst nach dem ersten Klick oder Tastendruck. Wo das gesperrt ist, läuft das Bild trotzdem
  sofort, der Knopf zeigt „Ton an“, und der erste Klick startet die Musik an der aktuellen Stelle. Wer den Ton ausschaltet, hört
  ihn auch beim nächsten Besuch nicht (einzige gespeicherte Information, im Browser, nicht auf dem Server).
* **Bewegung reduzieren** (Betriebssystem-Einstellung): die Seite zeigt sofort das Schlussbild ohne Ton, „Animation abspielen“ startet sie.
* **Ohne WebGL oder ohne JavaScript:** statische Seite mit dem Schriftzug und der Schlusszeile.
* **Akku und Leistung:** die Auflösung sinkt automatisch, wenn das Bild ruckelt; im Hintergrund-Tab pausieren Bild und Ton;
  das Schlussbild läuft mit 30 Bildern pro Sekunde und hält nach einigen Minuten an.
* **Datenschutz:** keine Cookies, kein Tracking, keine externen Anfragen.
* **Blitzen:** keine Vollbild-Blitze; Taktschläge verändern die Helligkeit nur leicht.

## Prüfen

```sh
npm run verify          # alles, rund 10 bis 20 Minuten (Software-WebGL)
node tools/verify.mjs 4k --quick   # eine Animation ohne Musik- und Verhaltenstest
node tools/e2e.mjs all  # Verhalten der echten Seite: Ton erlaubt/gesperrt, Mute, Esc, reduzierte Bewegung, kein WebGL, kein Netz
PAGE=dist/index.html node tools/e2e.mjs all   # dasselbe gegen die Einzeldatei (der Uhr-Test braucht die Testanimation und entfällt)
```

`verify` baut, prüft die Größen und schreibt `verification/SUMMARY.md` und `verification/report.json`: Dauer 50 bis 70 s, erstes
Bild dunkel, mindestens drei verschiedene Phasen, keine Standbild-Phase, Bild unabhängig von vorher gezeichneten Bildern (keine veralteten Zwischenpuffer), Blitzsicherheit, Schriftzug Zeile für Zeile und lesbar
(Kontrast), ruhiger dunkler unterer Rand bei 16:9, 21:9, 4:3 und Hochformat, Musik (Pegel, stiller Anfang, Ausblenden, kein
Übersteuern), Verhalten der Seite, keine Netzwerkzugriffe. Die Spektrogramme (`verification/<id>/audio/spectrogram.png`)
liegen daneben. Die Kontaktbögen (`verification/<id>/frames/sheet.png`, je rund 4 MB) fehlen im Monorepo, damit das
öffentliche Repo klein bleibt; sie liegen im Fork, und `verify` erzeugt sie bei jedem Lauf neu.

Wichtig: Alle Prüfungen laufen in einem Headless-Chromium mit Software-Rendering und ohne Soundkarte. Auf echten Geräten
(iPhone/Safari, Android/Chrome, Firefox, ein älteres Notebook) sollte man die Seite vor dem Livegang einmal ansehen und anhören.

## Aufbau

```
SPEC.md              die übertragene Anforderung (Aufgabenstellung)
ENVIRONMENT.json     gemessene Testumgebung
site/                die fertige Seite (index.html, shell.js, p/*.js)
src/p/               Quellcode der drei Animationen
docs/CONTRACT.md     Schnittstelle zwischen Seite (Laufzeit) und Animation
docs/briefs/         die kreativen Vorgaben je Animation
tools/               Build, Vorschau, Prüfwerkzeuge (Bilder, Musik, Verhalten, Gesamtprüfung)
verification/        Ergebnisse der Prüfungen
```

## Wie es gebaut ist

* **Laufzeit (`site/shell.js`)** wählt zufällig, lädt nur die gewählte Animation, besitzt die Zeichenfläche (WebGL2), die Uhr,
  den Ton, den Ton-Knopf, Esc und die Schlusszeile und liefert den Schriftzug als Distanzfeld-Textur.
* **Eine Animation** ist eine Funktion der Zeit: ein Fragment-Shader (oder ein eigenes Zeichenprogramm) für das Bild und eine
  Funktion, die die Musik mit WebAudio „ins Reine“ schreibt.
* **Musik** wird einmal im Voraus offline berechnet (wenige Sekunden im Hintergrund, auf bis zu vier Threads verteilt, während
  das Bild schon läuft), auf einen angenehmen Pegel gebracht und als Aufnahme abgespielt. Aus der fertigen Aufnahme misst die
  Laufzeit Pegel für Bass, Mitten und Höhen; das Bild liest sie. So bleiben Bild und Ton im Takt, auch wenn das Gerät eine
  Ausgabeverzögerung hat. Der Anfang jeder Musik ist fast still, damit ein späterer Einstieg (Ton erst nach dem ersten Klick)
  nicht als Schnitt auffällt.
* **Uhr:** läuft frei und wird sanft an die Ausgabeposition des Tons angepasst, sobald Ton läuft.
