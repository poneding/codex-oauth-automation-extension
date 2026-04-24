const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('content/signup-page.js', 'utf8');

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

test('step6LoginFromPasswordPage switches to one-time code login when password is missing but trigger exists', async () => {
  const api = new Function(`
const logs = [];
function inspectLoginAuthState() {
  return {};
}
function normalizeStep6Snapshot(snapshot) {
  return snapshot;
}
function log(message, level = 'info') {
  logs.push({ message, level });
}
async function humanPause() {}
function fillInput() {}
async function sleep() {}
async function triggerLoginSubmitAction() {}
async function waitForStep6PasswordSubmitTransition() {
  return { action: 'done', result: { ok: true } };
}
async function step6SwitchToOneTimeCodeLogin(snapshot) {
  return { switched: true, snapshot };
}
function createStep6RecoverableResult(reason, snapshot, options = {}) {
  return { step6Outcome: 'recoverable', reason, snapshot, message: options.message || '' };
}
${extractFunction('step6LoginFromPasswordPage')}
return {
  run(payload, snapshot) {
    return step6LoginFromPasswordPage(payload, snapshot);
  },
  getLogs() {
    return logs;
  },
};
`)();

  const snapshot = {
    passwordInput: { value: '' },
    switchTrigger: { id: 'switch-trigger' },
    submitButton: { id: 'submit-button' },
  };

  const result = await api.run(
    { email: 'user@example.com', password: '' },
    snapshot
  );

  assert.deepStrictEqual(result, {
    switched: true,
    snapshot,
  });
  assert.ok(api.getLogs().some(({ message }) => /缺少可用密码/.test(message)));
});
