# Infisical Human Project Membership Implementation Plan

**Goal:** Synchronize non-admin Testmails project scopes from pure `no-access`
Infisical project memberships and provision Shazia's ORISO and Dreambau
assignments.

**Architecture:** The human-access provider uses the existing read-only
Universal Auth boundary to read configured project memberships. Request-time
synchronization persists effective scopes and fails closed for non-admin users;
administrators retain their bootstrap scopes.

## Constraints

- Organization groups are unavailable on the live Infisical Free plan.
- Only pure `no-access` project memberships are safe assignment markers.
- No AI identity or secret-value changes are in scope.
- Tokens, credentials, enrollment codes, and secret values never enter logs or
  committed files.

## Tasks

- [x] Add TDD coverage for membership mapping, role filtering, normalization,
  caching, and upstream failures.
- [x] Implement and test the Infisical human-access provider.
- [x] Persist synchronized scopes and enforce fail-closed non-admin access.
- [x] Keep administrator scopes independent from Infisical availability.
- [x] Update the employee UI and operational documentation.
- [x] Change Shazia's ORISO membership from `member` to `no-access`.
- [x] Add Shazia to Dreambau Test Access with `no-access`; keep ORIMO absent.
- [x] Verify the three live memberships through the read-only runtime identity.
- [ ] Run the complete lint, test, and production build gates.
- [ ] Build/import a unique image, deploy it, and wait for rollout readiness.
- [ ] Trigger and verify live Testmails synchronization without exposing
  credentials or enrollment codes.
