# Prompt: HTML-Mockup → React-Story

Für ein HTML-Mockup/eine Datei, das/die als Storybook-Story sichtbar werden
soll (Pfad zur HTML-Datei und Zielname ersetzen):

---

Ich habe ein HTML-Mockup unter **<pfad/zum/mockup.html>**. Mache daraus eine
React-Story in **<ORISO-Frontend|ORISO-Admin>**, ohne das rohe HTML in die
Komponente einzubauen.

1. Lies das Mockup und entscheide:
   - **Screen-Layout oder Variante** (der Normalfall) → Story aus vorhandenen
     Komponenten und Tokens bauen (`npx storybook tools docs show --id <id>`).
     Kein roh eingebettetes HTML, keine nachgebauten Styles — Regel 3 in
     `rules/AGENTS-block.md`.
   - **Volle visuelle Treue nötig** (z. B. E-Mail-Template) → Wrapper-Komponente, die das HTML per `<iframe srcDoc={html}>`
     rendert. Das HTML bleibt als eigene Datei/Konstante, nicht inline im JSX.
   - **Einfaches Snippet, soll ins Komponenten-Tooling** →
     `dangerouslySetInnerHTML` in einer kleinen Wrapper-Komponente, mit
     Kommentar, warum (z. B. Rich-Text-Vorschau).
2. Lege die Story unter `src/components/<Name>/<Name>.stories.tsx` an,
   Komponente daneben unter `src/components/<Name>/<Name>.tsx`.
3. **Committe die rohe HTML-Datei nicht in den Komponenten-Ordner** — sie
   bleibt Referenz/Input außerhalb des Repos oder als dokumentierter Fixture
   mit klarer Herkunft, nie unkommentiert im Produktionscode.
4. Führe `test-stories` für die neue Story aus und zeige sie mit
   `npx storybook tools stories preview` (lokales `npm run storybook`).
5. Nimm die Story-ID **wörtlich** in den Abschlussbericht auf.
6. Nenne, welcher Ansatz (iframe vs. dangerouslySetInnerHTML) gewählt wurde
   und warum.

Bei Unsicherheit über Storybook-Story-Konventionen im Repo:
den Skill `write-stories` des Repos zuerst laden.
