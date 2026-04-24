# Gmail IMAP + Native Host Refactor Design

## Goal

Refactor the current extension flow so that:

1. opening the ChatGPT homepage immediately clears login cookies
2. Gmail verification code retrieval moves from mailbox tab DOM polling to background-driven IMAP polling
3. CPA verification moves from panel-page callback submission to background token exchange and auth-file upload
4. successfully registered and CPA-synced emails move from the pending list into a separate registered list

The existing step-based extension flow should remain intact where possible. The work should remove Gmail-page and CPA-page dependency from the main registration path, not rebuild the entire product.

## Existing Constraints

- The project is a Manifest V3 Chrome extension with no build step.
- Runtime orchestration lives in `background.js`.
- Current Gmail code retrieval depends on `content/gmail-mail.js`.
- Current CPA flow depends on `content/vps-panel.js` and the CPA panel UI.
- Step 9 currently captures a localhost callback URL, but the extension does not own the PKCE material required to exchange the callback code for tokens.
- The workspace is not currently a Git worktree, so this spec cannot be committed from the current environment.

## Hard Constraints

### 1. Gmail IMAP cannot stay inside pure MV3 extension runtime

The extension itself cannot be the IMAP client for this design. The supported implementation path is:

- extension background logic
- Chrome Native Messaging bridge
- local native host process
- IMAP over TLS from the native host

This keeps the product self-contained from the user's perspective while avoiding a separate long-running HTTP backend.

### 2. Step 7 must stop depending on CPA for OAuth URL generation

If the extension continues to fetch an OAuth URL from CPA, it still lacks the local `state` and `code_verifier` used to exchange the callback `code` for tokens.

Therefore the refactor must move OAuth start into local logic:

- generate PKCE verifier and challenge locally
- generate `state` locally
- generate the OpenAI OAuth URL locally
- persist the OAuth runtime context locally

Only with that change can Step 10 exchange the callback URL for tokens and upload a CPA auth file in the background.

## Design Summary

The refactor introduces three focused subsystems:

1. `native-host bridge`
   A small local companion process invoked through Chrome Native Messaging.
2. `background Gmail IMAP verification service`
   Background-owned verification code polling through the native host instead of Gmail tabs.
3. `background OAuth + CPA upload service`
   Background-owned OAuth URL generation, callback token exchange, and CPA auth-file upload.

The step machine remains in the extension, but provider-specific side effects move out of content scripts and into background plus native host.

## Architecture

### 1. Native Host Responsibilities

The native host exposes a small command-oriented protocol:

- `gmail.testConnection`
- `gmail.waitForVerificationCode`
- `oauth.exchangeCallback`
- `cpa.uploadAuthFile`

The host is responsible for:

- Gmail IMAP login using configured Gmail address and App Password
- polling recent messages and extracting verification codes
- exchanging OpenAI OAuth callback code for `access_token`, `refresh_token`, and `id_token`
- generating CPA-compatible auth JSON
- uploading the generated JSON file payload to CPA management API

The extension remains responsible for:

- flow control
- tab control
- page automation
- state persistence
- retry policies
- deciding when each native-host command is invoked

### 2. Local OAuth Runtime Context

Add a new session-scoped OAuth context record in extension state:

- `oauthRuntime.state`
- `oauthRuntime.codeVerifier`
- `oauthRuntime.redirectUri`
- `oauthRuntime.clientId`
- `oauthRuntime.authUrl`
- `oauthRuntime.createdAt`

This context is created in Step 7 and consumed in Step 10.

### 3. Email List Model

Keep the current pending list behavior, but split persistent email storage into:

- `customEmailList`
  Pending registration emails.
- `customEmailUsedMap`
  Current allocation progress within the pending list.
- `registeredEmailList`
  Emails that have completed registration and successful CPA upload.

`registeredEmailList` is operator-editable and supports import, manual editing, and clearing.

## Flow Changes

### Step 1: Open ChatGPT and immediately clear cookies

Current behavior:

- Step 1 opens ChatGPT
- Step 6 later waits 25 seconds and clears cookies

New behavior:

- Step 1 opens ChatGPT
- once the page is ready, it immediately runs the existing ChatGPT/OpenAI cookie cleanup logic
- Step 6 is removed as a real cookie-clearing operation and becomes either:
  - a no-op compatibility step, or
  - a renamed validation step if the UI must still preserve ten steps

Recommended implementation:

- keep Step 6 as a compatibility step with no destructive action
- move the current cookie cleanup helper into a reusable function called by Step 1
- reduce duplicated cookie-clearing code paths to one shared implementation

### Step 4 and Step 8: Background Gmail verification

Current behavior:

- background opens or reuses Gmail tab
- `content/gmail-mail.js` polls inbox and spam
- background submits the code

New behavior:

- background calls native host `gmail.waitForVerificationCode`
- native host polls Gmail IMAP using Gmail App Password
- host returns the newest matching code and timestamp
- background submits the code to the signup/auth page

Matching rules should stay aligned with current behavior:

- step-specific sender and subject filters
- time window filtering using the current verification request timestamp
- exclude already rejected codes
- optional target email filtering for forwarded mail scenarios

The Gmail tab and `content/gmail-mail.js` are no longer part of the core flow.

### Step 7: Local OAuth start

Current behavior:

- background opens CPA panel
- content script reads OAuth URL from CPA page
- background opens the returned OAuth URL

New behavior:

- background generates PKCE verifier and challenge locally
- background builds the OpenAI OAuth URL locally
- background stores `oauthRuntime`
- background opens the generated OAuth URL directly

CPA is no longer needed in Step 7.

### Step 9: Keep localhost callback capture

Current behavior is mostly retained:

- background keeps listening for localhost callback navigation
- the consent page automation remains in the extension
- Step 9 stores the callback URL in session state

No CPA page interaction is needed here.

### Step 10: Background callback exchange and CPA upload

Current behavior:

- background opens CPA panel
- content script fills callback URL into CPA page

New behavior:

1. background validates that `localhostUrl` exists
2. background validates that `oauthRuntime` exists
3. background sends callback URL plus local PKCE context to native host `oauth.exchangeCallback`
4. native host exchanges callback `code` for tokens
5. native host builds CPA-compatible auth JSON
6. background sends CPA target config plus token bundle to native host `cpa.uploadAuthFile`
7. successful upload completes Step 10

This completely removes `content/vps-panel.js` from the success path.

## Configuration Changes

### Gmail Configuration

Replace the browser-login-oriented Gmail config with IMAP config:

- `gmailImapEmail`
- `gmailImapAppPassword`
- `gmailImapHost` default `imap.gmail.com`
- `gmailImapPort` default `993`

UI changes:

- remove the `Login Gmail` action from the main flow path
- replace it with `Test IMAP Connection`

### CPA Configuration

Keep CPA as an API target, not as a panel page dependency.

Rename settings to reflect actual use:

- `cpaApiUrl`
- `cpaManagementKey`

UI changes:

- remove local CPA step-10 mode toggle
- remove wording that suggests callback URL is submitted through a web page
- rename Step 10 label to `Upload CPA Auth File`

## Pending and Registered Email Lists

### Pending List Behavior

`customEmailList` remains the source of allocatable registration emails.

Allocation behavior stays mostly unchanged:

- allocate next unused email for a fresh run
- preserve current email within the same run
- do not remove pending emails on partial success

### Registered List Behavior

Add persistent `registeredEmailList`.

On successful registration plus successful CPA upload:

1. append current email to `registeredEmailList` if not already present
2. remove current email from `customEmailList`
3. remove the email entry from `customEmailUsedMap`
4. clear runtime `email` so the next run allocates a new pending email

If registration succeeds but CPA upload fails:

- do not move the email to `registeredEmailList`
- do not remove it from pending list
- keep retryability intact

### Side Panel UX

The side panel should expose two list managers:

- pending email list
- registered email list

Both support:

- paste/import by text
- manual editing
- clear all

Pending list additionally keeps progress summary:

- total
- used
- remaining
- current
- next

Registered list displays:

- total registered count
- recent entries preview

## Data Model Changes

Add persistent settings:

- `gmailImapEmail`
- `gmailImapAppPassword`
- `gmailImapHost`
- `gmailImapPort`
- `registeredEmailList`

Add session state:

- `oauthRuntime`
- optional `lastCpaUploadResult`
- optional `lastNativeHostError`

Keep compatibility mapping where practical so old config import does not silently break.

## File-Level Impact

Primary extension changes:

- `background.js`
- `background/verification-flow.js`
- `background/steps/open-chatgpt.js`
- `background/steps/clear-login-cookies.js`
- `background/steps/oauth-login.js`
- `background/steps/platform-verify.js`
- `background/custom-email-pool.js`
- `background/message-router.js`
- `background/navigation-utils.js`
- `sidepanel/sidepanel.html`
- `sidepanel/sidepanel.js`
- `sidepanel/custom-email-manager.js`
- `data/step-definitions.js`
- `manifest.json`

New extension-side helpers are expected:

- `background/native-host.js`
- `background/oauth-runtime.js`
- `background/cpa-auth-upload.js`

Possible deprecation path:

- `content/gmail-mail.js`
- `content/vps-panel.js`

They may remain temporarily for compatibility, but should no longer be on the main path after the refactor.

## Error Handling

The new path must surface explicit operator-facing errors:

- native host unavailable
- Gmail IMAP authentication failed
- Gmail IMAP timeout waiting for code
- no matching verification mail found
- OAuth runtime context missing
- OAuth callback state mismatch
- token exchange failed
- CPA upload failed
- registered-list migration failed after successful upload

Failures should not silently corrupt pending-email progress.

## Testing Strategy

Implementation should follow TDD and add focused tests before code changes.

Minimum regression coverage:

- Step 1 invokes cookie cleanup immediately after homepage readiness
- Step 6 no longer performs delayed cookie cleanup
- Step 4 uses native-host verification instead of Gmail tab polling
- Step 8 uses native-host verification instead of Gmail tab polling
- Step 7 generates and stores local OAuth runtime context
- Step 10 exchanges callback URL using stored PKCE context
- Step 10 uploads CPA auth file without opening CPA panel
- successful Step 10 migrates pending email into registered list
- failed Step 10 does not migrate the email
- side panel saves, resets, imports, and edits the registered list correctly

## Deferred Work

The first refactor intentionally does not include:

- encrypted local secret storage
- remote helper deployment
- Gmail API OAuth integration
- multi-account Gmail IMAP pool support
- automatic native-host installer

## Recommendation

Implement the refactor as:

- extension main controller
- Native Messaging local helper
- locally generated OpenAI OAuth URL and PKCE state
- direct CPA auth-file upload from background-triggered native host commands

This is the smallest design that satisfies all requested behavior without relying on browser Gmail pages, CPA pages, or a separate local HTTP backend.
