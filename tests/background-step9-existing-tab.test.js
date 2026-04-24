const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/steps/confirm-oauth.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundStep9;`)(globalScope);

test('step 9 reuses existing signup tab even when oauthUrl is missing', async () => {
  const tabUpdates = [];
  const logs = [];

  const executor = api.createStep9Executor({
    addLog: async (message, level = 'info') => {
      logs.push({ message, level });
    },
    chrome: {
      webNavigation: {
        onBeforeNavigate: { addListener() {}, removeListener() {} },
        onCommitted: { addListener() {}, removeListener() {} },
      },
      tabs: {
        update: async (tabId, payload) => {
          tabUpdates.push({ tabId, payload });
        },
        onUpdated: { addListener() {}, removeListener() {} },
      },
    },
    cleanupStep8NavigationListeners: () => {},
    clickWithDebugger: async () => {},
    completeStepFromBackground: async () => {},
    ensureStep8SignupPageReady: async () => {},
    getOAuthFlowStepTimeoutMs: async (_defaultTimeoutMs, _details) => 1000,
    getStep8CallbackUrlFromNavigation: () => '',
    getStep8CallbackUrlFromTabUpdate: () => '',
    getStep8EffectLabel: () => 'no_effect',
    getTabId: async (sourceName) => (sourceName === 'signup-page' ? 11 : null),
    isTabAlive: async () => true,
    prepareStep8DebuggerClick: async () => ({ rect: { centerX: 10, centerY: 20 } }),
    reloadStep8ConsentPage: async () => {},
    reuseOrCreateTab: async () => {
      throw new Error('should not reopen signup tab');
    },
    sleepWithStop: async () => {},
    STEP8_CLICK_RETRY_DELAY_MS: 1,
    STEP8_MAX_ROUNDS: 1,
    STEP8_READY_WAIT_TIMEOUT_MS: 1,
    STEP8_STRATEGIES: [{ mode: 'debugger', label: 'debugger click' }],
    throwIfStep8SettledOrStopped: () => {},
    triggerStep8ContentStrategy: async () => {},
    waitForStep8ClickEffect: async () => ({ progressed: false, restartCurrentStep: false }),
    waitForStep8Ready: async () => {
      throw new Error('sentinel-after-existing-tab');
    },
    setWebNavListener: () => {},
    setWebNavCommittedListener: () => {},
    setStep8PendingReject: () => {},
    setStep8TabUpdatedListener: () => {},
    getWebNavListener: () => null,
    getWebNavCommittedListener: () => null,
    getStep8TabUpdatedListener: () => null,
  });

  await assert.rejects(
    () => executor.executeStep9({ oauthUrl: null }),
    /sentinel-after-existing-tab/,
  );

  assert.deepStrictEqual(tabUpdates, [
    { tabId: 11, payload: { active: true } },
  ]);
  assert.equal(
    logs.some(({ message }) => message === '步骤 9：已切回认证页，正在准备调试器点击...'),
    true,
  );
});
