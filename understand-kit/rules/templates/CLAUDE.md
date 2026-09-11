# <ORISO-Repo-Name> — Claude Code

**Arbeitsregeln: siehe [`AGENTS.md`](./AGENTS.md).** That file is the single source. Do not
duplicate rules here — anything written only in this file would not exist for Codex or any
other agent.

This file adds **only** what is genuinely Claude-Code-specific: skills, hooks and MCP server
registration.

## Skills

The kit ships these and the installer links them into `<repo>/.claude/skills/`:

| Skill | For |
|---|---|
| `oriso-delivery` | branch, PR target, reviewers, merge rules, environments, board hygiene |
| `oriso-graph` | code and architecture questions from the Understand-Anything graphs |
| `oriso-board-triage` | auditing a board column against what is actually on the branch |

Your own skills in `~/.oriso-dev-kit/local/skills/` are linked the same way and win over a
kit skill of the same name. Run `bash ~/.oriso-dev-kit/install.sh` from this checkout to
(re)create the links:

```
<repo>/.claude/skills/<name>  ->  ~/.oriso-dev-kit/skills/<name>
```

Symlinks, not copies, so an updated kit updates every repository without a repository change.
To change a kit skill and keep the change across updates, use `kit-local adapt <path>` —
never edit the file in `~/.oriso-dev-kit/` directly, the next update overwrites it.

## Plugin

Understand-Anything (`/understand-chat`, `/understand-diff`, `/understand-onboard`),
installed by `install.sh` via `claude plugin marketplace add Lum1104/Understand-Anything`.
These are conveniences over the same graph files `AGENTS.md` describes — never the only path.

## SessionStart hook

`.claude/settings.json` carries one `SessionStart` hook (merged by `install.sh` from
`understand-kit/settings.hook.json`). It runs `ua-pull --verify` at session start and pulls a
fresh graph when the local one is stale. Output is capped at one line.

## MCP servers

Storybook MCP for ORISO-Frontend and ORISO-Admin, registered with `--scope user`:

```bash
bash ~/.oriso-dev-kit/mcp-add.sh
```

**Never `--scope project`** — that would write the Basic-Auth value into the repository's
`.mcp.json`. The value comes from Infisical at runtime, never from a file. A project-scoped
template without a secret (env-var reference only) is at
`understand-kit/.mcp.json.example`.

## Claude-spezifische Besonderheit dieses Repos

<!-- PLACEHOLDER — only fill this in if there IS one; otherwise delete this section.
     Examples of what would belong here:
       - an extra repo-local skill (e.g. oriso-frontend-component-discipline)
       - an additional hook (PreToolUse guard, lint-on-stop)
       - a second MCP server used only by this repository
     A build command, a branch policy or a repository trap does NOT belong here —
     it goes into AGENTS.md, because it applies to every agent. -->
