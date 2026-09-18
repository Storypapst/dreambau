# ORISO Dev Hub — presentation concept (v1)

Concept, 2026-09-11 · Dreambau app, shadcn/ui `new-york` + Tailwind v4 · Source of truth:
the kit folder `/understand/api/v1/kit` already serves. Nothing here is implemented.

## 0. What the sources show (why this concept looks the way it does)

- **The current hub page drifts.** `pages/index.html` is hand-written German and already
  wrong: it says kit 0.2.0, "endpoint not deployed", "graph every 2 h" and a shared
  `ORISO_KIT_TOKEN`. The kit is at 0.4.3 and the graph refreshes on demand from `dev`, and
  since 0.4.1 each person uses their own token. (The endpoint itself is still *not* live as
  of 2026-09-11: the running testmails image is `main` @ `59533e5`, which predates the kit
  code in PR #105 — the Hub depends on that PR being merged and deployed.) So v1 only shows facts that
  are **generated from kit files**. Prose that someone types by hand is kept to a minimum.
- **Keep the good ideas from the current page.** Every block shows its own freshness. Blocks
  are grouped by the question they answer, not by repository. There is a "how it reaches
  you" flow and a table of what is public and what is team-only. The ORISO red accent stays.
- **Every team fact already exists as a Markdown table or a JSON file:**
  `rules/team/team-directory.md` (roster, reviewer routing, deploy routing),
  `rules/team/slack-channels.md`, the "Environments" and "How work reaches Dev" sections of
  `rules/AGENTS-block.md`, `skills/README.md` (three skill tables), `skills/*/SKILL.md`
  frontmatter, `rules/devs/*.md` and `manifest.json`.
- **The app already has what the hub needs:** Tailwind v4 (`@theme inline` in
  `src/client/styles.css`), lucide, cmdk, `marked`, `next-themes`, zod, and the ui components
  card, table, tabs, badge, command, sheet, alert, tooltip, separator, select, toggle-group,
  empty and skeleton, plus `copy-button.tsx`. It has **no** dark tokens yet, no router, and no
  sidebar, breadcrumb or accordion. Human auth uses passkey or email-OTP, with
  `user.projects` taken from Infisical grants. The PR #105 branch adds an ingress rule that
  sends `/understand` to the app; live, `/understand` still answers 301 until that is applied.
- **Two gaps affect the content.** The kit wires skills into Claude Code and Codex, but has
  nothing for Cursor. The five `prompts/*.md` are still in German.

## 1. Purpose and audience

The Dev Hub is the one page the six ORISO developers open to answer everyday "how do we do
this here" questions. Which branch? Who reviews? Which channel? Which skill? May I deploy
there? Am I on the current kit? Frank, Shazia, Riccardo, Hassan, Shanzae and Nikunj work in
Claude Code, Codex and Cursor. The Hub shows people the same rules their agents already read
from the kit, so humans and agents cannot disagree. It is a read-only view of the kit that is
currently served. It is team-only, in English, and it never replaces the kit files themselves.

## 2. Content inventory (prioritised)

"Freshness" means how often the content changes. The Hub rebuilds on every kit version, so
nothing here needs to be kept up by hand unless it says so.

| Pri | Item | Why it helps the team | Generated from | Freshness |
|---|---|---|---|---|
| P0 | **Delivery flow at a glance.** 6 steps from branch to tested on Dev, the board status chain, and "keep the ticket honest" | The rule that changed on 2026-08-31 (PRs go to `dev`, not `pre-dev`) and the one people get wrong most often | `AGENTS-block.md` → "How work reaches Dev", "Keep the ticket honest" | Rarely, per kit version |
| P0 | **Reviewer routing per repo.** Includes a picker (repo + author → 2–3 reviewers + `gh pr edit` command) | Every PR needs reviewers at open. The exceptions are easy to forget (no Shanzae on UserService; the fallback when the pool minus the author has fewer than 2) | `team-directory.md` → "Reviewer routing", core list, "Deployment routing" | When the roster changes |
| P0 | **Environments.** Local / Dev / Stage / Pre-Dev, what each one is, who deploys, and whether a developer may deploy | Pre-Dev is Frank's. A wrong swap there with `imagePullPolicy: Never` freezes the cluster for everyone | `AGENTS-block.md` → "Environments" | Rarely |
| P0 | **Skills catalogue.** What each skill does, when to use it, and where it comes from: kit, library, method or personal | 6 kit skills, 8 library skills and 5 method skills. People do not know what exists or where to get it | `skills/README.md` (3 tables) + `skills/*/SKILL.md` frontmatter, `evals/`, `references/` | Per kit version |
| P0 | **Kit version, changelog and "am I current?"** | 0.4.3 is a canary (Shazia only) while everyone else runs 0.4.2. People need to see which version they should have | `manifest.json` (`version`, `date`, `changelog[]`) as served, plus canary info (see Q2) | Per release, about weekly |
| P0 | **Install and update commands.** First install, update, graph pull, `ORISO_KIT_DEV`, `kit-local` | The one command you need, ready to copy, for each tool | `README.md` (setup, `kit-subscribe`, `kit-local`), `rules/templates/codex.md` | Rarely |
| P0 | **Slack channel map.** Purpose → channel, with deep links | `#oriso-deployement` is misspelled, and ORISO and WCR share one workspace | `slack-channels.md` | Rarely |
| P1 | **Who is who.** Developers, then roles around the team (Björn, Christoph, Jonas, Kio) | Who owns which repo, who reviews what, and who is *not* a reviewer | `team-directory.md` roster + `rules/devs/<handle>.md` | When the roster changes |
| P1 | **Per-dev space.** Your rules file, `~/.oriso-dev-kit/local/`, and the server folder `devs/<you>/` | Shows where personal skills and rules go so they survive kit updates and a laptop change | `rules/devs/README.md`, `rules/local/README.md`, "server account" line in `rules/devs/*.md` | Rarely |
| P1 | **Troubleshooting.** STALE graph, 401 from the MCP server, skipped skill links, lost local edit | These are the errors people actually hit, each with its fix | `README.md` → "Troubleshooting" | Per kit version |
| P1 | **Prompts.** Ticket check, onboarding, component, HTML→story, story→HTML | Ready to paste | `prompts/*.md` (**German, must be translated first**, see Q6) | Rarely |
| P1 | **Link-outs.** Graph dashboards, Storybook Frontend/Admin, the Case Handover page, docs.oriso.org | Brings together what the old sector cards linked to | New `pages/links.json` in the kit, replacing the URLs hard-coded in `index.html` | Rarely |
| P2 | Graph freshness (shallow and depth dates) | "Is the graph I pulled current?" | predev `meta.json` / `depth.json` (needs server-side credential) | Per refresh |
| P2 | Live library listing including `devs/<user>/` contents | Shows drafts before they reach the kit | `/srv/dreambau/agent-skills/` mounted read-only (Q3) | Live |
| P2 | Kit version per person | Frank can see who is behind without asking | `kit-subscribe` reporting its version (Q4) | Per session start |
| P2 | Open PRs without reviewers, PRs still targeting `pre-dev` | Turns the rule into a to-do list | GitHub API (a bot token, not a person's token) | Live |

## 3. Information architecture

**Location.** The Hub lives at `/understand/` in the Dreambau app. It replaces the static
German `pages/index.html` as the start page. The remaining old sectors (Features,
Architecture, Code) become link-out cards on the start page. Legal and Operations are not
shown (see §7).

**Pages.** Each page has a short path, so you can link to it from Slack and PR comments.

```
/understand/                   Start here  (one screen, answers the top 5 questions)
/understand/deliver            Delivery flow · ticket hygiene · release discipline
/understand/review             Reviewer routing table + picker · deployment routing
/understand/environments       Local / Dev / Stage / Pre-Dev
/understand/skills             Catalogue  (/understand/skills/<name> opens the detail sheet)
/understand/people             Who is who · roles around the team
/understand/channels           Slack map
/understand/kit                Version · changelog · install/update per tool · troubleshooting
/understand/me                 Per-dev space (your rules file, local/, server folder)
```

**Navigation**

- A shadcn `Sidebar` with three groups. *Work:* Start, Deliver, Review, Environments.
  *Tools:* Skills, Kit. *Team:* People, Channels, Me. On screens narrower than `md`, the
  sidebar becomes a `Sheet` (built into Sidebar).
- A header with a `Breadcrumb`, the global search (⌘K, see §4), a **"Viewing as"** `Select`
  (a GitHub handle, kept in `localStorage`, no server data) and a theme toggle.
- "Viewing as" is the only personalisation. It removes you from the reviewer picker, shows
  your `rules/devs` notes on `/me`, and marks your row in tables. It is not taken from the
  login: human users are keyed by email, and email must stay out of the Hub data.

## 4. Presentation per section (shadcn/ui + Tailwind)

**Page layout.** `SidebarProvider` › `SidebarInset` › `main.mx-auto.w-full.max-w-6xl.px-4.sm:px-6.py-6`.
Card grids use `grid gap-4 md:grid-cols-2 xl:grid-cols-3`. Every `Table` sits inside
`div.overflow-x-auto.rounded-lg.border`. The body never scrolls sideways.

**Theme.** Use the existing tokens. Add a `.dark { … }` token block and
`@custom-variant dark (&:where(.dark, .dark *));` to `styles.css`, and a `next-themes`
`ThemeProvider` (the package is installed but only used by sonner today). The ORISO accent is
the existing `.domain-oriso-org` class on the Hub root, which sets `--domain-color` to
oklch(0.56 0.18 25). That matches the old hub's `#A5231D` and is used for active nav items,
step numbers and the "kit" badge.

**Freshness footer.** Every page ends with `Separator` + a muted line:
`Generated from kit 0.4.2 (2026-09-10) · sources: rules/team/team-directory.md, …`.
Each source is a `Tooltip` showing the file's sha256 prefix from `manifest.files`.

**Components to add** (`npx shadcn add`): `sidebar`, `breadcrumb`, `accordion`,
`scroll-area`, `collapsible`, `kbd`. **Components to reuse:** card, table, tabs, badge,
command, sheet, alert, tooltip, separator, select, toggle-group, empty, skeleton, button,
popover, sonner, `copy-button`. No new data-grid library: with about 20 rows,
`Table` + `ToggleGroup` + `Input` is enough.

### 4.1 Start here (`/understand/`)

```
┌ Sidebar ─┬───────────────────────────────────────────────────────────────────────┐
│ ● Start  │ Understand › Start          [⌘K Search…]  Viewing as [shazia-k ▾]  ◐ │
│   Deliver├───────────────────────────────────────────────────────────────────────┤
│   Review │ ORISO Dev Hub                        [Kit 0.4.2 · 2026-09-10] [canary │
│   Envs   │ How we ship to Dev — same rules your agent reads.       0.4.3: shazia]│
│ ──────── ├───────────────────────────────────────────────────────────────────────┤
│   Skills │ YOUR NEXT PR                                                          │
│   Kit    │ (1) Branch off dev → (2) PR → dev → (3) Reviewers at open →           │
│ ──────── │ (4) Never self-merge → (5) Test on Dev, say so → (6) Planned only     │
│   People │ Board: [In progress]→[In review]→[On Dev]→[QA]            [Details →] │
│   Chan.  ├──────────────────────┬──────────────────────┬────────────────────────┤
│   Me     │ WHO REVIEWS?         │ WHERE DO I POST?     │ AM I CURRENT?          │
│          │ Repo [UserService ▾] │ PR review  #…codere… │ Served: 0.4.2          │
│          │ → Shirloin, Hassan92…│ Bug        #…bugfix  │ $ kit-subscribe  [⧉]   │
│          │ $ gh pr edit … [⧉]   │ Deploy     #…deploy… │ expect "kit current"   │
│          │                      │ Standup    #…standup │ What's new in 0.4.2 ▸  │
│          ├──────────────────────┴──────────────────────┴────────────────────────┤
│          │ ENVIRONMENTS  [local·you] [Dev·Hassan/deploy] [Stage·release]         │
│          │ ⚠ Pre-Dev is Frank's environment — no developer deploy.               │
│          ├───────────────────────────────────────────────────────────────────────┤
│          │ SKILLS ON EVERY MACHINE (6)                        [All skills →]     │
│          │ [oriso-delivery] [oriso-graph] [board-triage] [code-archaeology] …    │
│          ├───────────────────────────────────────────────────────────────────────┤
│          │ ELSEWHERE  Graph dashboards · Storybook FE · Storybook Admin · Case H.│
│          │ Generated from kit 0.4.2 · 7 sources                                  │
└──────────┴───────────────────────────────────────────────────────────────────────┘
```

- **Header:** `Card` with `border-l-4 border-[var(--domain-color)]`. Version shown as `Badge`
  (default style), canary as `Badge variant="outline"`. A `Tooltip` lists the handles that
  have the canary.
- **"Your next PR":** an ordered list of 6 small `Card`s (`grid sm:grid-cols-2 lg:grid-cols-6`),
  numbered in the accent colour. Step 4 carries a destructive `Badge` "never". The board chain
  is `Badge variant="secondary"` items joined by lucide `ChevronRight`.
- **Three quick cards** (`md:grid-cols-3`). Each is the smallest working version of its full
  page, and each ends with a `Button variant="link"` to that page.
- **Environments strip:** 4 `Badge`s, followed by an `Alert` for Pre-Dev (not the destructive
  style — it is a rule, not an error).
- **Skills row:** kit skills as `Badge variant="outline"` chips. Clicking one opens the
  skill's detail `Sheet`, the same one used on `/skills`.

### 4.2 Skills catalogue (`/understand/skills`)

```
Skills                                    [Kit 6] [Library 8] [Method 5] [Personal ⓘ]
[ Filter skills…            ]   ToggleGroup: (All)(Kit)(Library)(Method)
┌───────────────────────┬─────────┬──────────────────────────────┬─────────────────┐
│ Skill                 │ Source  │ What it does                 │ Reach for it    │
├───────────────────────┼─────────┼──────────────────────────────┼─────────────────┤
│ oriso-delivery        │ [kit]   │ Branch off dev, PR to dev, … │ Work becomes a  │
│ oriso-board-triage    │ [kit]   │ Board column vs branches …   │ Before trusting │
│   by shazia-k · refs 2│         │                              │ a board column  │
│ code-archaeology  ✓ev │ [kit]   │ Finds work that already …    │ "This worked …" │
│ work-through          │ [lib]   │ Works a parent issue to done │ copy to local/ ▸│
│ tdd                   │ [method]│ Red–green–refactor           │ —               │
└───────────────────────┴─────────┴──────────────────────────────┴─────────────────┘
Row click → Sheet (right, sm:max-w-xl):
  oriso-board-triage   [kit] [Claude Code ✓] [Codex ✓] [Cursor —]
  Frontmatter description (full text)
  Tabs: [How you get it] [SKILL.md] [References]
  How you get it: "Installed by install.sh into .claude/skills and ~/.codex/skills.
                   Adapt: $ kit-local adapt skills/oriso-board-triage/SKILL.md [⧉]"
```

- **Source badges** show one meaning each. *kit* = on every machine and auto-updated (solid,
  accent colour). *library* = on the server; copy it into `local/skills/` to use it
  (`secondary`). *method* = Matt Pocock vendor skill (`outline`). *personal* = never listed;
  a `Popover` explains where personal skills live (`local/skills/`, `devs/<you>/`).
- A row's action is based on its source. Kit skills: "installed". Library skills: a copy
  command. Method skills: "run `setup-matt-pocock-skills` once" (text from the README).
- The **SKILL.md tab** shows the body rendered at build time with `marked`, with raw HTML
  stripped, inside a `ScrollArea`. Because it renders the kit's own file, it cannot drift.
- A small "has evals" indicator (`✓ev`) comes from `evals/evals.json`, and "refs N" from
  `references/`.
- `/understand/skills/<name>` opens the sheet directly, so a Slack message can link to one
  skill.

### 4.3 Review (`/understand/review`), including the picker

```
Pick reviewers
Repo [ORISO-UserService ▾]  Author [shazia-k ▾ (= viewing as)]  [✓] touches deploy/K8s/config
┌─────────────────────────────────────────────────────────────────────────────┐
│ Shirloin   (pool)                                                           │
│ Hassan9215 (core fallback — pool minus author < 2; shanzaeimran excluded)   │
│ + Hassan9215 is required: deploy-relevant → add deploy-impact note to body  │
│ $ gh pr edit <N> --repo OpenResilienceInitiative/ORISO-UserService \        │
│     --add-reviewer Shirloin,Hassan9215                                  [⧉] │
└─────────────────────────────────────────────────────────────────────────────┘
Routing table (Table): Repository | Primary reviewers (Badges, lead marked ★) | Never
Deployment routing (Table): Situation | Who | What the agent does
```

- The picker is a pure function over the routing data (§5): the pool minus the author,
  minus excluded people. If fewer than 2 remain, fill from the core list in order. Cap at 3.
  If "deploy-relevant" is ticked, add `Hassan9215`. Each result shows *why* that person was
  picked as a muted line, so the rule is visible and not a black box. The output command
  uses `copy-button`.
- The Jonas row shows `Badge variant="outline"` "suggest only". The Pre-Dev row links to
  `/environments`.

### 4.4 Other sections, briefly

- **Deliver:** a numbered `Card` per step, including any inline command from the rule text
  (code chip + copy). "Keep the ticket honest" is a checklist-style list, shown read-only.
  "Release discipline" is an `Alert` naming the roles (Björn, Frank, Christoph) who move
  issues into a release.
- **Environments:** `Table` with columns Where / What it is / Who deploys / Developer may
  deploy (`Badge` yes/no). Dev links to `dev.oriso.org/admin` and `/auth`. Stage shows "URL
  not in kit" rather than a guess. Below it, an `Accordion` "If Frank sends you to Pre-Dev"
  with the record-and-restore procedure.
- **People:** `Tabs` for "Developers (6)" and "Roles around the team". Developers appear as
  cards (`md:grid-cols-2 xl:grid-cols-3`): name, GitHub (link to profile), Slack handle
  (links to `sunflowercare.slack.com/team/<ID>`), role, repositories as badges, review role,
  and an `Accordion` "Notes for agents" from `rules/devs`. Roles (Björn, Christoph, Jonas)
  carry `Badge` "not a default reviewer". Kio carries "service — never a human approval".
- **Channels:** `Table` with Purpose / Channel (link to `sunflowercare.slack.com/archives/<ID>`)
  / note. The misspelling gets a `Tooltip`. Above it, an `Alert`: "Agents draft, people send.
  English only."
- **Kit:** a version `Card` (served version, date, canary). The changelog is an `Accordion`
  with the newest entry open and each entry's version as a `Badge`. **Install/update** uses
  `Tabs` for Claude Code / Codex / Cursor. Each tab has numbered command blocks with copy.
  Cursor shows an `Alert`: "Cursor reads `AGENTS.md`; the kit does not wire Cursor skills yet"
  (Q5). Troubleshooting is an `Accordion`, one item per symptom. **Am I current** has a
  `kbd`-styled `kit-subscribe` command and the exact line it prints (`kit current (version X)`),
  plus an optional "My version" `Input`. It is stored locally and shows a `Badge`
  "current / N versions behind" along with the changelog entries you missed. This uses no
  telemetry.
- **Me:** your `rules/devs/<handle>.md` rendered; the `local/` tree as a `pre` block; your
  server folder path `/srv/dreambau/agent-skills/devs/<account>/`; and "how to change your
  rules file" from `rules/devs/README.md`.

**Global search (⌘K):** a `CommandDialog` (cmdk, already installed) with the groups Skills,
People, Repos, Channels, Commands and Pages. Selecting a skill opens its sheet. Selecting a
command copies it and shows a sonner toast. Items come from the same Hub data, so there is
no second index.

**States:** `Skeleton` while loading, `Empty` for no filter match, destructive `Alert` if
the Hub data is missing or mismatches the served manifest (§5) — never stale content.

## 5. Data model and generation

**Where it is generated.** A generator script `scripts/build-hub-data.ts` reads the kit
directory and writes `understand-kit/dist/hub-<version>.json`. It runs in the same Docker
`kit` stage that builds the bundle. It parses Markdown tables by their column headers, reads
SKILL.md frontmatter, reads `manifest.json`, validates everything with zod, and **fails the
build** if a table shape changes. A vitest test runs it against the real kit folder. The
server serves the file only if `hub.kit.version === manifest.version`. The Hub therefore
reads exactly the kit that the endpoint hands to agents, and never the authoring copy. That
is why a canary version cannot show up as "current" for everyone.

```ts
type Handle = string;                       // GitHub login, e.g. "shazia-k"
type SkillSource = "kit" | "library" | "method";
type Tool = "claude-code" | "codex" | "cursor";

interface HubData {
  schema: 1;
  generatedAt: string;                      // ISO
  kit: KitInfo;
  delivery: { steps: DeliveryStep[]; ticketHygiene: string[]; boardFlow: string[] };
  environments: Environment[];
  skills: Skill[];
  people: Person[];
  routing: ReviewerRouting;
  deployRouting: { situation: string; who: string; agentAction: string }[];
  channels: Channel[];
  commands: CommandSnippet[];
  links: { label: string; href: string; group: "graph" | "storybook" | "features" | "docs" }[];
  sources: { path: string; sha256: string }[];   // from manifest.files, shown in footers
}

interface KitInfo {
  name: string; version: string; date: string;
  changelog: { versions: string[]; date: string; summary: string }[]; // "0.4.1/0.4.2" → 2 versions
  canary?: { version: string; handles: Handle[] };                     // Q2
}

interface DeliveryStep { n: number; title: string; detail: string; commands: string[]; never?: boolean }

interface Environment {
  key: "local" | "dev" | "stage" | "predev"; label: string; urls: string[];
  description: string; deployedBy: string; developerMayDeploy: boolean;
}

interface Skill {
  name: string; source: SkillSource;
  oneLiner: string; reachFor?: string;      // skills/README.md tables
  description?: string;                     // SKILL.md frontmatter (kit only)
  author?: Handle;                          // new optional frontmatter field
  hasEvals: boolean; references: string[];
  bodyHtml?: string;                        // kit only, rendered at build, raw HTML stripped
  wiredInto: Tool[];                        // kit: ["claude-code","codex"]
}

interface Person {
  handle: Handle; name: string;
  kind: "developer" | "role" | "service";
  slack?: { handle: string; id: string };
  role: string; repos: string[]; reviewRole?: string;
  agentNotes: string[];                     // rules/devs/<handle>.md → "Notes for an agent"
  serverAccount?: string;                   // → devs/<account>/ folder path only
}

interface ReviewerRouting {
  min: 2; max: 3;
  corePool: Handle[];                       // order matters for fallback
  deployReviewer: Handle;                   // "Hassan9215"
  repos: { repo: string; reviewers: Handle[]; lead?: Handle; never: Handle[] }[];
}

interface Channel { name: string; id: string; purpose: string; note?: string }

interface CommandSnippet {
  id: string; label: string; command: string;
  tool: Tool | "any"; when: "install" | "update" | "graph" | "local" | "review";
}
```

**Small kit-side changes** these need (each a one-line edit in the kit, not in the Hub):

1. Add a `Never` column to the reviewer routing table. Today the Shanzae/UserService
   exclusion is only an italic note that the generator cannot read reliably.
2. Add an optional `author:` frontmatter field to SKILL.md files. Today only
   `oriso-board-triage` names its author, in prose.
3. Add `pages/links.json`, replacing the URLs hand-written in `index.html`.
4. Fix a contradiction: `oriso-board-triage` says its authoring copy is the server library,
   but `kit-publish.sh` says the kit is the source and the server library is only a mirror.
   The Hub will show whichever source is correct, so the two must agree first.

## 6. Access and privacy

- **Who can open it:** anyone with a human session (passkey or email-OTP, the existing
  `requireActiveHumanSession`) **and** `user.projects.includes("oriso")`. Machine tokens do
  not open the Hub. Agents already get the kit itself; the Hub is for people.
- **Routing detail:** the router at `/understand/api/v1` applies machine auth to every path
  under it. The Hub's data route must therefore sit outside it, e.g. `GET /understand/hub/data`.
  The SPA goes at `/understand/*` (a second Vite HTML entry; assets can stay under the
  existing `/testmails/` base). Response headers: `Cache-Control: no-store`,
  `X-Robots-Tag: noindex`, and a CSP modelled on `docs-mirror.ts`.
- **What may be shown:** names, GitHub handles, Slack handles and IDs, roles, repositories,
  reviewer routing, channel names and IDs, public environment URLs, kit version and
  changelog, commands with placeholders (`<N>`, `<your-handle>`), and the server folder path
  pattern.
- **What must never appear:** email addresses (including anything from `/auth/users` or
  `/auth/me`); tokens, token hashes or `Authorization` values; machine identity names such as
  `<name>-mbp-oriso`, because they reveal devices; last-used timestamps per identity;
  Infisical project or key values; Basic-Auth credentials; internal SSH aliases or hostnames
  (`m4dreambau`, `predev`); anything from someone's `~/.oriso-dev-kit/local/`; Frank's
  personal or vault material. **The former-contributor ignore list also stays agent-only.**
  It is needed for routing, but a team page should not name the people who left.
- **Build-time guard:** the generator runs the kit's existing `SECRET-SCAN.md` patterns plus
  an email regex over the Hub data, and fails the build on any hit.

## 7. Out of scope for v1

- Legal/DSFA and Operations (refresh logs, health) from the old hub. Those are for Frank and
  auditors, not shared developer material.
- Writing or editing feature explainer pages. v1 only links to them.
- Any write action: editing rules, moving board items, posting to Slack, requesting reviewers
  (the picker only produces a command).
- Live GitHub data, graph freshness, per-person kit versions, server library contents (P2);
  a German UI, public/marketing content, Frank-personal material.

## 8. Open questions for Frank

1. **Location:** should `/understand/` replace the German `pages/index.html` as the start
   page, with the old Features, Architecture and Code sectors kept as link cards? Or should
   the Dev Hub be a tab inside `/testmails`?
2. **Canary:** add a `canary: { version, handles }` field to `manifest.json`, so the Hub can
   honestly show "0.4.3 for Shazia, 0.4.2 for everyone"? Or should canaries not appear at all
   until they are served to everyone?
3. **Library listing:** mount `/srv/dreambau/agent-skills/` read-only into the pod so
   `custom/` and `devs/` are listed live? Or keep the hand-maintained library table in
   `skills/README.md`, which can drift from the server's "What is in custom/" table?
4. **Version telemetry:** may `kit-subscribe` send its local version, so the Hub can show who
   is behind? Or keep "am I current?" as a self-check only?
5. **Cursor:** should the kit wire Cursor (for example, a `.cursor/rules` pointer to
   `AGENTS.md`)? Or should the Hub state "Cursor: AGENTS.md only"?
6. **Prompts:** who translates the five German `prompts/*.md` into English? The P1 Prompts
   section is blocked until then.
