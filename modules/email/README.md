# Email

## Communication recipient selection (0.1.7)

Select an enabled Communication module from the same package source and Application context, then choose All or one of its configured provider groups and review individual recipients. Known Resend opt-outs are excluded even when the same address also exists in Stripe/Auth. Missing or failed configured sources block a private send rather than using a partial list. The server re-reads membership before sending; browser-supplied addresses outside that group are rejected. Customer/Auth membership alone is not permission to contact someone: the sender must explicitly confirm their basis to contact the selected recipients.

One private batch supports 1–100 reviewed recipients. Resend receives separate email objects with exactly one To address each, no shared CC/BCC list and no attachments (not supported by Resend batch API). A stable idempotency key is retained by the UI for uncertain retries. Core stores a private receipt containing a digest, request ID, count and status, not message text or recipient addresses. Accepted receipts do not send again; uncertain retries are blocked after 23 hours, before Resend's 24-hour duplicate-protection window expires. There is no automatic restart/replay. An administrator must check provider logs before deliberately discarding an uncertain retry. Receipts are bounded to 5,000 per Email module and are not silently purged.

The batch is visible as active/failed work in Jobs without recipient addresses or email body in the job description. Successful Jobs entries are removed according to Core's existing policy; the separate send receipt remains. Tests never send real email. Requires updated Core, Communication 0.1.7 and Resend 1.1.5. Account quotas, suppressions, sender verification and delivery outcomes remain provider-controlled.

Reusable templates support `{{field_name}}` text fields. Field values are HTML-escaped, and the selected template plus field values persist with the draft. This does not execute JavaScript templates.

The original Email composer is rendered by this external package, not embedded in Core. It provides HTML and Markdown editing, an inert sandboxed preview, explicit To/CC/BCC/reply-to headers, payload editing and reusable HTML templates/components/snippets. Drafts and assets persist in the module instance volume. Supabase is optional; Resend is required for sending.

Sending requires a second recipient confirmation. A provider acceptance ID is not a delivery receipt. On a timeout, inspect provider logs before retrying. Sender verification and provider limits still apply. Attachments use inline base64 content only, with a Workspace limit of 450 KB combined; remote attachment paths are rejected.

Legacy executable JavaScript templates, AI/credit purchasing, provider Broadcast campaigns and remote reusable attachment synchronization are not connected by this migration. The Communication batch flow above is separately scoped and does not turn these legacy controls on. Integration keys stay in the server-side gateway.


Inbox requires a Core release with signed Email receiving support. Use a unique Resend webhook secret and the exact receiving address in Core. Message-body reads additionally require Resend 1.1.11 and an explicitly selected, owner-confirmed receiving connection. Scheduled campaigns are managed separately in Content Calendar.
