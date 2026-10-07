# Secret scan — ORISO Understand Kit

Scanned on 2026-09-05, over the whole of `understand-kit/` (all 24 payload files, including
`pages/features/case-handover.html`). `dist/` is excluded: it is a build artefact, gitignored,
and contains only a repacked copy of the files scanned here.

## Commands

```bash
# A — credential words, basic-auth headers, key blocks, known token prefixes
grep -rniE "password|passwd|secret|token|Authorization: Basic [A-Za-z0-9+/=]{8,}|BEGIN (RSA|OPENSSH)|ghp_|xox[bp]-|AKIA[0-9A-Z]{16}" .

# B — IP addresses
grep -rnoE "\b([0-9]{1,3}\.){3}[0-9]{1,3}\b" .

# C — base64-looking blocks of 24+ characters
grep -rnoE "[A-Za-z0-9+/]{24,}={0,2}" .

# D — user@host / ssh targets
grep -rnoE "[a-zA-Z0-9_.-]+@[a-zA-Z0-9.-]+|ssh [a-z][a-z0-9_-]+" .

# E — every URL in the kit
grep -rhoE "https?://[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+" . | sort -u
```

## Result

| Scan | Finding |
|---|---|
| **A — credentials** | ~45 hits, **all** either a variable *name* (`ORISO_SB_MCP_AUTH`, `ORISO_UA_AUTH`, `ORISO_KIT_TOKEN`), a placeholder in angle brackets (`<base64 of user:password, from Frank>`, `<token>`), or the words "secret"/"token" in prose describing the mechanism. **No value, hash, key or token.** |
| **B — IP addresses** | **None.** Not one IPv4 literal anywhere in the kit. |
| **C — base64 blocks** | 15 hits, all ordinary long identifiers: CamelCase function names in the feature page (`apiGetCaseHandoverCandidates`, `useCaseHandoverReasonPolicies`, …), `OpenResilienceInitiative`, `SessionStart/PostToolUse`, path fragments. **No encoded credential.** |
| **D — ssh / user@host** | `ssh predev` and `ssh -G predev` (the SSH *alias*, explicitly permitted — no host, no user, no key), `git@github.com` inside a documented example origin URL, `understand-anything@understand-anything` (a plugin identifier), `wght@400` (a Google-Fonts parameter). **No real ssh host or credential.** |
| **E — URLs** | 10 distinct, all credential-free: `https://predev.oriso.org/{ua,storybook-frontend-mcp/mcp,storybook-admin-mcp/mcp}`, `https://secrets.dreambau.com`, `https://understand.oriso.org`, `https://github.com/OpenResilienceInitiative/ORISO-Frontend.git`, `https://claude.com/claude-code`, and two Google-Fonts URLs in the feature page. **No basic-auth credentials embedded in any URL** (no `https://user:pass@host` form). |

**Verdict: clean.** No credential value, no hash, no token, no key material, no IP address and
no Basic-Auth value is present in this folder.

## Deliberately present, and why it is not a secret

- `INFISICAL_PROJECT_ID=2808af88-2c60-4023-8754-98665192cfdf` (`install.sh`, `mcp-add.sh`,
  `ua-pull.sh`) — the *identifier* of the Infisical project "ORISO Test Access". It addresses
  a project; it grants nothing. Reading a secret from it still requires an authenticated
  `infisical login`. Carried over unchanged from the source kit.
- `https://secrets.dreambau.com` — the self-hosted Infisical instance. Naming it is required,
  because without `--domain` the CLI silently talks to Infisical Cloud, which is the wrong
  instance.
- `predev` as an SSH alias and `https://predev.oriso.org/ua` as a URL — explicitly allowed:
  an alias resolves only inside a developer's own `~/.ssh/config`, and the URL answers 401
  without credentials.

## How the kit stays clean

All three scripts read `ORISO_SB_MCP_AUTH` / `ORISO_UA_AUTH` at runtime, in this order:
environment → Infisical (authenticated CLI) → tell the user to ask Frank. Nothing is ever
written to a file. MCP servers are registered with `--scope user`, never `--scope project`,
so the Basic-Auth value cannot land in a repository's `.mcp.json`. `build-bundle.sh` packs
only the files listed above, so a future bundle cannot pick up a stray local secret.

Re-run the five commands above after any change to this folder, and update this file.
