# Email Tabs And Window Scope Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sidepanel tabs for pending/registered email lists and constrain extension-opened pages to the sidepanel's current browser window.

**Architecture:** Keep the two email managers unchanged and add a small sidepanel tab controller for display state only. Store a runtime owner window id in session state and make tab creation/reuse honor that preferred window, with fallback when the window no longer exists.

**Tech Stack:** Chrome extension sidepanel UI, background tab runtime, Node-based unit tests

---

## Chunk 1: Sidepanel Email Tabs

### Task 1: Add failing tests for tab switching

**Files:**
- Create: `tests/sidepanel-email-tabs.test.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.css`
- Modify: `sidepanel/sidepanel.js`

- [ ] Write failing tests for default active tab and tab switching
- [ ] Run `node --test tests/sidepanel-email-tabs.test.js` and confirm failure
- [ ] Implement minimal tab markup, styling, and controller wiring
- [ ] Re-run `node --test tests/sidepanel-email-tabs.test.js` until green

## Chunk 2: Owner Window Scoped Tabs

### Task 2: Add failing tests for owner window tab reuse/create

**Files:**
- Modify: `tests/background-tab-runtime-module.test.js`
- Modify: `background/tab-runtime.js`
- Modify: `sidepanel/sidepanel.js`

- [ ] Add failing tests for creating tabs in owner window and avoiding reuse across other windows
- [ ] Run targeted tab runtime tests and confirm failure
- [ ] Implement owner window helpers and sidepanel window registration
- [ ] Re-run targeted tests until green

## Chunk 3: Regression Verification

### Task 3: Run focused and broader regressions

**Files:**
- Test: `tests/sidepanel-email-tabs.test.js`
- Test: `tests/background-tab-runtime-module.test.js`
- Test: `tests/sidepanel-custom-email-manager.test.js`
- Test: `tests/sidepanel-registered-email-manager.test.js`
- Test: `tests/*.test.js`

- [ ] Run focused tests for the new UI and tab runtime behavior
- [ ] Run nearby sidepanel manager tests
- [ ] Run broader `node --test tests/*.test.js`
- [ ] Confirm no regressions before handoff
