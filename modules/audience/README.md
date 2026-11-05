# Communication

The package ID remains `audience` for existing data, Routes tokens and Website subscription forms. The display name is Communication. Version 0.1.7 requires Core with the Communication source adapter and opted-in module service connections, Resend 1.1.5, Stripe 0.1.6 for customer contacts and Supabase 0.1.6 for Auth contacts.

Only configured, ready declared sources appear. Select privileged customer/Auth connections explicitly in the module's **Service connections** panel. Stripe/Supabase groups are read-only; Resend retains its existing contact/subscription controls. **All** combines case-normalized matching email addresses without treating Auth/customer membership as marketing permission. A known Resend unsubscribe stays an opt-out after merging. No contact is copied into another provider or automatically resubscribed. No full cross-provider contact cache is persisted by this view.

Failed source reads are labelled unavailable, not empty successful lists. Stripe and Auth reads are bounded to 1,000 provider records; pagination failures and over-limit reads do not return partial lists. Unconfigured providers do not appear as selectable groups. Names/emails are display data, never authorization claims.

The original contact list, search, creation, editing and subscription controls run in a package-owned sandbox UI without the legacy header. Core owns authentication and forwards declared actions through the source-scoped Resend integration. Update that integration to 1.1.0 before using the editor.

Contacts are the configured Resend account's global contacts, as in the original implementation. Changes are provider writes, not local demo data. Existing unsubscribed contacts are not silently resubscribed on signup. Permanent removal has an explicit confirmation panel.

Website visibility is stored per module instance. Enable it and add `[import:audience]` to a published Website page. The public form requires explicit subscription consent and does not reveal existing contacts or credentials.

Automated tests use a synthetic provider transport. Live provider CRUD and full visual/accessibility acceptance remain required; these tests do not certify actual Resend permissions or delivery. Automatic legacy landing-menu placement and signed unsubscribe links are not yet restored.

## Module data API

Version 0.1.8 exposes the package-owned `contacts` read API; see [API contract](api/README.md). Use a Core version supporting `api.provider_reads` and Email 0.1.8 for consumption. Explicit Resend contact reads require Resend 1.1.6; existing other read providers require 0.1.6. Select the provider instances deliberately; an ambiguous/missing connection is not an empty contact list.
