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

Run live E2E only with credentials sourced from the operator Keychain. Never
place secret values in command literals, files, logs or chat.
