---
name: code-archaeology
description: Find where work ALREADY exists before anyone rebuilds it — dig through local branches, worktrees, stashes, commits, and merged/closed PRs for leftover drafts and code lost in merges, then build a version matrix (which fix lives on which branch/environment) and prove the live state with screenshots. Use whenever the user says a feature or fix "was already there" / "war schon drin" / "hat schon mal funktioniert", suspects a merge overwrote or dropped code, asks which branch or environment (dev, pre-dev, main, a local speed branch) contains a change, wonders whether a fix is actually deployed, or during debugging when behavior that used to work has vanished. Also use when the user drops screenshots (even a big unsorted pile) containing jobs or annotations that must be triaged and checked against code, branches, and ADRs, or when the problem itself is still unclear and a diagnosis plus an ordered work plan must exist BEFORE any pull request is opened.
---

# Code Archaeology: find it before you rebuild it

Prime directive: when the user says "this already worked", treat that as a
strong prior, not a claim to debate. The cheapest correct fix is almost always
restoring or porting code that already existed and was proven, not rewriting
it. Your deliverable is **evidence**: where the code lives, where it died, and
where it is (not) deployed — then a restore plan.

**Who "the user" is:** the developer running this session — resolve them from
`rules/devs/$ORISO_KIT_DEV.md` in the kit (or the file matching
`gh api user --jq .login`). Names in this skill (Frank, Björn) are roles, never
the user.

Portable: shipped by the ORISO Understand Kit and linked into both Claude Code
and Codex. Capability mapping:

| Capability | Claude | Codex | Fallback if absent |
|---|---|---|---|
| Diagnosis loop (pin the symptom first) | `diagnosing-bugs` skill | *absent* | inline: build a tight pass/fail signal for the symptom before digging |
| GitHub search (PRs incl. closed, org code search) | `gh` CLI / GitHub MCP | `gh` CLI | web UI links for the user |
| Test accounts / OTP on test envs | `dreambau-testmail-api` skill | *absent* | Test Access Hub (`TEST_ACCESS_URL` in `~/.config/agent-routing/paths.env`) |
| Durable evidence on GitHub | `dreambau-pr-evidence` skill | *absent* | `dreambau-evidence` CLI in `~/.local/bin` |
| Browser proof | Playwright / in-app browser | Playwright | headless Playwright script |

## Dev first — scope and order of search

**The default scope is Dev, and only Dev.** Search the Dev source branch and
the deployed Dev environment first, every time. Do not open the search up to
PreDev, Main, or other environments on your own initiative — a dig that sprays
across every environment at once produces noise instead of a verdict.

Only when the Dev scope comes up empty do you **propose** widening:

> Nothing found on Dev. Shall I extend the search to PreDev, Main, or all
> remaining scopes?

Proposing is not doing. Wait for the answer before touching another scope. If
the user already named one or more scopes in the current request, use exactly
those and skip both the default and the question. If a widening proposal goes
unanswered, stay on Dev and say so — elapsed time is not consent.

When you do ask, use a multiple-choice input control only if it supports
selecting several answers; otherwise this compact numbered question in chat:

> Where should I search?
>
> 1. Dev
> 2. PreDev
> 3. Main
> 4. All
>
> Pick one or several numbers, e.g. `1,2`. With no answer I check Dev only.

Interpret the selection as follows:

- `1` = the Dev source branch and the deployed Dev environment.
- `2` = the PreDev/pre-dev source branch and the deployed PreDev environment.
  PreDev is Frank's environment: reading it is fine, deploying to it is not.
- `3` = the `main` branch or ref; include a Main runtime only when the project
  actually defines one.
- `4` = all three scopes.
- Multiple numbers combine only the selected scopes.

Once set, do not silently expand the scope later. Source locations discovered
through ticket or commit archaeology may be recorded as pointers, but do not
inspect or fill matrix cells for an unselected integration branch or deployed
environment unless the user extends the scope.

### Local and branches come next — never skip them

Dev first does not mean Dev only. Within the selected scope the order is fixed:

1. **Dev** — the Dev branch and the running Dev environment.
2. **Local** — worktrees, stashes, uncommitted changes, and unpushed local
   branches on this machine. This step is mandatory, not optional: lost work
   sits here more often than anywhere else, and it is invisible to everyone
   but you.
3. **Branches and remote history** — other branches, merge history, and open
   plus closed/merged PRs.

Never stop after step 1 because Dev looks clean. "Not on Dev" is exactly the
situation in which local drafts and side branches matter most — so an empty
Dev result is a reason to go to steps 2 and 3, not a reason to report failure
or to jump straight to another environment.

### Start with the current week, then work backwards

Time order is newest first. Begin with the current week, and widen the window
only one step at a time — last week, this month, the last quarter, then
everything — stopping as soon as the finding is in hand. Bound the log and PR
queries accordingly (`--since='1 week ago'`, then `'1 month ago'`, and so on).
Recent work is both the likeliest hit and the cheapest to restore. A user-given
time window ("im Juli", "before the big merge") overrides this ladder.

## 0. Orient, then frame the dig

Often the input is not a clean claim but a pile of symptoms — five or ten
screenshots, a vague "irgendwas ist kaputt", several half-related complaints.
Orient before digging:

- **Sort the pile first.** Group the inputs by area/repo, note what each one
  is actually about. It is fine — expected, even — for some inputs to turn
  out irrelevant to the current problem: park those explicitly ("screenshot 6:
  unrelated to this, parked") rather than either working them or silently
  dropping them.
- **Diagnose when the problem itself is unclear.** If you don't yet know what
  is broken or where to search, that is a diagnosis job, not a dig: load the
  `diagnosing-bugs` skill (or apply its core inline — build a tight pass/fail
  signal for the symptom) until you can name the broken behavior precisely.
  Only a named symptom yields usable search keys.

Turn the claim into searchable artifacts before touching git. Collect 3–5
search keys: symbol/function names, UI strings, i18n/translation keys, file
paths, endpoints, words likely used in commit messages. For frontend features,
visible strings and translation keys are the most durable keys — code gets
refactored, user-facing text survives. Note any time window the user gives
("im Juli", "before the big merge") — it bounds every log command below.

If the user's input is only a vague memory, ask ONE round of sharpening
questions (what did the button/behavior look like, roughly when, which repo),
then dig. Don't interrogate — the dig itself will sharpen things.

## 1. Inventory the search space — discover, never assume

Branch names, worktrees, and "the current big local branch" change over time.
Enumerate them fresh every dig; never rely on a remembered name.

Per repo under the project root (for ORISO: `${PROJECT_ORISO_ROOT}/ORISO-*`,
resolved from `~/.config/agent-routing/paths.env` — never guessed), in the Dev →
local → branches order above, and with the newest time window first:

- `git fetch --all --prune` first. A dig against stale refs proves nothing.
- `git worktree list` — leftover worktrees often hold finished-but-unmerged
  deliveries. Check them before concluding work doesn't exist.
- `git branch -vv --sort=-committerdate` — local branches, ahead/behind, and
  especially **unpushed** ones (a local-only branch is invisible to everyone
  else and a prime place for "lost" work, e.g. long-running `speed/*`
  deploy branches).
- `git stash list` and `git status --short` in every worktree — drafts die
  here most often.
- `git reflog` and `git fsck --lost-found` when something seems truly gone
  (deleted branch, hard reset).
- Remote: open AND closed/merged PRs — `gh pr list --state all --search
  "<key>"` — plus org-wide code search. A closed-unmerged PR is a common
  grave for working code.

Time-box each query and walk the ladder: `--since='1 week ago'` first, widening
only when the current week is exhausted. Report which window you have covered
so far, so an unfinished dig is still a usable partial answer.

## 2. Dig techniques

- **Pickaxe** — the workhorse: `git log --all --oneline -S'<key>'` shows every
  commit where the key appeared *or disappeared*; `-G'<regex>'` for patterns.
  `--all` is essential — the point is finding code on branches nobody looks at.
- **Deleted files**: `git log --all --diff-filter=D --name-only -- '<glob>'`.
- **Vanished region**: `git log --all --oneline -- <path>`, then diff around
  the commit where the code disappears.
- **Merge-loss detection** (the "someone overlooked it while merging" case):
  for a suspect merge `M`, run `git diff M^1 M` and `git diff M^2 M`. If one
  parent's changes are missing from `M` with no explicit revert, the merge
  silently dropped them. `git log --merges --oneline <since>..<until>` finds
  candidates in the window. Report this factually (commit, PR, what was
  dropped) — GitHub output is client-facing; name the mechanism, not blame.
- **Presence across branches**: once you have the commit that introduced the
  work, `git branch -a --contains <sha>` and `git tag --contains <sha>` tell
  you instantly where it landed and where it never arrived.

## 3. Build the version matrix

Always produce one table. Rows = each finding (fix, feature, draft). Columns =
the source branches and deployed environments selected in **Dev first — scope
and order of search**, plus local source locations actually found during the
dig. With the default scope that means a Dev column only.
**Derive the selected environment chain fresh at dig time from the project's
current process docs** — environments get promoted and demoted just like
branches (a sandbox becomes official, a "stable" env becomes free-for-all, an
integration env is allowed to break once a staging env exists). Do not add
PreDev or Main comparison columns when only Dev was selected. Cells: ✅ present
`@sha` / ❌ absent / 🟡 partial or diverged / ❓ not yet verified.

Branch ≠ deployment. The running image can lag its branch by days, and logs
or caches can be stale (pre-dev has served 3-day-old cached responses before).
For the deployment columns, verify against the running system — an actual
HTTP response, the DB, or the image tag — never conclude from a branch tip or
a log line.

Board state ≠ delivery evidence either. Issue states and release tags are
testimony, not proof: teams deliberately draw lines — bulk-closing a QA
backlog as "accepted", stripping release tags from never-deployed tickets —
so a closed issue can mean "administratively settled", not "fixed and
verified", and an open one can be long delivered. Only commit containment and
observed live behavior fill matrix cells; issue links are context for the
report, never evidence in the matrix.

## 4. Prove it live

When the claim concerns visible behavior (a button, a flow, a fix), the matrix
deployment cells are only filled by a real session on the actual environment:

1. Get accounts via provisioning (`dreambau-testmail-api` / Test Access Hub) —
   never burn shared logins blindly.
2. Drive the UI (Playwright or in-app browser) and screenshot the decisive
   state on each environment being compared.
3. Post evidence twice: in the chat (user sees it now) and durably on the
   GitHub issue/PR (via `dreambau-pr-evidence`), so the finding survives the
   session.

A claim like "fixed on pre-dev but missing on dev" without both screenshots is
a hypothesis, not a finding — label it as such or go get the screenshots.

## 5. Screenshots from the user are work orders

When the user drops screenshots, read each one completely, edge to edge —
they typically embed several jobs, annotations, and instructions, not just the
one obvious thing.

**Annotation colors carry meaning.** Derive the legend from the material and
state it in your playback so the user can correct it. The legend used in the
team's annotated screenshots (Frank's convention) unless the material says otherwise:
**yellow/gold sticky notes** are the important headline claims (with author +
date — the date tells you how fresh the complaint is, regardless of which
folder the file sits in); **ochre boxes** are verification jobs ("double check
X works" — the deliverable is proof, not code); **dark boxes** are build jobs,
usually with prio + effort; **red frames/circles** mark the defect location;
**green frames** mark the correct reference example to match.

**Harvest environment and version from the pixels.** The URL bar, the version
footer (e.g. `v2.0.3`), and dates visible inside the app pin down which
environment and build each screenshot shows. Record them per screenshot —
never assume one environment for the whole pile ("fast alle auf dev" means
some are not), and never date the material by its folder.

1. Extract every actionable item into a numbered list, sorted by area and
   apparent priority, and play the list back — nothing gets silently dropped.
2. Ambiguous item → one concrete question. Don't guess at intent.
3. Scan the extracted jobs against the ADRs, the code, and what the dig has
   established. An instruction that contradicts an ADR, or asks to rebuild
   something the dig shows already exists on some branch, gets flagged with
   the evidence — not silently executed and not silently skipped.
4. **Reflect at the first results, not at the end.** After the playback (and
   again after the first dig findings), pause: is this cut of the work
   optimal, or should the grouping, priorities, or approach change? Say what
   you would improve and let the user redirect while redirecting is still
   cheap.

## 6. Verdict and work plan

**No pull requests, no branches, no code changes until the facts stand.** The
whole point of the dig is to find out what is actually the case *first* —
opening PRs against an unverified picture is how the same feature gets built
three times. The dig itself is strictly read-only: never close or edit issues
as part of it; findings go into comments (English on GitHub).

Report structure — ALWAYS use this shape:

1. **Verdict** — one sentence: was it already there, and where.
2. **Evidence** — findings with commit shas, branch names, PR links.
3. **Version matrix** — the table from §3, including live-proof status.
4. **Work plan** — an ordered, checkable list: what happens in which order,
   what each step depends on, and where the go/no-go points are. This is the
   document the user (and any agent) works *against* afterwards. When the work
   exists somewhere, the default step is to bring it home (cherry-pick /
   rebase / revert-of-the-lossy-merge onto the current integration branch),
   with the concrete commits named; rewriting from scratch needs a stated
   reason (e.g. the old code diverged too far). Include the parked-as-
   irrelevant items from §0 at the bottom so nothing is silently lost.
5. **Open questions** — including flagged screenshot jobs from §5.

Only after the user confirms the plan does delivery start — then hand over to
the normal flow (`issue-subtask-pr-loop` / `work-through`) with the plan as
input.

When the plan becomes tracker issues, **re-read the project's current issue
conventions first** — they change (and the change is often exactly what a
process-reset document announces). Two conventions worth honoring wherever
they apply: write the issue body as a user story and put the dig's technical
analysis, code pointers, and step lists into comments or the PR description,
not the body; and when a bug resurfaces on an integration environment, reuse
the feature's existing issue instead of filing a new one — the dig's evidence
then lands as a comment on that issue.
