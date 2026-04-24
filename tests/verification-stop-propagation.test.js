const assert = require('assert');
const fs = require('fs');

const helperSource = fs.readFileSync('background.js', 'utf8');
const verificationFlowSource = fs.readFileSync('background/verification-flow.js', 'utf8');

function extractFunction(source, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map(marker => source.indexOf(marker))
    .find(index => index >= 0);
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

async function testPollFreshVerificationCodeRethrowsStop() {
  const helperBundle = [
    extractFunction(helperSource, 'isStopError'),
    extractFunction(helperSource, 'throwIfStopped'),
  ].join('\n');

  const api = new Function('verificationFlowSource', `
const self = {};
let stopRequested = false;
const STOP_ERROR_MESSAGE = '流程已被用户停止。';
const VERIFICATION_POLL_MAX_ROUNDS = 5;
const logs = [];
let resendCalls = 0;

async function sendToMailContentScriptResilient() {
  throw new Error(STOP_ERROR_MESSAGE);
}
async function requestVerificationCodeResend() {
  resendCalls += 1;
}
async function addLog(message, level) {
  logs.push({ message, level });
}

${helperBundle}
${verificationFlowSource}

const helpers = self.MultiPageBackgroundVerificationFlow.createVerificationFlowHelpers({
  addLog,
  chrome: {},
  completeStepFromBackground: async () => {},
  confirmCustomVerificationStepBypassRequest: async () => ({ confirmed: true }),
  getState: async () => ({}),
  getTabId: async () => null,
  isStopError,
  sendToContentScript: async () => ({}),
  sendToMailContentScriptResilient,
  setState: async () => {},
  setStepStatus: async () => {},
  sleepWithStop: async () => {},
  throwIfStopped,
  VERIFICATION_POLL_MAX_ROUNDS,
});

return {
  pollFreshVerificationCode: helpers.pollFreshVerificationCode,
  snapshot() {
    return { logs, resendCalls };
  },
};
`)(verificationFlowSource);

  let error = null;
  try {
    await api.pollFreshVerificationCode(7, {}, { provider: 'gmail' }, {});
  } catch (err) {
    error = err;
  }

  const state = api.snapshot();
  assert.strictEqual(error?.message, '流程已被用户停止。', 'Stop 错误应原样向上抛出');
  assert.strictEqual(state.resendCalls, 0, 'Stop 后不应继续请求新的验证码');
  assert.deepStrictEqual(state.logs, [], 'Stop 后不应再记录普通失败或重试日志');
}

async function testResolveVerificationStepRethrowsStopFromFreshRequest() {
  const helperBundle = [
    extractFunction(helperSource, 'isStopError'),
  ].join('\n');

  const api = new Function('verificationFlowSource', `
const self = {};
const STOP_ERROR_MESSAGE = '流程已被用户停止。';
const logs = [];
let pollCalls = 0;
async function addLog(message, level) {
  logs.push({ message, level });
}
const chrome = { tabs: { async update() {} } };

${helperBundle}
${verificationFlowSource}

const helpers = self.MultiPageBackgroundVerificationFlow.createVerificationFlowHelpers({
  addLog,
  chrome,
  completeStepFromBackground: async () => {},
  confirmCustomVerificationStepBypassRequest: async () => ({ confirmed: true }),
  getState: async () => ({}),
  getTabId: async () => 1,
  isStopError,
  sendToContentScript: async () => {
    throw new Error(STOP_ERROR_MESSAGE);
  },
  sendToMailContentScriptResilient: async () => {
    pollCalls += 1;
    return {
      code: '654321',
      emailTimestamp: 123,
    };
  },
  setState: async () => {},
  setStepStatus: async () => {},
  sleepWithStop: async () => {},
  throwIfStopped: () => {},
  VERIFICATION_POLL_MAX_ROUNDS: 5,
});

return {
  resolveVerificationStep: helpers.resolveVerificationStep,
  snapshot() {
    return { logs, pollCalls };
  },
};
`)(verificationFlowSource);

  let error = null;
  try {
    await api.resolveVerificationStep(7, {}, { provider: 'gmail' }, { requestFreshCodeFirst: true });
  } catch (err) {
    error = err;
  }

  const state = api.snapshot();
  assert.strictEqual(error?.message, '流程已被用户停止。', '提交验证码时收到 Stop 后应立即终止');
  assert.strictEqual(state.pollCalls, 0, 'requestFreshCodeFirst 生效后，Stop 会在首次重发前直接终止，不再继续轮询邮箱');
  assert.deepStrictEqual(state.logs, [], 'Stop 后不应追加降级日志');
}

(async () => {
  await testPollFreshVerificationCodeRethrowsStop();
  await testResolveVerificationStepRethrowsStopFromFreshRequest();
  console.log('verification stop propagation tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
