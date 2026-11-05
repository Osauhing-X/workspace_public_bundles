# Discord

The package owns its administration UI, private conversation cache and Website renderer. Core provides the opaque-origin UI bridge, instance-owned persistence and declared integration actions.

Configure the Discord integration's bot/application credentials plus its assigned server and channel IDs. Refresh rooms, choose a room, refresh messages, then send or create a forum conversation. Every provider operation rechecks the assigned server/channel; mentions are suppressed. Archived and locked threads cannot receive messages.

Message builder supports up to 10 embeds, fields, author/footer/media URLs, reordering and a safe text preview. Optional author/media/footer fields are collapsed to keep the main task clear. Remote images are not downloaded in the preview. Edit/delete controls appear only for messages projected as this bot's own; the integration independently rechecks ownership and the configured room before every mutation. Editing and deletion require a separate explicit confirmation. Unsent drafts survive view changes; New draft keeps an in-memory Restore previous draft option. Drafts are not persisted across page reload/navigation.

Website publication is an explicit text-only snapshot of 1–20 selected messages. It excludes sender names and Discord IDs, requires publication consent and does not update automatically after Discord edits/deletions. Embed-only messages cannot be selected for this text-only snapshot. `[import:discord]` renders it. Website compatibility is optional; the module can be managed without attaching it to Website. Anonymous visitors cannot use the bot to send messages.

The private Discord Application has **not** been retired. Its original sidebar, DM/gateway and business-plugin capabilities remain unchanged. Full builder/sidebar parity, uploads, reactions, archived browsing, forum synchronization and guest CAPTCHA/moderation are unfinished migration requirements, not implemented by these scoped REST actions.

Select the intended Discord instance under Service connections; credentials remain with the integration. The unused Supabase dependency has been removed. No second Discord gateway is started by this module.

Rich compose/edit/delete requires Discord integration **0.1.7 or newer**. The
builder calls the new `compose-message` action, so an old text-only provider
cannot silently drop embeds. Edits/deletions send the revision returned by the
last read; a concurrent change requires a refresh instead of overwriting it.
Messages containing unsupported embed formats cannot be opened for rich editing
because doing so could discard content; they remain accessible in Discord.

Tests use synthetic provider responses, never actual bot credentials or community messages. Live provider acceptance requires an approved test channel and configured integration.

Run `node --test modules/discord/tests/*.test.js integrations/discord/tests/*.test.js` from the catalogue root. For disposable visual tests run `node modules/discord/tests/preview.mjs` and open the printed loopback address. The page is labelled SYNTHETIC ONLY, has no real credentials and uses the actual handlers against an in-memory fake Discord transport; its contents disappear when stopped. It must never be used as a public deployment.
