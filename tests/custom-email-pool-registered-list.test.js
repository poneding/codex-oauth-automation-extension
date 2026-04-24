const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const poolSource = fs.readFileSync('background/custom-email-pool.js', 'utf8');
const poolGlobalScope = {};
const poolApi = new Function('self', `${poolSource}; return self.MultiPageBackgroundCustomEmailPool;`)(poolGlobalScope);

const routerSource = fs.readFileSync('background/message-router.js', 'utf8');
const routerGlobalScope = {};
const routerApi = new Function('self', `${routerSource}; return self.MultiPageBackgroundMessageRouter;`)(routerGlobalScope);

test('successful CPA upload moves email from pending list to registered list', async () => {
  const calls = {
    persistent: [],
    session: [],
    broadcasts: [],
  };

  const pool = poolApi.createCustomEmailPool({
    broadcastDataUpdate: (payload) => {
      calls.broadcasts.push(payload);
    },
    getState: async () => ({
      customEmailList: ['a@example.com', 'b@example.com'],
      customEmailUsedMap: { 'a@example.com': true },
      registeredEmailList: ['done@example.com'],
      email: 'a@example.com',
    }),
    setPersistentSettings: async (payload) => {
      calls.persistent.push(payload);
    },
    setState: async (payload) => {
      calls.session.push(payload);
    },
  });

  await pool.markEmailRegistrationComplete('a@example.com');

  assert.deepStrictEqual(calls.persistent.at(-1), {
    customEmailList: ['b@example.com'],
    customEmailUsedMap: {},
    registeredEmailList: ['done@example.com', 'a@example.com'],
  });
  assert.deepStrictEqual(calls.session.at(-1), {
    customEmailList: ['b@example.com'],
    customEmailUsedMap: {},
    registeredEmailList: ['done@example.com', 'a@example.com'],
    email: null,
  });
  assert.deepStrictEqual(calls.broadcasts.at(-1), {
    customEmailList: ['b@example.com'],
    customEmailUsedMap: {},
    registeredEmailList: ['done@example.com', 'a@example.com'],
    email: null,
  });
});

test('step 10 migration only runs after successful CPA upload', async () => {
  const calls = [];

  const router = routerApi.createMessageRouter({
    buildPersistentSettingsPayload: (payload) => payload,
    closeLocalhostCallbackTabs: async () => {},
    closeTabsByUrlPrefix: async () => {},
    getState: async () => ({}),
    isLocalhostOAuthCallbackUrl: () => true,
    markEmailRegistrationComplete: async (email) => {
      calls.push(email);
    },
    setPersistentSettings: async () => {},
    setState: async () => {},
  });

  await router.handleStepData(10, {
    localhostUrl: 'http://127.0.0.1:1455/auth/callback?code=abc&state=xyz',
    verifiedStatus: 'failed',
    accountEmail: 'a@example.com',
  });
  await router.handleStepData(10, {
    localhostUrl: 'http://127.0.0.1:1455/auth/callback?code=abc&state=xyz',
    verifiedStatus: 'uploaded',
    accountEmail: 'a@example.com',
  });

  assert.deepStrictEqual(calls, ['a@example.com']);
});
