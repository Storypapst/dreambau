# Per-developer rules

One file per person, named after the GitHub handle. It ships with the kit, so every agent —
yours and everyone else's — can read how you work before it does something on your behalf.

**What belongs here**

- which repositories you own or usually work in
- your review role (who you review for, who reviews you)
- anything an agent should do *differently* for you: a machine that has no Infisical, a
  different checkout path, a language preference, a tool you do not use
- standing decisions you keep repeating to your agent

**What does not belong here**

- secrets, tokens or passwords of any kind
- rules that apply to the whole team — those go into `rules/AGENTS-block.md`, so everyone
  gets them
- anything private. This file is distributed to the team.

**How to change your file**

Edit it and send it to Frank (or open a PR against the kit). The next bundle carries it to
everyone. For things that should stay on *your* machine only, use the local overlay instead:
`~/.oriso-dev-kit/local/rules/` — see `rules/local/README.md`.

**How an agent uses these files**

Read your own file at the start of a session (`rules/devs/$ORISO_KIT_DEV.md` when the
variable is set, otherwise the one matching the git user). Read someone else's only when the
work concerns them — for example before requesting them as a reviewer or handing work over.
