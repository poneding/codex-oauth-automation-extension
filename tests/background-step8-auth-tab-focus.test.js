const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/steps/fetch-login-code.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundStep8;`)(globalScope);

test('step 8 switches focus back to signup auth tab after verification resolves', async () => {
  const tabUpdates = [];
  const logs = [];

  const executor = api.createStep8Executor({
    addLog: async (message, level = 'info') => {
      logs.push({ message, level });
    },
    chrome: {
      tabs: {
        update: async (tabId, payload) => {
          tabUpdates.push({ tabId, payload });
        },
      },
    },
    ensureStep8VerificationPageReady: async () => ({ state: 'verification_page', displayedEmail: 'user@example.com' }),
    executeStep7: async () => {},
    getOAuthFlowRemainingMs: async () => 5000,
    getOAuthFlowStepTimeoutMs: async (defaultTimeoutMs) => Math.min(defaultTimeoutMs, 5000),
    getMailConfig: () => ({
      provider: 'gmail',
      label: 'Gmail IMAP 后台收件箱',
      source: 'gmail-imap',
    }),
    getState: async () => ({ email: 'user@example.com', password: 'secret' }),
    getTabId: async (sourceName) => (sourceName === 'signup-page' ? 1 : null),
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
  });

  await executor.executeStep8({
    email: 'user@example.com',
    password: 'secret',
    oauthUrl: 'https://oauth.example/latest',
  });

  assert.deepStrictEqual(tabUpdates, [
    { tabId: 1, payload: { active: true } },
    { tabId: 1, payload: { active: true } },
  ]);
  assert.equal(
    logs.some(({ message }) => message === '步骤 8：验证码已提交，已切回认证页继续后续授权。'),
    true,
  );
});
