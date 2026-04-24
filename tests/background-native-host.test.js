const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/native-host.js', 'utf8');

function loadApi(chrome) {
  const globalScope = {};
  return new Function('self', 'chrome', `${source}; return self.MultiPageBackgroundNativeHost;`)(globalScope, chrome);
}

test('native host helper sends request envelope and resolves reply payload', async () => {
  const calls = [];
  let onMessage = null;
  let onDisconnect = null;
  let disconnected = false;

  const fakeChrome = {
    runtime: {
      connectNative(name) {
        return {
          name,
          onMessage: {
            addListener(listener) {
              onMessage = listener;
            },
          },
          onDisconnect: {
            addListener(listener) {
              onDisconnect = listener;
            },
          },
          postMessage(message) {
            calls.push([name, message.command]);
            queueMicrotask(() => onMessage?.({
              ok: true,
              result: { code: '123456' },
            }));
          },
          disconnect() {
            disconnected = true;
          },
        };
      },
      lastError: null,
    },
  };

  const api = loadApi(fakeChrome);

  const bridge = api.createNativeHostBridge({
    chrome: fakeChrome,
  });

  const result = await bridge.callNativeHost('gmail.waitForVerificationCode', {});

  assert.equal(result.code, '123456');
  assert.deepStrictEqual(calls, [['com.codex.oauth.automation', 'gmail.waitForVerificationCode']]);
  assert.equal(typeof onDisconnect, 'function');
  assert.equal(disconnected, true);
});
