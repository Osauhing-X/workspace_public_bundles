# Communication read API

Action `contacts`, mode `read`, handler `api/contacts.js`. Requires Core support for module API provider read inputs. The stable module package ID is `audience`.

Input body: `{}`. Output: `{groups, setup, contacts, all_contacts}`. Groups contain `id`, `label`, `status` and whitelisted `contacts`. IDs are `resend`, `stripe`, `supabase`. Only explicitly connected, updated read providers become groups. Configured failed providers return `unavailable`, never a successful empty list. All merges normalized emails and preserves any known Resend opt-out. Customer/Auth membership is not marketing consent.

A consuming module declares `modules: [{id:"audience", actions:["contacts"]}]` and the local owner selects the exact instance under Module API connections. UI bridge requests use `resource:"module-api"`, body `{module:"audience",action:"contacts",payload:{}}`. This is not a public endpoint. General module API grants do not give provider keys, arbitrary database access, subscription mutations or permission to send email.

Communication's Service connections must explicitly select each provider. Minimum provider versions: Resend 1.1.6 (`contact-overview`), Stripe 0.1.6 (`customer-contacts`), Supabase 0.1.6 (`auth-contacts`). No contact cache or cross-provider copy is persisted. Limits: existing provider projections, 10000 records per returned source and Core worker size/time bounds; larger responses fail rather than claiming a complete list.
