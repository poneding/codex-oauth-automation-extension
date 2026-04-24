const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/steps/fetch-signup-code.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundStep4;`)(globalScope);

test('step 4 switches focus back to signup auth tab after verification resolves', async () => {
  const tabUpdates = [];
  const logs = [];

  const executor = api.createStep4Executor({
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
    completeStepFromBackground: async () => {},
    getMailConfig: () => ({
      provider: 'gmail',
      label: 'Gmail IMAP 后台收件箱',
      source: 'gmail-imap',
    }),
    getTabId: async (sourceName) => (sourceName === 'signup-page' ? 1 : null),
    isTabAlive: async () => true,
    resolveVerificationStep: async () => {},
    reuseOrCreateTab: async () => {},
    sendToContentScriptResilient: async () => ({ ready: true }),
    STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS: 25000,
    throwIfStopped: () => {},
  });

  await executor.executeStep4({
    mailProvider: 'custom',
    email: 'user@example.com',
    password: 'secret',
  });

  assert.deepStrictEqual(tabUpdates, [
    { tabId: 1, payload: { active: true } },
    { tabId: 1, payload: { active: true } },
  ]);
  assert.equal(
    logs.some(({ message }) => message === '步骤 4：验证码已提交，已切回认证页继续注册流程。'),
    true,
  );
});
