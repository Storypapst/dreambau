# What the skills do

One line per skill: what it is for and when to reach for it. Every skill is linked into
Claude Code and Codex by `install.sh`; ask for it by name or just describe the job.

## Shipped with the kit (on every machine)

| Skill | What it does | Reach for it when |
|---|---|---|
| `oriso-delivery` | The team's delivery flow: branch off `dev`, PR against `dev`, reviewers at PR-open, no self-merge, test on Dev. | Work is about to become a branch, PR, review request or board move. |
| `oriso-graph` | Answers code/architecture questions from the knowledge graph and ADRs. | "Which service owns this?", "who calls this endpoint?", before starting a ticket. |
| `oriso-board-triage` | Checks a board column against what is really on the branches; flags conflicts and missing approvals. | Before trusting a board column, or "what is missing on these tickets?" |
| `code-archaeology` | Finds work that already exists — branches, worktrees, stashes, closed PRs — and builds a "which fix is where" table. | "This worked before", "was it merged?", "is it deployed?" — before rebuilding anything. |
| `issue-subtask-pr-loop` | Parent issue → sub-issues → reviewable PRs, reviewer routing, readiness score 1–20. | Creating or tidying issues and PRs, especially across several repos. |
| `oriso-quality-gate` | Reviews a diff for missing tests, duplicated components and structural drift. | Before committing, before calling a PR ready, when working through CodeRabbit comments. |

## In the server library (`/srv/dreambau/agent-skills/custom/` on dreambau.com)

Read-only for most people; copy one into `~/.oriso-dev-kit/local/skills/` to use it locally.

| Skill | What it does |
|---|---|
| `oriso-e2e-quality-gate` | Real-browser Playwright test of Admin and App on Dev, with evidence. |
| `work-through` | Works a whole parent issue to done: own branch, TDD, evidence, no self-merge. |
| `dreambau-testmail-api` | Test identities and OTP mails for E2E (needs a Keychain entry). |
| `dreambau-pr-evidence` | Attaches screenshots and videos to a PR as durable proof. |
| `oriso-storybook-routing` | Storybook/Figma work; component props come from the Storybook MCP. |
| `oriso-frontend-component-discipline` | Building or changing frontend components. |
| `oriso-language-i18n-qa` | Checks UI texts and translations in the running app. |
| `oriso-prune` | Repo and worktree hygiene sweep. |

## Method skills (Matt Pocock, `vendor/mattpocock-skills/` in the same library)

| Skill | What it does |
|---|---|
| `wayfinder` | Plans work that is too big for one session as a map of decision tickets. Run `setup-matt-pocock-skills` once first. |
| `resolving-merge-conflicts` | Walks an in-progress merge or rebase conflict to a clean result. |
| `diagnosing-bugs` | A tight loop for hard bugs: reproduce, narrow down, prove the cause. |
| `tdd` | Red–green–refactor, test first. |
| `writing-for-agents` | How to write a skill or an `AGENTS.md` that agents actually follow. |
