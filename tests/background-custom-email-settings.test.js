const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const routerSource = fs.readFileSync('background/message-router.js', 'utf8');
const routerGlobalScope = {};
const routerApi = new Function('self', `${routerSource}; return self.MultiPageBackgroundMessageRouter;`)(routerGlobalScope);

const customEmailPoolSource = fs.readFileSync('background/custom-email-pool.js', 'utf8');
const customEmailPoolGlobalScope = {};
const customEmailPoolApi = new Function('self', `${customEmailPoolSource}; return self.MultiPageBackgroundCustomEmailPool;`)(customEmailPoolGlobalScope);

test('message router saves a normalized custom email list without rewriting used progress unless it is explicitly provided', async () => {
  const calls = {
    persisted: null,
    session: null,
  };
  let currentState = {
    customEmailUsedMap: {
      'keep@example.com': true,
      'drop@example.com': true,
    },
  };

  const router = routerApi.createMessageRouter({
    buildPersistentSettingsPayload: (input = {}) => {
      const output = {};
      if (input.customEmailList !== undefined) {
        output.customEmailList = customEmailPoolApi.normalizeCustomEmailList(input.customEmailList);
      }
      if (input.customEmailUsedMap !== undefined) {
        output.customEmailUsedMap = customEmailPoolApi.normalizeCustomEmailUsedMap(
          input.customEmailUsedMap,
          output.customEmailList
        );
      }
      return output;
    },
    buildLuckmailSessionSettingsPayload: () => ({}),
    getState: async () => currentState,
    setPersistentSettings: async (updates) => {
      calls.persisted = updates;
    },
    setState: async (updates) => {
      calls.session = updates;
      currentState = {
        ...currentState,
        ...updates,
      };
    },
  });

  const response = await router.handleMessage({
    type: 'SAVE_SETTING',
    payload: {
      customEmailList: ['keep@example.com', 'next@example.com'],
    },
  }, {});

  assert.deepStrictEqual(calls.persisted, {
    customEmailList: ['keep@example.com', 'next@example.com'],
  });
  assert.deepStrictEqual(calls.session, {
    customEmailList: ['keep@example.com', 'next@example.com'],
  });
  assert.deepStrictEqual(response, {
    ok: true,
    state: {
      customEmailList: ['keep@example.com', 'next@example.com'],
      customEmailUsedMap: {
        'drop@example.com': true,
        'keep@example.com': true,
      },
    },
  });
});
