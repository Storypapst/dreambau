# ORISO working rule — knowledge graph, ADRs, Storybook

> Paste this block into a repository's `AGENTS.md`. It is the **single source** of the
> working rule and must stay tool-neutral: every step below is expressed as a file to read
> or an MCP tool to call, so Claude Code, Codex and any other coding agent can follow it.
> Agent-specific conveniences (slash commands, plugins, hooks) are listed at the end as
> *examples only* — never as a requirement.

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
- Do not run a local LLM graph rebuild inside an ORISO repository — graphs are pulled by
  `ua-pull`; a local rebuild burns tokens and diverges.

## Agent-specific conveniences (optional, never required)

These are shortcuts for the same steps above. An agent without them follows the file-and-MCP
path and reaches the same result.

- **Claude Code:** the Understand-Anything plugin adds `/understand-chat`, `/understand-diff`
  and `/understand-onboard`; the `oriso-graph` skill adds `/oriso-graph <question>`; a
  `SessionStart` hook can run `ua-pull --verify` automatically. See the repository's
  `CLAUDE.md`.
- **Codex:** reads `AGENTS.md` natively — this block is already the instruction. See
  `rules/templates/codex.md` for the token/environment setup.
