# Auto-Run All Pending Emails Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make auto-run consume all remaining pending emails by default, disable auto-run when the pending list is empty, and keep view-only controls usable during runtime locks.

**Architecture:** Keep the existing auto-run state machine intact. Move the sidepanel trigger from manual run-count input to a derived pending-email count, and replace broad settings-card inert locking with targeted per-control locking.

**Tech Stack:** MV3 extension, sidepanel DOM logic, background runtime helpers, Node test runner

---

### Task 1: Lock the desired behavior with tests

**Files:**
- Create: `tests/sidepanel-auto-run-pending-count.test.js`
- Create: `tests/background-normalize-run-count.test.js`

- [ ] Step 1: Write sidepanel helper tests for deriving run count from pending emails and disabling auto-run on empty lists.
- [ ] Step 2: Run the sidepanel helper test and verify it fails.
- [ ] Step 3: Write background helper test showing `normalizeRunCount` no longer caps values at 50.
- [ ] Step 4: Run the background helper test and verify it fails.

### Task 2: Implement pending-email-driven auto-run

**Files:**
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`
- Modify: `background.js`

- [ ] Step 1: Remove or hide the manual run-count UI.
- [ ] Step 2: Add sidepanel helpers that derive auto-run rounds from the pending email pool.
- [ ] Step 3: Update auto-run and scheduled auto-run triggers to send derived total runs.
- [ ] Step 4: Remove the 50-run cap from `normalizeRunCount`.
- [ ] Step 5: Run focused tests and verify they pass.

### Task 3: Implement view-only controls during runtime lock

**Files:**
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`

- [ ] Step 1: Mark visibility toggles and email tabs as lock-exempt controls.
- [ ] Step 2: Replace `inert` locking with targeted editable-control locking.
- [ ] Step 3: Ensure runtime unlock restores normal computed disabled states.
- [ ] Step 4: Run focused sidepanel tests and verify they pass.

### Task 4: Verify full regression coverage

**Files:**
- Test only

- [ ] Step 1: Run focused tests for the new helpers and sidepanel behavior.
- [ ] Step 2: Run `node --test tests/*.test.js`.
- [ ] Step 3: Report the verified outcomes and any residual manual verification gaps.
