const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/steps/oauth-login.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundStep7;`)(globalScope);

function createExecutor(overrides = {}) {
  return api.createStep7Executor({
    addLog: async () => {},
    completeStepFromBackground: async () => {},
    createLocalOAuthRuntime: async () => ({
      authUrl: 'https://auth.openai.com/oauth/authorize?client_id=test',
      state: 'state-1',
      codeVerifier: 'verifier-1',
      redirectUri: 'http://127.0.0.1:1455/auth/callback',
      clientId: 'client-id',
      createdAt: 123,
    }),
    getErrorMessage: (error) => error?.message || String(error || ''),
    getLoginAuthStateLabel: (state) => state || 'unknown',
    getOAuthFlowStepTimeoutMs: async () => 5000,
    getState: async () => ({ email: 'user@example.com', password: 'secret' }),
    isStep6RecoverableResult: (result) => result?.step6Outcome === 'recoverable',
    isStep6SuccessResult: (result) => result?.step6Outcome === 'success',
    reuseOrCreateTab: async () => {},
    sendToContentScriptResilient: async () => ({ step6Outcome: 'success' }),
    setState: async () => {},
    startOAuthFlowTimeoutWindow: async () => {},
    STEP6_MAX_ATTEMPTS: 3,
    throwIfStopped: () => {},
    ...overrides,
  });
}

test('step 7 creates oauth runtime with auth url, state, verifier, and redirect uri', async () => {
  const stateUpdates = [];
  const openedUrls = [];
  const startedWindows = [];

  const executor = createExecutor({
    createLocalOAuthRuntime: async () => ({
      authUrl: 'https://auth.openai.com/oauth/authorize?client_id=test',
      state: 'state-1',
      codeVerifier: 'verifier-1',
      redirectUri: 'http://127.0.0.1:1455/auth/callback',
      clientId: 'client-id',
      createdAt: 123,
    }),
    reuseOrCreateTab: async (_source, url) => {
      openedUrls.push(url);
    },
    setState: async (payload) => {
      stateUpdates.push(payload);
    },
    sendToContentScriptResilient: async () => ({ step6Outcome: 'success' }),
    startOAuthFlowTimeoutWindow: async (payload) => {
      startedWindows.push(payload);
    },
  });

  await executor.executeStep7({ email: 'user@example.com', password: 'secret' });

  assert.deepStrictEqual(stateUpdates, [{
    oauthRuntime: {
      authUrl: 'https://auth.openai.com/oauth/authorize?client_id=test',
      state: 'state-1',
      codeVerifier: 'verifier-1',
      redirectUri: 'http://127.0.0.1:1455/auth/callback',
      clientId: 'client-id',
      createdAt: 123,
    },
    oauthUrl: 'https://auth.openai.com/oauth/authorize?client_id=test',
  }]);
  assert.deepStrictEqual(openedUrls, ['https://auth.openai.com/oauth/authorize?client_id=test']);
  assert.deepStrictEqual(startedWindows, [{
    step: 7,
    oauthUrl: 'https://auth.openai.com/oauth/authorize?client_id=test',
  }]);
});
