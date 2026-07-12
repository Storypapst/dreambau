# Visible Taxonomy Tags Design

## Goal

Make account metadata readable at a glance: selected roles, topics, and conversation types appear as localized colored tags instead of an opaque selection count, while intermediate desktop widths truncate safely instead of overlapping.

## Scope

- Replace `N selected` / `N ausgewählt` summaries with the taxonomy label plus visible selected pills.
- Render selected pills directly below each compact multi-select in desktop rows and mobile cards.
- Give roles, topics, and conversation types distinct semantic colors; selected pills can remove their value with one click.
- Keep the existing searchable checkbox popover for adding values and instant persistence.
- Replace raw newline textareas in taxonomy settings with tag editors that show localized display labels, accept one new value at a time, and allow removal.
- Preserve stable ORISO topic keys in storage while always presenting German or English labels.
- Make table cells, labels, email addresses, and controls shrinkable; long content uses ellipsis and never overlaps adjacent columns.
- Keep existing filtering behavior and display the active filter values as pills.
- Rotate the shared application password using the operator-provided value through Keychain and Kubernetes Secret handling. Never commit or log the plaintext value.

## Out of Scope

- Carrier or organization-name metadata.
- Generic free-form account tags.
- Changes to mailbox passwords, Stalwart accounts, email content, or encryption keys.

## Interaction

The compact button always names the category, for example `Themen / Topics`. Selected values appear immediately beneath it. Clicking the button opens search and checkboxes. Clicking a pill's remove icon saves the reduced selection immediately. The settings sheet uses the same visual language: input plus Add action, then removable pills.

## Responsive Layout

The assignment column uses shrinkable grid tracks (`minmax(0, 1fr)`). Every trigger uses `min-width: 0`, a bounded width, and truncated text. At narrower desktop widths the table remains readable by clipping labels with `…`; mobile continues to use cards.

## Data and Safety

No schema migration is required. Existing string arrays and taxonomy tables remain authoritative. Topic keys are mapped to localized labels only at the presentation boundary. Password rotation updates the local operator Keychain and the `wcr/testmails-auth` Secret with a new Argon2id hash and fresh session secret, then rolls the application to invalidate old sessions.

## Verification

- Unit tests cover tag label formatting and selection removal.
- Browser tests verify visible selected labels, localized ORISO topic names, filtering, truncation/non-overlap at the reported breakpoint, and settings tag creation/removal.
- Full lint, unit, build, desktop/mobile E2E, Kubernetes readiness, and login with the rotated password must pass before completion.
