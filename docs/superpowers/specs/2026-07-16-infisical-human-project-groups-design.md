# Infisical Human Project Membership Design

## Goal

Make Infisical the authoritative source for human `oriso`, `orimo`, and
`dreambau` assignments in Dreambau Testmails without granting those people
access to Infisical secrets.

## Live constraint and decision

Organization groups require Infisical Enterprise and cannot be created on the
live Free plan. A pure project membership with the built-in `no-access` role is
therefore the assignment marker. It is visible in Infisical's project member
administration while granting no permissions. Memberships with any additional
role are deliberately ignored.

Shazia Kausar is assigned to ORISO Test Access and Dreambau Test Access with
`no-access`; she is not assigned to ORIMO Test Access. AI identities and their
future secret permissions remain out of scope.

## Architecture

An `InfisicalHumanAccessProvider` authenticates with the existing read-only
Universal Auth credential and reads all three configured project membership
lists. It maps lower-cased human email addresses whose complete role set is
`no-access` to Testmails project scopes and caches the result for at most 60
seconds.

Testmails synchronizes a non-admin user's project array before returning human
user data or authorizing account access. Refresh failures fail closed with HTTP
503. Administrators retain their local bootstrap scopes so an Infisical outage
cannot lock out the bootstrap administrator.

## Data flow and security

1. An Infisical administrator adds or updates a human project membership.
2. Testmails reads `GET /api/v1/projects/{projectId}/memberships` for the three
   configured test-access projects.
3. Only memberships whose roles are exactly `no-access` become Testmails
   assignments.
4. The resolved projects are persisted in `human_users.projects` and used for
   account scoping.

Universal Auth tokens and credentials are never logged or returned. A member
with no safe marker remains authenticated but sees no test accounts. Passkey
credentials, enrollment codes, roles, and activation state stay in local
SQLite.

## Verification

- Unit tests cover mapping, normalization, exclusion of privileged and mixed
  roles, caching, and API failure.
- Authentication tests cover synchronization, zero access, administrator
  independence, and fail-closed behavior.
- Full lint, unit tests, and build must pass.
- Live read-only verification must show Shazia as `no-access` in ORISO and
  Dreambau, absent from ORIMO, and synchronized to `oriso,dreambau` in
  Testmails without exposing tokens, enrollment codes, or secrets.
