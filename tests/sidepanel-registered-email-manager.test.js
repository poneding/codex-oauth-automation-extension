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

test('registered email manager renders editable list and clear action', () => {
  const source = fs.readFileSync('sidepanel/registered-email-manager.js', 'utf8');
  const windowObject = {};
  const api = new Function('window', `${source}; return window.SidepanelRegisteredEmailManager;`)(windowObject);

  const dom = {
    btnRegisteredEmailClear: createNode(),
    inputRegisteredEmailList: createNode(),
    registeredEmailPreview: createNode(),
    registeredEmailSummary: createNode(),
  };

  const manager = api.createRegisteredEmailManager({
    state: {
      getLatestState: () => ({
        registeredEmailList: ['done@example.com', 'Done@example.com'],
      }),
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

  const view = manager.applyState({
    registeredEmailList: ['done@example.com', 'Done@example.com'],
  });

  assert.equal(view.totalCount, 1);
  assert.equal(dom.inputRegisteredEmailList.value, 'done@example.com');
  assert.match(dom.registeredEmailSummary.textContent, /已登记 1 个邮箱/);
  assert.match(dom.registeredEmailPreview.innerHTML, /done@example.com/);
  assert.equal(dom.btnRegisteredEmailClear.disabled, false);
});

test('registered email manager supports input normalization and clear without mutating pending list state', async () => {
  const source = fs.readFileSync('sidepanel/registered-email-manager.js', 'utf8');
  const windowObject = {};
  const api = new Function('window', `${source}; return window.SidepanelRegisteredEmailManager;`)(windowObject);

  let latestState = {
    customEmailList: ['pending@example.com'],
    registeredEmailList: ['done@example.com'],
  };
  const toasts = [];
  let lastInputList = null;
  let lastCommitList = null;
  let sentMessage = null;

  const dom = {
    btnRegisteredEmailClear: createNode(),
    inputRegisteredEmailList: createNode(),
    registeredEmailPreview: createNode(),
    registeredEmailSummary: createNode(),
  };

  const manager = api.createRegisteredEmailManager({
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
        latestState = { ...latestState, registeredEmailList: [] };
        return { state: latestState };
      },
    },
    callbacks: {
      onListInput(list) {
        lastInputList = list;
        latestState = { ...latestState, registeredEmailList: list };
      },
      onListCommit(list) {
        lastCommitList = list;
        latestState = { ...latestState, registeredEmailList: list };
      },
    },
  });

  manager.bindEvents();
  dom.inputRegisteredEmailList.value = 'done@example.com\nDONE@example.com\nok@example.com';
  dom.inputRegisteredEmailList.listeners.input();
  dom.inputRegisteredEmailList.listeners.blur();

  assert.deepEqual(lastInputList, ['done@example.com', 'ok@example.com']);
  assert.deepEqual(lastCommitList, ['done@example.com', 'ok@example.com']);
  assert.equal(dom.inputRegisteredEmailList.value, 'done@example.com\nok@example.com');

  dom.btnRegisteredEmailClear.listeners.click();
  await flushPromises();

  assert.deepEqual(sentMessage, {
    type: 'SAVE_SETTING',
    source: 'sidepanel',
    payload: {
      registeredEmailList: [],
    },
  });
  assert.deepEqual(latestState.customEmailList, ['pending@example.com']);
  assert.match(toasts.at(-1)?.message || '', /已清空已注册邮箱列表/);
});
