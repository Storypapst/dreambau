---
name: oriso-graph
description: Answer ORISO code and architecture questions from the Understand-Anything graphs (repo graph + cross-service ORISO-Platform graph) and enforce the working rule "ticket → graph + ADRs → Storybook → code". Use before implementing any ORISO ticket, for "which function calls which endpoint", "which service owns this table", "which ADR governs this", onboarding questions, or when the user says /oriso-graph.
---

# ORISO Graph — query and working rule

Classification: generalizable method (any coding agent); the slash-command form is Claude-specific.

## Working rule (before writing code for a ticket)

1. **Graph first.** Query the repo graph and the platform graph (below) for the files,
   functions, endpoints and tables the ticket touches. Do not start from `grep` over the
   whole tree.
2. **ADRs second.** Every `document` node with `governs` edges to what you touch is binding.
   Follow it or stop and raise the conflict in the ticket — never deviate silently.
   Platform ADRs: `ORISO-Docs/oriso-platform/decisions/`; code-adjacent ADRs sit beside their
   repo (numbering drifts between the two — link by name, not number).
3. **UI only via Storybook.** Props come from the Storybook MCP (`docs-show`,
   `stories-preview`), never from guessing. Rules and hosts: `skills/storybook-routing/SKILL.md`
   and `skills/oriso-frontend-component-discipline/SKILL.md`.
4. **Freshness is printed, not assumed.** Run `ua-pull --verify` (Dev-Kit). Shallow structure
   is refreshed on demand from `dev`; the depth (concepts, flows, tour) carries its own date.
   If the shallow graph is older than 24 h, run `ua-pull`. Never edit or commit files under
   `.understand-anything/`.
5. **Evidence in the PR.** Cite node ids, endpoint names and ADR names from the graph; add
   Storybook preview URLs for UI work.

## Files

- Repo graph: `<repo>/.understand-anything/knowledge-graph.json` (+ `meta.json`:
  `gitCommitHash`, `analyzedAt`).
- Platform graph: `<repo>/.understand-anything/platform-graph.json` — 17 services, ~290 own
  backend endpoints (`exposes`) plus consumed/external contracts (`consumes`), `calls`
  (frontend/admin function → endpoint; only method-exact literal matches — weaker matches are
  `calls_unconfirmed` and must be treated as hints, not facts), `owns` (service → table),
  `governs` (ADR → **service**; there are no endpoint-level governs — say "governs the service"
  and never claim an ADR binds a specific endpoint), `documents` (docs page → service),
  `deploys` (Helm → service), `depends_on` (service → service; `metadata.evidence` says calls
  and/or bundled spec). Node ids are prefixed `<Repo>::`. Counts live in `metadata.stats`,
  input commits in `metadata.sources` (both top-level keys of the graph, not under `project`).
- Source of truth for both: the on-demand build on predev
  (`ssh predev /opt/oriso-understand/_rebuild/ua-refresh.sh`). `https://understand.oriso.org`
  is the separate nightly pipeline's dashboard for humans — not what `ua-pull` delivers.

## How to answer a question

1. Resolve `UA_DIR=.understand-anything` in the repo root; check both graph files exist
   (else tell the user to run `ua-pull`). Read only `meta.json`, `depth.json` and the platform
   graph's top-level `metadata.sources` for freshness; print them in one line.
2. Grep, don't load: search `"name"` and `"summary"` fields for the question's keywords in
   **both** files; collect node ids.
3. Follow edges one hop in both files: `calls`, `exposes`, `owns`, `governs`, `documents`,
   `depends_on`; for repo-local detail use `imports`/`contains`.
4. Answer with: the concrete nodes (file paths, endpoint `METHOD /path`, table names), the
   cross-service chain (function → endpoint → service → table), the governing ADRs with
   their file paths, and which layer each node belongs to. Say explicitly when the graph
   has no edge for something (e.g. an endpoint without callers) instead of inferring one.
5. Only `calls` edges are confirmed. `calls_unconfirmed` edges (wildcard or method-unknown
   matches) are hints: name them as such or leave them out — never present one as "X calls Y".

## Do not

- Do not run the plugin's `/understand` LLM rebuild inside ORISO repos — graphs come from
  predev; a local rebuild burns tokens and diverges.
- Do not treat the 36 MB `ORISO-Supergraph` or `oriso-super-graph-detailed.json` as input;
  they are dashboard artefacts.
- Do not put secrets, hostnames with credentials, or tokens into graph files or this skill.
