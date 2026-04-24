const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/steps/fill-password.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundStep3;`)(globalScope);

test('step 3 reuses existing generated password when rerunning the same email flow', async () => {
  const events = {
    logs: [],
    passwordStates: [],
    messages: [],
  };

  const executor = api.createStep3Executor({
    addLog: async (message, level = 'info') => {
      events.logs.push({ message, level });
    },
    chrome: { tabs: { update: async () => {} } },
    ensureContentScriptReadyOnTab: async () => {},
    generatePassword: () => 'Generated-Should-Not-Be-Used',
    getTabId: async () => 88,
    isTabAlive: async () => true,
    sendToContentScript: async (_source, message) => {
      events.messages.push(message);
    },
    setPasswordState: async (password) => {
      events.passwordStates.push(password);
    },
    setState: async () => {},
    SIGNUP_PAGE_INJECT_FILES: [],
  });

  await executor.executeStep3({
    email: 'keep@example.com',
    password: 'Secret123!',
    customPassword: '',
    accounts: [],
  });

  assert.deepStrictEqual(events.passwordStates, ['Secret123!']);
  assert.deepStrictEqual(events.logs, [
    {
      message: '步骤 3：正在填写密码，邮箱为 keep@example.com，密码为自动生成（10 位）',
      level: 'info',
    },
    {
      message: '步骤 3：本轮使用的自动生成密码为 Secret123!',
      level: 'info',
    },
  ]);
  assert.deepStrictEqual(events.messages, [
    {
      type: 'EXECUTE_STEP',
      step: 3,
      source: 'background',
      payload: {
        email: 'keep@example.com',
        password: 'Secret123!',
      },
    },
  ]);
});

test('step 3 logs the generated password value when password is auto generated', async () => {
  const events = {
    logs: [],
    passwordStates: [],
  };

  const executor = api.createStep3Executor({
    addLog: async (message, level = 'info') => {
      events.logs.push({ message, level });
    },
    chrome: { tabs: { update: async () => {} } },
    ensureContentScriptReadyOnTab: async () => {},
    generatePassword: () => 'Auto-Gen-7788!',
    getTabId: async () => 99,
    isTabAlive: async () => true,
    sendToContentScript: async () => {},
    setPasswordState: async (password) => {
      events.passwordStates.push(password);
    },
    setState: async () => {},
    SIGNUP_PAGE_INJECT_FILES: [],
  });

  await executor.executeStep3({
    email: 'autogen@example.com',
    password: '',
    customPassword: '',
    accounts: [],
  });

  assert.deepStrictEqual(events.passwordStates, ['Auto-Gen-7788!']);
  assert.deepStrictEqual(events.logs, [
    {
      message: '步骤 3：正在填写密码，邮箱为 autogen@example.com，密码为自动生成（14 位）',
      level: 'info',
    },
    {
      message: '步骤 3：本轮使用的自动生成密码为 Auto-Gen-7788!',
      level: 'info',
    },
  ]);
});

test('step 3 does not print the custom password value into logs', async () => {
  const events = {
    logs: [],
  };

  const executor = api.createStep3Executor({
    addLog: async (message, level = 'info') => {
      events.logs.push({ message, level });
    },
    chrome: { tabs: { update: async () => {} } },
    ensureContentScriptReadyOnTab: async () => {},
    generatePassword: () => 'Should-Not-Be-Used',
    getTabId: async () => 77,
    isTabAlive: async () => true,
    sendToContentScript: async () => {},
    setPasswordState: async () => {},
    setState: async () => {},
    SIGNUP_PAGE_INJECT_FILES: [],
  });

  await executor.executeStep3({
    email: 'custom@example.com',
    password: '',
    customPassword: 'MyCustom#2026',
    accounts: [],
  });

  assert.deepStrictEqual(events.logs, [
    {
      message: '步骤 3：正在填写密码，邮箱为 custom@example.com，密码为自定义（13 位）',
      level: 'info',
    },
  ]);
  assert.ok(events.logs.every((entry) => !entry.message.includes('MyCustom#2026')));
});
