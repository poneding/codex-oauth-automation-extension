const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/steps/platform-verify.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundStep10;`)(globalScope);

function createExecutor(overrides = {}) {
  return api.createStep10Executor({
    addLog: async () => {},
    completeStepFromBackground: async () => {},
    exchangeAndUploadAuthFile: async () => ({ uploaded: true, accountEmail: 'user@example.com' }),
    getConfiguredCpaApiUrl: (state) => state?.cpaApiUrl || '',
    getConfiguredCpaManagementKey: (state) => state?.cpaManagementKey || '',
    isLocalhostOAuthCallbackUrl: () => true,
    shouldBypassStep9ForLocalCpa: () => false,
    ...overrides,
  });
}

test('step 10 exchanges callback and uploads auth file without opening CPA panel', async () => {
  const events = [];
  const executor = createExecutor({
    exchangeAndUploadAuthFile: async (state) => {
      events.push(['exchange', state.localhostUrl, state.oauthRuntime?.state]);
      return { uploaded: true, accountEmail: 'user@example.com' };
    },
    completeStepFromBackground: async (_step, payload) => {
      events.push(['complete', payload.verifiedStatus, payload.accountEmail]);
    },
    reuseOrCreateTab: async () => {
      throw new Error('should not open cpa panel');
    },
    ensureContentScriptReadyOnTab: async () => {
      throw new Error('should not connect cpa content script');
    },
    sendToContentScriptResilient: async () => {
      throw new Error('should not submit callback through cpa page');
    },
  });

  await executor.executeStep10({
    localhostUrl: 'http://127.0.0.1:1455/auth/callback?code=abc&state=xyz',
    oauthRuntime: {
      state: 'xyz',
      codeVerifier: 'verifier-1',
      redirectUri: 'http://127.0.0.1:1455/auth/callback',
      clientId: 'client-id',
    },
    cpaApiUrl: 'http://127.0.0.1:8317',
    cpaManagementKey: 'secret',
  });

  assert.deepStrictEqual(events, [
    ['exchange', 'http://127.0.0.1:1455/auth/callback?code=abc&state=xyz', 'xyz'],
    ['complete', 'uploaded', 'user@example.com'],
  ]);
});
