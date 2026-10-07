# Your own layer: `~/.oriso-dev-kit/local/`

The kit subscription replaces `~/.oriso-dev-kit/` wholesale whenever a newer version is
served. That is what keeps everyone on the same rules — and it is also why a change you make
directly in a kit file disappears at the next update.

`local/` is the exception. It is not part of the bundle, so no update touches it.

```
~/.oriso-dev-kit/local/
  rules/        your own rule files
  prompts/      your own prompts
  skills/       your own skills, and adapted copies of kit skills
  overrides/    a file here replaces the kit file of the same relative path
  overrides.json  records which kit version each override was based on
```

## Adapting a kit file so the change survives

```bash
kit-local adapt skills/oriso-graph/SKILL.md   # copies it into local/overrides/
$EDITOR ~/.oriso-dev-kit/local/overrides/skills/oriso-graph/SKILL.md
kit-local apply                               # copies it over the installed kit
```

`apply` runs on its own at the end of `install.sh` and after every successful subscription,
so from then on your version is back in place automatically after each update. You adapt
once, not once per release.

When the kit's own version of a file you adapted changes, `apply` says so:

```
[kit-local] note: the kit's own skills/oriso-graph/SKILL.md changed since you adapted it — re-check your override
```

That is a nudge, not an error — your override still applies. `kit-local status` lists all of
them, `kit-local drop <path>` gives a file back to the kit.

## Your own skills

Put them in `local/skills/<name>/SKILL.md`. The installer wires them the same way it wires
kit skills: a symlink into `<repo>/.claude/skills/` for Claude Code and into
`~/.codex/skills/` for Codex. Nothing to register twice.

When a skill turns out to be useful for everyone, it should stop being local: send it to
Frank or put it in the shared library on the server
(`/srv/dreambau/agent-skills/custom/`, see `README.md` → "Shared skill library"). Your
personal drafts can live at `/srv/dreambau/agent-skills/devs/<you>/` so they survive a laptop.

## What does not belong here

Secrets. Not in `local/`, not in a skill, not in a prompt. Credentials are read at runtime
from Infisical or the environment — never written to a file.

## Team-wide rules about you

Things the *team's* agents should know about how you work go into `rules/devs/<handle>.md` in
the kit, not here — `local/` never leaves your machine.
