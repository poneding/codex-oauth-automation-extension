const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }

  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
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

const bundle = extractFunction('ensureAutoEmailReady');

test('ensureAutoEmailReady allocates the next custom email without manual waiting', async () => {
  const api = new Function(`
const events = { logs: [], waits: 0, statuses: [], ensured: 0 };
function normalizeCustomEmailEntry(value) { return String(value || '').trim().toLowerCase(); }
function hasConfiguredCustomEmailList(state) { return Array.isArray(state.customEmailList) && state.customEmailList.length > 0; }
async function ensureCustomEmailForFlow() {
  events.ensured += 1;
  return 'pool-1@example.com';
}
async function setEmailStateSilently(email) {
  events.assignedEmail = email;
}
async function addLog(message, level = 'info') { events.logs.push({ message, level }); }
async function broadcastAutoRunStatus(phase, payload) { events.statuses.push({ phase, payload }); }
async function waitForResume() { events.waits += 1; }
async function getState() {
  return {
    email: '',
    customEmailList: ['pool-1@example.com', 'pool-2@example.com'],
    customEmailUsedMap: {},
  };
}
${bundle}
return {
  run: async () => {
    const email = await ensureAutoEmailReady(2, 5, 1);
    return { email, events };
  },
};
`)();

  const result = await api.run();

  assert.equal(result.email, 'pool-1@example.com');
  assert.equal(result.events.ensured, 1);
  assert.equal(result.events.assignedEmail, 'pool-1@example.com');
  assert.equal(result.events.waits, 0);
  assert.deepStrictEqual(result.events.statuses, []);
});

test('ensureAutoEmailReady fails fast when the configured custom email list is exhausted', async () => {
  const api = new Function(`
const events = { waits: 0, statuses: [] };
function normalizeCustomEmailEntry(value) { return String(value || '').trim().toLowerCase(); }
function hasConfiguredCustomEmailList(state) { return Array.isArray(state.customEmailList) && state.customEmailList.length > 0; }
async function ensureCustomEmailForFlow() { return ''; }
async function setEmailStateSilently() {}
async function addLog() {}
async function broadcastAutoRunStatus(phase, payload) { events.statuses.push({ phase, payload }); }
async function waitForResume() { events.waits += 1; }
async function getState() {
  return {
    email: '',
    customEmailList: ['pool-1@example.com'],
    customEmailUsedMap: { 'pool-1@example.com': true },
  };
}
${bundle}
return {
  run: async () => ensureAutoEmailReady(2, 5, 1),
  events,
};
`)();

  await assert.rejects(() => api.run(), /自定义邮箱列表已耗尽/);
  assert.equal(api.events.waits, 0);
  assert.deepStrictEqual(api.events.statuses, []);
});
