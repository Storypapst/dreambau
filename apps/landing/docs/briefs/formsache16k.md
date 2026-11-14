# Auftrag `formsache16k`: „Formsache“ (Größenklasse 16k, höchstens 16 384 Byte)

Dieser Lauf folgte [`theme.md`](theme.md). Unten stehen der Auftrag, wie er ankam, und das Gespräch aus „Bevor du baust“,
beides wörtlich und in der Reihenfolge, in der es stattfand. Weggelassen sind nur Markierungen der Oberfläche (für
zitierte und für abgebrochene Eingaben). Die Texte der Person, die den Auftrag gab, stehen in grauen Kästen; Tippfehler und
Lücken der Spracherkennung sind stehen geblieben.

## Die drei Felder

| Feld | im Auftrag | nach dem Gespräch |
|---|---|---|
| Thema | noch offen, im Gespräch zu erfragen | „Dieselbe Frage, jedes Mal eine andere Antwort. KI ist magisch einfach und dann doch magisch kompliziert.“ |
| Größenklasse | 16k | 16k |
| id | nach dem Gespräch festzulegen | `formsache16k` |

Eine Bild- oder Stilidee lag dem Auftrag nicht bei. Sie entstand im Gespräch.

## Der Auftrag

```text
Du baust eine neue Fassung für den Zufallspool der Startseite dreambau.com. Arbeite genau nach `apps/landing/docs/briefs/theme.md` (dieser Stand liegt auf dem Branch `claude/production-credits`, PR #237; dort steht auch der Abschnitt „Bevor du baust“).

Felder:
- Thema: noch offen. Erfrag es im Gespräch mit mir, zusammen mit Bildidee, Stimmung, Klang und dem Claim am Ende.
- Größenklasse: 16k
- id: legst du nach dem Gespräch fest; Kleinbuchstaben und Ziffern, endet auf `16k`, darf es noch nicht geben (siehe `D.ids` in `apps/landing/site/shell.js`).

Wichtig:
- Fang mit „Bevor du baust“ an: Frag mich in Runden, jede Frage mit deiner Empfehlung, schlag mir danach zwei bis drei deutlich verschiedene Konzepte vor und warte auf meine Wahl. Ich antworte hier in dieser Sitzung.
- Halte das Gespräch wörtlich in `docs/briefs/<id>.md` fest und trag dich in `site/credits.js` ein (Modell, das tatsächlich gearbeitet hat).
- Arbeite auf einem neuen Branch von `claude/production-credits`, öffne am Ende einen Pull Request gegen `main` und schreib in die Beschreibung, dass er auf #237 aufbaut. Merge nichts und veröffentliche nichts auf dem Server.
- Schreib mir auf Deutsch und duze mich.
```

## Das Gespräch

### 1. Rückfragen, Runde 1

> Ich habe den Auftrag (`theme.md`), den Vertrag und alle sieben Fassungen im Pool angesehen; die Kontaktbögen habe ich dafür neu gerendert. Gebaut, angelegt oder gepusht ist noch nichts.
>
> **Was mir im Pool auffällt:** Alle sieben Fassungen erzählen vom Bauen über Architektur: Stadt, Haus, Skyline, drei Brücken und eine Signalstrecke. Alle sind Nachtszenen in Dunkelblau mit Cyan-Linien und Bernstein, alle mit elektronischer Musik (90 bis 122 BPM, vier davon mit 100). Eine achte Fassung fällt beim Neuladen nur auf, wenn sie sich in Motiv, Farbe und Klang unterscheidet. Darauf zielen meine Empfehlungen.
>
> Nicht zur Wahl stehen: 60 Sekunden, drei Phasen, die drei Zeilen zwischen etwa 40 und 51 s auf musikalische Ereignisse, das ruhige dunkle Band unten und höchstens 16.384 Byte.
>
> ## Runde 1 von höchstens 3
>
> Ein „ja“ übernimmt meine Empfehlung. Kurz antworten reicht, zum Beispiel „1 ja, 2 ja, 3 plus …“.
>
> ❓ **Q1** - **Thema**: Worum geht es in dieser Fassung? Die bisherigen Themen („Vom Rauschen zur Ordnung“ und „Jagged Intelligence: KI hat Kanten. Wir bauen Brücken.“) zeigen beide das Ergebnis: Am Ende steht ein Bauwerk.
>
> ➡️ **„Erst zuhören, dann bauen: Aus einem Gespräch wird ein Plan.“** Die Seite endet mit „nich warten, quatschen“, aber keine Fassung zeigt, was vor dem Bauen passiert. Ein Gespräch gibt außerdem der Musik eine Form, die man ohne Erklärung hört: zwei Stimmen, Frage und Antwort.
>
> Falls du etwas anderes willst, drei Alternativen:
> - (b) „Reparieren statt neu bauen: Aus Bruch wird etwas Besseres.“
> - (c) „Viele Hände, ein Werk: Menschen und Agenten bauen zusammen.“
> - (d) „Wachsen lassen: Aus einem Samen wird ein Garten.“
>
> Oder dein eigenes Thema in deinen Worten.
>
> ---
>
> ❓ **Q2** - **Gefühl**: Welches Gefühl soll nach der Minute bleiben?
>
> ➡️ Warm, nah und ruhig, mit einem kleinen Lächeln: der Maßstab eines Tisches, nicht der einer Stadt. Der Pool ist bisher kühl und groß (Skyline, Brücke, Stadt von oben), das Menschliche fehlt.
>
> ---
>
> ❓ **Q3** - **Was es auf keinen Fall sein soll**: Wovon soll ich die Finger lassen?
>
> ➡️ Keine Brücke, keine Stadt, kein Haus. Keine weitere Nachtszene in Dunkelblau mit Cyan-Linien. Keine Gesichter, Figuren, Sprechblasen oder Zeichen wie Glühbirne, Zahnrad, Handschlag: In 16 KB wirken sie schnell unbeholfen, und sie erklären, statt zu erzählen. Ohnehin gilt: kein Plasma, kein Matrix-Regen, kein Kitsch. Fehlt etwas auf der Liste, oder ist etwas davon doch erlaubt?
>
> ---
>
> ❓ **Q4** - **Schluss: Marke und Claim**: Was steht am Ende?
>
> ➡️ Der heutige Schriftzug: „Jeht nich…“, „jibs nich…“, „dreambau.com“, danach die Schlusszeile der Seite. Er kommt von der Laufzeit, ist in alle 47 angebotenen Sprachen übersetzt und für alle Fassungen gleich.
>
> - *Mit dem heutigen Schriftzug:* Die Fassung ist nach der Abnahme fertig für den Pool.
> - *Mit einem eigenen Claim:* Ich schreibe ihn wörtlich in `docs/briefs/<id>.md`, baue trotzdem mit dem heutigen Schriftzug und melde im Pull Request, dass die Laufzeit dafür erst einen eigenen Schlusstext pro Fassung braucht, samt 47 Übersetzungen. Eigenen Text zeichne ich nicht ins Bild.
>
> ---
>
> ❓ **Q5** - **Was du schon mitbringst**: Hast du schon ein Bild, einen Klang oder ein Vorbild im Kopf (ein Material, ein Ort, ein Lied, ein Film), so grob es ist?
>
> ➡️ Wenn nicht, genügt „nein“. Dann leite ich Bild und Klang in Runde 2 aus Thema und Gefühl ab und frage dich dort nach dem einen Bild, den drei Phasen, Farben, Material und Musik.
>
> ---
>
> **Wie es weitergeht:** Nach Runde 2 bekommst du zwei bis drei deutlich verschiedene Konzepte mit meiner Empfehlung. Ich baue erst nach deiner Wahl. Den Branch von `claude/production-credits` lege ich an, sobald die id feststeht.
>
> **Ein Hinweis:** `~/.config/agent-routing/` gibt es in diesem Cloud-Container nicht. Die globalen Gesprächsregeln und das Vault-Manifest konnte ich deshalb nicht laden; ich arbeite nach den Regeln im Repo (`AGENTS.md`, `apps/AGENTS.md`, `HANDOVER.md`).

### 2. Antwort auf Runde 1

Beantwortet wurde nur Q1. Die Antwort zitierte zuerst die Frage und fuhr dann fort:

```text
> Q1 - Thema: Worum geht es in dieser Fassung? Die bisherigen Themen („Vom Rauschen zur Ordnung“ und „Jagged Intelligence: KI hat Kanten. Wir bauen Brücken.“) zeigen beide das Ergebnis: Am Ende steht ein Bauwerk.
> 
> ➡️ „Erst zuhören, dann bauen: Aus einem Gespräch wird ein Plan.“ Die Seite endet mit „nich warten, quatschen“, aber keine Fassung zeigt, was vor dem Bauen passiert. Ein Gespräch gibt außerdem der Musik eine Form, die man ohne Erklärung hört: zwei Stimmen, Frage und Antwort.
> 
> Falls du etwas anderes willst, drei Alternativen:
> 
> (b) „Reparieren statt neu bauen: Aus Bruch wird etwas Besseres.“
> (c) „Viele Hände, ein Werk: Menschen und Agenten bauen zusammen.“
> (d) „Wachsen lassen: Aus einem Samen wird ein Garten.“

viel zu ersthaft und trotzdem nicht mal interessant, wir sind die die ki und ihre weirdheid verstehen. Als Beispiel kann man beispielsweise diese I guess. Oder 5% Mr. Bean, 95%. KI oder noch geiler ist, glaube ich, dass er vielleicht Das Problem mit Large Language Models und Fragen, die so in der Mitte sind und Chatbots machen, dass dann immer wieder was Neues geantwortet wird. Und dass wir jetzt erst eigentlich in diesem Alter sind, wo die Technologie erst wirklich verlässlich wird. Das heißt, irgendwie ist die magisch einfach und dann doch magisch kompliziert. diese Aussage, dass alle dachten, dass irgendwie die Leute vor zehn Jahren, dass sie alle dann arbeitslos sind, die die LKWs fahren. Und am Ende hatten dann irgendwie Leute eher so ein 20-jähriges Genie gekriegt, was aber so im College nichts gemacht hat und so eine Art Bullshitter ist. Und keiner weiß, wie er diesen... Über kreativen Bullshitter wendigen muss. Also es sind so ein paar Ideen. Welche findest du denn da besser? Auch für dich kreativ.
```

### 3. Einschätzung der Ideen und Rückfragen, Runde 2

> Du hast recht: Meine vier Themen klangen nach Firmenbroschüre. Deine Ideen sind besser, und ich würde keine davon wegwerfen.
>
> ## Meine Wahl: die mittlere
>
> | Deine Idee | Was sie in einer Minute ohne Worte hergibt | Rolle im Stück |
> |---|---|---|
> | Dieselbe Frage, jedes Mal eine neue Antwort; die Technik wird jetzt erst verlässlich | Wiederholung mit Abweichung sieht und hört man sofort | **Thema und Ablauf** |
> | 95 % KI, 5 % Mr. Bean | Ein Verhältnis, noch keine Geschichte. Aber wörtlich nehmbar: Einer von zwanzig Versuchen geht herrlich daneben | **Ton** |
> | Das 20-jährige Genie, das bullshittet, statt arbeitsloser LKW-Fahrer | Eine Pointe aus Worten. Ohne Text und Figuren wird daraus ein Bilderrätsel mit LKW und Doktorhut | **Charakter der Hauptfigur**: Sie macht alles mit vollem Selbstvertrauen, auch das Falsche |
> | „diese I guess“ | Hier hat die Spracherkennung etwas verschluckt | Bitte nachreichen |
>
> Warum die mittlere:
>
> 1. **Man kann sie zeigen.** Etwas versucht dasselbe immer wieder, und jedes Mal kommt etwas anderes heraus. Das versteht man in fünf Sekunden ohne ein Wort. Die LKW-Pointe lebt dagegen vom Satz.
> 2. **Sie bringt den Ablauf mit.** Erst jedes Mal anders, dann baut jemand die Führung, dann kommt dreimal dasselbe. „Dreimal dasselbe“ sind genau die drei Zeilen des Schriftzugs.
> 3. **Deine Startseite macht es selbst.** Jedes Neuladen antwortet mit einer anderen Fassung, wie ein Chatbot. Nur der Schriftzug kommt immer gleich. Die Fassung erzählt also den Witz, in dem sie selbst steckt.
>
> Für mich kreativ: Es ist die Idee, über die ich am meisten weiß, denn sie beschreibt, wie ich selbst arbeite. Über die eigene Macke gelingt ein Witz leichter als über die Prognosen anderer Leute.
>
> **Eine Grenze, die du kennen solltest:** Laut Vertrag läuft jede Fassung bei jedem Laden gleich ab (Bild als Funktion der Zeit, Musik mit festen Noten).
>
> - *So geht es heute:* „Jedes Mal anders“ passiert innerhalb der Minute, als Reihe von Versuchen.
> - *Mit echtem Zufall pro Besuch:* Die Laufzeit müsste einen Startwert liefern, und die Prüfwerkzeuge vergleichen Bilder zwischen Läufen. Das wäre ein eigener Pull Request, nicht diese Fassung.
>
> ## Runde 2 von höchstens 3
>
> Q2 bis Q5 aus Runde 1 sind noch offen. Deine Antwort hat die Richtung verschoben, deshalb stelle ich sie angepasst neu. Ein „ja“ übernimmt meine Empfehlung.
>
> ❓ **Q1** - **Themensatz**: Wie heißt das Thema in einem Satz? Er steht später in `docs/briefs/<id>.md` und in der Quelltextansicht unter „Wie es entstand“.
>
> ➡️ **„Dieselbe Frage, jedes Mal eine andere Antwort. KI ist magisch einfach und dann doch magisch kompliziert.“** Der zweite Satz ist deiner. „Mr. Bean“ lasse ich aus dem öffentlichen Themensatz heraus, weil es eine fremde Figur ist; die 5 % stecken im Stück. Dein Wortlaut steht trotzdem vollständig in der Brief-Datei.
>
> ---
>
> ❓ **Q2** - **Ton und Dosis**: Wie komisch soll es werden, und was soll bleiben?
>
> ➡️ Schmunzeln statt Schenkelklopfer. Die KI ist die Hauptfigur und wird gemocht, nicht vorgeführt. Die 5 % nehme ich wörtlich: Von zwanzig Versuchen geht genau einer daneben, mit vollem Selbstvertrauen. Dazu ein leiser Schlussgag nach dem Schriftzug. Am Ende bleibt: „Die verstehen das Ding und haben Spaß dabei.“ Der Grund für die Zurückhaltung: Die Fassung läuft im Schnitt bei jedem achten Laden, und ein Gag darf beim zehnten Mal nicht nerven.
>
> ---
>
> ❓ **Q3** - **Klang**: Wie klingt das?
>
> ➡️ Ein kleines, akustisch klingendes Ensemble statt Elektronik: gezupfter Kontrabass, Holz wie Marimba oder Xylofon, eine Spieluhr, Besen. Leicht geschwungen, etwa 100 bis 110 BPM. Die Frage ist immer dasselbe kurze Motiv, die Antwort jedes Mal eine andere, und die Pointe ist eine selbstbewusst falsche Note. Am Ende antwortet es dreimal gleich, einmal pro Zeile. Kein bekanntes Stück wird zitiert.
>
> ---
>
> ❓ **Q4** - **Tabus**: Wovon lasse ich die Finger?
>
> ➡️ Kein Roboter, kein Gehirn, kein Neuronen-Netz, kein Chatfenster, keine getippte Schrift, kein Glitch-Look. Keine Figur und kein Gesicht, also auch kein Mr. Bean selbst und kein LKW. Weiterhin keine Brücke, keine Stadt, kein Haus, kein Dunkelblau mit Cyan-Linien. Kein Spott, weder über die KI noch über Leute, die ihr nicht trauen.
>
> ---
>
> ❓ **Q5** - **Schluss: Marke und Claim**: Was steht am Ende?
>
> ➡️ Der heutige Schriftzug: „Jeht nich…“, „jibs nich…“, „dreambau.com“. Unter diesem Thema bekommt er eine zweite Bedeutung: Er ist die eine Antwort, die in allen acht Fassungen gleich kommt.
>
> - *Mit dem heutigen Schriftzug:* Er ist in 47 Sprachen übersetzt, die Fassung ist nach der Abnahme fertig für den Pool.
> - *Mit einem eigenen Claim:* Ich schreibe ihn wörtlich in die Brief-Datei, baue trotzdem mit dem heutigen Schriftzug und melde im Pull Request, dass die Laufzeit erst einen eigenen Schlusstext pro Fassung braucht.
>
> ---
>
> Danach kommt Runde 3 mit dem Bild: wer oder was die KI im Bild ist, was in den drei Phasen passiert und aus welchem Material es ist. Dann bekommst du zwei bis drei Konzepte zur Wahl.

### 4. Antwort auf Runde 2

Die Antwort bestand aus dem Text der fünf Fragen mit den Empfehlungen, ohne eigene Antworten dazu:

```text
❓ Q1 - Themensatz: Wie heißt das Thema in einem Satz? Er steht später in `docs/briefs/<id>.md` und in der Quelltextansicht unter „Wie es entstand“.
➡️ „Dieselbe Frage, jedes Mal eine andere Antwort. KI ist magisch einfach und dann doch magisch kompliziert.“ Der zweite Satz ist deiner. „Mr. Bean“ lasse ich aus dem öffentlichen Themensatz heraus, weil es eine fremde Figur ist; die 5 % stecken im Stück. Dein Wortlaut steht trotzdem vollständig in der Brief-Datei.
❓ Q2 - Ton und Dosis: Wie komisch soll es werden, und was soll bleiben?
➡️ Schmunzeln statt Schenkelklopfer. Die KI ist die Hauptfigur und wird gemocht, nicht vorgeführt. Die 5 % nehme ich wörtlich: Von zwanzig Versuchen geht genau einer daneben, mit vollem Selbstvertrauen. Dazu ein leiser Schlussgag nach dem Schriftzug. Am Ende bleibt: „Die verstehen das Ding und haben Spaß dabei.“ Der Grund für die Zurückhaltung: Die Fassung läuft im Schnitt bei jedem achten Laden, und ein Gag darf beim zehnten Mal nicht nerven.
❓ Q3 - Klang: Wie klingt das?
➡️ Ein kleines, akustisch klingendes Ensemble statt Elektronik: gezupfter Kontrabass, Holz wie Marimba oder Xylofon, eine Spieluhr, Besen. Leicht geschwungen, etwa 100 bis 110 BPM. Die Frage ist immer dasselbe kurze Motiv, die Antwort jedes Mal eine andere, und die Pointe ist eine selbstbewusst falsche Note. Am Ende antwortet es dreimal gleich, einmal pro Zeile. Kein bekanntes Stück wird zitiert.
❓ Q4 - Tabus: Wovon lasse ich die Finger?
➡️ Kein Roboter, kein Gehirn, kein Neuronen-Netz, kein Chatfenster, keine getippte Schrift, kein Glitch-Look. Keine Figur und kein Gesicht, also auch kein Mr. Bean selbst und kein LKW. Weiterhin keine Brücke, keine Stadt, kein Haus, kein Dunkelblau mit Cyan-Linien. Kein Spott, weder über die KI noch über Leute, die ihr nicht trauen.
❓ Q5 - Schluss: Marke und Claim: Was steht am Ende?
➡️ Der heutige Schriftzug: „Jeht nich…“, „jibs nich…“, „dreambau.com“. Unter diesem Thema bekommt er eine zweite Bedeutung: Er ist die eine Antwort, die in allen acht Fassungen gleich kommt.

* Mit dem heutigen Schriftzug: Er ist in 47 Sprachen übersetzt, die Fassung ist nach der Abnahme fertig für den Pool.
* Mit einem eigenen Claim: Ich schreibe ihn wörtlich in die Brief-Datei, baue trotzdem mit dem heutigen Schriftzug und melde im Pull Request, dass die Laufzeit erst einen eigenen Schlusstext pro Fassung braucht.
```

Darauf folgten drei kurze Nachrichten:

```text
mach einfach leg los ich bin auf deine versionen gespannt
keine weiteren runden.
grilling meinte ich
```

### 5. Die Konzepte

> Verstanden: keine weiteren Fragerunden. Hier sind die drei Konzepte, und ich baue ohne Warten das erste.
>
> **1. „Formsache“ (Knete und Ziegelform), meine Empfehlung.** Blick von oben auf einen dunklen Holztisch im Lampenlicht. Ein Klumpen heller Knete bekommt immer dieselbe Frage, sichtbar als derselbe Lichtring und hörbar als dasselbe Motiv, und antwortet jedes Mal stolz mit einer anderen Form: Stern, Kringel, Schnecke. Dann schieben sich Holzleisten heran, eine nach der anderen, bis eine Ziegelform steht; die Antworten quellen erst durch die Lücken und werden dann gleich. Am Ende kommen drei gleiche Ziegel heraus, einer pro Zeile des Schriftzugs. Musik: gezupfter Kontrabass und Marimba im Frage-Antwort-Spiel, jede Leiste ein Holzschlag.
>
> **2. „Kugelbahn“ (Murmeln, Holz, Messing).** Seitlicher Blick auf ein Brett mit Messingstiften. Aus demselben Loch fällt immer wieder eine Murmel und landet jedes Mal woanders; jeder Aufprall ist ein Ton, also jedes Mal eine andere Melodie. Leisten und Trichter kommen dazu, die Wege laufen zusammen, und am Ende schlagen drei Murmeln dieselbe Glocke.
>
> **3. „Tafel“ (Kreide).** Die Kreide soll immer denselben Kreis ziehen und zieht ein Ei, eine Spirale, eine Kartoffel; der Schwamm wischt. Mit einer Schablone gelingt dreimal derselbe Strich. Schwäche: Helle Linien auf dunklem Grund ähneln dem Pool am meisten.
>
> **Warum 1:** Die Knete ist eine Hauptfigur, die man mag. Sie präsentiert jede Antwort mit einem „Ta-da“, ob sie passt oder nicht, und das ist dein überkreativer Bullshitter ohne Gesicht und ohne Spott. Drei gleiche Ziegel sagen ohne Worte, was du meintest: Erst wenn es verlässlich ist, kann man damit bauen. Bei der Kugelbahn ist die Murmel nur Physik, keine Figur.
>
> **So halte ich es fest:** id `formsache16k`, Name „Formsache“. Deine Antwort auf Runde 2 steht wörtlich in der Brief-Datei, mit dem Hinweis, dass meine Empfehlungen ohne Einzelantwort gelten und ich das Konzept unter deinem „mach einfach“ selbst gewählt habe. Ein Wort von dir („2“ oder „3“) ändert das.

## Die Wahl

Eine ausdrückliche Wahl zwischen den drei Konzepten gab es nicht. Nach „mach einfach leg los“ und „keine weiteren runden.“
(gemeint waren die Fragerunden) wurde ohne Warten Konzept 1, „Formsache“, gebaut. Für die Fragen aus Runde 2 gelten die
Empfehlungen ohne Einzelantwort, so wie `theme.md` es für einen Lauf ohne Antwort vorsieht. Eine dritte Runde zum Bild
fand nicht statt; die Lücke „diese I guess“ aus der ersten Antwort blieb offen.

Am Ende steht der heutige Schriftzug der Seite. Ein eigener Claim oder eine andere Marke wurde nicht gewünscht, die Laufzeit
braucht deshalb keinen eigenen Schlusstext für diese Fassung.

## Nachtrag, 2026-11-14: der Claim

Nach dem Merge kam der Claim, den die Fassung zum Schluss zeigen soll (Auszug aus der Nachricht, wörtlich):

```text
hier ist der claim:

Kann alles. Außer konstant. / Unser Part. / dreambau.com
```

Damit gilt der Absatz „Am Ende steht der heutige Schriftzug“ oben nicht mehr. Die drei Zeilen sind die drei Ziegel: „Kann alles.
Außer konstant.“, „Unser Part.“ und „dreambau.com“. Dafür bekam die Laufzeit einen eigenen Schlusstext pro Fassung (Schlüssel
`claim.formsache16k.1` und `.2` in allen 47 Sprachdateien, Regel C13). Die Übersetzungen der beiden Zeilen sind Entwürfe.
