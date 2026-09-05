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
       - the repository's own hard rules (e.g. "PRs target `pre-dev`, never `dev`",
         "lint:css is check-only and blocks the PR", "Liquibase is enabled since 14.08.")
       - traps a newcomer will hit (env.js shadowing .env, i18n key guard, worktree deps, …)
       - where this repository's own ADRs live
     Do NOT repeat the generic working rule below. -->

## Kit subscription

This repository's working rule comes from the ORISO Understand Kit. To install or refresh it:

```bash
bash ~/.oriso-dev-kit/install.sh      # or: bash <path-to>/understand-kit/install.sh
ua-pull --verify                      # prints graph freshness
```

The kit installs `ua-pull` to `~/.local/bin`, pulls `.understand-anything/*` for this
repository plus the cross-service platform graph, and (for agents that support it) registers
the Storybook MCP servers. Secrets are never stored in files — they are read at runtime from
Infisical (`https://secrets.dreambau.com`, project "ORISO Test Access", env `pre-dev`).

<!-- Everything below this line is the shared working rule from
     understand-kit/rules/AGENTS-block.md. Keep it verbatim so an update to the kit can be
     re-applied mechanically. -->

---

# ORISO working rule — knowledge graph, ADRs, Storybook

Before you write code for a ticket in any ORISO repository:

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
   component or story, run `stories-preview` and include the preview URL in your report.
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
- Do not run a local LLM graph rebuild inside an ORISO repository — graphs are pulled by
  `ua-pull`; a local rebuild burns tokens and diverges.

## Agent-specific conveniences (optional, never required)

- **Claude Code:** the Understand-Anything plugin adds `/understand-chat`, `/understand-diff`
  and `/understand-onboard`; the `oriso-graph` skill adds `/oriso-graph <question>`; a
  `SessionStart` hook runs `ua-pull --verify` automatically. See `CLAUDE.md`.
- **Codex:** reads this file natively — the block above is already the instruction. Token and
  environment setup: `understand-kit/rules/templates/codex.md`.
