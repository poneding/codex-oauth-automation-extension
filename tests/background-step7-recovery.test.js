const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/steps/fetch-login-code.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundStep8;`)(globalScope);

function createExecutor(overrides = {}) {
  return api.createStep8Executor({
    addLog: async () => {},
    chrome: {
      tabs: {
        update: async () => {},
      },
    },
    ensureStep8VerificationPageReady: async () => ({ state: 'verification_page', displayedEmail: 'display.user@example.com' }),
    executeStep7: async () => {},
    getOAuthFlowRemainingMs: async () => 5000,
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => Math.min(defaultTimeoutMs, 5000),
    getMailConfig: () => ({
      provider: 'gmail',
      label: 'Gmail 转发收件箱',
      source: 'gmail-mail',
      url: 'https://mail.google.com/mail/u/0/#inbox',
      navigateOnReuse: false,
    }),
    getState: async () => ({ email: 'user@example.com', password: 'secret' }),
    getTabId: async (sourceName) => (sourceName === 'signup-page' ? 1 : 2),
    isTabAlive: async () => true,
    isVerificationMailPollingError: () => false,
    resolveVerificationStep: async () => {},
    reuseOrCreateTab: async () => {},
    setState: async () => {},
    setStepStatus: async () => {},
    sleepWithStop: async () => {},
    STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS: 25000,
    STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS: 8,
    throwIfStopped: () => {},
    ...overrides,
  });
}

test('step 8 submits login verification directly without replaying step 7', async () => {
  const calls = {
    ensureReady: 0,
    ensureReadyOptions: [],
    executeStep7: 0,
    sleep: [],
    resolveOptions: null,
    setStates: [],
  };
  const realDateNow = Date.now;
  Date.now = () => 123456;

  const executor = createExecutor({
    ensureStep8VerificationPageReady: async (options) => {
      calls.ensureReady += 1;
      calls.ensureReadyOptions.push(options || null);
      return { state: 'verification_page', displayedEmail: 'display.user@example.com' };
    },
    executeStep7: async () => {
      calls.executeStep7 += 1;
    },
    resolveVerificationStep: async (_step, _state, _mail, options) => {
      calls.resolveOptions = options;
    },
    setState: async (payload) => {
      calls.setStates.push(payload);
    },
    sleepWithStop: async (ms) => {
      calls.sleep.push(ms);
    },
  });

  try {
    await executor.executeStep8({
      email: 'user@example.com',
      password: 'secret',
      oauthUrl: 'https://oauth.example/latest',
    });
  } finally {
    Date.now = realDateNow;
  }

  assert.equal(calls.resolveOptions.beforeSubmit, undefined);
  assert.equal(calls.ensureReady, 1);
  assert.equal(calls.executeStep7, 0);
  assert.deepStrictEqual(calls.sleep, []);
  assert.equal(calls.resolveOptions.filterAfterTimestamp, 123456);
  assert.equal(typeof calls.resolveOptions.getRemainingTimeMs, 'function');
  assert.equal(await calls.resolveOptions.getRemainingTimeMs({ actionLabel: '登录验证码流程' }), 5000);
  assert.equal(calls.resolveOptions.resendIntervalMs, 25000);
  assert.equal(calls.resolveOptions.targetEmail, 'display.user@example.com');
  assert.deepStrictEqual(calls.setStates, [
    { step8VerificationTargetEmail: 'display.user@example.com' },
  ]);
  assert.deepStrictEqual(calls.ensureReadyOptions, [
    { timeoutMs: 5000 },
  ]);
});

test('step 8 falls back to the run email when the verification page does not expose a displayed email', async () => {
  let capturedOptions = null;

  const executor = createExecutor({
    ensureStep8VerificationPageReady: async () => ({ state: 'verification_page', displayedEmail: '' }),
    getOAuthFlowRemainingMs: async () => 8000,
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => Math.min(defaultTimeoutMs, 8000),
    resolveVerificationStep: async (_step, _state, _mail, options) => {
      capturedOptions = options;
    },
  });

  await executor.executeStep8({
    email: 'user@example.com',
    password: 'secret',
    oauthUrl: 'https://oauth.example/latest',
  });

  assert.equal(capturedOptions.targetEmail, 'user@example.com');
});

test('step 8 does not rerun step 7 when verification submit lands on add-phone', async () => {
  const calls = {
    executeStep7: 0,
    logs: [],
  };

  const executor = createExecutor({
    addLog: async (message, level = 'info') => {
      calls.logs.push({ message, level });
    },
    getOAuthFlowRemainingMs: async () => 8000,
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => Math.min(defaultTimeoutMs, 8000),
    executeStep7: async () => {
      calls.executeStep7 += 1;
    },
    resolveVerificationStep: async () => {
      throw new Error('步骤 8：验证码提交后页面进入手机号页面，当前流程无法继续自动授权。 URL: https://auth.openai.com/add-phone');
    },
  });

  await assert.rejects(
    () => executor.executeStep8({
      email: 'user@example.com',
      password: 'secret',
      oauthUrl: 'https://oauth.example/latest',
    }),
    /add-phone/
  );

  assert.equal(calls.executeStep7, 0);
});
