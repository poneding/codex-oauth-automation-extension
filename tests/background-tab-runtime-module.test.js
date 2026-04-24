const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('tab runtime never lets explicit poll-email timeouts undercut derived Gmail polling windows', () => {
  const source = fs.readFileSync('background/tab-runtime.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundTabRuntime;`)(globalScope);

  const runtime = api.createTabRuntime({
    LOG_PREFIX: '[test]',
    addLog: async () => {},
    chrome: {
      tabs: {
        get: async () => ({ id: 1, url: 'https://mail.google.com/mail/u/0/#inbox', status: 'complete' }),
        query: async () => [],
        onUpdated: { addListener() {}, removeListener() {} },
      },
    },
    getSourceLabel: (sourceName) => sourceName || 'unknown',
    getState: async () => ({ tabRegistry: {}, sourceLastUrls: {} }),
    matchesSourceUrlFamily: () => false,
    setState: async () => {},
    throwIfStopped: () => {},
  });

  const message = {
    type: 'POLL_EMAIL',
    step: 4,
    payload: {
      maxAttempts: 5,
      intervalMs: 10000,
    },
  };

  assert.equal(runtime.getContentScriptResponseTimeoutMs(message), 75000);
  assert.equal(runtime.resolveContentScriptResponseTimeoutMs(message, 45000), 75000);
  assert.equal(
    runtime.resolveResilientTransportTimeoutMs(message, {
      timeoutMs: 45000,
      responseTimeoutMs: 45000,
      maxRecoveryAttempts: 2,
    }),
    85000,
  );
});

test('tab runtime flushes multiple queued commands for the same source without leaving earlier promises hanging', async () => {
  const source = fs.readFileSync('background/tab-runtime.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundTabRuntime;`)(globalScope);
  const sentMessages = [];

  const runtime = api.createTabRuntime({
    LOG_PREFIX: '[test]',
    addLog: async () => {},
    chrome: {
      tabs: {
        get: async () => ({ id: 9, url: 'https://example.com', status: 'complete' }),
        query: async () => [],
        sendMessage: async (_tabId, message) => {
          sentMessages.push(message.type);
          return { ok: true, type: message.type };
        },
        onUpdated: { addListener() {}, removeListener() {} },
      },
    },
    getSourceLabel: (sourceName) => sourceName || 'unknown',
    getState: async () => ({ tabRegistry: {}, sourceLastUrls: {} }),
    matchesSourceUrlFamily: () => false,
    setState: async () => {},
    throwIfStopped: () => {},
  });

  const first = runtime.queueCommand('signup-page', { type: 'FIRST' }, 1000);
  const second = runtime.queueCommand('signup-page', { type: 'SECOND' }, 1000);

  runtime.flushCommand('signup-page', 9);

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepStrictEqual(sentMessages, ['FIRST', 'SECOND']);
  assert.deepStrictEqual(firstResult, { ok: true, type: 'FIRST' });
  assert.deepStrictEqual(secondResult, { ok: true, type: 'SECOND' });
});

test('tab runtime recognizes browser error page urls', () => {
  const source = fs.readFileSync('background/tab-runtime.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundTabRuntime;`)(globalScope);

  const runtime = api.createTabRuntime({
    LOG_PREFIX: '[test]',
    addLog: async () => {},
    chrome: {
      tabs: {
        get: async () => ({ id: 1, url: 'https://example.com', status: 'complete' }),
        query: async () => [],
        onUpdated: { addListener() {}, removeListener() {} },
      },
    },
    getSourceLabel: (sourceName) => sourceName || 'unknown',
    getState: async () => ({ tabRegistry: {}, sourceLastUrls: {} }),
    matchesSourceUrlFamily: () => false,
    setState: async () => {},
    throwIfStopped: () => {},
  });

  assert.equal(runtime.isBrowserErrorPageUrl('chrome-error://chromewebdata/'), true);
  assert.equal(runtime.isBrowserErrorPageUrl('edge-error://edgewebdata/'), true);
  assert.equal(runtime.isBrowserErrorPageUrl('about:neterror?e=dnsNotFound'), true);
  assert.equal(runtime.isBrowserErrorPageUrl('https://chatgpt.com/'), false);
});

test('tab runtime accepts chatgpt content source for signup-page family tabs', () => {
  const source = fs.readFileSync('background/tab-runtime.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundTabRuntime;`)(globalScope);

  const runtime = api.createTabRuntime({
    LOG_PREFIX: '[test]',
    addLog: async () => {},
    chrome: {
      tabs: {
        get: async () => ({ id: 1, url: 'https://chatgpt.com/', status: 'complete' }),
        query: async () => [],
        onUpdated: { addListener() {}, removeListener() {} },
      },
    },
    getSourceLabel: (sourceName) => sourceName || 'unknown',
    getState: async () => ({ tabRegistry: {}, sourceLastUrls: {} }),
    matchesSourceUrlFamily: (sourceName, candidateUrl, referenceUrl) => (
      sourceName === 'signup-page'
      && candidateUrl === 'https://chatgpt.com/'
      && referenceUrl === 'https://chatgpt.com/'
    ),
    setState: async () => {},
    throwIfStopped: () => {},
  });

  assert.equal(
    runtime.isCompatibleContentScriptSource('signup-page', 'chatgpt', 'https://chatgpt.com/'),
    true,
  );
  assert.equal(
    runtime.isCompatibleContentScriptSource('signup-page', 'gmail-mail', 'https://chatgpt.com/'),
    false,
  );
});

test('tab runtime surfaces friendly error when content script target is a browser error page', async () => {
  const source = fs.readFileSync('background/tab-runtime.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundTabRuntime;`)(globalScope);

  const runtime = api.createTabRuntime({
    LOG_PREFIX: '[test]',
    addLog: async () => {},
    chrome: {
      tabs: {
        get: async () => ({
          id: 9,
          url: 'chrome-error://chromewebdata/',
          status: 'complete',
        }),
        sendMessage: async () => {
          throw new Error('no content script');
        },
        query: async () => [],
        onUpdated: { addListener() {}, removeListener() {} },
      },
      scripting: {
        executeScript: async () => {
          throw new Error('should not inject into error page');
        },
      },
    },
    getSourceLabel: (sourceName) => sourceName || 'unknown',
    getState: async () => ({ tabRegistry: {}, sourceLastUrls: {} }),
    matchesSourceUrlFamily: () => false,
    setState: async () => {},
    throwIfStopped: () => {},
  });

  await assert.rejects(
    runtime.ensureContentScriptReadyOnTab('signup-page', 9, {
      inject: ['content/signup-page.js'],
      timeoutMs: 50,
      retryDelayMs: 1,
    }),
    /浏览器当前显示错误页/
  );
});

test('tab runtime waitForTabComplete waits until tab status becomes complete', async () => {
  const source = fs.readFileSync('background/tab-runtime.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundTabRuntime;`)(globalScope);

  let getCalls = 0;
  const runtime = api.createTabRuntime({
    LOG_PREFIX: '[test]',
    addLog: async () => {},
    buildLocalhostCleanupPrefix: () => '',
    chrome: {
      tabs: {
        get: async () => {
          getCalls += 1;
          return {
            id: 9,
            url: 'https://example.com',
            status: getCalls >= 3 ? 'complete' : 'loading',
          };
        },
        query: async () => [],
      },
    },
    getSourceLabel: (source) => source || 'unknown',
    getState: async () => ({ tabRegistry: {}, sourceLastUrls: {} }),
    matchesSourceUrlFamily: () => false,
    normalizeLocalCpaStep9Mode: () => 'submit',
    parseUrlSafely: () => null,
    registerTab: async () => {},
    setState: async () => {},
    shouldBypassStep9ForLocalCpa: () => false,
    throwIfStopped: () => {},
  });

  const result = await runtime.waitForTabComplete(9, {
    timeoutMs: 2000,
    retryDelayMs: 1,
  });

  assert.equal(result?.status, 'complete');
  assert.equal(getCalls, 3);
});

test('tab runtime waitForTabComplete aborts promptly when stop is requested', async () => {
  const source = fs.readFileSync('background/tab-runtime.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundTabRuntime;`)(globalScope);

  let throwCalls = 0;
  const runtime = api.createTabRuntime({
    LOG_PREFIX: '[test]',
    addLog: async () => {},
    chrome: {
      tabs: {
        get: async () => ({
          id: 9,
          url: 'https://example.com',
          status: 'loading',
        }),
        query: async () => [],
      },
    },
    getSourceLabel: (sourceName) => sourceName || 'unknown',
    getState: async () => ({ tabRegistry: {}, sourceLastUrls: {} }),
    matchesSourceUrlFamily: () => false,
    setState: async () => {},
    throwIfStopped: () => {
      throwCalls += 1;
      if (throwCalls >= 2) {
        throw new Error('Flow stopped.');
      }
    },
  });

  await assert.rejects(
    runtime.waitForTabComplete(9, {
      timeoutMs: 2000,
      retryDelayMs: 1,
    }),
    /Flow stopped\./
  );
});

test('tab runtime creates new tabs inside the owner window', async () => {
  const source = fs.readFileSync('background/tab-runtime.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundTabRuntime;`)(globalScope);
  const createdTabs = [];

  const runtime = api.createTabRuntime({
    LOG_PREFIX: '[test]',
    addLog: async () => {},
    chrome: {
      tabs: {
        create: async (payload) => {
          createdTabs.push(payload);
          return { id: 41, ...payload };
        },
        query: async () => [],
        onUpdated: { addListener() {}, removeListener() {} },
      },
      windows: {
        get: async (windowId) => ({ id: windowId }),
      },
    },
    getSourceLabel: (sourceName) => sourceName || 'unknown',
    getState: async () => ({ tabRegistry: {}, sourceLastUrls: {}, ownerWindowId: 77 }),
    matchesSourceUrlFamily: () => false,
    setState: async () => {},
    throwIfStopped: () => {},
  });

  await runtime.reuseOrCreateTab('signup-page', 'https://chatgpt.com/');

  assert.deepStrictEqual(createdTabs, [
    { url: 'https://chatgpt.com/', active: true, windowId: 77 },
  ]);
});

test('tab runtime does not reuse a tracked tab from another window', async () => {
  const source = fs.readFileSync('background/tab-runtime.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundTabRuntime;`)(globalScope);
  const createdTabs = [];
  const updatedTabs = [];
  const stateUpdates = [];

  const runtime = api.createTabRuntime({
    LOG_PREFIX: '[test]',
    addLog: async () => {},
    chrome: {
      tabs: {
        create: async (payload) => {
          createdTabs.push(payload);
          return { id: 51, ...payload };
        },
        get: async (tabId) => ({ id: tabId, url: 'https://chatgpt.com/', windowId: 88, status: 'complete' }),
        query: async () => [],
        update: async (tabId, payload) => {
          updatedTabs.push({ tabId, payload });
          return { id: tabId, ...payload };
        },
        onUpdated: { addListener() {}, removeListener() {} },
      },
      windows: {
        get: async (windowId) => ({ id: windowId }),
      },
    },
    getSourceLabel: (sourceName) => sourceName || 'unknown',
    getState: async () => ({
      tabRegistry: { 'signup-page': { tabId: 9, ready: true } },
      sourceLastUrls: {},
      ownerWindowId: 77,
    }),
    matchesSourceUrlFamily: () => false,
    setState: async (updates) => {
      stateUpdates.push(updates);
    },
    throwIfStopped: () => {},
  });

  await runtime.reuseOrCreateTab('signup-page', 'https://chatgpt.com/');

  assert.deepStrictEqual(updatedTabs, []);
  assert.deepStrictEqual(createdTabs, [
    { url: 'https://chatgpt.com/', active: true, windowId: 77 },
  ]);
  assert.deepStrictEqual(stateUpdates, [
    { tabRegistry: { 'signup-page': null } },
    { sourceLastUrls: { 'signup-page': 'https://chatgpt.com/' } },
  ]);
});
