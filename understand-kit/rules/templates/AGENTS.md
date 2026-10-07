# <ORISO-Repo-Name> — Agent instructions

> Template. Copy to the repository root as `AGENTS.md`, fill in the two placeholder
> sections, and keep it the **single source of the working rules**. `CLAUDE.md` and any
> Codex configuration only point here and add genuine tool-specific features — nothing may
> work with one agent only.

## Besonderheit dieses Repos

<!-- PLACEHOLDER — replace with 3–8 lines. What makes THIS repository different?
     Examples of what belongs here:
       - build/verify commands (`npm ci && npm run lint && npm test && npm run build`,
         `./gradlew build`, …)
       - the repository's own hard rules (e.g. "lint:css is check-only and blocks the PR",
         "Liquibase is enabled since 14.08.", "prettier must run on every staged path")
       - traps a newcomer will hit (env.js shadowing .env, i18n key guard, worktree deps, …)
       - where this repository's own ADRs live
     Do NOT repeat the generic working rule below, and do NOT restate the branch policy —
     it is the same for every repository and lives in the shared block. -->

## Kit subscription

This repository's working rule comes from the ORISO Understand Kit. To install or refresh it:

```bash
bash ~/.oriso-dev-kit/install.sh      # or: bash <path-to>/understand-kit/install.sh
ua-pull --verify                      # prints graph freshness
kit-local status                      # your own adaptations, if you have any
```

The kit installs `ua-pull` and `kit-local` to `~/.local/bin`, pulls `.understand-anything/*`
for this repository plus the cross-service platform graph, links the kit skills into
`.claude/skills/` and `~/.codex/skills/`, and (for agents that support it) registers the
Storybook MCP servers. Secrets are never stored in files — they are read at runtime from
Infisical (`https://secrets.dreambau.com`, project "ORISO Test Access", env `pre-dev`).

<!-- Everything below this line is the shared working rule from
     understand-kit/rules/AGENTS-block.md. Keep it verbatim so an update to the kit can be
     re-applied mechanically. -->

---

# ORISO working rule — delivery, knowledge graph, ADRs, Storybook

## How work reaches Dev

The flow the team agreed on 2026-08-31 and has run since. `dev` is the integration branch.

1. **Branch off `dev`.** Never implement on `dev` itself. Name the branch after the ticket.
2. **The PR targets `dev`.** Not `pre-dev`, not `main`. `main` is the release branch and is
   only touched by a release. If you find an older open PR still pointing at `pre-dev`,
   retarget it to `dev` unless there is a stated reason to keep it.
3. **Request reviewers in the same step that opens the PR.** A PR without requested
   reviewers is not open for review. Pick 2–3 from the repository's reviewer routing,
   excluding yourself. `gh pr edit <N> --repo <owner/repo> --add-reviewer a,b,c`
4. **An agent never merges a pull request.** Not when CI is green, not when the user says
   "finish it", not for chores or test-only changes. Merging is a human act and the
   developers decide which PRs land and when. Merge only on an explicit, per-PR instruction
   naming that PR.
5. **After the merge is deployed to Dev, test it on Dev** and say so in the ticket. If it
   broke something, the team decides between a rollback and a quick fix — do not decide that
   alone.
6. **Release discipline.** Work on the issues planned for the current release. Nothing gets
   merged that is not planned for it. Do not move an issue into a release yourself — ask
   Björn, Frank or Christoph. When a release goes to Stage, its tickets move to
   "QA external / Stage", and the person doing the release moves them.

### Keep the ticket honest

The board is how everyone else sees the state of the work, so it is part of delivery, not
paperwork after it:

- Assign the issue to yourself while you work on it, or to whoever reviews or QAs it.
- Comment on the issue when you finish a review and when the PR is merged.
- Comment again once you have tested it on Dev.
- Keep the board status current: in progress → in review → on Dev → QA.

## Environments

| Where | What it is | Who deploys |
|---|---|---|
| local | your stack. Where you develop and test first. | you |
| **Dev** — `dev.oriso.org` (`/admin`, `/auth`) | the integration environment, built from `dev`. Where a merged change is verified and where QA looks. May be briefly unstable; Stage is the stable one. | the deploy process / Hassan |
| Stage | the stable environment for demos and external QA, cut as a release. | the person doing the release |
| **Pre-Dev** — `predev.oriso.org` | **Frank's environment.** Not part of the developer process. | Frank |

**Pre-Dev is not yours to deploy to.** Do not swap an image, mutate config or data, or run a
test deployment there on your own initiative — an agent needs an explicit, per-task
instruction from Frank naming Pre-Dev. Test locally, and after merge on Dev. If Frank does
send you there: record the previous image reference and its `imagePullPolicy` first, put both
back before you report the work done, and say in the report what you swapped and restored.
A leftover image with `imagePullPolicy: Never` silently freezes the cluster on stale code for
everyone else.

**Report where it was verified.** Every PR body states the environment and the image the
change was exercised on, or says plainly that it was only tested locally. A reviewer must
never have to guess how much verification already happened.

## Before you write code

1. **Check the ticket against the graph.** Read `.understand-anything/knowledge-graph.json`
   for the affected files, functions and endpoints. For cross-service questions ("which
   frontend function calls this endpoint", "which service owns this table") read
   `.understand-anything/platform-graph.json`, the cross-service ORISO-Platform graph.
   Grep the `"name"` and `"summary"` fields for the ticket's keywords; do not load the whole
   file, and do not start from a `grep` over the entire source tree.
2. **Check the ADRs.** The platform graph links ADRs (`document` nodes, `governs` edges) to
   services. If an ADR governs what you touch, follow it or stop and raise the conflict — do
   not silently deviate. Platform ADRs live in `ORISO-Docs/oriso-platform/decisions/`;
   code-adjacent ADRs sit beside their repository. The numbering drifts between the two —
   link by name, not by number.
3. **UI components only via Storybook.** Never guess props. Query the Storybook MCP server
   (`docs-list`, `docs-show`, `docs-show-story`, `stories-find-by-component`,
   `stories-changed`, `stories-preview`) for ORISO-Frontend and ORISO-Admin; after changing a
   component or story, run `stories-preview` and include the preview URL in your report. HTML
   mockups become stories via the "HTML → Story" prompt (`prompts/html-to-story.md`).
4. **Freshness is printed, not assumed.** Run `ua-pull --verify`. It shows the graph's branch,
   commit, date (shallow structure: refreshed on demand from `dev`) and the depth date
   (concepts/flows/tour: date of the last deep run). If the shallow date is older than 24 h,
   run `ua-pull` first. Never edit or commit files under `.understand-anything/`.
5. **Report with evidence.** Reference node IDs, endpoint names and ADR names from the graph
   in your PR description; include Storybook preview URLs for UI work.

## What the graph can and cannot do

- Only `calls` edges are confirmed. `calls_unconfirmed` edges (wildcard or method-unknown
  matches) are hints — name them as hints or leave them out, never present one as "X calls Y".
- An endpoint without a caller edge means "no edge found", **not** "unused". Say so; do not
  infer an edge.
- The graph is a snapshot from its build commit (`meta.json` → `gitCommitHash`), not a live
  tracer.
- A commit reachable from `dev` does not prove the artefact is on `dev` — a sync branch can
  carry a merge commit whose content was reverted on the way in. Verify the file, the symbol
  or the removed line with `git ls-tree` / `git grep`, not with ancestry alone.
- Do not run a local LLM graph rebuild inside an ORISO repository — graphs are pulled by
  `ua-pull`; a local rebuild burns tokens and diverges.

## Where to ask, and in which channel

Slack workspace `sunflowercare.slack.com`. Two projects share it: ORISO channels start with
`oriso-`, WeCare Remote channels with `wcr-`. Always disambiguate before posting.

| Purpose | Channel |
|---|---|
| PR / code-review request | `#oriso-codereview` |
| Bug intake with screenshots | `#oriso-bugfix` |
| Functional / QA review | `#oriso-functionalreview` |
| Deployment | `#oriso-deployement` *(name is misspelled in Slack)* |
| Architecture | `#oriso-architecture` |
| Dev team, general | `#oriso-dev-team` |
| Standup | `#oriso-daily-standup` |

**Never post automatically.** An agent drafts the message and shows it to its user; a person
sends it. Everything written for the team — issues, PRs, comments, commits, branch names,
Slack messages — is in English. German product terms (Träger, Beratungsstelle) stay as quoted
terms inside English prose.

## Never manufacture review evidence

You may hold credentials that can approve a PR, dismiss a review or override a check. Do not
use them to clear a gate. The gate exists so that a *person* validated the change. Report
which PRs need an approval and from whom, and let a human click.

## Agent-specific conveniences (optional, never required)

These are shortcuts for the same steps above. An agent without them follows the file-and-MCP
path and reaches the same result.

- **Claude Code:** the Understand-Anything plugin adds `/understand-chat`, `/understand-diff`
  and `/understand-onboard`; the `oriso-graph` skill adds `/oriso-graph <question>` and
  `oriso-delivery` carries the flow above; a `SessionStart` hook can run `ua-pull --verify`
  automatically. See the repository's `CLAUDE.md`.
- **Codex:** reads `AGENTS.md` natively — this block is already the instruction. The kit
  installs the same skills into `~/.codex/skills/`. See `rules/templates/codex.md` for the
  token and environment setup.

## Your own rules

Your personal working rules — the things that are true for you and not for the team — live in
two places that a kit update never overwrites:

- `~/.oriso-dev-kit/local/` on your machine: your own rules, prompts and skills. The
  subscription replaces the kit around it and leaves this directory alone.
- `rules/devs/<your-handle>.md` in the kit: what the team should know about how you work
  (your repositories, your review role, anything an agent should do differently for you).

Read `rules/local/README.md` for how the overlay is applied.
