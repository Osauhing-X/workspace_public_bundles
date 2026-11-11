# Kanban

The packaged editor adapts the original board UI through Core's authenticated instance-owned data bridge. Board sets, columns, tasks, assignments, completion and moving tasks are available without a provider key. Supabase/Trello synchronization is not declared as restored.

Only one editor draft can be open at a time. Cancel restores the pre-edit state, including removing a newly added unsaved item. Failed saves retain the draft for retry; failed immediate actions restore the previous visible state. Completed tasks share the same editor as active tasks. Column selectors provide a keyboard-accessible alternative to dragging, including for completed tasks.

Local browser regression tests use a populated fixture and Core's real disk persistence, not a connected remote provider or deployed user data.

## Dashboard team access

Version 0.2.0 supplies a dedicated `member_ui` using the same board editor and the instance's existing Kanban data. A Core administrator grants the installed Kanban instance to a Dashboard group. That grants the group access to **all board sets and tasks in that instance**, including shared notes; task assignees are organizational labels, not access restrictions. Use separate Kanban instances for teams whose data must remain separate.

The Dashboard uses Core's verified local account, with no Supabase login or provider credentials. Reads and saves recheck current group access. A revision token rejects a stale draft after another editor changes the board, including edits made directly in Core. Invalid board references and dates are rejected by Core's ordinary Kanban validator.

Requires Core's `member_ui.storage = "kanban-settings"` adapter and Dashboard 0.4.2 or newer. The separate member handler does not call the owner handler or obtain environment variables. No remote Supabase/Trello synchronization is added.

To rebuild both self-contained editor documents, use Core's build helper with
`node /path/to/core/scripts/build-package-ui.mjs /path/to/modules/kanban --shared-member-document`.
The two documents share the editor UI; the member document always runs through
its dedicated member handler, Core account and scoped state adapter.
