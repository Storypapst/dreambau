---
title: Kleine Entscheidungen in RAG-Systemen an ein eigenes Modell geben
date: 2026-10-03
lang: de
sourceLink: https://www.youtube.com/watch?v=olIve0D8pJQ
sourceTitle: "The AI Automators: Why I switched my RAG decisions to Jev..."
example: true
---

Ein RAG-Agent trifft viele kleine Entscheidungen, bevor er eine Antwort gibt. Wer dafür jedes Mal ein großes Sprachmodell fragt, wartet länger und zahlt mehr. Im Video zeigt The AI Automators, wie sie in ihrer agentischen RAG-App für diese Aufrufe Jev von TypeSafe einsetzen, ein sogenanntes System-One-Entscheidungsmodell.

Jev übernimmt dort drei Aufgaben: Es wählt das passende Modell für eine Frage, sortiert gefundene Textstellen nach einer steuerbaren Vorgabe neu und prüft Quellenangaben. Man sieht die Funktionen in der App und kann die echten Aufrufe in Langfuse mitverfolgen.

Das Video ist vor allem ein Anlass, die eigenen Abläufe durchzusehen: Wo wird ein großes Modell nach etwas gefragt, das ein kleines Modell schneller beantworten könnte?
