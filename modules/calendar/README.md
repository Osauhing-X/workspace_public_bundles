# Calendar

The original month/day calendar UI is shipped as an isolated package document, without the old Workspace header. Build it with Core's `scripts/build-package-ui.mjs`.

Core's authenticated instance-scoped data bridge supports creating, editing and removing reminders. Records live in the instance's persistent module volume; Supabase is not required for these local reminders. The editor converts local dates to explicit UTC instants and converts them back for editing.

Booking and Rent event feeds are not migrated yet. The UI states this limitation; it does not substitute demo events or count their runtime health as working calendar integration. The old Supabase implementation is retained as reference only and is not executed.
