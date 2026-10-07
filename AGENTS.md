# Dreambau Agent Router

This repository is the Dreambau application and Test Access Hub project. Keep
this file short; implementation details remain in the repository docs and
central manifest.

Before resolving paths, load:

1. `~/.config/agent-routing/paths.env`
2. `~/.config/agent-routing/capabilities.json`

Capabilities may add runtimes or server access. They never override project,
Git or security policy.

Then read:

1. `${PROJECT_DREAMBAU_ROOT}/README.md`
2. `${PROJECT_DREAMBAU_ROOT}/PLAN.md`
3. `${GLOBAL_RULES_ROOT}/global.conversation.rules.md`
4. `${TEAM_VAULT_ROOT}/agent-rules/manifest.json`, filtered to Dreambau and
   the current repository/tool/triggers

For test-mail, 2FA, OTP, recent-message or mailbox API operations, load the
external operator skill before acting:

- Local operator Mac: `~/.agents/skills/dreambau-testmail-api/SKILL.md`
- Dreambau server: `/root/.agents/skills/dreambau-mail/SKILL.md`

The operator skills intentionally remain outside this repository because they
describe runtime credential access. Never copy Keychain values, mailbox
passwords, session cookies, API tokens, message bodies, OTPs, private age keys
or private S/MIME material into the repository.

Use the repository verification commands:

```bash
npm ci
npm run lint
npm test
npm run build
```

Run live E2E only with credentials sourced from the operator Keychain. In
particular, resolve `TESTMAILS_E2E_PASSWORD` at runtime rather than placing its
value in a command literal, file, log or chat.

## Canvas or epic: offer the epic (Frank, 2026-09-24)

Frank wants delivery work tracked in **GitHub epics rather than Slack canvases**. A canvas is
a snapshot that goes stale the day after it is written. An epic lives on the board, links its
issues and PRs, and shows their live state.

- **Every time you create or update a Slack canvas** (or a similar overview page) about delivery
  work, search for an existing epic or parent issue first, then ask proactively in the same reply.
  If one exists, name it: "Should epic #123 be updated to match?" If none exists, ask whether Frank
  wants a new epic. Never propose a duplicate.
- **Always attach a concrete epic proposal to the question**, ready to paste, in the project's
  language rules (GitHub = English):
  1. Title, plus two or three plain-language sentences on what and why.
  2. A status table: item as a link | what, in a few words | owner | state marker
     (✅ done · ⏳ running · 🔴 blocked · 💤 waiting on a human).
  3. Merge or build order, when it matters.
  4. "How to test" as action-plus-expected-result checkboxes.
  5. "Fixed" and "still open" as separate lists.

  Tables beat prose. The proposal must be understandable at a glance by someone who never
  saw the chat.
- **Create or change the epic only after Frank says yes.** Drafting the proposal is the default.
  Follow the project's issue rules when you do (ORISO: one main issue per package with slices as
  a checklist, issue type `Epic`, board fields set and read back).
- A canvas is still fine as a one-off handover to a person. The epic is the durable record: the
  canvas links to the epic, but GitHub never links back to Slack (outside readers cannot open it).

## GitHub descriptions: the working surface, machine parts in code blocks (Frank, 2026-09-25)

Frank wants agents to work **much more in the description field** of issues, epics and PRs:
the body is the live record, comments are the history.

- **Keep the current state in the description.** When merge order, status tables, the test
  checklist or "fixed vs. still open" change, update them there — not only in a new comment.
- **Edit sections, never rewrite the whole body.** Fetch the live body first, keep the top
  (the plain-language story) verbatim, change only the sections that moved (usually the lower
  ones), write it back, then read it back and diff.
- **Text for people stays plain; text for machines goes in code blocks.** Anything meant for
  developers or agents rather than people — contracts, endpoints, field names, migrations,
  commands, test counts, stack details — goes in a fenced `text` block, so a human can skip it.
- **One line above every block** says who it is for and why it helps, for example
  "**For developers — merge details (skip if you only need the status):**". No more than one line.
- **Delegation carries the rule.** When a subagent or a job on the Dreambau server writes to
  GitHub, include this rule in its prompt.
