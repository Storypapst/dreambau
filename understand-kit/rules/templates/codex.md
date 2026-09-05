# <ORISO-Repo-Name> — Codex

**Arbeitsregeln: siehe [`AGENTS.md`](./AGENTS.md).** Codex reads `AGENTS.md` natively from the
repository root, so no per-repository Codex file is required. This document exists to record
the one-time machine setup and, if a repository ever needs it, where a Codex-only note would
go.

## How Codex picks up the rules

Codex merges `AGENTS.md` files from, in increasing precedence:

1. `~/.codex/AGENTS.md` — global rules for all projects
2. the repository root `AGENTS.md` — the ORISO working rule plus this repository's specifics
3. nested `AGENTS.md` files in subdirectories, for the files below them

Nothing needs to be copied or registered. If the working rule is in the repository's
`AGENTS.md`, Codex already follows it.

## One-time machine setup

The kit itself is agent-neutral: `ua-pull` is a shell script and the graphs are plain JSON.

```bash
# 1. Install the kit (copies it to ~/.oriso-dev-kit/ and puts ua-pull on PATH)
bash <path-to>/understand-kit/install.sh

# 2. Make ~/.local/bin reachable, if it isn't already
export PATH="$HOME/.local/bin:$PATH"

# 3. Graph access. Preferred: let ua-pull read the credential from Infisical at runtime.
infisical login --domain https://secrets.dreambau.com --interactive
#    Alternative if Infisical is not available: export the values in your shell profile.
#    Never write them into a file inside a repository.
export ORISO_UA_BASE='https://predev.oriso.org/ua'
# export ORISO_UA_AUTH='<user:pass>'     # ask Frank; runtime only

# 4. Kit subscription token (bundle endpoint on the Dreambau app, same token mechanism as
#    the Test-Access API — a revocable per-person/per-machine bearer token).
export ORISO_KIT_TOKEN='<token>'         # runtime only, never committed
```

Put steps 2–4 in your shell profile (`~/.zshrc`, `~/.bashrc`) or in `~/.codex/config.toml`'s
environment section — **not** into any file inside an ORISO repository.

## Session start (the Claude `SessionStart` hook equivalent)

Codex has no hook that fires on session start, so run the same two checks by hand — or from
your shell profile — before starting work:

```bash
kit-subscribe --max-seconds 10   # rules/prompts: update ~/.oriso-dev-kit/ if a newer kit is served
ua-pull --verify || ua-pull      # knowledge graph: pull only when stale
```

`kit-subscribe` asks the bundle endpoint for `manifest.json`, compares its `version` with the
installed one, and downloads only when the served version is newer — verifying every file's
sha256 against the manifest before unpacking. It prints one line, gives up after ten seconds
and never fails the shell: a kit check must not stand between you and starting work.

`ua-pull --verify` exits 0 when the graph is fresh (≤ 24 h) and 1 when it is stale or missing,
so the line above pulls only when needed. It prints one line either way.

The Claude Code equivalent is the `SessionStart` hook in `settings.hook.json`, which runs the
same two commands in the same order.

## Codex-spezifische Besonderheit dieses Repos

<!-- PLACEHOLDER — usually empty. Fill in only if this repository needs something that
     exists in Codex and nowhere else (a sandbox/approval setting, an MCP server entry in
     ~/.codex/config.toml, a nested AGENTS.md for a subdirectory). Build commands, branch
     policy and repository traps belong in AGENTS.md — they apply to every agent. -->
