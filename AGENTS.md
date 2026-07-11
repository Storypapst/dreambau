# Dreambau Agent Router

For test-mail, 2FA, OTP, recent-message, or mailbox API work, read and follow the external operator skill before acting:

- Local operator Mac: `~/.agents/skills/dreambau-testmail-api/SKILL.md`
- Dreambau server operations: `/root/.agents/skills/dreambau-mail/SKILL.md`

The testmail API skill intentionally lives outside this repository because it describes runtime credential access. Do not copy that skill, Keychain values, mailbox passwords, session cookies, API tokens, message bodies, OTPs, or private S/MIME material into this repository.

Use the repository commands for application verification:

```bash
npm ci
npm run lint
npm test
npm run build
```

Run live E2E only with `TESTMAILS_E2E_PASSWORD` sourced from the operator Keychain; never place its value in a command literal or file.
