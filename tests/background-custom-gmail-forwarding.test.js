const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const step4Source = fs.readFileSync('background/steps/fetch-signup-code.js', 'utf8');
const step4GlobalScope = {};
const step4Api = new Function('self', `${step4Source}; return self.MultiPageBackgroundStep4;`)(step4GlobalScope);

const step8Source = fs.readFileSync('background/steps/fetch-login-code.js', 'utf8');
const step8GlobalScope = {};
const step8Api = new Function('self', `${step8Source}; return self.MultiPageBackgroundStep8;`)(step8GlobalScope);

test('step 4 treats custom provider as automated Gmail polling instead of manual bypass', async () => {
  const calls = {
    ensureContentScriptReadyOnTab: [],
    reuseOrCreateTab: [],
    resolveVerificationStep: null,
  };

  const executor = step4Api.createStep4Executor({
    addLog: async () => {},
    chrome: { tabs: { update: async () => {} } },
    completeStepFromBackground: async () => {},
    ensureContentScriptReadyOnTab: async (source, tabId, options) => {
      calls.ensureContentScriptReadyOnTab.push({ source, tabId, options });
    },
    getMailConfig: () => ({
      source: 'gmail-imap',
      label: 'Gmail IMAP 后台收件箱',
    }),
    getTabId: async (source) => (source === 'signup-page' ? 1 : null),
    isTabAlive: async () => false,
    resolveVerificationStep: async (_step, _state, mail, options) => {
      calls.resolveVerificationStep = { mail, options };
    },
    reuseOrCreateTab: async (source, url, options) => {
      calls.reuseOrCreateTab.push({ source, url, options });
      return 2;
    },
    sendToContentScriptResilient: async () => ({ ready: true }),
    STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS: 25000,
    throwIfStopped: () => {},
  });

  await executor.executeStep4({
    mailProvider: 'custom',
    email: 'custom-1@example.com',
    password: 'Secret123!',
  });

  assert.deepStrictEqual(calls.reuseOrCreateTab, []);
  assert.deepStrictEqual(calls.ensureContentScriptReadyOnTab, []);
  assert.deepStrictEqual(calls.resolveVerificationStep.mail, {
    source: 'gmail-imap',
    label: 'Gmail IMAP 后台收件箱',
  });
  assert.equal(calls.resolveVerificationStep.options.gmailPollIntervalMs, 30000);
  assert.equal(calls.resolveVerificationStep.options.nativeHostPollIntervalSeconds, 1);
  assert.equal(calls.resolveVerificationStep.options.requestFreshCodeFirst, false);
  assert.equal(calls.resolveVerificationStep.options.targetEmail, 'custom-1@example.com');
  assert.equal(calls.resolveVerificationStep.options.resendIntervalMs, 25000);
  assert.equal(typeof calls.resolveVerificationStep.options.filterAfterTimestamp, 'number');
});

test('step 8 treats custom provider as automated Gmail polling instead of manual bypass', async () => {
  let capturedOptions = null;
  const ensureReadyCalls = [];

  const executor = step8Api.createStep8Executor({
    addLog: async () => {},
    chrome: { tabs: { update: async () => {} } },
    ensureContentScriptReadyOnTab: async (source, tabId, options) => {
      ensureReadyCalls.push({ source, tabId, options });
    },
    ensureStep8VerificationPageReady: async () => ({
      state: 'verification_page',
      displayedEmail: 'custom-1@example.com',
    }),
    executeStep7: async () => {},
    getOAuthFlowRemainingMs: async () => 8000,
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => Math.min(defaultTimeoutMs, 8000),
    getMailConfig: () => ({
      source: 'gmail-imap',
      label: 'Gmail IMAP 后台收件箱',
    }),
    getState: async () => ({ email: 'custom-1@example.com', password: 'Secret123!' }),
    getTabId: async (source) => (source === 'signup-page' ? 1 : 2),
    isTabAlive: async () => false,
    isVerificationMailPollingError: () => false,
    resolveVerificationStep: async (_step, _state, _mail, options) => {
      capturedOptions = options;
    },
    reuseOrCreateTab: async () => 2,
    setState: async () => {},
    setStepStatus: async () => {},
    sleepWithStop: async () => {},
    STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS: 25000,
    STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS: 8,
    throwIfStopped: () => {},
  });

  await executor.executeStep8({
    mailProvider: 'custom',
    email: 'custom-1@example.com',
    password: 'Secret123!',
    oauthUrl: 'https://oauth.example/latest',
  });

  assert.deepStrictEqual(ensureReadyCalls, []);
  assert.equal(capturedOptions.gmailPollIntervalMs, 30000);
  assert.equal(capturedOptions.nativeHostPollIntervalSeconds, 1);
  assert.equal(capturedOptions.targetEmail, 'custom-1@example.com');
  assert.equal(capturedOptions.resendIntervalMs, 25000);
});
