const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('sidepanel window scope registers current window and opens links inside it', async () => {
  const source = fs.readFileSync('sidepanel/window-scope.js', 'utf8');
  const windowObject = { open() {} };
  const api = new Function('window', `${source}; return window.SidepanelWindowScope;`)(windowObject);
  const sentMessages = [];
  const createdTabs = [];

  const scope = api.createSidepanelWindowScope({
    chrome: {
      runtime: {
        sendMessage: async (message) => {
          sentMessages.push(message);
          return { ok: true };
        },
      },
      tabs: {
        create: async (payload) => {
          createdTabs.push(payload);
          return { id: 12, ...payload };
        },
      },
      windows: {
        getCurrent: async () => ({ id: 44 }),
      },
    },
  });

  const registeredWindowId = await scope.registerOwnerWindow();
  await scope.openExternalUrl('https://example.com/docs');

  assert.equal(registeredWindowId, 44);
  assert.deepStrictEqual(sentMessages, [
    {
      type: 'SET_OWNER_WINDOW',
      source: 'sidepanel',
      payload: { windowId: 44 },
    },
  ]);
  assert.deepStrictEqual(createdTabs, [
    { url: 'https://example.com/docs', active: true, windowId: 44 },
  ]);
});
