const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/message-router.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundMessageRouter;`)(globalScope);

function createRouter(overrides = {}) {
  const events = {
    logs: [],
    stepStatuses: [],
    emailStates: [],
    finalizePayloads: [],
    notifyCompletions: [],
    notifyErrors: [],
  };

  const router = api.createMessageRouter({
    addLog: async (message, level) => {
      events.logs.push({ message, level });
    },
    finalizeStep3Completion: overrides.finalizeStep3Completion || (async (payload) => {
      events.finalizePayloads.push(payload);
    }),
    getState: async () => overrides.state || { stepStatuses: { 3: 'pending' } },
    getStopRequested: () => false,
    isStopError: () => false,
    notifyStepComplete: (step, payload) => {
      events.notifyCompletions.push({ step, payload });
    },
    notifyStepError: (step, error) => {
      events.notifyErrors.push({ step, error });
    },
    setEmailState: async (email) => {
      events.emailStates.push(email);
    },
    setState: async () => {},
    setStepStatus: async (step, status) => {
      events.stepStatuses.push({ step, status });
    },
  });

  return { router, events };
}

test('message router skips step 3 when step 2 lands on verification page', async () => {
  const { router, events } = createRouter({
    state: { stepStatuses: { 3: 'pending' } },
  });

  await router.handleStepData(2, {
    email: 'user@example.com',
    skippedPasswordStep: true,
  });

  assert.deepStrictEqual(events.emailStates, ['user@example.com']);
  assert.deepStrictEqual(events.stepStatuses, [{ step: 3, status: 'skipped' }]);
  assert.equal(events.logs[0]?.message, '步骤 2：提交邮箱后页面直接进入邮箱验证码页，已自动跳过步骤 3。');
});

test('message router does not overwrite a completed step 3 when step 2 is replayed', async () => {
  const { router, events } = createRouter({
    state: { stepStatuses: { 3: 'completed' } },
  });

  await router.handleStepData(2, {
    skippedPasswordStep: true,
  });

  assert.deepStrictEqual(events.stepStatuses, []);
});

test('message router finalizes step 3 before marking it completed', async () => {
  const { router, events } = createRouter();

  const response = await router.handleMessage({
    type: 'STEP_COMPLETE',
    step: 3,
    source: 'signup-page',
    payload: {
      email: 'user@example.com',
      signupVerificationRequestedAt: 123,
    },
  }, {});

  assert.deepStrictEqual(events.finalizePayloads, [
    {
      email: 'user@example.com',
      signupVerificationRequestedAt: 123,
    },
  ]);
  assert.deepStrictEqual(events.stepStatuses, [{ step: 3, status: 'completed' }]);
  assert.deepStrictEqual(events.emailStates, ['user@example.com']);
  assert.deepStrictEqual(events.notifyCompletions, [
    {
      step: 3,
      payload: {
        email: 'user@example.com',
        signupVerificationRequestedAt: 123,
      },
    },
  ]);
  assert.deepStrictEqual(response, { ok: true });
});

test('message router marks step 3 failed when post-submit finalize fails', async () => {
  const { router, events } = createRouter({
    finalizeStep3Completion: async () => {
      throw new Error('步骤 3 提交后仍停留在密码页。');
    },
  });

  await assert.rejects(
    () => router.handleMessage({
      type: 'STEP_COMPLETE',
      step: 3,
      source: 'signup-page',
      payload: {
        email: 'user@example.com',
      },
    }, {}),
    /步骤 3 提交后仍停留在密码页。/
  );

  assert.deepStrictEqual(events.stepStatuses, []);
  assert.deepStrictEqual(events.notifyErrors, []);
});

test('message router marks step errors as failed and forwards the original error message', async () => {
  const { router, events } = createRouter();

  const response = await router.handleMessage({
    type: 'STEP_ERROR',
    step: 7,
    source: 'signup-page',
    payload: {},
    error: 'CF_SECURITY_BLOCKED::您已触发Cloudflare 安全防护系统',
  }, {});

  assert.deepStrictEqual(events.stepStatuses, [{ step: 7, status: 'failed' }]);
  assert.deepStrictEqual(events.notifyErrors, [
    {
      step: 7,
      error: 'CF_SECURITY_BLOCKED::您已触发Cloudflare 安全防护系统',
    },
  ]);
  assert.deepStrictEqual(response, {
    ok: true,
  });
});
