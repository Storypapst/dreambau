# Issue tracker: GitHub

Implementation issues for this repository live in [Storypapst/dreambau](https://github.com/Storypapst/dreambau/issues).
Use the `gh` CLI and specify this repository explicitly. Website design decisions and private operational records
remain in their existing private sources; this adapter does not move them into public issues.

## Conventions

Apply the `Testmails` label to issues and pull requests about Testmails accounts, access, or daily use. Other work does
not receive that label automatically. Follow the active project rules and the portable issue-subtask-pr-loop skill
before creating or changing issues or pull requests. Keep the current state in the description and history in comments.

**For agents — read the relevant ticket and list open work:**

```text
gh issue view <number> --repo Storypapst/dreambau --comments --json number,title,body,labels,comments
gh issue list --repo Storypapst/dreambau --state open --json number,title,body,labels
```

When a skill says “fetch the relevant ticket”, read the issue with its comments and labels. When it says “publish to
the issue tracker”, create a GitHub issue only within the user's authorized scope. Write GitHub descriptions in
English; keep the human story plain and developer details in labelled fenced blocks. For multiline bodies, write the
exact text to a temporary file and use `--body-file`.

**For agents — authorized issue and label changes:**

```text
gh issue create --repo Storypapst/dreambau --title "<title>" --body-file <body-file>
gh issue edit <number> --repo Storypapst/dreambau --body-file <body-file>
gh issue comment <number> --repo Storypapst/dreambau --body-file <body-file>
gh issue edit <number> --repo Storypapst/dreambau --add-label Testmails
gh pr edit <number> --repo Storypapst/dreambau --add-label Testmails
```

## Pull requests as a triage surface

**PRs as a request surface: no.** This adapter does not enable automatic PR triage or define a triage-label vocabulary.

GitHub shares one number space across issues and pull requests. If the item type is unclear, read it as a pull request
first and fall back to an issue. Private operational inventory belongs in the routed `${KNOWLEDGE_DREAMBAU_ROOT}`,
resolved through the machine-local path mapping, rather than in this public repository.
