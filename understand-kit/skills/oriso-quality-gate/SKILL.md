---
name: oriso-quality-gate
description: Run the ORISO pre-commit and PR quality gate. Use before committing, pushing, opening a PR, addressing CodeRabbit feedback, or when asked for TDD enforcement, test sufficiency review, frontend component-system review, thermo-nuclear code quality review, or strict maintainability audit.
---

# ORISO Quality Gate

Use this skill before committing or calling ORISO feature work done. The goal is
not to create ceremony. The goal is to catch missing tests, brittle UI
shortcuts, duplicated components, and structural drift before a reviewer has to.

## Delivery Rules Come First

This skill checks the *diff*. How that diff becomes delivered work — branch off `dev`, PR
against `dev`, 2–3 reviewers requested in the same step that opens the PR, no self-merge,
test on Dev after the merge, Pre-Dev only on Frank's explicit instruction — is in
`oriso-delivery` (`~/.oriso-dev-kit/skills/oriso-delivery/SKILL.md`, and the same rules in
each repository's `AGENTS.md`). Load it before opening or finishing a PR.

Older documents still say PRs target `pre-dev`. They are out of date since 2026-08-31.

## Operating Mode

1. Identify the repo, branch, and diff scope with `git status`, `git diff`, and
   the current PR when available.
2. Separate production changes, test changes, styling changes, and generated
   assets.
3. Verify Red-Green TDD evidence:
   - Changed behavior should have a test that would fail without the
     implementation.
   - Existing tests should be updated when behavior changes.
   - Missing tests require an explicit reason.
4. Run the smallest useful validation loop first, then broaden:
   - targeted unit/component tests when available
   - related integration tests for flows
   - build/typecheck/lint for shared or frontend-heavy changes
5. Review structure with the thermo-nuclear standards below.
6. For PR work, fetch CodeRabbit status and comments once available. Treat
   actionable comments as required follow-up unless verified invalid.
7. Iterate: fix, rerun relevant checks, and re-review the diff before committing.

## TDD Standard

Default to Red-Green TDD for behavior changes:

- Write or update the smallest meaningful failing test first.
- Implement the minimal production change needed to pass.
- Refactor only after the test is green.
- Keep tests focused on behavior, not implementation trivia.
- Cover edge cases, error paths, permission/read-only states, async failures,
  and regressions when relevant.
- Do not rely on CodeRabbit to generate tests. CodeRabbit should review test
  sufficiency; Codex should write the tests.

If the change is too small for tests, document why in the final response or PR
notes. Examples that may not need tests: comments, copy-only docs,
non-functional formatting, generated lockfile updates, or a mechanical rename
with existing coverage.

## Frontend System Standard

For ORISO frontend work:

- Prefer shared components, variants, tokens, and canonical helpers over local
  CSS patches.
- Do not create two divergent search fields, filters, cards, toggles, dialogs,
  or form controls for equivalent use cases in different ORISO areas.
- When a pattern appears in request, conversation, admin, tenant, or settings
  areas, check whether behavior and design should live in one reusable
  component.
- Fix styling at the system layer when the same change should apply globally.
- Keep component APIs typed, accessible, and reusable. Check aria labels,
  keyboard behavior, disabled/read-only states, and focus states.
- Treat hardcoded text, hardcoded colors, and one-off spacing overrides as
  review smells unless clearly local.

## Thermo-Nuclear Review Standard

Be ambitious about structural simplification. Do not merely identify local
cleanup. Look for moves that preserve behavior while making the implementation
dramatically simpler, smaller, more direct, and easier to maintain.

Ask these questions for every meaningful change:

- Is there a simpler structural move that deletes branches, helpers, modes, or
  duplicated concepts?
- Did the diff add ad-hoc conditionals to an already busy flow?
- Did a file or component grow past a healthy size boundary, especially toward
  or beyond 1000 lines?
- Is feature logic living in the canonical layer?
- Is a new abstraction earning its keep, or is it only a wrapper?
- Did the change introduce unnecessary `any`, `unknown`, casts, optionality, or
  silent fallbacks?
- Is there an existing ORISO helper, component, token, or service that should be
  reused?
- Are independent async steps serialized for no reason?
- Can partial updates leave state half-applied?

Flag aggressively:

- missing or weak tests for changed behavior
- duplicated components or duplicated business logic
- local CSS overrides that should be tokens, variants, or shared styles
- hardcoded UI text instead of locale keys
- feature checks scattered through shared code
- large-file growth that should be decomposed
- generic magic that hides a simple invariant
- unnecessary wrappers and pass-through abstractions
- casts or optional params that obscure the real contract

Prefer remedies that delete complexity:

- extract a pure helper or focused component
- move logic to the owning layer
- reuse the canonical helper
- replace condition chains with a typed model or explicit dispatcher
- turn local style tweaks into design-system variants or tokens
- collapse duplicated branches into one clearer flow
- split large files into smaller modules
- make type boundaries explicit

## CodeRabbit Follow-Up

When a PR exists:

1. Check the PR head SHA, status checks, CodeRabbit status, review threads, and
   top-level CodeRabbit comments.
2. If CodeRabbit is pending, wait or report that it is not yet ready.
3. Summarize actionable CodeRabbit comments by file and severity.
4. Fix only still-valid findings, keep changes minimal, and rerun relevant
   tests.
5. Do not claim a manual finding came from CodeRabbit.

## Output Bar

Do not call the work ready until:

- the PR targets `dev` and has 2–3 requested reviewers, excluding the author
- the PR body states where the change was verified — environment and image — or says plainly
  that it was only tested locally

- changed behavior has meaningful tests or a clear no-test justification
- relevant local checks have run or their omission is explained
- frontend changes reuse the component system where appropriate
- the diff has been reviewed for structural simplification
- CodeRabbit feedback has been checked when a PR exists
- unresolved risks are named plainly
