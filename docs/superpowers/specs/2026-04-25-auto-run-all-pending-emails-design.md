# Auto-Run All Pending Emails Design

## Goal

Make sidepanel auto-run consume the full pending custom email pool by default instead of a user-entered run count, and keep only view-oriented controls usable while auto-run is active.

## Scope

- Remove the need to configure a manual run count in the sidepanel.
- Derive auto-run total rounds from the current pending email pool's remaining consumable count.
- Disable the auto-run trigger when the pending email list is empty.
- During active auto-run or scheduled lock states, keep form fields non-editable while still allowing:
  - password/secret visibility toggle buttons
  - pending/registered email tabs

## Design

### Auto-run round count

Sidepanel start actions will calculate the run count from the current custom email view model's `remainingCount`. This preserves current pool progress semantics: already-used emails are not re-run unless the user explicitly resets progress.

The background `normalizeRunCount` guard will still enforce a minimum of `1`, but will no longer cap values at `50`, so larger lists can run end-to-end.

### Empty-list behavior

The `自动` button becomes disabled whenever the pending email list has no remaining consumable entries and the auto-run state is idle. Manual single-step execution remains available.

### Locked settings behavior

The current `inert` lock is too broad because it also blocks view-only controls. Replace it with targeted lock handling:

- editable inputs, textareas, selects, save/reset/list mutation actions remain locked
- visibility toggles and email tabs remain interactive

This keeps runtime safety while allowing users to inspect secrets and switch between pending/registered email tabs during execution.

## Testing

- Sidepanel helper tests for derived pending auto-run counts and empty-list button disabling.
- Background helper regression for removing the `50` run cap.
- Existing full JS test suite.
