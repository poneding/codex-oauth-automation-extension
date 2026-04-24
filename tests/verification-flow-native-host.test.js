const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/verification-flow.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundVerificationFlow;`)(globalScope);

function createHelpers(overrides = {}) {
  return api.createVerificationFlowHelpers({
    addLog: async () => {},
    callNativeHost: async () => ({ code: '654321', emailTimestamp: 123 }),
    chrome: {
      tabs: {
        update: async () => {},
      },
    },
    completeStepFromBackground: async () => {},
    confirmCustomVerificationStepBypassRequest: async () => ({ confirmed: true }),
    getState: async () => ({}),
    getTabId: async () => 1,
    isStopError: () => false,
    sendToContentScript: async () => ({}),
    sendToMailContentScriptResilient: async () => {
      throw new Error('should not poll gmail tab');
    },
    setState: async () => {},
    setStepStatus: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
    VERIFICATION_POLL_MAX_ROUNDS: 5,
    ...overrides,
  });
}

test('verification flow uses native host for gmail verification instead of Gmail tab polling', async () => {
  const events = [];

  const helpers = createHelpers({
    callNativeHost: async (command) => {
      events.push(command);
      return { code: '654321', emailTimestamp: 123 };
    },
    completeStepFromBackground: async (_step, payload) => {
      events.push(['complete', payload.code]);
    },
    sendToContentScript: async (_source, message) => {
      if (message.type === 'SUBMIT_VERIFICATION_CODE') {
        events.push(['submit', message.payload.code]);
        return { emailTimestamp: 456 };
      }
      return {};
    },
  });

  await helpers.resolveVerificationStep(
    4,
    { email: 'user@example.com', gmailImapEmail: 'worker@gmail.com', gmailImapAppPassword: 'secret' },
    { provider: 'gmail', source: 'gmail-imap', label: 'Gmail IMAP' },
    { targetEmail: 'user@example.com', filterAfterTimestamp: 100 }
  );

  assert.deepStrictEqual(events, [
    'gmail.waitForVerificationCode',
    ['submit', '654321'],
    ['complete', '654321'],
  ]);
});

test('verification flow gives native host an inner timeout buffer below the bridge timeout', async () => {
  const calls = [];

  const helpers = createHelpers({
    callNativeHost: async (command, payload, options) => {
      calls.push({ command, payload, options });
      return { code: '654321', emailTimestamp: 123 };
    },
    completeStepFromBackground: async () => {},
    sendToContentScript: async () => ({ emailTimestamp: 456 }),
  });

  await helpers.resolveVerificationStep(
    8,
    { email: 'user@example.com', gmailImapEmail: 'worker@gmail.com', gmailImapAppPassword: 'secret' },
    { provider: 'gmail', source: 'gmail-imap', label: 'Gmail IMAP' },
    { targetEmail: 'user@example.com', filterAfterTimestamp: 100, nativeHostTimeoutMs: 90000 }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'gmail.waitForVerificationCode');
  assert.equal(calls[0].options.timeoutMs, 90000);
  assert.equal(typeof calls[0].payload.timeoutMs, 'number');
  assert.ok(calls[0].payload.timeoutMs < calls[0].options.timeoutMs);
});

test('verification flow forwards native-host poll interval for Gmail IMAP', async () => {
  const calls = [];

  const helpers = createHelpers({
    callNativeHost: async (command, payload, options) => {
      calls.push({ command, payload, options });
      return { code: '654321', emailTimestamp: 123 };
    },
    completeStepFromBackground: async () => {},
    sendToContentScript: async () => ({ emailTimestamp: 456 }),
  });

  await helpers.resolveVerificationStep(
    8,
    { email: 'user@example.com', gmailImapEmail: 'worker@gmail.com', gmailImapAppPassword: 'secret' },
    { provider: 'gmail', source: 'gmail-imap', label: 'Gmail IMAP' },
    { targetEmail: 'user@example.com', filterAfterTimestamp: 100, nativeHostPollIntervalSeconds: 1 }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.pollIntervalSeconds, 1);
});

test('verification flow logs native host diagnostics and surfaces native-host error payloads', async () => {
  const logs = [];

  const helpers = createHelpers({
    addLog: async (message, level = 'info') => {
      logs.push([level, message]);
    },
    callNativeHost: async () => ({
      error: 'Gmail IMAP 轮询结束，但未获取到验证码。',
      diagnostics: [
        { level: 'info', message: 'before_ids 基线数量: 3' },
        { level: 'warn', message: 'INBOX 搜索结果: 0 封新邮件' },
      ],
    }),
  });

  await assert.rejects(
    helpers.resolveVerificationStep(
      4,
      { email: 'user@example.com', gmailImapEmail: 'worker@gmail.com', gmailImapAppPassword: 'secret' },
      { provider: 'gmail', source: 'gmail-imap', label: 'Gmail IMAP' },
      { targetEmail: 'user@example.com', filterAfterTimestamp: 100, maxResendRequests: 0 }
    ),
    /Gmail IMAP 轮询结束，但未获取到验证码。/
  );

  assert.deepStrictEqual(logs.slice(0, 2), [
    ['info', '步骤 4：[Gmail IMAP] before_ids 基线数量: 3'],
    ['warn', '步骤 4：[Gmail IMAP] INBOX 搜索结果: 0 封新邮件'],
  ]);
});
