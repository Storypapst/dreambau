# Website pages

References and Glossary are generated from `content.json`. The reference timeline uses the approved C layout; the glossary uses the approved question-first Wegweiser. Original portfolio text remains English. Current-project descriptions without approved copy remain visibly missing. The blog and legal drafts are not published as finished content.

Run with Node 20:

```sh
npm ci
npm run build
npm run build:apex --prefix ../landing
npm run check
```

The checks use an isolated real nginx and Chromium, verify routes, responsive layouts, no-JavaScript content, source-view interaction and the Rohbau rendering regression. Browser and container resources are closed after the run. Screenshots and the result record live in ignored `test-results/`. `BASE_URL=https://dreambau.com npm run check` repeats these checks against the published website.

The Landing Apex builder packages these pages and their assets in its checksum manifest. Canonical page routes must be activated by the private operator transaction before publication; operational configuration and backup paths do not belong in this public repository.

## Content provenance

The approved offline References C and Glossary Wegweiser mockups define the components. The saved fgp.webflow.io portfolio supplies the seven English references and four original project descriptions/images. Unconfirmed glossary proposals and obsolete language-release gates are excluded. There are twelve reference entries, twenty-six settled terms and twenty-seven questions. Counts reflect actual published records.

The menu uses the existing pill and list-panel components. Its placement and grouping were decided under the owner's delegation; one word can change them. No new colour, font or marketing copy was introduced.
