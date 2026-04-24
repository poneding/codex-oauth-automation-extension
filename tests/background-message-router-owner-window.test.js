const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/message-router.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundMessageRouter;`)(globalScope);

test('message router stores owner window id for sidepanel scoped tabs', async () => {
  const stateUpdates = [];
  const router = api.createMessageRouter({
    getState: async () => ({}),
    setState: async (updates) => {
      stateUpdates.push(updates);
    },
  });

  const result = await router.handleMessage({
    type: 'SET_OWNER_WINDOW',
    source: 'sidepanel',
    payload: {
      windowId: 44,
    },
  }, {});

  assert.deepStrictEqual(stateUpdates, [
    { ownerWindowId: 44 },
  ]);
  assert.deepStrictEqual(result, {
    ok: true,
    windowId: 44,
  });
});

test('message router rejects invalid owner window id payloads', async () => {
  const router = api.createMessageRouter({
    getState: async () => ({}),
    setState: async () => {},
  });

  await assert.rejects(
    () => router.handleMessage({
      type: 'SET_OWNER_WINDOW',
      source: 'sidepanel',
      payload: {
        windowId: 'abc',
      },
    }, {}),
    /无效的窗口 ID/
  );
});
