# Changelog

## 0.1.10 — 2026-11-05

- Declare the received-message read capability for the Core Inbox. No webhook or read grant is activated by installation.

## 0.1.9 — 2026-10-26

- Bound the composer width, align form and confirmation controls, and improve narrow-screen recipient selection. Send confirmation, private batches and retry protection are unchanged.

## 0.1.8 — 2026-10-23

- Declare Communication's `contacts` module API scope. Update Email before Communication 0.1.8 and use the updated Core; existing exact contact-source authorization is retained without granting unrelated API actions.

## 0.1.7 — 2026-10-23

- Add Communication source/group/individual recipient selection and separately confirmed, individually addressed private batches.
- Retain stable request keys for uncertain retries and reject unsupported batch attachments/shared recipient fields. Ordinary single-message compose and draft behavior remains unchanged.

## 0.1.0-migrating — 2026-09-21

- Initial package release in the Extaas public catalog.

# 0.1.5

- Show recipient confirmation in a keyboard-accessible modal popover with cancellation focused by default.
- Explain disabled/not-ready requests without implying that the provider may have sent them.

# 0.1.6

- Ask the isolated Core frame host to reveal confirmation in the visible page area and restore the original scroll position on cancel.

