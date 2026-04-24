const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/verification-flow.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundVerificationFlow;`)(globalScope);

function createHelpers(overrides = {}) {
  return api.createVerificationFlowHelpers({
    addLog: async () => {},
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
    sendToMailContentScriptResilient: async () => ({}),
    setState: async () => {},
    setStepStatus: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
    VERIFICATION_POLL_MAX_ROUNDS: 5,
    ...overrides,
  });
}

test('verification flow polls Gmail code, submits it, persists state, and completes the step', async () => {
  const events = [];

  const helpers = createHelpers({
    completeStepFromBackground: async (_step, payload) => {
      events.push(['complete', payload.code, payload.emailTimestamp]);
    },
    sendToContentScript: async (_source, message) => {
      events.push([message.type, message.payload.code, message.payload.targetEmail || '']);
      return { emailTimestamp: 456 };
    },
    sendToMailContentScriptResilient: async () => ({
      code: '654321',
      emailTimestamp: 123,
    }),
    setState: async (payload) => {
      events.push(['state', payload.lastLoginCode || payload.lastSignupCode, payload.lastEmailTimestamp]);
    },
  });

  await helpers.resolveVerificationStep(
    8,
    { email: 'user@example.com', lastLoginCode: null },
    { provider: 'gmail', source: 'gmail-mail', label: 'Gmail 转发收件箱' },
    { targetEmail: 'user@example.com' }
  );

  assert.deepStrictEqual(events, [
    ['SUBMIT_VERIFICATION_CODE', '654321', 'user@example.com'],
    ['state', '654321', 456],
    ['complete', '654321', 456],
  ]);
});

test('verification flow honors requestFreshCodeFirst before the first non-Gmail poll', async () => {
  const events = [];
  let pollCalls = 0;

  const helpers = createHelpers({
    sendToContentScript: async (_source, message) => {
      events.push(message.type);
      if (message.type === 'SUBMIT_VERIFICATION_CODE') {
        return {};
      }
      return {};
    },
    sendToMailContentScriptResilient: async () => {
      pollCalls += 1;
      return { code: '654321', emailTimestamp: 123 };
    },
  });

  await helpers.resolveVerificationStep(
    4,
    {
      email: 'user@example.com',
      verificationResendCount: 0,
      lastSignupCode: null,
    },
    { provider: 'other', source: 'other-mail', label: 'Other Mail' },
    { requestFreshCodeFirst: true }
  );

  assert.deepStrictEqual(events, ['RESEND_VERIFICATION_CODE', 'SUBMIT_VERIFICATION_CODE']);
  assert.equal(pollCalls, 1);
});

test('verification flow resends immediately when the submitted verification code is rejected', async () => {
  const events = [];
  let pollCalls = 0;
  let submitCalls = 0;

  const helpers = createHelpers({
    completeStepFromBackground: async (_step, payload) => {
      events.push(['complete', payload.code]);
    },
    sendToContentScript: async (_source, message) => {
      events.push([message.type, message.payload.code || '']);
      if (message.type === 'SUBMIT_VERIFICATION_CODE') {
        submitCalls += 1;
        if (submitCalls === 1) {
          return { invalidCode: true, errorText: '代码不正确' };
        }
        return { emailTimestamp: 789 };
      }
      return {};
    },
    sendToMailContentScriptResilient: async () => {
      pollCalls += 1;
      return { code: pollCalls === 1 ? '111111' : '222222', emailTimestamp: 123 };
    },
  });

  await helpers.resolveVerificationStep(
    4,
    {
      email: 'user@example.com',
      verificationResendCount: 1,
      lastSignupCode: null,
    },
    { provider: 'other', source: 'other-mail', label: 'Other Mail' },
    { resendIntervalMs: 0 }
  );

  assert.equal(pollCalls, 2);
  assert.deepStrictEqual(events, [
    ['SUBMIT_VERIFICATION_CODE', '111111'],
    ['RESEND_VERIFICATION_CODE', ''],
    ['SUBMIT_VERIFICATION_CODE', '222222'],
    ['complete', '222222'],
  ]);
});

test('verification flow exhausts two Gmail poll passes and a first-match fallback before resending step 4', async () => {
  const resendSteps = [];
  const pollPayloads = [];
  let pollCalls = 0;

  const helpers = createHelpers({
    sendToContentScript: async (_source, message) => {
      if (message.type === 'RESEND_VERIFICATION_CODE') {
        resendSteps.push(message.step);
      }
      if (message.type === 'SUBMIT_VERIFICATION_CODE') {
        return {};
      }
      return {};
    },
    sendToMailContentScriptResilient: async (_mail, message) => {
      pollPayloads.push(message.payload);
      pollCalls += 1;
      return pollCalls === 4
        ? { code: '654321', emailTimestamp: 123 }
        : {};
    },
  });

  await helpers.resolveVerificationStep(
    4,
    {
      email: 'user@example.com',
      verificationResendCount: 2,
      lastSignupCode: null,
    },
    { provider: 'gmail', source: 'gmail-mail', label: 'Gmail 转发收件箱' },
    { gmailPollIntervalMs: 30000 }
  );

  assert.deepStrictEqual(resendSteps, [4]);
  assert.equal(pollCalls, 4);
  assert.deepStrictEqual(
    pollPayloads.map((payload) => ({
      mailboxSection: payload.mailboxSection,
      forceOpenMessage: payload.forceOpenMessage,
      maxAttempts: payload.maxAttempts,
      intervalMs: payload.intervalMs,
      refreshBeforeStart: payload.refreshBeforeStart,
      refreshEachAttempt: payload.refreshEachAttempt,
      allowExistingMatching: payload.allowExistingMatching,
      ignoreTimeFilter: payload.ignoreTimeFilter,
      fallbackToExistingAfterAttempts: payload.fallbackToExistingAfterAttempts,
      maxMatchingRows: payload.maxMatchingRows,
    })),
    [
      {
        mailboxSection: 'inbox',
        forceOpenMessage: false,
        maxAttempts: 5,
        intervalMs: 30000,
        refreshBeforeStart: false,
        refreshEachAttempt: false,
        allowExistingMatching: true,
        ignoreTimeFilter: false,
        fallbackToExistingAfterAttempts: 0,
        maxMatchingRows: undefined,
      },
      {
        mailboxSection: 'spam',
        forceOpenMessage: false,
        maxAttempts: 1,
        intervalMs: 1000,
        refreshBeforeStart: false,
        refreshEachAttempt: false,
        allowExistingMatching: true,
        ignoreTimeFilter: false,
        fallbackToExistingAfterAttempts: 0,
        maxMatchingRows: undefined,
      },
      {
        mailboxSection: 'inbox',
        forceOpenMessage: false,
        maxAttempts: 5,
        intervalMs: 30000,
        refreshBeforeStart: true,
        refreshEachAttempt: false,
        allowExistingMatching: true,
        ignoreTimeFilter: false,
        fallbackToExistingAfterAttempts: 0,
        maxMatchingRows: undefined,
      },
      {
        mailboxSection: 'inbox',
        forceOpenMessage: false,
        maxAttempts: 5,
        intervalMs: 30000,
        refreshBeforeStart: false,
        refreshEachAttempt: false,
        allowExistingMatching: true,
        ignoreTimeFilter: false,
        fallbackToExistingAfterAttempts: 0,
        maxMatchingRows: undefined,
      },
    ]
  );
});

test('verification flow exhausts two Gmail poll passes and a first-match fallback before resending step 8', async () => {
  const resendSteps = [];
  let pollCalls = 0;

  const helpers = createHelpers({
    sendToContentScript: async (_source, message) => {
      if (message.type === 'RESEND_VERIFICATION_CODE') {
        resendSteps.push(message.step);
      }
      if (message.type === 'SUBMIT_VERIFICATION_CODE') {
        return {};
      }
      return {};
    },
    sendToMailContentScriptResilient: async () => {
      pollCalls += 1;
      return pollCalls === 4
        ? { code: '654321', emailTimestamp: 123 }
        : {};
    },
  });

  await helpers.resolveVerificationStep(
    8,
    {
      email: 'user@example.com',
      verificationResendCount: 2,
      lastLoginCode: null,
    },
    { provider: 'gmail', source: 'gmail-mail', label: 'Gmail 转发收件箱' }
  );

  assert.deepStrictEqual(resendSteps, [8]);
  assert.equal(pollCalls, 4);
});

test('verification flow uses final first-match fallback only after Gmail retries and resends are exhausted', async () => {
  const pollPayloads = [];
  let pollCalls = 0;

  const helpers = createHelpers({
    sendToContentScript: async (_source, message) => {
      if (message.type === 'SUBMIT_VERIFICATION_CODE') {
        return {};
      }
      return {};
    },
    sendToMailContentScriptResilient: async (_mail, message) => {
      pollPayloads.push(message.payload);
      pollCalls += 1;
      return pollCalls === 4
        ? { code: '654321', emailTimestamp: 123 }
        : {};
    },
  });

  await helpers.resolveVerificationStep(
    4,
    {
      email: 'user@example.com',
      verificationResendCount: 0,
      lastSignupCode: null,
    },
    { provider: 'gmail', source: 'gmail-mail', label: 'Gmail 转发收件箱' },
    { gmailPollIntervalMs: 30000, targetEmail: 'user@example.com' }
  );

  assert.deepStrictEqual(
    pollPayloads.map((payload) => ({
      mailboxSection: payload.mailboxSection,
      forceOpenMessage: payload.forceOpenMessage,
      maxAttempts: payload.maxAttempts,
      intervalMs: payload.intervalMs,
      refreshBeforeStart: payload.refreshBeforeStart,
      maxMatchingRows: payload.maxMatchingRows,
      ignoreTimeFilter: payload.ignoreTimeFilter,
    })),
    [
      {
        mailboxSection: 'inbox',
        forceOpenMessage: false,
        maxAttempts: 5,
        intervalMs: 30000,
        refreshBeforeStart: false,
        maxMatchingRows: undefined,
        ignoreTimeFilter: false,
      },
      {
        mailboxSection: 'spam',
        forceOpenMessage: false,
        maxAttempts: 1,
        intervalMs: 1000,
        refreshBeforeStart: false,
        maxMatchingRows: undefined,
        ignoreTimeFilter: false,
      },
      {
        mailboxSection: 'inbox',
        forceOpenMessage: false,
        maxAttempts: 5,
        intervalMs: 30000,
        refreshBeforeStart: true,
        maxMatchingRows: undefined,
        ignoreTimeFilter: false,
      },
      {
        mailboxSection: 'inbox',
        forceOpenMessage: true,
        maxAttempts: 1,
        intervalMs: 1000,
        refreshBeforeStart: false,
        maxMatchingRows: 1,
        ignoreTimeFilter: true,
      },
    ]
  );
});

test('verification flow marks exhausted verification failures as round-scoped failures', async () => {
  const helpers = createHelpers({
    sendToContentScript: async (_source, message) => {
      if (message.type === 'SUBMIT_VERIFICATION_CODE') {
        return { invalidCode: true, errorText: '代码不正确' };
      }
      return {};
    },
    sendToMailContentScriptResilient: async () => ({
      code: '111111',
      emailTimestamp: 123,
    }),
  });

  let error = null;
  try {
    await helpers.resolveVerificationStep(
      4,
      {
        email: 'user@example.com',
        verificationResendCount: 0,
        lastSignupCode: null,
      },
      { provider: 'other', source: 'other-mail', label: 'Other Mail' },
      { resendIntervalMs: 0 }
    );
  } catch (err) {
    error = err;
  }

  assert.match(error?.message || '', /验证码被拒绝/);
  assert.equal(error?.roundScopedFailure, true);
});

test('verification flow recovers retryable submit transport errors when step 4 has already advanced', async () => {
  const events = [];

  const helpers = createHelpers({
    completeStepFromBackground: async (_step, payload) => {
      events.push(['complete', payload.code, typeof payload.emailTimestamp]);
    },
    recoverVerificationSubmitResult: async (step, state, code, error) => {
      events.push(['recover', step, state.email, code, error.message]);
      return { success: true, recoveredAfterTransportError: true };
    },
    sendToContentScript: async () => {
      throw new Error('The page keeping the extension port is moved into back/forward cache, so the message channel is closed.');
    },
    sendToMailContentScriptResilient: async () => ({
      code: '346714',
      emailTimestamp: 123,
    }),
    setState: async (payload) => {
      events.push(['state', payload.lastSignupCode, typeof payload.lastEmailTimestamp]);
    },
  });

  await helpers.resolveVerificationStep(
    4,
    { email: 'stages_4threads@icloud.com', lastSignupCode: null },
    { provider: 'gmail', source: 'gmail-mail', label: 'Gmail 转发收件箱' }
  );

  assert.deepStrictEqual(events, [
    [
      'recover',
      4,
      'stages_4threads@icloud.com',
      '346714',
      'The page keeping the extension port is moved into back/forward cache, so the message channel is closed.',
    ],
    ['state', '346714', 'number'],
    ['complete', '346714', 'number'],
  ]);
});

test('verification flow restarts step 8 before resending when oauth remaining time is exhausted', async () => {
  const resendSteps = [];
  let pollCalls = 0;

  const helpers = createHelpers({
    sendToContentScript: async (_source, message) => {
      if (message.type === 'RESEND_VERIFICATION_CODE') {
        resendSteps.push(message.step);
      }
      return {};
    },
    sendToMailContentScriptResilient: async () => {
      pollCalls += 1;
      return {};
    },
  });

  await assert.rejects(
    helpers.resolveVerificationStep(
      8,
      {
        email: 'user@example.com',
        verificationResendCount: 1,
        lastLoginCode: null,
      },
      { provider: 'gmail', source: 'gmail-mail', label: 'Gmail 转发收件箱' },
      {
        getRemainingTimeMs: async ({ actionLabel }) => (
          /重新请求登录验证码/.test(actionLabel) ? 20000 : 60000
        ),
        resendIntervalMs: 25000,
      }
    ),
    /STEP8_RESTART_STEP7::/
  );

  assert.equal(pollCalls, 3);
  assert.deepStrictEqual(resendSteps, []);
});
