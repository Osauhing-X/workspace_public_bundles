# Changelog

## 0.1.3 — 2026-10-25

- Add a package-owned multi-embed composer, safe live text preview, own-bot edit/delete controls and recoverable in-memory draft replacement.
- Dispatch form actions explicitly through the Core bridge so they work without weakening the opaque iframe's form/navigation sandbox.
- Bound rich private caches and keep text-only Website snapshots explicit and independent from later Discord edits/deletions.
- Make Website compatibility optional and remove the unused Supabase dependency; enable explicit Discord Service connection selection.
- This is not a completed replacement of the private Discord Application; its original sidebar, runtime, DM features and business plugins remain intact pending parity and cutover acceptance.

## 0.1.1 — 2026-10-07

- Restore a package-owned administration UI for scoped rooms, messages, forum creation and sending.
- Persist bounded private message caches without exposing integration credentials.
- Render explicit selected-message Website snapshots through `[import:discord]`; exclude author names/IDs and require publication consent.
- Add provider scope and data/rendering regression tests. Actual bot/channel acceptance remains a separate live check.

## 0.1.0-migrating — 2026-09-21

- Initial package release in the Extaas public catalog.

