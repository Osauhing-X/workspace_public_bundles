# Changelog

## 0.1.0-migrating — 2026-09-21

- Initial package release in the Extaas public catalog.

# 0.1.1

- Restore a private, instance-owned project/task workspace instead of the info-only placeholder.
- Add edits, search, deadlines, completion/reopening and recoverable archives with validated project relationships.
- Use Core's authenticated package bridge, a network-disabled sandbox and a monochrome icon.
- Keep staff permissions, billing and legacy import explicitly out of this partial restoration.
# 0.1.2

- Save directly through the authenticated bridge without native form submission in Core's allow-forms-free sandbox; preserve validation and keyboard save.
# 0.1.3

- Initialize all editor options before loading and lock fields until state is available; a failed first load cannot leave an editable form with an empty status selector.
# 0.1.4

- Replace blocked native confirm dialogs with an accessible in-document confirmation panel. Core does not need allow-modals or allow-forms.
# 0.1.5

- Align the request deadline with Core's bounded worker and retain a new draft's random record ID across uncertain save retries to prevent duplicate creation.

# 0.1.6

- Lock background controls during confirmation, support Escape and keyboard focus cycling, and return focus when dismissed.
- Measure actual body content for the iframe height so repeated edits do not accumulate blank space.
