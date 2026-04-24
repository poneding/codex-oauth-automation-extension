const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function createNode(initial = {}) {
  return {
    value: '',
    innerHTML: '',
    textContent: '',
    disabled: false,
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    ...initial,
  };
}

async function flushPromises() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('pending email manager normalizes list and renders pending registration progress', () => {
  const source = fs.readFileSync('sidepanel/custom-email-manager.js', 'utf8');
  const windowObject = {};
  const api = new Function('window', `${source}; return window.SidepanelCustomEmailManager;`)(windowObject);

  assert.equal(typeof api?.createCustomEmailManager, 'function');

  const dom = {
    btnCustomEmailResetProgress: createNode(),
    customEmailCurrent: createNode(),
    customEmailNext: createNode(),
    customEmailPreview: createNode(),
    customEmailRemaining: createNode(),
    customEmailSummary: createNode(),
    inputCustomEmailList: createNode(),
  };
  const latestState = {
    email: 'second@example.com',
    customEmailList: [
      'first@example.com',
      ' second@example.com ',
      'third@example.com',
      'FIRST@example.com',
    ],
    customEmailUsedMap: {
      'first@example.com': true,
    },
  };

  const manager = api.createCustomEmailManager({
    state: {
      getLatestState: () => latestState,
      syncLatestState() {},
    },
    dom,
    helpers: {
      escapeHtml: (value) => String(value ?? ''),
      showToast() {},
    },
    runtime: {
      sendMessage: async () => ({}),
    },
  });

  manager.applyState(latestState);

  assert.equal(
    dom.inputCustomEmailList.value,
    'first@example.com\nsecond@example.com\nthird@example.com'
  );
  assert.match(dom.customEmailSummary.textContent, /已配置 3 个待注册邮箱/);
  assert.match(dom.customEmailSummary.textContent, /已用 1 个/);
  assert.match(dom.customEmailSummary.textContent, /剩余 2 个/);
  assert.equal(dom.customEmailCurrent.textContent, 'second@example.com');
  assert.equal(dom.customEmailNext.textContent, 'third@example.com');
  assert.equal(dom.customEmailRemaining.textContent, '2');
  assert.match(dom.customEmailPreview.innerHTML, /当前/);
  assert.match(dom.customEmailPreview.innerHTML, /已用/);
  assert.equal(dom.btnCustomEmailResetProgress.disabled, false);
});

test('pending email manager binds input and resets pending progress', async () => {
  const source = fs.readFileSync('sidepanel/custom-email-manager.js', 'utf8');
  const windowObject = {};
  const api = new Function('window', `${source}; return window.SidepanelCustomEmailManager;`)(windowObject);

  let latestState = {
    email: '',
    customEmailList: [],
    customEmailUsedMap: {
      'used@example.com': true,
    },
  };
  let lastInputList = null;
  let lastCommitList = null;
  let sentMessage = null;
  const toasts = [];

  const dom = {
    btnCustomEmailResetProgress: createNode(),
    customEmailCurrent: createNode(),
    customEmailNext: createNode(),
    customEmailPreview: createNode(),
    customEmailRemaining: createNode(),
    customEmailSummary: createNode(),
    inputCustomEmailList: createNode(),
  };

  const manager = api.createCustomEmailManager({
    state: {
      getLatestState: () => latestState,
      syncLatestState(nextState) {
        latestState = { ...latestState, ...(nextState || {}) };
      },
    },
    dom,
    helpers: {
      escapeHtml: (value) => String(value ?? ''),
      showToast(message, tone) {
        toasts.push({ message, tone });
      },
    },
    runtime: {
      sendMessage: async (message) => {
        sentMessage = message;
        latestState = { ...latestState, customEmailUsedMap: {} };
        return { state: latestState };
      },
    },
    callbacks: {
      onListInput(list) {
        lastInputList = list;
        latestState = { ...latestState, customEmailList: list };
      },
      onListCommit(list) {
        lastCommitList = list;
        latestState = { ...latestState, customEmailList: list };
      },
    },
  });

  manager.bindEvents();
  dom.inputCustomEmailList.value = 'alpha@example.com\nALPHA@example.com\nbravo@example.com';
  dom.inputCustomEmailList.listeners.input();

  assert.deepEqual(lastInputList, ['alpha@example.com', 'bravo@example.com']);
  assert.match(dom.customEmailPreview.innerHTML, /alpha@example.com/);

  dom.inputCustomEmailList.listeners.blur();

  assert.deepEqual(lastCommitList, ['alpha@example.com', 'bravo@example.com']);
  assert.equal(dom.inputCustomEmailList.value, 'alpha@example.com\nbravo@example.com');

  dom.btnCustomEmailResetProgress.listeners.click();
  await flushPromises();

  assert.deepEqual(sentMessage, {
    type: 'SAVE_SETTING',
    source: 'sidepanel',
    payload: {
      customEmailUsedMap: {},
    },
  });
  assert.equal(dom.btnCustomEmailResetProgress.disabled, true);
  assert.match(toasts.at(-1)?.message || '', /已重置待注册邮箱列表进度/);
});
