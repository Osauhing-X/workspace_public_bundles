# Changelog

## 0.1.5 — 2026-10-26

- Add a clear customer-workspace heading and semantic compact customer/company/task totals.
- Center content within 1440px, align checkbox controls and improve touch targets, input containment and keyboard focus. Existing private state and archive behavior are unchanged.

## 0.1.4 — 2026-10-07

- Keep raw customer tag text in an editable draft and parse it on Save; immediate saves retain tags without a blur event, and typing commas does not reformat the field mid-edit.
- New customers start without a company rather than silently assigning the first company.
- Both behaviors have regression checks; the live company/customer/activity and archive/restore workflow passed on 0.1.3.

## 0.1.0-migrating — 2026-09-21

- Initial package release in the Extaas public catalog.

# 0.1.3

- Snapshot nested Svelte reactive drafts as JSON before sending Core bridge requests; fixes company saves failing with DataCloneError on the live development server.
- Clean pending timers when a bridge send fails; keep drafts intact.
- Regression-test nested proxies, immutable snapshots, response cleanup and failed sends. Rebuild the shipped UI.
