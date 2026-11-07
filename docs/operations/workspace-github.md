# Workspace GitHub reader

The Evidence workspace fetches facts only for a selected run's explicit Issue/PR links.
Existing links and run details still work when GitHub integration is unconfigured or unavailable.
An Issue being closed, a PR being merged, an assigned release and a published release are separate facts.
This reader never asserts that code is deployed.

## Configure the dedicated GitHub App

The operator must obtain approval for the actual App installations and repositories before enabling this reader.
Do not reuse a person's `gh` credentials, a PAT, the Evidence bearer, or mailbox credentials.
App signing/token and conditional transport primitives were adapted from the unmerged work-state PR190
at commit `6e6500d7f8ccbc0d8f4dae20419f116d05ce9aa2`; that stack and its scheduler are not dependencies.

**For operators — mount a protected JSON file and RSA key read-only, readable by the container's node user:**

```text
TESTMAILS_GITHUB_CONFIG_FILE=/run/secrets/workspace-github/config.json
Suggested host permissions: private directory 0700, files 0600, owned by the mapped runtime UID.
The environment variable contains a path only. Never put the key or an installation token in environment values.
Missing configuration disables GitHub enrichment. Malformed enabled configuration fails startup.
```

**For operators — configuration shape; replace all example IDs with approved installation/project IDs:**

```json
{
  "appId": "123",
  "privateKeyFile": "/run/secrets/workspace-github/app.pem",
  "installations": [
    {
      "installationId": "456",
      "repositories": [{"fullName": "Storypapst/dreambau", "project": "dreambau"}]
    },
    {
      "installationId": "789",
      "repositories": [{
        "fullName": "OpenResilienceInitiative/ORISO-Frontend",
        "project": "oriso",
        "boards": [{
          "projectId": "REPLACE_WITH_APPROVED_PROJECT_NODE_ID",
          "title": "ORISO Roadmap",
          "url": "https://github.com/orgs/OpenResilienceInitiative/projects/1",
          "statusField": "Status",
          "releaseField": "Platform release"
        }]
      }]
    }
  ]
}
```

Each installation contains repositories from one owner. Repository mappings and installation IDs must be unique.
The App needs repository Metadata, Issues, Pull requests and Contents read permissions.
Organization Projects read is requested only for installations with configured boards.
No webhook, checks/status permissions or GitHub write access is needed.
An App may have separate installations for multiple owners, sharing the protected signing key.
Installation tokens stay in memory and are restricted to that installation's configured repository names.

The repository-to-project mapping is authority, independent of the selected run's project.
For example, a link to Storypapst/dreambau inside an ORISO run still requires Dreambau project access.
Fresh human grants authorize the run target/pool and repository before cache access and again before response.
Closing-PR repositories are authorized separately, including when filtering previously cached facts.
Unmapped or forbidden references remain external links without fetched titles/status.

## Refresh and bounded storage

**For developers — lazy endpoints and hard bounds:**

```text
GET  /testmails/api/workspace/runs/:source/:id/github
POST /testmails/api/workspace/runs/:source/:id/github/refresh
Human session and existing viewer binding required; cross-origin refresh denied.
200 returns status ready|partial|unavailable|unconfigured|denied; run denial stays 404.
Snapshot TTL 15 minutes; shared minimum refresh retry 60 seconds; rate-limit backoff can extend it.
At most 10 explicit references, 20 upstream requests and 15 seconds per selected-read budget.
At most 8 active distinct snapshot refreshes; upstream transport is serialized per installation.
Each upstream attempt times out after at most 10 seconds, including token acquisition.
ETag cache: in memory, at most 100 responses/2 MiB per installation; individual response <=512 KiB.
Sanitized SQLite snapshot cache: workspace_github_cache, at most 1000 records, <=64 KiB each.
No raw GitHub bodies, private keys or tokens are persisted in the snapshot table or browser DTO.
```

This is selected-record loading, not a global scheduler. Manual refresh shares work with concurrent readers.
Failures retain the last successful snapshot and its actual observation time, labeled stale/unavailable.
Installation authentication denial removes old private facts across that installation. Core Issue/PR access denial removes the repository's facts, including dependent closing-PR facts in cached Issues. A core 404 first probes repository access through the same App and request budget: only a matching repository response permits invalidating just the missing reference and its dependent links. An unconfirmed probe fails closed. Secondary board/release/compare failures produce fresh partial facts without retaining denied auxiliary data or revoking a valid core read. A 403 with rate-limit headers or GitHub's bounded official rate-limit message retains stale facts and honors backoff.
Permission-denial knowledge does not expire with the retry cooldown: a successful live core Issue/PR read
is required to revalidate access. Concurrent outage fallbacks use the current sanitized SQLite value,
so an older pending request cannot restore a denied closing PR from its captured snapshot.
Missing fields, incomplete association/board/release pages or exhausted budgets are partial, never fabricated completion.
Only configured project IDs are projected; single-select, text and multi-select/issue-field release assignments retain their source.
Published-release inclusion is emitted only when the PR's merge commit is an ancestor of that published release's tag.
Only the first five releases are examined; pagination makes coverage partial. Issue-to-version delivery is never inferred.

## Personal defaults

**For developers — use the existing human preference routes/table:**

```text
GET/PUT/DELETE /testmails/api/auth/me/preferences/workspace-defaults
Value: {rememberFilters:boolean, refreshMinutes:0|15|60,
        filtersByProject:{[project]:{source:all|test-run|evidence-run,
                                   environment:all|local|pre-dev|dev|production-test}}}
Defaults: rememberFilters=true, refreshMinutes=15, filtersByProject={}; absent saved value is null.
Fresh grants clamp saved project/environment filters on read and write.
Search phrases, selected record IDs and an overriding default project are not stored here.
```

Before claiming live acceptance, verify actual Issue, PR, configured board and release reads using this App's
own service identity. A successful developer-Mac `gh` read or synthetic test does not establish App access.
Record installation/repository coverage and key-rotation ownership without copying secrets into evidence.
