# Verdicts and the auditor prompt

## Verdict taxonomy

Exactly one per ticket. The value of a fixed set is that a reader can act on the word alone,
so resist inventing new ones — if a ticket does not fit, it is usually `PARTIAL` plus a
sentence naming what is outstanding.

| Verdict | Meaning | Move it? |
|---|---|---|
| `MERGED-ON-DEV` | Delivered, and the **artefact is verified present** on `dev` | Yes |
| `MERGED-PREDEV-ONLY` | Merged, but only reachable from `pre-dev` | No — needs a promotion PR |
| `OPEN-CLEAN` | PR open, no conflicts, blocked on review or checks | No |
| `OPEN-CONFLICTED` | PR open with conflicts; list files and say trivial / mechanical / semantic | No |
| `OPEN-DRAFT` | Only PR is a draft — cannot merge regardless of `mergeable` | No |
| `PARTIAL` | Some scope delivered, some not; for epics give the delivered/outstanding split | No |
| `NO-PR` | Nothing open or merged delivers it; state the single next step | No |

Repos without a `dev` branch (ORISO-E2E): judge against `pre-dev` and say so explicitly rather
than stretching `MERGED-ON-DEV` to mean something different.

A ticket whose code is delivered but whose remaining work is **non-engineering** — artwork, a
product decision, a live browser proof — is not `MERGED-ON-DEV` for moving purposes. Say the
code landed, name the owner and the outstanding item, and hold it.

## Evidence standard

Ancestry is necessary and not sufficient. For every delivered claim, verify the artefact:

```bash
git fetch origin
git branch -r --contains <merge-sha>          # necessary
git ls-tree -r --name-only origin/dev -- <path>   # the file is there
git grep -n "<symbol>" origin/dev -- <dir>        # the code is there
git grep -c "<removed-thing>" origin/dev          # the bad thing is gone
```

A sync can revert content while keeping merge commits — see the Helm de-scope trap in
`environment.md`. When ancestry and artefact disagree, the artefact wins and that disagreement
is itself a finding worth reporting loudly.

## Finding the real PRs

Tickets are routinely delivered by PRs that never referenced them. Search widely before
concluding `NO-PR`:

```bash
gh issue view <n> --repo <owner>/<repo> --json title,body,comments
gh pr list --repo <owner>/<repo> --search "<n>"
gh search prs "<keywords>" --owner OpenResilienceInitiative
git log -S "<symbol>" --oneline origin/dev     # code archaeology
```

Check sibling repos whenever the ticket implies them — Frontend, Admin, UserService,
TenantService, AgencyService, Helm, E2E, Keycloak, Docs. Epics almost always span repos.

Treat existing audit comments on the ticket as **claims to verify, not facts**. Several have
been wrong in both directions: reporting "no merged PR" when successors had landed, and
reporting delivery when content was reverted.

## Auditor prompt template

Adapt per group. Keep it read-only, give real branch facts, and ask for the verdict word.

```
READ-ONLY audit. Do NOT push, force-push, edit any PR/issue, or write to the project board.
You may fetch and create/remove throwaway worktrees under <session scratchpad>; leave every
repo on its original branch with a clean tree (<repo> is on <branch>).

Context: org OpenResilienceInitiative, clones at /Users/shaziakausar/Repos/ORISO/<repo>.
gh is authenticated (repo, read:org, project, read:project).

Branch facts: <origin/dev is N ahead of origin/pre-dev, pre-dev M ahead; or "no dev branch">.
GitHub does NOT auto-close these issues, so an open issue proves nothing — verify on the branches.

Audit these <repo> issues, all currently "In review" on board view <N>:
- #<n> (<type>, <priority>) <title>
...

For EACH issue report:
1. Linked PRs — via gh issue view, gh pr list --search, gh search prs. Check body and comments
   for links, and check sibling repos where the issue implies them.
2. PR state: OPEN / MERGED / CLOSED-unmerged, base branch, isDraft, mergeable,
   mergeStateStatus, reviewDecision.
3. Ground truth: if merged, is the merge commit reachable from origin/dev — AND is the
   artefact actually present? Verify the file/symbol, not just ancestry. Flag
   MERGED-PREDEV-ONLY explicitly.
4. A targeted code check on origin/dev for the behaviour the issue describes. One or two
   greps each, not a deep review.
5. Verdict, exactly one of: MERGED-ON-DEV, MERGED-PREDEV-ONLY, OPEN-CLEAN,
   OPEN-CONFLICTED (list files + trivial/mechanical/semantic), OPEN-DRAFT, PARTIAL, NO-PR
   (state the single next step).
6. Evidence comments with PR links, and assignees.

Known context to VERIFY, not assume: <PR states you already believe>.

Output compact per-issue blocks then a summary table: issue | verdict | PR(s) | base | on-dev?
| next action. Terse and factual; say "unknown" rather than guessing.
```

The "verify, not assume" line matters. Auditors given briefings as fact stop investigating,
and they are often the ones who catch errors in the briefing itself.

## Adversarial reviewer prompt template

For anything that removes an API surface, changes persistence or ORM semantics, touches auth
or permissions, alters a CI security gate, or promotes commits to a shared branch.

```
You are an ADVERSARIAL reviewer. Find what this BREAKS. Assume the author was careless and
optimistic. Be concrete: file, line, and the exact failure scenario with inputs. Do NOT
rubber-stamp. Only conclude it is safe after genuinely trying to break it.

READ-ONLY. Do not push, merge, edit or comment on GitHub. Leave <repo> on <branch>, clean.

Target: <owner>/<repo> PR #<n> — <what it changes>.
Claimed verification: <what the author says they ran>.

Attack these specifically:
1. <the riskiest behaviour change — name it and say what you suspect>
2. <the second — e.g. a semantics change that is not migrated>
...
N. Anything the passing test suite would NOT catch. Contract tests that assert absence can
   pass while real integrations break. Name the gaps.

Verify every claim in this brief independently; if a claim is wrong, say so loudly.

Report a ranked list, most severe first: severity (BLOCKER / SERIOUS / MINOR), file:line,
concrete failure scenario, and whether it blocks the merge. End with an explicit verdict:
SAFE TO MERGE, MERGE WITH CONDITIONS (list them), or DO NOT MERGE (say why).
```

Ask it to check cross-repo callers before declaring a removal safe — a green OpenAPI
breaking-change gate has passed a path removal here, so that check proves nothing on its own.

When the review returns conditions, fix them and record what you did in the PR body. Prove any
new guard actually bites: break the thing it guards, watch the test go red, restore it, watch
it go green. An assertion that passes in both states is decoration.
