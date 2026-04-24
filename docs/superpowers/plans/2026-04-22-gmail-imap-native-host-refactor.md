# Gmail IMAP Native Host Refactor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Gmail page polling and CPA panel callback submission with a background-driven native-host flow, while splitting pending and registered email lists and moving cookie cleanup to the start of the run.

**Architecture:** Keep the existing MV3 extension as the orchestration layer, add a local Python native host for IMAP and OAuth/CPA network work, and preserve the current step machine by swapping out Gmail and CPA page dependencies behind background helpers. Step 7 must generate local PKCE state, Step 10 must exchange the callback and upload the auth file, and successful CPA sync must migrate the email from pending to registered storage.

**Tech Stack:** Chrome Extension MV3, plain JavaScript, Node `node:test`, Python 3 standard library plus optional `curl_cffi` fallback reuse patterns from repo, Chrome Native Messaging, IMAP over TLS, `chrome.storage.local`, `chrome.storage.session`

---

**Execution notes:**

- Current workspace is not a Git repository. `git rev-parse --show-toplevel` fails, so commit steps cannot run in this environment. Use local checkpoints instead, and restore the Git metadata later if commit history is required.
- Current session is not using delegated subagents. Plan-review subagent loops are therefore skipped; do a local critical review before each chunk.

## Chunk 1: Native Host Foundation

### Task 1: Add the native-host bridge contract on the extension side

**Files:**
- Create: `background/native-host.js`
- Modify: `background.js`
- Modify: `manifest.json`
- Test: `tests/background-native-host.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/background-native-host.test.js` with focused coverage for the new bridge module:

```js
test('native host helper sends request envelope and resolves reply payload', async () => {
  const calls = [];
  const api = loadModuleWithChrome({
    runtime: {
      connectNative: (name) => ({
        postMessage(message) {
          calls.push([name, message.command]);
        },
        onMessage: { addListener(listener) { listener({ ok: true, result: { code: '123456' } }); } },
        onDisconnect: { addListener() {} },
        disconnect() {},
      }),
    },
  });

  const result = await api.callNativeHost('gmail.waitForVerificationCode', {});
  assert.equal(result.code, '123456');
  assert.deepStrictEqual(calls, [['com.codex.oauth.automation', 'gmail.waitForVerificationCode']]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="native host helper"`

Expected: FAIL because `background/native-host.js` does not exist and the helper is not wired into `background.js`.

- [ ] **Step 3: Write minimal implementation**

Add `background/native-host.js` with:

- a fixed native host name such as `com.codex.oauth.automation`
- `callNativeHost(command, payload, options)`
- request/response envelope normalization
- timeout handling
- disconnect/error propagation

Wire the helper into `background.js` so other modules can consume it.

Update `manifest.json` permissions:

```json
{
  "permissions": ["nativeMessaging", "cookies", "storage", "tabs", "webNavigation", "browsingData"]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern="native host helper"`

Expected: PASS.

- [ ] **Step 5: Local checkpoint**

If Git metadata is restored later:

```bash
git add manifest.json background.js background/native-host.js tests/background-native-host.test.js
git commit -m "feat: add native host bridge"
```

Current environment: record a local checkpoint note instead of committing.

### Task 2: Add the local Python native host skeleton

**Files:**
- Create: `native_host/host.py`
- Create: `native_host/messages.py`
- Create: `native_host/install_host_manifest.py`
- Create: `native_host/com.codex.oauth.automation.template.json`
- Create: `native_host/README.md`

- [ ] **Step 1: Write the failing test**

Create a small host smoke test in `native_host/README.md` and development notes describing the required protocol:

```json
{"command":"gmail.testConnection","payload":{}}
```

Expected response:

```json
{"ok":true,"result":{"status":"not_configured"}}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
python3 native_host/host.py
```

Expected: FAIL because the file does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create a Python host that:

- reads and writes Chrome native messaging length-prefixed JSON messages
- dispatches commands from a registry
- returns structured errors
- supports no-op stub handlers for:
  - `gmail.testConnection`
  - `gmail.waitForVerificationCode`
  - `oauth.exchangeCallback`
  - `cpa.uploadAuthFile`

Add a host-manifest template and installer script that replaces the absolute path to `host.py`.

- [ ] **Step 4: Run test to verify it passes**

Run a manual smoke check:

```bash
python3 -m py_compile native_host/host.py native_host/messages.py native_host/install_host_manifest.py
```

Expected: no output, exit 0.

- [ ] **Step 5: Local checkpoint**

If Git metadata is restored later:

```bash
git add native_host/host.py native_host/messages.py native_host/install_host_manifest.py native_host/com.codex.oauth.automation.template.json native_host/README.md
git commit -m "feat: scaffold native host runtime"
```

Current environment: record a local checkpoint note instead of committing.

## Chunk 2: Step 1 Cookie Cleanup and Gmail IMAP Verification

### Task 3: Move cookie cleanup from Step 6 into Step 1

**Files:**
- Modify: `background.js`
- Modify: `background/steps/open-chatgpt.js`
- Modify: `background/steps/clear-login-cookies.js`
- Test: `tests/step1-immediate-cookie-cleanup.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/step1-immediate-cookie-cleanup.test.js`:

```js
test('step 1 clears login cookies after opening the signup entry tab', async () => {
  const events = [];
  const executor = createExecutor({
    openSignupEntryTab: async () => { events.push('open'); },
    runImmediateCookieCleanup: async () => { events.push('cleanup'); },
    completeStepFromBackground: async () => { events.push('complete'); },
  });

  await executor.executeStep1();
  assert.deepStrictEqual(events, ['open', 'cleanup', 'complete']);
});
```

Add a second assertion that Step 6 no longer calls the delayed cookie cleanup helper.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="step 1 clears login cookies"`

Expected: FAIL because Step 1 only opens the page and Step 6 still owns the cleanup.

- [ ] **Step 3: Write minimal implementation**

Refactor shared cookie-clearing logic in `background.js`:

- extract a reusable helper such as `runChatgptCookieCleanup({ delayMs, logLabel })`
- call it from Step 1 with `delayMs: 0`
- make Step 6 a compatibility no-op or a lightweight verification step

Update `background/steps/open-chatgpt.js` and `background/steps/clear-login-cookies.js` accordingly.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- --test-name-pattern="step 1 clears login cookies|step 6"
```

Expected: PASS.

- [ ] **Step 5: Local checkpoint**

If Git metadata is restored later:

```bash
git add background.js background/steps/open-chatgpt.js background/steps/clear-login-cookies.js tests/step1-immediate-cookie-cleanup.test.js
git commit -m "refactor: move cookie cleanup to step 1"
```

Current environment: record a local checkpoint note instead of committing.

### Task 4: Add Gmail IMAP configuration and background verification path

**Files:**
- Modify: `background.js`
- Modify: `background/verification-flow.js`
- Modify: `background/steps/fetch-signup-code.js`
- Modify: `background/steps/fetch-login-code.js`
- Modify: `background/message-router.js`
- Test: `tests/background-gmail-imap-settings.test.js`
- Test: `tests/verification-flow-native-host.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/background-gmail-imap-settings.test.js`:

```js
test('persistent settings normalize gmail imap config and registered list', () => {
  const payload = api.buildPersistentSettingsPayload({
    gmailImapEmail: ' User@gmail.com ',
    gmailImapAppPassword: ' abcd efgh ijkl mnop ',
    gmailImapHost: ' imap.gmail.com ',
    gmailImapPort: '993',
    registeredEmailList: ['Done@example.com', 'done@example.com'],
  });

  assert.equal(payload.gmailImapEmail, 'user@gmail.com');
  assert.equal(payload.gmailImapHost, 'imap.gmail.com');
  assert.equal(payload.gmailImapPort, 993);
  assert.deepStrictEqual(payload.registeredEmailList, ['done@example.com']);
});
```

Create `tests/verification-flow-native-host.test.js`:

```js
test('verification flow uses native host for gmail verification instead of Gmail tab polling', async () => {
  const events = [];
  const helpers = createHelpers({
    callNativeHost: async (command) => {
      events.push(command);
      return { code: '654321', emailTimestamp: 123 };
    },
    sendToMailContentScriptResilient: async () => {
      throw new Error('should not poll gmail tab');
    },
  });

  await helpers.resolveVerificationStep(4, { email: 'user@example.com' }, { source: 'gmail-imap' }, {});
  assert.deepStrictEqual(events, ['gmail.waitForVerificationCode']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- --test-name-pattern="gmail imap config|native host for gmail verification"
```

Expected: FAIL because the settings do not exist and verification flow still routes through Gmail tab polling.

- [ ] **Step 3: Write minimal implementation**

In `background.js`:

- add persisted settings:
  - `gmailImapEmail`
  - `gmailImapAppPassword`
  - `gmailImapHost`
  - `gmailImapPort`
  - `registeredEmailList`
- add normalization helpers for Gmail IMAP config and registered email list
- expose a `callNativeHost` dependency to verification helpers

In `background/verification-flow.js`:

- add a native-host Gmail path that calls `gmail.waitForVerificationCode`
- preserve existing filtering inputs:
  - `filterAfterTimestamp`
  - `targetEmail`
  - `excludeCodes`
  - step-specific labels

In `background/steps/fetch-signup-code.js` and `background/steps/fetch-login-code.js`:

- stop opening Gmail tabs
- pass enough context to the verification helper for native-host polling

In `background/message-router.js`:

- save the new Gmail IMAP settings and registered list

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- --test-name-pattern="gmail imap config|native host for gmail verification|verification flow"
```

Expected: PASS.

- [ ] **Step 5: Local checkpoint**

If Git metadata is restored later:

```bash
git add background.js background/verification-flow.js background/steps/fetch-signup-code.js background/steps/fetch-login-code.js background/message-router.js tests/background-gmail-imap-settings.test.js tests/verification-flow-native-host.test.js
git commit -m "feat: add gmail imap verification path"
```

Current environment: record a local checkpoint note instead of committing.

### Task 5: Implement Gmail IMAP command handlers in the native host

**Files:**
- Modify: `native_host/host.py`
- Create: `native_host/gmail_imap.py`
- Test: `native_host/README.md`

- [ ] **Step 1: Write the failing test**

Document a deterministic mail-filter example in `native_host/README.md`:

```python
messages = [
    {"subject": "OpenAI verification code", "to": "other@example.com", "timestamp": 100, "body": "111111"},
    {"subject": "OpenAI verification code", "to": "user@example.com", "timestamp": 200, "body": "222222"},
]
assert pick_verification_code(messages, target_email="user@example.com", exclude_codes={"111111"}) == "222222"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
python3 -m py_compile native_host/gmail_imap.py
```

Expected: FAIL because `gmail_imap.py` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `native_host/gmail_imap.py` with:

- IMAP connection helper using `imaplib.IMAP4_SSL`
- message fetch and RFC822 parsing
- sender/subject/to/time filtering
- 6-digit OTP extraction with English and Chinese patterns
- `test_connection(config)`
- `wait_for_verification_code(config, request)`

Register those handlers in `native_host/host.py`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
python3 -m py_compile native_host/host.py native_host/gmail_imap.py
```

Expected: no output, exit 0.

- [ ] **Step 5: Local checkpoint**

If Git metadata is restored later:

```bash
git add native_host/host.py native_host/gmail_imap.py native_host/README.md
git commit -m "feat: implement gmail imap native host commands"
```

Current environment: record a local checkpoint note instead of committing.

## Chunk 3: Local OAuth, CPA Upload, and Email List Migration

### Task 6: Add local OAuth runtime context and Step 7 local URL generation

**Files:**
- Create: `background/oauth-runtime.js`
- Modify: `background.js`
- Modify: `background/steps/oauth-login.js`
- Modify: `background/navigation-utils.js`
- Test: `tests/background-local-oauth-runtime.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/background-local-oauth-runtime.test.js`:

```js
test('step 7 creates oauth runtime with auth url, state, verifier, and redirect uri', async () => {
  const stateUpdates = [];
  const executor = createExecutor({
    createLocalOAuthRuntime: () => ({
      authUrl: 'https://auth.openai.com/authorize?client_id=test',
      state: 'state-1',
      codeVerifier: 'verifier-1',
      redirectUri: 'http://127.0.0.1:1455/auth/callback',
      clientId: 'client',
      createdAt: 123,
    }),
    setState: async (payload) => stateUpdates.push(payload.oauthRuntime),
    reuseOrCreateTab: async () => {},
  });

  await executor.executeStep7({});
  assert.equal(stateUpdates[0].state, 'state-1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="oauth runtime"`

Expected: FAIL because Step 7 still depends on CPA panel OAuth URL refresh.

- [ ] **Step 3: Write minimal implementation**

Create `background/oauth-runtime.js` with:

- PKCE verifier generation
- SHA-256 challenge helper
- auth URL generation
- callback URL parsing helper

Modify Step 7 to:

- generate local OAuth runtime
- persist it into session state
- open the generated auth URL directly
- remove CPA panel dependency from the main Step 7 path

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- --test-name-pattern="oauth runtime|step 7"
```

Expected: PASS.

- [ ] **Step 5: Local checkpoint**

If Git metadata is restored later:

```bash
git add background.js background/oauth-runtime.js background/steps/oauth-login.js background/navigation-utils.js tests/background-local-oauth-runtime.test.js
git commit -m "feat: generate local oauth runtime in step 7"
```

Current environment: record a local checkpoint note instead of committing.

### Task 7: Exchange callback and upload CPA auth file in Step 10

**Files:**
- Create: `background/cpa-auth-upload.js`
- Modify: `background.js`
- Modify: `background/steps/platform-verify.js`
- Modify: `native_host/host.py`
- Create: `native_host/openai_oauth.py`
- Create: `native_host/cpa_upload.py`
- Test: `tests/step10-native-cpa-upload.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/step10-native-cpa-upload.test.js`:

```js
test('step 10 exchanges callback and uploads auth file without opening CPA panel', async () => {
  const events = [];
  const executor = createExecutor({
    exchangeAndUploadAuthFile: async (state) => {
      events.push(['exchange', state.localhostUrl]);
      return { uploaded: true, accountEmail: 'user@example.com' };
    },
    completeStepFromBackground: async (_step, payload) => {
      events.push(['complete', payload.verifiedStatus]);
    },
    getTabId: async () => null,
  });

  await executor.executeStep10({
    localhostUrl: 'http://127.0.0.1:1455/auth/callback?code=abc&state=xyz',
    oauthRuntime: { state: 'xyz', codeVerifier: 'verifier' },
    cpaApiUrl: 'http://127.0.0.1:8317',
    cpaManagementKey: 'secret',
  });

  assert.deepStrictEqual(events, [['exchange', 'http://127.0.0.1:1455/auth/callback?code=abc&state=xyz'], ['complete', 'uploaded']]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="uploads auth file without opening CPA panel"`

Expected: FAIL because Step 10 still opens the CPA tab and uses `content/vps-panel.js`.

- [ ] **Step 3: Write minimal implementation**

Create `background/cpa-auth-upload.js` and native host helpers:

- `native_host/openai_oauth.py`
  - parse callback
  - validate state
  - exchange code for tokens
- `native_host/cpa_upload.py`
  - build CPA-compatible auth JSON
  - upload multipart auth file to `/v0/management/auth-files`

Modify Step 10 to:

- validate `localhostUrl`
- validate `oauthRuntime`
- call native host `oauth.exchangeCallback`
- call native host `cpa.uploadAuthFile`
- complete with `verifiedStatus: 'uploaded'`
- skip all CPA panel opening logic

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- --test-name-pattern="uploads auth file without opening CPA panel|step10"
python3 -m py_compile native_host/host.py native_host/openai_oauth.py native_host/cpa_upload.py
```

Expected: both commands succeed.

- [ ] **Step 5: Local checkpoint**

If Git metadata is restored later:

```bash
git add background.js background/cpa-auth-upload.js background/steps/platform-verify.js native_host/host.py native_host/openai_oauth.py native_host/cpa_upload.py tests/step10-native-cpa-upload.test.js
git commit -m "feat: upload cpa auth file from background"
```

Current environment: record a local checkpoint note instead of committing.

### Task 8: Migrate successful emails from pending to registered list

**Files:**
- Modify: `background/custom-email-pool.js`
- Modify: `background.js`
- Modify: `background/message-router.js`
- Test: `tests/custom-email-pool-registered-list.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/custom-email-pool-registered-list.test.js`:

```js
test('successful CPA upload moves email from pending list to registered list', async () => {
  const calls = { persistent: [], session: [] };
  const pool = createPool({
    getState: async () => ({
      customEmailList: ['a@example.com', 'b@example.com'],
      customEmailUsedMap: { 'a@example.com': true },
      registeredEmailList: ['done@example.com'],
      email: 'a@example.com',
    }),
    setPersistentSettings: async (payload) => calls.persistent.push(payload),
    setState: async (payload) => calls.session.push(payload),
  });

  await pool.markEmailRegistrationComplete('a@example.com');

  assert.deepStrictEqual(calls.persistent.at(-1), {
    customEmailList: ['b@example.com'],
    customEmailUsedMap: {},
    registeredEmailList: ['done@example.com', 'a@example.com'],
  });
});
```

Add a second test proving failed CPA upload does not call this migration helper.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="moves email from pending list to registered list"`

Expected: FAIL because no migration helper exists and `registeredEmailList` is not persisted.

- [ ] **Step 3: Write minimal implementation**

Extend `background/custom-email-pool.js` with:

- `normalizeRegisteredEmailList`
- `markEmailRegistrationComplete(email)`

Wire Step 10 success handling in `background.js` or `background/message-router.js` to invoke migration only after successful CPA upload.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- --test-name-pattern="registered list|custom email pool"
```

Expected: PASS.

- [ ] **Step 5: Local checkpoint**

If Git metadata is restored later:

```bash
git add background/custom-email-pool.js background.js background/message-router.js tests/custom-email-pool-registered-list.test.js
git commit -m "feat: move synced emails into registered list"
```

Current environment: record a local checkpoint note instead of committing.

### Task 9: Update side panel for IMAP config and dual email lists

**Files:**
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.css`
- Modify: `sidepanel/sidepanel.js`
- Modify: `sidepanel/custom-email-manager.js`
- Test: `tests/sidepanel-custom-email-manager.test.js`
- Test: `tests/sidepanel-registered-email-manager.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/sidepanel-registered-email-manager.test.js`:

```js
test('registered email manager renders editable list and clear action', async () => {
  const manager = createManager(...);
  const view = manager.applyState({
    registeredEmailList: ['done@example.com'],
  });
  assert.equal(view.totalCount, 1);
});
```

Extend `tests/sidepanel-custom-email-manager.test.js` so pending list labels use “待注册邮箱” semantics and registered list actions do not mutate pending state.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- --test-name-pattern="registered email manager|custom email manager"
```

Expected: FAIL because the registered list UI and IMAP settings UI do not exist.

- [ ] **Step 3: Write minimal implementation**

Update side panel UI:

- rename CPA fields to API-oriented wording
- replace `Login Gmail` button with `Test IMAP Connection`
- add fields for:
  - Gmail IMAP email
  - Gmail App Password
  - host
  - port
- keep pending email list panel
- add registered email list panel with edit/import/clear support

Update side panel state sync and save payload assembly for the new settings.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- --test-name-pattern="registered email manager|custom email manager|gmail imap"
```

Expected: PASS.

- [ ] **Step 5: Local checkpoint**

If Git metadata is restored later:

```bash
git add sidepanel/sidepanel.html sidepanel/sidepanel.css sidepanel/sidepanel.js sidepanel/custom-email-manager.js tests/sidepanel-custom-email-manager.test.js tests/sidepanel-registered-email-manager.test.js
git commit -m "feat: add imap config and registered email panel"
```

Current environment: record a local checkpoint note instead of committing.

## Chunk 4: Documentation and Full Verification

### Task 10: Update product docs and remove stale Gmail/CPA main-path descriptions

**Files:**
- Modify: `项目完整链路说明.md`
- Modify: `项目文件结构说明.md`
- Modify: `native_host/README.md`

- [ ] **Step 1: Write the failing test**

Search for stale statements that must disappear:

```text
Gmail 页面轮询
打开 CPA 面板提交回调
登录 Gmail
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
rg -n "Gmail 页面|打开 CPA 面板|登录 Gmail|提交回调 URL" 项目完整链路说明.md 项目文件结构说明.md native_host/README.md
```

Expected: matches exist.

- [ ] **Step 3: Write minimal implementation**

Update the docs to describe:

- Step 1 immediate cookie cleanup
- native host architecture
- Step 7 local OAuth start
- Step 10 auth-file upload
- pending and registered list behavior

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
rg -n "native host|IMAP|auth file|registeredEmailList|本地生成 OAuth" 项目完整链路说明.md 项目文件结构说明.md native_host/README.md
```

Expected: relevant new wording is present.

- [ ] **Step 5: Local checkpoint**

If Git metadata is restored later:

```bash
git add 项目完整链路说明.md 项目文件结构说明.md native_host/README.md
git commit -m "docs: update flow for native host refactor"
```

Current environment: record a local checkpoint note instead of committing.

### Task 11: Run complete verification before claiming completion

**Files:**
- Modify only if verification exposes defects

- [ ] **Step 1: Run targeted Node tests**

Run:

```bash
npm test -- --test-name-pattern="native host|gmail imap|oauth runtime|step 10|registered list|custom email manager|verification flow|step 1"
```

Expected: PASS.

- [ ] **Step 2: Run full Node test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run Python syntax verification**

Run:

```bash
python3 -m py_compile native_host/host.py native_host/messages.py native_host/gmail_imap.py native_host/openai_oauth.py native_host/cpa_upload.py native_host/install_host_manifest.py
```

Expected: no output, exit 0.

- [ ] **Step 4: Manual smoke checklist**

Verify manually:

- Step 1 opens ChatGPT and immediately clears cookies
- IMAP test action reaches native host
- Step 4 obtains signup OTP without opening Gmail
- Step 7 opens locally generated OAuth URL
- Step 10 uploads auth file without opening CPA
- successful CPA sync moves the email into registered list

- [ ] **Step 5: Completion handoff**

Because Git metadata is absent in this workspace, do not claim commit-based completion. Instead, report:

- test command results
- Python verification result
- any remaining manual setup requirement for native host installation
