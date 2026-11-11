# Changelog

## 0.2.0 — 2026-11-11

- Add a group-scoped Dashboard editor backed by the existing instance Kanban data.
- Retain all board sets, assignments, notes and completed tasks.
- Reject stale Dashboard saves after edits in Core or another Dashboard.
- Keep provider keys and Core management outside the member view.

## 0.1.8 — 2026-10-27

- Add a create-task automation action for a selected existing board and column.
- Declare its created task ID for later workflow steps.
- Use the Core Kanban storage adapter so tasks appear in the normal board UI.
- Keep automatic event activation and a visual target picker explicitly pending.

## 0.1.7 — 2026-10-14

- Keep board spacing inside the module document with responsive desktop and mobile gutters.

## 0.1.6 — 2026-10-07

- Report a missing authenticated account email instead of silently ignoring Assign to me.
- Core's authenticated local-account identity fix supplies the configured owner email; no identity or provider account is fabricated.

## 0.1.5 — 2026-10-05

- Cancel restores the original state for task, column and board-set drafts, including unsaved additions.
- Failed immediate actions roll back their visible changes; failed editor saves preserve drafts for retry.
- Completed tasks use the same editor and accessible column selector as active tasks.
- Board-set selection is persisted, and pending drafts cannot be silently saved by an unrelated action.
- Disable editor fields during save; soften column headers and use the CVI gold progress accent.
- Validate populated editor workflows against real local Core persistence and reload, without provider requests.

## 0.1.2 — 2026-10-03

- Apply the shared Workspace typography, surfaces and keyboard focus defaults inside the isolated package frame.

## 0.1.0-migrating — 2026-09-21

- Initial package release in the Extaas public catalog.

