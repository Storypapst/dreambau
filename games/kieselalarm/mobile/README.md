# Kieselalarm auf dem Handy

Das Godot-Projekt enthält das gemeinsame 2D-Spiel für iOS und Android. Unter `ios/` liegt außerdem eine in SwiftUI geschriebene iPhone- und iPad-App für die Rechtschreibübungen. Beide Projekte laden denselben Wortschatz und dieselben 188 deutschen Aufnahmen aus `catalog.json` und `audio.json`. Die gezeichnete Ameise und das Kart dienen als Platzhalter für die noch auszuwählende Gestaltung.

## Das Spiel mit Godot starten

Godot 4.6.3 öffnen, `mobile/project.godot` importieren und F5 drücken. Auf dem Desktop funktioniert außerdem dieser Aufruf aus dem Spielverzeichnis.

```sh
godot --path mobile
```

Jedes Wort beginnt mit einer Hörpause und der Anzahl seiner Buchstaben. Zu Fuß nimmt die Ameise angetippte Buchstaben auf. Im Kart wechselt sie durch Ziehen die Spur und sammelt den Buchstaben bei der Durchfahrt. Einen Käfer neben dem Kart trifft ein Tipp auf die entsprechende Seite. Nach der Kartfahrt folgt ein Buchstabenfeld zum Verbinden. Ein gepanzerter Käfer braucht drei Treffer. Am Desktop wählen die Tasten 1 bis 3 eine Spur bzw. einen Buchstaben, Escape pausiert. Eine falsche Wahl kostet zehn Punkte und zwei Sekunden. Dann friert die Strecke ein und die Aufnahme läuft langsamer. Auch der Wechsel in den Hintergrund pausiert die Runde.

Lokale Spitznamen trennen die Lernstände. Die native Wortauswahl berücksichtigt bereits gelöste und zuletzt verfehlte Wörter sowie die drei Freischaltstufen. Fehlerwörter lassen sich ohne Zeitdruck aus gemischten Buchstaben legen. Ein im ersten Versuch korrekt gelegtes Wort bringt fünf Bonussekunden, vier Wörter verdoppeln und mindestens fünf verdreifachen den Betrag. Das Guthaben gilt für den nächsten Start. Godot speichert diese Ereignisse unter `user://learners.json` mit einer Sicherung der vorherigen Fassung. Die Godot-Ausgabe läuft lokal. Die detaillierte Fälligkeitsplanung und die Verlaufsauswertung der Webfassung sind weitere Portierungsschritte.

## Store-Ziele für das Godot-Spiel

Unter **Projekt → Exportieren** sind die Ziele **Android** und **iOS** eingerichtet. Die mitgelieferten Paketnamen sind Entwicklungswerte. Für die Veröffentlichung müssen die eigenen Store-IDs, Signaturen und finalen Grafiken eingesetzt werden.

- **Google Play** benötigt die zu Godot 4.6.3 passenden Exportvorlagen, Android SDK, JDK, Gradle-Bauvorlage und den eigenen Release-Keystore. Den Android Build Template über das Projektmenü installieren und den SDK-Pfad in den Editor-Einstellungen setzen. Das Preset erstellt ein Android App Bundle für ARM64.
- **App Store** benötigt macOS, Xcode und die passenden Godot-Exportvorlagen. Im iOS-Preset Team-ID und Bundle-ID setzen, als Xcode-Projekt exportieren, das erzeugte Projekt in Xcode öffnen und für ein iPhone archivieren.

## SwiftUI auf dem iPhone

`ios/Kieselalarm.xcodeproj` in Xcode 16 oder neuer öffnen. Das geteilte Schema **Kieselalarm** läuft ab iOS 16. Einen Simulator wählen und „Run“ drücken. Für ein echtes Gerät unter **Signing & Capabilities** das eigene Team wählen.

Der Swift-Client zählt Wörter und Zeit. Ein falscher Buchstabe kostet zwei Sekunden. Er enthält Hörübungen, Buchstabenwahl, Fehlererklärung, Sortierübung, Pause, Zeitguthaben und getrennte Lernprofile. Die Arcade-Strecke wird im Godot-Projekt gespielt. Die Swift-App verwendet AVFoundation für die Aufnahmen und die deutsche Systemstimme als Ersatz. Im Profilmenü kann eine exportierte Profildatei aus dem Browser importiert werden. Für einen späteren Serverabgleich den eigenen HTTPS-Ursprung eintragen und „Lernstand abgleichen“ wählen. Zugangsdaten landen im iOS-Schlüsselbund. Die v1-API vereinigt Ereignisse anhand ihrer IDs und löst konkurrierende Revisionen durch erneutes Zusammenführen. Ein importierter Zugang gilt nur für seinen ursprünglichen Server. Profil-Synchronisierung setzt eine erreichbare API voraus. Die Übungen und das lokale Speichern funktionieren offline. [Server und API](../backend/README.md)

```sh
xcodebuild -project mobile/ios/Kieselalarm.xcodeproj -scheme Kieselalarm \
  -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

## Prüfen und Sprachdaten aktualisieren

Aus dem Spielverzeichnis starten.

```sh
godot --headless --path mobile --script tests/test_round.gd
godot --headless --path mobile --script tests/test_native.gd
```

Die Linux-Prüfung umfasst die Godot-Startszene, die Rundenzustände, Fehlerwiederholung, Wortlinie, Profilwechsel, erneutes Laden, Pausieren von Uhr und Aufnahme, Bonusgutschrift und die 188 MP3-Datensätze. Das Ressourcenpaket des Android-Presets wurde exportiert und mit der Godot-Laufzeit geöffnet. Signierte Geräte-Builds, Swift-Kompilierung und ein Hörtest auf physischen Geräten stehen aus. Die hiesige Linux-Umgebung enthält Godot, Xcode und die Android-SDK-Werkzeuge werden auf den jeweiligen Build-Rechnern benötigt.

Nach Änderungen an Wörtern oder Aufnahmen beide Datenbanken neu erzeugen.

```sh
npm run build
node mobile/prepare-audio.mjs
```
