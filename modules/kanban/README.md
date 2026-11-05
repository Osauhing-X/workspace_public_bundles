# Kanban

The packaged editor adapts the original board UI through Core's authenticated instance-owned data bridge. Board sets, columns, tasks, assignments, completion and moving tasks are available without a provider key. Supabase/Trello synchronization is not declared as restored.

Only one editor draft can be open at a time. Cancel restores the pre-edit state, including removing a newly added unsaved item. Failed saves retain the draft for retry; failed immediate actions restore the previous visible state. Completed tasks share the same editor as active tasks. Column selectors provide a keyboard-accessible alternative to dragging, including for completed tasks.

Local browser regression tests use a populated fixture and Core's real disk persistence, not a connected remote provider or deployed user data.
