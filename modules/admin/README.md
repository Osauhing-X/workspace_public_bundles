# Admin 0.1.6

Private Core-admin workspace for projects and linked tasks. Records are persisted by Core in this module instance's volume through the authenticated package bridge. No external service or credentials are needed for these local records. UI runs inside Core's opaque-origin sandbox; notes are rendered as text, not HTML.

Includes search, project/customer/type labels, priority projects, task assignment labels and deadlines, statuses, editing, completion/reopening and recoverable archives. Active linked tasks must be archived or unlinked before archiving a project. Assignments are labels, **not account permissions**.

This is a partial restoration, not the whole original Admin suite. Original billing, staff/account management, inbox aggregation, work logs, inventory and legacy database import remain to be adapted to their current owning packages and permission boundaries. No legacy provider secrets or staff role grants are copied.

Run `node --test modules/admin/tests/*.test.js` from the catalogue root. Live interaction and visual acceptance must still be verified after installing this version.
