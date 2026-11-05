# Changelog

## 0.1.9 — 2026-10-26

- Bound the management workspace on wide screens, align touch targets and keyboard focus, and retain compact contact table scrolling. Contact access and consent rules are unchanged.

## 0.1.8 — 2026-10-23

- Own the contact normalization, source groups, opt-out-preserving merge and response contract in `api/contacts.js`.
- Declare bounded provider read inputs; requires the updated Core and explicit read-provider connections. Existing Website subscription settings and public signup behavior are preserved.

## 0.1.7 — 2026-10-23

- Rename the display to Communication while preserving package IDs, existing Website signup settings and public consent behavior.
- Add configured Resend/Stripe/Supabase Auth source views and a deduplicated All view, without merging provider identities or implying marketing consent.

## 0.1.1 — 2026-10-03

- Restore the original contact list, search and editor in the external package without its legacy header.
- Use Core's authenticated bridge and source-scoped Resend actions; require an explicit permanent-removal confirmation.
- Add a consent-requiring Website subscription renderer and per-instance publication setting.
- Preserve existing unsubscribed contacts instead of resubscribing them on duplicate signup.
- Live provider CRUD acceptance remains pending.

## 0.1.0-migrating — 2026-09-21

- Initial package release in the Extaas public catalog.

