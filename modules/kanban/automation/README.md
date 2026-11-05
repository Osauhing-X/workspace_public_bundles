# Kanban automation

`create-task` creates a task in an existing board set and column belonging to
the selected Kanban instance. It requires Core's `storage: kanban` automation
adapter; older Core versions do not provide that adapter. Update Core before
using this block. The adapter writes the same validated storage as the Kanban UI
and rejects a write if the board changed while the step was running.

Choose the board-set and column IDs from your Kanban configuration. These are
currently text fields; a visual board/column picker is still needed. For the
initial default board, the IDs are `default` and `column-todo`. Custom boards
may use different IDs. Missing targets stop the action; no board is guessed.

The task title and description support earlier-step values in updated Core,
for example `Booking {{booking_service}}` after Booking's request-details step.
The output `task_id` can be used by later steps. Existing cards, assignments and
the active board are preserved. A run creates one task; repeating a manual run
creates another task. Automatic event delivery and deduplication of business
events are separate work and are not activated by installing this definition.

No email is sent, no integration credential is requested, and no other module's
storage is read. Verify a synthetic task in your installation before relying on
the workflow. This source implementation is not evidence of a live update.
