const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('panel bridge opens CPA panel inside the owner window', async () => {
  const source = fs.readFileSync('background/panel-bridge.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundPanelBridge;`)(globalScope);
  const createdTabs = [];

  const bridge = api.createPanelBridge({
    addLog: async () => {},
    chrome: {
      tabs: {
        create: async (payload) => {
          createdTabs.push(payload);
          return { id: 31, ...payload };
        },
      },
      windows: {
        get: async (windowId) => ({ id: windowId }),
      },
    },
    closeConflictingTabsForSource: async () => {},
    ensureContentScriptReadyOnTab: async () => {},
    getState: async () => ({ ownerWindowId: 77 }),
    rememberSourceLastUrl: async () => {},
    sendToContentScriptResilient: async () => ({ oauthUrl: 'https://auth.openai.com/authorize' }),
    waitForTabUrlFamily: async () => ({ id: 31, url: 'https://cpa.example/panel' }),
  });

  await bridge.requestCpaOAuthUrl({
    vpsUrl: 'https://cpa.example/panel',
    vpsPassword: 'secret',
  });

  assert.deepStrictEqual(createdTabs, [
    { url: 'https://cpa.example/panel', active: true, windowId: 77 },
  ]);
});
