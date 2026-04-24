const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const syncSignature = `function ${name}(`;
  const asyncSignature = `async function ${name}(`;
  const asyncStart = source.indexOf(asyncSignature);
  const syncStart = source.indexOf(syncSignature);
  let start = asyncStart >= 0 ? asyncStart : syncStart;
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

function buildApi(overrides = {}) {
  const logs = [];
  const getAllCalls = [];
  const removeCalls = [];
  const tabQueryCalls = [];
  const browsingDataCalls = [];

  const chrome = overrides.chrome || {
    tabs: {
      query: async (queryInfo) => {
        tabQueryCalls.push(queryInfo);
        return [];
      },
    },
    cookies: {
      getAllCookieStores: async () => [],
      getAll: async (details) => {
        getAllCalls.push(details);
        return [];
      },
      remove: async (details) => {
        removeCalls.push(details);
        return { url: details.url, name: details.name };
      },
    },
    browsingData: {
      removeCookies: async (details) => {
        browsingDataCalls.push(details);
      },
    },
  };

  const bundle = [
    extractFunction('normalizeCookieDomainForMatch'),
    extractFunction('normalizeCookieStoreId'),
    extractFunction('shouldClearPreLoginCookie'),
    extractFunction('buildCookieRemovalUrl'),
    extractFunction('resolveCookieStoreIdsForWindow'),
    extractFunction('collectCookiesForPreLoginCleanup'),
    extractFunction('removeCookieDirectly'),
    extractFunction('runChatgptCookieCleanup'),
  ].join('\n');

  const api = new Function(
    'chrome',
    'PRE_LOGIN_COOKIE_CLEAR_DOMAINS',
    'LOG_PREFIX',
    'addLog',
    'getState',
    'getErrorMessage',
    'sleepWithStop',
    'throwIfStopped',
    `${bundle}
     return {
       resolveCookieStoreIdsForWindow,
       collectCookiesForPreLoginCleanup,
       runChatgptCookieCleanup,
     };`
  )(
    chrome,
    ['chatgpt.com', 'openai.com', 'auth.openai.com'],
    '[test]',
    async (message, level = 'info') => {
      logs.push({ message, level });
    },
    overrides.getState || (async () => ({ ownerWindowId: 44 })),
    (error) => error?.message || String(error || ''),
    async () => {},
    () => {}
  );

  return {
    api,
    browsingDataCalls,
    chrome,
    getAllCalls,
    logs,
    removeCalls,
    tabQueryCalls,
  };
}

test('runChatgptCookieCleanup only removes cookies from the owner window cookie store', async () => {
  const tabQueryCalls = [];
  const getAllCalls = [];
  const removeCalls = [];
  const browsingDataCalls = [];
  const runtime = buildApi({
    chrome: {
      tabs: {
        query: async (queryInfo) => {
          tabQueryCalls.push(queryInfo);
          return [
            { id: 101, windowId: 44 },
            { id: 102, windowId: 44 },
          ];
        },
      },
      cookies: {
        getAllCookieStores: async () => [
          { id: '0', tabIds: [201] },
          { id: '1', tabIds: [101, 102] },
        ],
        getAll: async (details) => {
          getAllCalls.push(details);
          if (details?.storeId === '1') {
            return [
              { domain: '.auth.openai.com', path: '/', name: 'target', secure: true, storeId: '1' },
              { domain: '.example.com', path: '/', name: 'ignore', secure: true, storeId: '1' },
            ];
          }
          if (details?.storeId === '0') {
            return [
              { domain: '.auth.openai.com', path: '/', name: 'other-store', secure: true, storeId: '0' },
            ];
          }
          return [];
        },
        remove: async (details) => {
          removeCalls.push(details);
          return { url: details.url, name: details.name };
        },
      },
      browsingData: {
        removeCookies: async (details) => {
          browsingDataCalls.push(details);
        },
      },
    },
  });

  await runtime.api.runChatgptCookieCleanup({
    stepLabel: '步骤 1',
    delayMs: 0,
  });

  assert.deepStrictEqual(tabQueryCalls, [
    { windowId: 44 },
  ]);
  assert.deepStrictEqual(getAllCalls, [
    { storeId: '1' },
  ]);
  assert.deepStrictEqual(removeCalls, [
    { url: 'https://auth.openai.com/', name: 'target', storeId: '1' },
  ]);
  assert.deepStrictEqual(browsingDataCalls, []);
  assert.match(runtime.logs.at(-1)?.message || '', /当前窗口对应的 Cookie 存储/);
});

test('runChatgptCookieCleanup skips cleanup when no cookie store matches the owner window', async () => {
  const tabQueryCalls = [];
  const getAllCalls = [];
  const removeCalls = [];
  const browsingDataCalls = [];
  const runtime = buildApi({
    chrome: {
      tabs: {
        query: async (queryInfo) => {
          tabQueryCalls.push(queryInfo);
          return [{ id: 301, windowId: 44 }];
        },
      },
      cookies: {
        getAllCookieStores: async () => [
          { id: '0', tabIds: [999] },
        ],
        getAll: async (details) => {
          getAllCalls.push(details);
          return [];
        },
        remove: async (details) => {
          removeCalls.push(details);
          return { url: details.url, name: details.name };
        },
      },
      browsingData: {
        removeCookies: async (details) => {
          browsingDataCalls.push(details);
        },
      },
    },
  });

  await runtime.api.runChatgptCookieCleanup({
    stepLabel: '步骤 1',
    delayMs: 0,
  });

  assert.deepStrictEqual(tabQueryCalls, [
    { windowId: 44 },
  ]);
  assert.deepStrictEqual(getAllCalls, []);
  assert.deepStrictEqual(removeCalls, []);
  assert.deepStrictEqual(browsingDataCalls, []);
  assert.match(runtime.logs.at(-1)?.message || '', /未找到当前窗口对应的 Cookie 存储/);
});
