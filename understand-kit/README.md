# ORISO Understand Kit

The subscribable source of ORISO's **working rules, prompts and graph tooling**. It lives in
the `dreambau` monorepo (not in a repo of its own, not on docs.oriso.org) and is served to
developers and agent sessions through a token-protected bundle endpoint on the Dreambau app.

**Public is *what* is built, not *how*.** docs.oriso.org stays product documentation and the
Understand dashboards stay open — reading the code is fine for anyone. Prompts, working
rules, workarounds and evidence are process, and a workaround named in a prompt is an attack
surface. So everything in this folder is private and reached only through a login.

## Zweck

One place Frank edits; every developer and every Claude/Codex session pulls the current
state. Local copies are a cache, never the source.

## Abo-Mechanik

```
Frank changes a prompt / rule / template
   → understand-kit/ in the dreambau monorepo
   → build-bundle.sh: version + manifest.json (sha256 per file) + dist/*.tar.gz
   → Dreambau serves the bundle behind a per-person/per-machine bearer token
   → session start: compare local manifest.version with the served one
        → newer? download + unpack to ~/.oriso-dev-kit/
        → then ua-pull (graph from predev)
   → the agent works with the current rules and a fresh graph
```

The client never merges: it replaces `~/.oriso-dev-kit/` wholesale. Repos point *into* that
directory (skill symlink, hook, `mcp-add.sh`), so one replaced directory updates every
checkout at once.

`manifest.json` is the contract: `version`, `date`, `changelog`, and a `files` array with a
`sha256` per file. A client that has `version` already does nothing; a client that downloads
can verify each unpacked file.

> **Status:** the bundle endpoint is live in the Dreambau app (concept step 7.3) —
> `GET /understand/api/v1/kit/manifest` and `GET /understand/api/v1/kit/bundle`. Running
> `install.sh` against a local copy of this folder still works and does the same thing; the
> endpoint only changes *where the copy comes from*.

## Abonnieren

### Was der Endpunkt anbietet

| Route | Antwort |
|---|---|
| `GET /understand/api/v1/kit/manifest` | `manifest.json` — `version`, `date`, `changelog`, `files[]` mit sha256. |
| `GET /understand/api/v1/kit/bundle` | `understand-kit-<version>.tar.gz` (`application/gzip`), `ETag` = sha256 des Archivs, `Content-Disposition` mit Dateinamen. `If-None-Match` mit dem gleichen ETag → `304`. Ist `dist/` nicht gebaut → `503 bundle_not_built`. |

Beides ist **read-only** und braucht einen Bearer-Token. Es ist derselbe Token-Mechanismus
wie bei der Test-Access-API (sha256-Hash, `timingSafeEqual`, `expiresAt`/`revokedAt`): ein
gültiger, nicht abgelaufener, nicht widerrufener Token darf lesen. Kein eigenes Scope-Feld —
ein Token, der die Test-Access-API erreicht, gehört per Definition zu einer Person oder
Maschine im Team. Ein fehlender oder ungültiger Token bekommt `401` ohne Details; Token-Werte
werden nirgends geloggt.

### Token

Der Token kommt zur Laufzeit aus der Umgebung oder aus Infisical — nie aus einer Datei in
einem Repository:

```bash
# Variante A: einmal einloggen, dann liest kit-subscribe den Token selbst
infisical login --domain https://secrets.dreambau.com --interactive
# Projekt "ORISO Test Access", Env pre-dev, Key ORISO_KIT_TOKEN

# Variante B: nur für diese Shell
export ORISO_KIT_TOKEN='<token von Frank>'
```

`ORISO_KIT_BASE` überschreibt die Basis-URL (Default
`https://dreambau.com/understand/api/v1/kit`), `ORISO_KIT_HOME` das Installationsziel
(Default `~/.oriso-dev-kit`).

### Der Abo-Aufruf

```bash
kit-subscribe                    # prüfen und bei neuerer Version aktualisieren
kit-subscribe --max-seconds 10   # dasselbe mit Zeitlimit (was der Hook nutzt)
bash install.sh --subscribe      # identisch, ohne den Wrapper
```

Der Ablauf: Manifest holen → `version` mit `~/.oriso-dev-kit/manifest.json` vergleichen → nur
bei **neuerer** Version das Bundle laden → jede Datei gegen die sha256 aus dem Manifest prüfen
→ erst dann nach `~/.oriso-dev-kit/` entpacken. Passt eine Prüfsumme nicht, wird **nichts**
installiert. Der Client merged nie, er ersetzt.

Der Aufruf ist absichtlich nie blockierend: kein Token, kein Netz, Endpunkt tot oder Bundle
nicht gebaut → eine Zeile Ausgabe, Exit ≠ 0, und die Sitzung läuft normal weiter.

### Hook (Claude Code) und Codex

`settings.hook.json` enthält zwei `SessionStart`-Hooks in dieser Reihenfolge:
`kit-subscribe --max-seconds 10` (Regeln und Prompts aktuell) und danach der bestehende
`ua-pull`-Check (Graph aktuell). `install.sh` merged sie idempotent in
`<repo>/.claude/settings.json`.

Codex hat keinen Session-Hook. `rules/templates/codex.md` enthält dieselben zwei Zeilen zum
Aufruf von Hand oder aus dem Shell-Profil.

## 5-Minuten-Setup

```bash
# 1. Get the kit (today: a checkout of this monorepo; later: the bundle endpoint)
cd <path-to>/dreambau/understand-kit

# 2. Optional but recommended — one login, so no credential ever lands in a file
infisical login --domain https://secrets.dreambau.com --interactive

# 3. Install, from inside the ORISO repo you want to work in
cd /path/to/ORISO-Frontend
bash <path-to>/dreambau/understand-kit/install.sh

# 4. Read the summary table: [ok] / [skipped] / [failed] per step, with the reason
```

Afterwards: `ua-pull --verify` prints graph freshness; `prompts/*.md` are ready to paste;
in Claude Code `/understand-chat`, `/understand-diff`, `/understand-onboard` and
`/oriso-graph` are available. Codex needs no registration — it reads the repository's
`AGENTS.md` natively (see `rules/templates/codex.md`).

`install.sh` copies the kit to `~/.oriso-dev-kit/` and works from there. Override the
location with `ORISO_KIT_HOME`.

## Portabilität — AGENTS.md ist die einzige Quelle

Nothing may work with Claude only.

- `rules/AGENTS-block.md` — the working rule "ticket → graph + ADRs → Storybook → code",
  written tool-neutrally: files to read, MCP tools to call. This is the block that goes into
  every ORISO repo's `AGENTS.md`.
- `rules/templates/AGENTS.md` — the repo template: the block plus a placeholder for **this
  repository's speciality** (build commands, branch policy, its own traps).
- `rules/templates/CLAUDE.md` — only "see AGENTS.md" plus genuine Claude Code features:
  the `oriso-graph` skill, the `SessionStart` hook, MCP server registration — and a
  placeholder for a Claude-specific speciality *if the repo has one*.
- `rules/templates/codex.md` — how Codex picks up `AGENTS.md` natively, and the one-time
  machine setup (token env, `ua-pull` call) in `~/.codex/`.

Rule of thumb for where something belongs: if it applies to every agent (a build command, a
branch policy, a trap), it goes in `AGENTS.md`. Only a real tool feature — a skill, a hook,
an MCP registration — goes in `CLAUDE.md` or the Codex file.

## Sicherheitsmodell

- **Nothing here is public.** Not on docs.oriso.org, not in a public repo. Access is through
  the Dreambau bundle endpoint with a revocable per-person/per-machine bearer token (the same
  mechanism as the Test-Access API) or a passkey for humans in the UI.
- **No secrets in files.** `ORISO_SB_MCP_AUTH` and `ORISO_UA_AUTH` are read at runtime from
  Infisical (self-hosted `https://secrets.dreambau.com`, project "ORISO Test Access", env
  `pre-dev`) or from the environment. The scripts reference variable *names*; no value, hash
  or token is stored anywhere in this folder. See `SECRET-SCAN.md`.
- **MCP servers are registered with `--scope user`, never `--scope project`** — project scope
  would write the Basic-Auth value into the repository's `.mcp.json`.
- **Never commit `.understand-anything/`.** `ua-pull` marks the files it manages
  `skip-worktree` (or adds them to `.git/info/exclude`) so a stray commit cannot leak a
  graph snapshot into a repository.
- **The kit performs no server action.** It copies local files and reads endpoints that are
  already running.

## Was jede Datei tut

| Datei | Zweck |
|---|---|
| `README.md` | This file: purpose, subscription mechanics, setup, security model. |
| `manifest.json` | Subscription contract — version, date, changelog, sha256 per file. |
| `build-bundle.sh` | Regenerates the manifest and packs `dist/understand-kit-<version>.tar.gz`. `dist/` is gitignored. |
| `install.sh` | Installs the kit to `~/.oriso-dev-kit/`, then wires plugin, MCP, `ua-pull`, skill symlink, hook and graph pull. Idempotent, with a summary table. |
| `ua-pull.sh` | Fetches `.understand-anything/{knowledge-graph,meta,fingerprints,depth,platform-graph}.json` via SSH or HTTPS; `--verify` reports freshness; `--unlock` releases `skip-worktree` before a `git pull`. Plain shell — agent-neutral. |
| `mcp-add.sh` | The two `claude mcp add` commands for the Storybook MCP servers, runnable on their own. |
| `kit-subscribe.sh` | The subscription check: wrapper around `install.sh --subscribe` with a wall-clock limit (`--max-seconds`). Installed as `~/.local/bin/kit-subscribe`. |
| `kit-local.sh` | Your own layer: `kit-local adapt/apply/status/drop`. Keeps personal changes to kit files across updates. Installed as `~/.local/bin/kit-local`. |
| `settings.hook.json` | A `SessionStart` hook snippet: first `kit-subscribe --max-seconds 10`, then `ua-pull --verify` (and pulls when stale). Merged into `<repo>/.claude/settings.json` by `install.sh`. |
| `.mcp.json.example` | Project-scoped MCP template — env-var reference only, no secret. |
| `rules/AGENTS-block.md` | The working rule, tool-neutral. Single source; paste into a repo's `AGENTS.md`. |
| `rules/templates/AGENTS.md` | Repo template: rule block + "Besonderheit dieses Repos". |
| `rules/templates/CLAUDE.md` | Repo template: pointer to `AGENTS.md` + Claude-only features. |
| `rules/templates/codex.md` | How Codex reads `AGENTS.md`; one-time `~/.codex/` setup. |
| `rules/devs/<handle>.md` | One file per developer: repositories, review role, what an agent should do differently for that person. Ships to everyone. |
| `rules/local/README.md` | How the personal overlay in `~/.oriso-dev-kit/local/` works. |
| `skills/oriso-delivery/SKILL.md` | Branch, PR target, reviewers, merge rules, environments, board hygiene. |
| `skills/oriso-graph/SKILL.md` | The graph-query skill (linked into `.claude/skills/` and `~/.codex/skills/` by `install.sh`). |
| `skills/oriso-board-triage/` | Board column vs. branch reality (Shazia Kausar). Authoring copy: the shared library on the server. |
| `prompts/*.md` | Five ready prompts: ticket check, onboarding, build a component, HTML → story, story → HTML. |
| `pages/features/case-handover.html` | First feature explainer page (Legal-page style): how Case Handover works — flow, endpoints, ADRs, known gaps. Template for further feature pages. |
| `SECRET-SCAN.md` | Result of the secret scan over this folder. |

## Freshness-Aussage

> The shallow overview (structure, functions, endpoints, ADRs as nodes) is refreshed on
> demand from `dev` — the date is in `meta.json`, checkable with `ua-pull --verify`. The
> depth (concepts, flows, tour) carries its own date in `depth.json`; deep run 04.09.2026 for
> the active repos (Frontend, Admin, UserService, AgencyService, TenantService,
> ConsultingTypeService, Docs). `depth.json` in the repo is always authoritative.

## Was der Graph kann / nicht kann

- **Repo graph** (`knowledge-graph.json`): file, function and endpoint detail for **one**
  repository — `imports`, `contains`, `calls`/`exposes` within that repository.
- **Platform graph** (`platform-graph.json`): the cross-service view — services, backend
  endpoints, `calls` (frontend/admin function → endpoint), `owns` (service → table),
  `governs`/`documents` (ADR/doc → service), `deploys` (Helm → service), `depends_on`
  (service → service, weight = call count).
- **What it does not do:** an endpoint with no caller edge is reported as "no edge found" —
  never silently read as unused, and never guessed. The graph is a snapshot from its build
  commit (`meta.json` → `gitCommitHash`), not a live tracer. Only `calls` edges are
  confirmed; `calls_unconfirmed` edges are hints.
- The 36 MB `ORISO-Supergraph` / `oriso-super-graph-detailed.json` is a dashboard artefact,
  not agent input.

## Troubleshooting

**`ua-pull --verify` says STALE**
→ Run `ua-pull` (no flags). Check which mode is configured: `--via-ssh` is the default,
`--via-https` when `ORISO_UA_BASE` / `ORISO_UA_AUTH` are set.

**`git status` / `git pull` conflicts on `.understand-anything/*`**
→ The managed files are marked `git update-index --skip-worktree`. Before a `git pull` that
also changes them upstream: `ua-pull --unlock`, then `git pull`, then `ua-pull` again to
re-pull and re-lock.

**Storybook MCP does not connect / HTTP 401**
→ The ingress is live and answers 401 without valid credentials, so `ORISO_SB_MCP_AUTH` is
missing or wrong: `infisical login --domain https://secrets.dreambau.com`, then re-run
`mcp-add.sh`. The value comes from Infisical, never from a file.

**`ua-pull --via-ssh` fails**
→ Check that the SSH alias `predev` exists (`ssh -G predev`). Otherwise create the alias or
switch to `--via-https` (`https://predev.oriso.org/ua`).

**A skill link step was skipped**
→ `<repo>/.claude/skills/<name>` (or `~/.codex/skills/<name>`) already exists as a real
directory. Remove or rename it, then re-run `install.sh`; the installer never overwrites
your own work.

**My change to a kit file disappeared after an update**
→ Expected: the subscription replaces the kit wholesale. Make the change once via
`kit-local adapt <path>`, edit the copy under `~/.oriso-dev-kit/local/overrides/`, and it is
re-applied after every update. `kit-local status` lists your overrides and tells you when the
kit's own version of an adapted file has moved on.

**A skill says it cannot resolve the project boundary**
→ It is looking for `~/.config/agent-routing/paths.env`. Running `install.sh` from inside an
ORISO checkout writes a minimal one (`PROJECT_ORISO_ROOT`); check the value it guessed.

## Dein eigener Anteil: `~/.oriso-dev-kit/local/`

An update replaces the kit wholesale — that is what keeps the team on one rule set, and it is
why a change made directly in a kit file is gone at the next update. `local/` is outside the
bundle payload and is never touched:

```
~/.oriso-dev-kit/local/
  rules/       your own rule files
  prompts/     your own prompts
  skills/      your own skills — linked like kit skills, and winning over a kit skill of the same name
  overrides/   a file here replaces the kit file of the same relative path, after every update
```

```bash
kit-local adapt skills/oriso-graph/SKILL.md   # take a copy
$EDITOR ~/.oriso-dev-kit/local/overrides/skills/oriso-graph/SKILL.md
kit-local apply                               # and it stays applied from now on
```

`apply` runs automatically at the end of `install.sh` and after every successful
subscription. When the kit's own version of a file you adapted changes, it says so — your
override still applies, but it may now be based on an outdated original.

Full description: `rules/local/README.md`.

## Regeln pro Person: `rules/devs/`

One file per developer, named after the GitHub handle, shipped to everyone: which
repositories that person owns, their review role, and what an agent should do differently for
them. Set `ORISO_KIT_DEV=<handle>` so an agent reads yours at session start. Personal notes
that should not leave your machine belong in `local/rules/` instead.

## Shared skill library

`/srv/dreambau/agent-skills/` on `dreambau.com` is where the team's skills are authored:

- `custom/` — the shared library. Skills that are ready for everyone.
- `devs/<user>/` — your own drafts and personal variants, surviving a laptop.
- `vendor/` — third-party skill sources.

The kit is the *distribution* channel for that library: a skill that belongs to everyone is
copied into `skills/` here, and the subscription carries it to every laptop. That replaces
passing tarballs around by hand.

## Offen (nicht in diesem Ordner erledigt)

- Frank has to issue the subscription tokens (`test-access` machine identities) and put one
  under the Infisical key `ORISO_KIT_TOKEN`, project "ORISO Test Access", env `pre-dev`.
- Deploying the Dreambau image that carries the built bundle (`understand-kit/dist/` is
  produced in the Docker `kit` stage, not committed).
- Whether graph delivery moves from the predev `/ua` Basic-Auth channel behind the same
  Dreambau token (one login instead of two).
