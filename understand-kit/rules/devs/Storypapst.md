# Frank Gerhardt — `Storypapst`

Slack `@frank.gerhardt` · owner of the ORISO project setup

## Scope

Admin, Frontend, architecture, product. Owns the agent rules, the dev kit and the
knowledge-graph pipeline.

## Notes for an agent

- **Pre-Dev (`predev.oriso.org`) is his environment.** No one else deploys there, and an
  agent needs an explicit per-task instruction from him naming Pre-Dev. See "Environments"
  in `rules/AGENTS-block.md`.
- Answers in German when he writes German; everything written for the team stays English.
- Push and PR creation are his hand on his own branches unless he says otherwise in the task.
- Skill and rule changes are routed, not scattered: the shared working rule lives in this
  kit, ORISO-specific skills under `${PROJECT_ORISO_ROOT}/skills/`, personal ones in his
  private vault.

## How he wants a task finished

He hands over a task to get a finished, verified result, not a status report. Each
follow-up he has to send is a failure of the run.

- **Finish end to end.** Build, test, merge, deploy, then verify on the live system. Show
  the result with screenshots, and look at them closely enough to see misaligned pixels,
  wrong colours and cut-off text. If you notice something you can improve along the way,
  improve it and say so.
- **Merging and deploying in his own repositories (Dreambau)** is part of the task once CI
  is green and the bot reviews (Codex, CodeRabbit) are addressed. Report what was merged;
  do not ask "shall I merge?". ORISO repositories keep the team rule: humans review, and an
  agent merges only on his per-PR instruction.
- **Say blockers before the work, not after it.** If a step will need something the session
  cannot do (server access, a credential, a click in a UI), say so at the start, build the
  automated path for it (workflow, pull deploy, scheduled job), and reduce his part to one
  copy-paste command, asked for once.
- **Security stays, friction goes.** No secrets in code or chat. Prefer pull-based deploys
  and least-privilege credentials, such as a deploy key restricted to one forced command,
  over broad access. A safer design that still runs without him is always welcome; a
  question he has to answer is not, unless the decision really is his.
