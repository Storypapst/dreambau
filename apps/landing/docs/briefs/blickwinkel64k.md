# Brief: Blickwinkel (`blickwinkel64k`)

Diese Datei hält den Auftrag und das Gespräch aus „Bevor du baust“ (`theme.md`) wörtlich fest: die Fragen und
Empfehlungen, wie sie gestellt wurden, die Antworten, wie sie kamen, die Konzepte und die Wahl. Ergänzt sind nur die
Überschriften, die Quellenangabe zum eingefügten Podcast-Auszug und am Ende eine Zusammenfassung, was daraus folgt.

## Die drei Felder

- **Thema:** Blickwinkel. „Unmöglich ist eine Frage der Perspektive.“ Eine unmögliche Figur (wie das Penrose-Dreieck)
  schließt sich nur aus einem Blickwinkel, und dann wird sie gebaut. Bezug: Hintons Prisma (Runde 1).
- **Größenklasse:** 64k (höchstens 65.536 Byte)
- **id:** `blickwinkel64k`

Eine Bild- oder Stilidee kam mit dem Thema: das Prisma aus Hintons Beispiel (Runde 1). Alles Weitere ist im Gespräch
entstanden.

## Der Auftrag, wie er kam

> Du baust eine neue Fassung für den Zufallspool der Startseite dreambau.com. Arbeite genau nach `apps/landing/docs/briefs/theme.md` (dieser Stand liegt auf dem Branch `claude/production-credits`, PR #237; dort steht auch der Abschnitt „Bevor du baust“).
>
> Felder:
> - Thema: noch offen. Erfrag es im Gespräch mit mir, zusammen mit Bildidee, Stimmung, Klang und dem Claim am Ende.
> - Größenklasse: 64k
> - id: legst du nach dem Gespräch fest; Kleinbuchstaben und Ziffern, endet auf `64k`, darf es noch nicht geben (siehe `D.ids` in `apps/landing/site/shell.js`).
>
> Wichtig:
> - Fang mit „Bevor du baust“ an: Frag mich in Runden, jede Frage mit deiner Empfehlung, schlag mir danach zwei bis drei deutlich verschiedene Konzepte vor und warte auf meine Wahl. Ich antworte hier in dieser Sitzung.
> - Halte das Gespräch wörtlich in `docs/briefs/<id>.md` fest und trag dich in `site/credits.js` ein (Modell, das tatsächlich gearbeitet hat).
> - Arbeite auf einem neuen Branch von `claude/production-credits`, öffne am Ende einen Pull Request gegen `main` und schreib in die Beschreibung, dass er auf #237 aufbaut. Merge nichts und veröffentliche nichts auf dem Server.
> - Schreib mir auf Deutsch und duze mich.

## Bevor du baust: das Gespräch

### Runde 1: Fragen

Ich habe den Auftrag, die Regeln und die sieben Fassungen im Pool gelesen. Hier ist die erste Fragerunde.

**Runde 1 von höchstens 3: Thema, Gefühl, Schluss, No-Gos**

Jede Frage hat meine Empfehlung. „ja“ übernimmt alle; sonst antworte kurz, zum Beispiel „F1: C, F2: Staunen“. Hast du schon ein Bild im Kopf, schreib es einfach dazu, so grob es ist. Fragen, Antworten und Konzepte kommen wörtlich in `docs/briefs/<id>.md`, und das Repo ist öffentlich.

Was schon im Pool ist (Schlussbilder unter `verification/`): drei Städte oder Häuser (Rohbau, Traumhaus, Skyline), drei Brücken (Kante, Tragwerk, Schlucht) und eine Signallinie (Signal). Fast alle sind dunkelblau mit Orange, Gold oder Cyan. Damit sich Neuladen wirklich nach einer anderen Fassung anfühlt, sollte die neue im Motiv und in der Farbe davon weg.

❓ **F1 – Thema**: Welche Geschichte erzählen die 60 Sekunden? Drei Vorschläge, oder dein eigenes:

- **A Schlussstein.** „Ein Bogen trägt erst, wenn der letzte Stein sitzt.“ Keilsteine liegen auf einem Lehrgerüst aus Holz. Erst mit dem Schlussstein trägt der Bogen sich selbst; das Gerüst wird weggenommen, und er hält.
- **B Blickwinkel.** „Unmöglich ist eine Frage der Perspektive.“ Eine unmögliche Figur (wie das Penrose-Dreieck) schließt sich nur aus einem Blickwinkel, und dann wird sie gebaut.
- **C Baulücke.** „Wo andere eine Lücke sehen, fangen wir an.“ Eine Berliner Lücke zwischen zwei Brandwänden füllt sich in einer Nacht.
- **D Dein Thema**, gern nur als Stichwort.

➡️ **A Schlussstein.** Das Bild beweist den Schriftzug, statt ihn zu behaupten: Kurz vorher ist es wirklich unmöglich, dass Steine ohne Stütze in der Luft stehen. Fällt das Gerüst und der Bogen hält, ist das „jibs nich…“ als Physik. Nebenbei trägt jeder Stein seinen Nachbarn; das erzählt Zusammenarbeit ohne ein Wort. Und Stein, Holz und warmes Licht gibt es im Pool noch nicht.
*Mit A:* Man sieht 50 Sekunden lang, warum der Bogen nicht stehen kann, und dann, dass er steht. Der Schriftzug landet genau in der Erleichterung.
*Ohne ein solches Bild* (zum Beispiel noch eine wachsende Stadt): Wer neu lädt, sieht zum vierten Mal etwas wachsen, und der Schriftzug bleibt eine Behauptung.

---

❓ **F2 – Gefühl**: Was soll bleiben, wenn der Schriftzug steht? Zuversicht und Erleichterung, Staunen, Wärme und Geborgenheit, oder ein Schmunzeln?

➡️ **Zuversicht und Erleichterung, mit Wärme.** Vorher eine leise Spannung („hält das?“), die sich im richtigen Moment löst. Der Humor bleibt beim Berliner Schriftzug; macht das Bild auch noch Witze, wird es albern.

---

❓ **F3 – Schluss: Marke und Claim**: Welche Zeilen stehen am Ende?

➡️ **Der heutige Schriftzug:** „Jeht nich…“, „jibs nich…“, „dreambau.com“. Er kommt von der Seite, ist in alle 47 angebotenen Sprachen übersetzt und für alle Fassungen gleich.
*Mit dem heutigen Schriftzug:* Die Fassung läuft sofort in allen Sprachen, ohne Änderung an der Laufzeit.
*Mit einem eigenen Claim:* Ich schreibe ihn wörtlich in die Brief-Datei und baue trotzdem mit dem heutigen Schriftzug. Im Pull Request steht dann, dass die Laufzeit erst einen eigenen Schlusstext pro Fassung braucht, samt 47 Übersetzungen. Bis dahin endet die Fassung wie alle anderen.

---

❓ **F4 – Was es auf keinen Fall sein soll**:

➡️ Keine wachsende Stadt, keine Brücke, keine Partikelwolke, die zum Text wird (gibt es alles schon). Keine Effekte aus Technik-Demos (Plasma, Linsenreflexe, Matrix-Regen). Kein Kitsch, kein Text im Bild, keine Blitze. Keine Figuren oder Gesichter aus der Nähe (prozedural wirken sie schnell gruselig). Keine glänzende Architektur-Visualisierung mit Glastürmen.

### Runde 1: Antworten

Franks Antwort zu F1 enthält einen eingefügten Auszug aus einem Podcast-Transkript; er steht unverändert als Zitat da.
Quelle, nach Sprechern und Zeitmarken: The Weekly Show with Jon Stewart, Folge „AI: What Could Go Wrong? with Geoffrey
Hinton“ vom 9. Oktober 2025, ab 1:23:23.

<!-- reply 4 -->
> B Blickwinkel. „Unmöglich ist eine Frage der Perspektive.“ Eine unmögliche Figur (wie das Penrose-Dreieck) schließt sich nur aus einem Blickwinkel, und dann wird sie gebaut.

finde ich spannend. kenne ich als prisma hatte mal geoffrey hinton dem podcasterr der 

> **1:23:23** · GEOFFREY HINTON: So I'm going to give you an example of a multimodal chatbot, that is something that can do language and vision, having a subjective experience.
>
> **1:23:33** · Because I think they already do.
>
> **1:23:35** · So here we go.
>
> **1:23:37** · I have this chatbot.
>
> **1:23:38** · It can do vision.
>
> **1:23:39** · It can do language.
>
> **1:23:40** · It's got a robot arm so it can point.
>
> **1:23:42** · JON STEWART: OK.
>
> **1:23:43** · GEOFFREY HINTON: And it's all trained up.
>
> **1:23:45** · So I place an object in front of it and say, point at the object.
>
> **1:23:49** · And it points at the object.
>
> **1:23:50** · Not a problem.
>
> **1:23:52** · I then put a prism in front of its camera lens when it's not looking.
>
> **1:23:58** · \[JON LAUGHING\] JON STEWART: You're pranking AI?
>
> **1:24:06** · GEOFFREY HINTON: We're pranking AI.
>
> **1:24:08** · Now, I put an object in front of it, and I say, point at the object.
>
> **1:24:14** · And it points off to one side because the prism bent the light rays.
>
> **1:24:18** · And I say, no, that's not where the object is.
>
> **1:24:20** · The object is actually straight in front of you, but I put a prism in front of your lens.
>
> **1:24:24** · And the chatbot says, oh, I see the camera bent the light rays.
>
> **1:24:29** · So the object is actually there.
>
> **1:24:32** · But I had the subjective experience that it was over there.
>
> **1:24:37** · Now, if it said that, it would be using the word "subjective experience" exactly like we use them.
>
> **1:24:42** · JON STEWART: Right.
>
> **1:24:43** · I experienced the light over there even though the light was here because it's using a reasoning to figure that out.
>
> **1:24:56** · GEOFFREY HINTON: So that's a multimodal chatbot that just had a subjective experience.
>
> **1:24:59** · JON STEWART: Right.
>
> **1:25:01** · The way that we would think of it.
>
> ### Subjectives Experiences of AI & Humans
>
> **1:25:03** · GEOFFREY HINTON: This idea there's a line between us and machines, we have this special thing called subjective experience and they don't-- it's rubbish.

<!-- reply -->
> F2 – Gefühl: Was soll bleiben, wenn der Schriftzug steht? Zuversicht und Erleichterung, Staunen, Wärme und Geborgenheit, oder ein Schmunzeln?

neugier

<!-- reply -->
> „Jeht nich…“, „jibs nich…“, „dreambau.com“.

also irgendwas das wir die Brücken bauen weil wir verstehen wie man diese spannende technologie hebelt. aber natürlich humorvoll bitte und nicht auf die schnauze selling. du kannst auch mit hintons aussage stehen bleiben. ist mir egal

<!-- reply -->
> F4 – Was es auf keinen Fall sein soll:
> 
> ➡️ Keine wachsende Stadt, keine Brücke, keine Partikelwolke, die zum Text wird (gibt es alles schon). Keine Effekte aus Technik-Demos (Plasma, Linsenreflexe, Matrix-Regen). Kein Kitsch, kein Text im Bild, keine Blitze. Keine Figuren oder Gesichter aus der Nähe (prozedural wirken sie schnell gruselig). Keine glänzende Architektur-Visualisierung mit Glastürmen

ja

### Runde 2: Fragen

Danke. Wörtlich notiert: **Thema B Blickwinkel**, mit Hintons Prisma als Bezug; **Gefühl: Neugier**; am Ende ein **eigener Claim** (humorvoll, ohne Verkaufen, oder Hintons Gedanke); **No-Gos** wie vorgeschlagen.

Zu deinem Hinton-Auszug: Er kommt wörtlich in den Brief, als Zitat gekennzeichnet und mit Quelle. Nach Sprechern und Zeitmarken ist das die Folge „AI: What Could Go Wrong? with Geoffrey Hinton“ von The Weekly Show with Jon Stewart (9. Oktober 2025), ab 1:23:23. Das Repo ist öffentlich; willst du den Auszug lieber auf zwei, drei Sätze gekürzt, sag es.

**Runde 2 von höchstens 3: Wer schaut, welcher Moment, Farbe, Klang, Claim-Text**

Danach schlage ich dir zwei bis drei Konzepte vor. Sie unterscheiden sich vor allem darin, welches Bild trägt: das unmögliche Dreieck, das Prisma oder beides.

❓ **F5 – Wer schaut?** Hintons Pointe: Die Maschine erlebt dasselbe wie wir („es sah aus, als wäre es dort drüben“). Wie viel Maschine soll man sehen?

- **A** Nur du: Die Kamera ist dein Auge, nichts deutet auf eine Maschine.
- **B** Du schaust durch das Auge einer Maschine: Das Bild wirkt wie durch ein Objektiv (die Schärfe sucht, an Kanten gibt es Farbsäume). Keine Roboterteile im Bild.
- **C** Eine Maschine im Bild, wie bei Hinton: ein Kameraauge mit Zeigearm, das erst daneben zeigt und dann richtig.

➡️ **B.** Du machst selbst den Fehler, den der Chatbot macht, und merkst erst danach, dass dein Blick gebrochen war. Das ist Hintons Punkt (keine Linie zwischen uns und der Maschine), ohne dass ihn jemand erklärt.
*Mit B:* Die KI-Anspielung steckt im Bild, auch solange am Ende noch der heutige Schriftzug steht.
*Mit C:* Du schaust einem Roboterarm beim Danebenzeigen zu. Man versteht die Anekdote, bleibt aber Zuschauer, und Roboterarme sind das Standardbild für KI.

---

❓ **F6 – Welcher Moment trifft auf den Schriftzug?**

- **A Der Klick:** Aus dem richtigen Blickwinkel schließt sich die Figur, genau auf einem Schlag, und die erste Zeile kommt mit ihm. Ein Hinweis bleibt sichtbar, zum Beispiel ein Schatten, der drei getrennte Balken zeigt.
- **B Die Auflösung:** Die Kamera geht weiter, die Figur zerfällt wieder, und der Schriftzug kommt, wenn man den Trick durchschaut hat.

➡️ **A.** Neugier bleibt nur, wenn etwas offen bleibt.
*Mit A:* Das letzte Bild zeigt ein geschlossenes unmögliches Dreieck über einem Schatten, der nicht dazu passt. Wer das bemerkt, schaut noch einmal hin oder lädt neu.
*Mit B:* Das Rätsel ist gelöst, bevor der Schriftzug kommt; danach gibt es nichts mehr zu entdecken.

---

❓ **F7 – Farbe und Material**: Woraus ist die Welt?

➡️ **Ein fast schwarzer Raum, die Balken aus hellem Sichtbeton mit dem Abdruck der Schalbretter, dazu Glas. Farbe gibt es nur, wo Licht durch Glas geht: schmale Spektralsäume, keine Regenbogenflächen.** Im Pool ist sonst alles dunkelblau mit Orange, Gold oder Cyan; neutrales Weiß mit gebrochenem Licht gibt es noch nicht. Sichtbeton sagt „wirklich gebaut“, das Spektrum sagt „Licht verstanden“. Ist dir das zu kühl: warmes Holz statt Beton.

---

❓ **F8 – Klang**: Wie klingt Neugier?

➡️ **Gläsern und verspielt, um 108 BPM:** angeschlagenes Glas, Holz wie bei einer Marimba, gezupfter Bass, keine Stimmen. Zwei Stimmen spielen dieselbe Figur, leicht gegeneinander verschoben wie ein gebrochenes Bild, und fallen im Klick zusammen. So hört man, was man sieht.
*Ohne diese Idee* (Flächen und Beat wie in den anderen Fassungen) begleitet die Musik nur, statt dieselbe Geschichte zu erzählen.

---

❓ **F9 – Der Claim, wörtlich**: Er kommt wörtlich in den Brief. Gebaut wird vorerst mit dem heutigen Schriftzug, und der Pull Request nennt die nötige Änderung an der Laufzeit (siehe Runde 1). Drei Vorschläge in der Form des heutigen Schriftzugs, also zwei kurze Zeilen und die Marke:

- **A** „KI hat Kanten.“ / „Gut zum Hebeln.“ / „dreambau.com“
- **B** „KI sieht manchmal um die Ecke.“ / „Wir wissen, um welche.“ / „dreambau.com“
- **C** „Die Linie zwischen Mensch und Maschine?“ / „Auch nur ein Blickwinkel.“ / „dreambau.com“. Das ist Hintons Gedanke ohne seinen Namen: Ein wörtliches Zitat mit Namen auf der Firmenseite liest sich, als würde er Dreambau empfehlen.

➡️ **A.** Am nächsten an deinen Worten: Kanten sind kein Fehler, sondern die Stelle, an der man den Hebel ansetzt. Das ist Handwerkerwissen mit Augenzwinkern, es verkauft nichts, und es knüpft an „KI hat Kanten. Wir bauen Brücken.“ an. B passt am genauesten zum Bild (das Prisma und die eine Ecke des Dreiecks, an der der Trick sitzt), falls dir das wichtiger ist.

Quelle zur Folge: [The Weekly Show with Jon Stewart: „AI: What Could Go Wrong? with Geoffrey Hinton“](https://pocketcasts.com/podcast/the-weekly-show-with-jon-stewart/6930ae10-ebba-0139-a517-0acc26574db2/ai-what-could-go-wrong-with-geoffrey-hinton/e354d8ad-1161-4bf1-9ac5-ad4ab8e24ea3)

### Runde 2: Antwort

mach einfach such dir das beste raus ich bin gespannt was du kreativ daraus haust

### Konzepte und Wahl

Gut, dann entscheide ich. Aus Runde 2 nehme ich alle Empfehlungen: F5 B (du schaust durch das Auge einer Maschine), F6 A (der Klick), F7 Sichtbeton und Glas, F8 Glas und Holz um 108 BPM, F9 A („KI hat Kanten.“ / „Gut zum Hebeln.“ / „dreambau.com“). Drei Konzepte, die sich darin unterscheiden, welches Bild trägt:

**1 Prisma.** Du schaust durch ein Objektiv, vor dem ein Glasprisma hängt: Ein Betonblock im dunklen Raum erscheint verschoben und mit Farbsäumen, ein dünner Lichtstrahl zeigt immer knapp daneben. Im Takt dreht sich das Prisma aus dem Blick, das Bild rückt an seinen wahren Platz, und auf dem Schlag trifft der Strahl. Musik: zwei Glasstimmen, gegeneinander verschoben, die im Treffer zu einer werden.

**2 Dreieck.** In einer dunklen Halle werden drei Balken aus Sichtbeton geschalt und ausgeschalt, im Takt, einer nach dem anderen; die Kamera umkreist sie, und man sieht: Sie berühren sich nicht. Dann findet die Kamera den einen Punkt, auf dem Schlag schließt sich das unmögliche Dreieck, und ein flaches Licht wirft den ehrlichen Schatten: drei getrennte Balken. Musik: Holz und Glas, verschobene Stimmen, die im Klick zusammenfallen.

**3 Blickwinkel (beides).** Erst siehst du durch ein Prisma: Im Dunkeln schweben Lichtsplitter in Spektralfarben, nichts steht dort, wo es scheint, die Schärfe sucht. Dann gleitet das Prisma aus dem Blick, die Lichter rücken an ihren wahren Platz, und im Takt werden drei Betonbalken geschalt und ausgeschalt; die Kamera umkreist sie, sie passen nicht zusammen. Zum Schluss fährt die Kamera zurück und zoomt zugleich heran, bis die Perspektive flach wird: Auf dem Klick bei 40 s schließt sich das unmögliche Dreieck, der Schatten am Boden zeigt weiter drei getrennte Balken, und die beiden verschobenen Stimmen fallen zusammen.

**Meine Wahl, unter Delegation: 3 „Blickwinkel“.** Nur hier erzählen dein Prisma und dein unmögliches Dreieck eine einzige Geschichte: Erst wird das Auge getäuscht, dann versteht es, was das Glas mit dem Licht macht, dann wird etwas gebaut, das nur aus einem Blickwinkel unmöglich aussieht.
*Mit 3:* Wer die Seite öffnet, macht zuerst Hintons Erfahrung selbst und sieht danach, wie daraus etwas Gebautes wird. Der Schatten am Ende lässt die Frage offen, wie das geht.
*Mit 1 oder 2:* Bei 1 fehlt das Bauen, die Fassung bliebe ein Lichtexperiment. Bei 2 fehlt dein Prisma, und der Bezug zur KI stünde nirgends, solange am Ende noch der heutige Schriftzug kommt.

Name „Blickwinkel“, id `blickwinkel64k`. Ein Wort von dir ändert das. Ich baue jetzt und melde mich mit Kontaktbogen und Hörprobe.

## Was daraus folgt

- **Gebaut:** Konzept 3 „Blickwinkel“, unter Delegation entschieden; ein Wort ändert das.
- **Aus Runde 2 übernommen (Empfehlungen):** Du schaust durch das Auge einer Maschine (Objektiv mit suchender Schärfe
  und Farbsäumen, keine Roboterteile); der Klick schließt das Dreieck bei 40 s und bringt die erste Zeile, der Schatten
  zeigt weiter drei getrennte Balken; Sichtbeton und Glas, Farbe nur, wo Licht durchs Glas geht; Glas und Holz um
  108 BPM, zwei Stimmen gegeneinander verschoben, die im Klick zusammenfallen.
- **Claim am Ende, wie gewünscht (F9 A):** „KI hat Kanten.“ / „Gut zum Hebeln.“ / „dreambau.com“. Die Laufzeit kennt
  noch keinen eigenen Schlusstext pro Fassung. Die Fassung endet deshalb mit dem heutigen Schriftzug „Jeht nich…“,
  „jibs nich…“, „dreambau.com“; der Pull Request beschreibt die nötige Änderung. Kein eigener Text ist ins Bild
  gezeichnet.
