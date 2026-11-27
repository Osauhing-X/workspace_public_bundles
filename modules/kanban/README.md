# Kanban

The packaged editor adapts the original board UI through Core's authenticated instance-owned data bridge. Board sets, columns, tasks, assignments, completion and moving tasks are available without a provider key. Supabase/Trello synchronization is not declared as restored.

Only one editor draft can be open at a time. Cancel restores the pre-edit state, including removing a newly added unsaved item. Failed saves retain the draft for retry; failed immediate actions restore the previous visible state. Completed tasks share the same editor as active tasks. Column selectors provide a keyboard-accessible alternative to dragging, including for completed tasks.

Column headers expose left/right controls for changing the persisted column order.
Boundary controls and all ordering controls during a draft or save are disabled.
A failed save restores the prior order without changing tasks, notes or board
sets. Columns use the document's vertical scrolling instead of a viewport-height
cap and nested task scrollbar; horizontal board navigation remains available.
The same rebuilt document is used in Core and Dashboard.

Each task displays its existing immutable ID in active and completed cards and
in the editor. Search matches the ID, with or without a leading `#`, as well as
the existing task text and labels. Existing tasks are not renumbered or migrated.

The next drag candidate fills the browser's native transfer data, identifies its
target column and uses the same card move as the column selector. Only a drag
started in the current editor selects a task; external text/file drops do not
select or move records. Task fields and sparse order values are preserved.
Its logic tests and package build pass. On 2026-11-28 an isolated Core fixture
verified native pointer dragging between columns, persistence after reload,
retained descriptions and notes, completed-card IDs and ID search. This
verification did not move or delete any deployed task.

Task labels are stored on the existing card, with at most 20 labels of 32 Unicode
characters each. Equivalent labels are normalized and duplicates removed. Labels
can be edited or cleared, appear on active and completed cards, and can filter
the board together with title/description search. Filters never remove records
from the saved board. An open editor stays visible even when its draft no longer
matches a filter, and failed saves retain its label draft.

Label controls are enabled only when Core advertises
`features.kanban_task_labels = true` through its owner/member data adapter. Older
Core versions retain the ordinary board editor without submitting new labels to
a storage adapter that cannot preserve them. Deploy the label-capable Core
before relying on label editing. A single shared document serves both Core and
Dashboard; group access and optimistic concurrency continue to be checked by Core.

Local browser regression tests use a populated fixture and Core's real disk persistence, not a connected remote provider or deployed user data.

## Dashboard team access

Version 0.2.0 supplies a dedicated `member_ui` using the same board editor and the instance's existing Kanban data. A Core administrator grants the installed Kanban instance to a Dashboard group. That grants the group access to **all board sets and tasks in that instance**, including shared notes; task assignees are organizational labels, not access restrictions. Use separate Kanban instances for teams whose data must remain separate.

The Dashboard uses Core's verified local account, with no Supabase login or provider credentials. Reads and saves recheck current group access. A revision token rejects a stale draft after another editor changes the board, including edits made directly in Core. Invalid board references and dates are rejected by Core's ordinary Kanban validator.

Requires Core's `member_ui.storage = "kanban-settings"` adapter and Dashboard 0.4.2 or newer. The separate member handler does not call the owner handler or obtain environment variables. No remote Supabase/Trello synchronization is added.

To rebuild both self-contained editor documents, use Core's build helper with
`node /path/to/core/scripts/build-package-ui.mjs /path/to/modules/kanban --shared-member-document`.
The two documents share the editor UI; the member document always runs through
its dedicated member handler, Core account and scoped state adapter.
