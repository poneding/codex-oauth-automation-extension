const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

function extractFunction(name) {
  const markers = [`function ${name}(`, `async function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start === undefined || start < 0) {
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

const bundle = [
  extractFunction('getPendingAutoRunTargetCount'),
  extractFunction('hasPendingAutoRunTargets'),
  extractFunction('isSettingsControlLockExempt'),
].join('\n');

const api = new Function(`${bundle}; return {
  getPendingAutoRunTargetCount,
  hasPendingAutoRunTargets,
  isSettingsControlLockExempt,
};`)();

test('sidepanel auto-run target count uses all remaining pending emails without a 50 cap', () => {
  assert.equal(api.getPendingAutoRunTargetCount({ remainingCount: 125 }), 125);
  assert.equal(api.getPendingAutoRunTargetCount({ remainingCount: 1.9 }), 1);
  assert.equal(api.getPendingAutoRunTargetCount({ remainingCount: 0 }), 0);
});

test('sidepanel auto-run trigger is disabled when no pending emails remain', () => {
  assert.equal(api.hasPendingAutoRunTargets({ remainingCount: 3 }), true);
  assert.equal(api.hasPendingAutoRunTargets({ remainingCount: 0 }), false);
  assert.equal(api.hasPendingAutoRunTargets({ remainingCount: -1 }), false);
});

test('sidepanel lock exemptions allow tabs and eye buttons to remain interactive', () => {
  assert.equal(api.isSettingsControlLockExempt({ dataset: { allowWhileLocked: 'true' } }), true);
  assert.equal(api.isSettingsControlLockExempt({ dataset: { allowWhileLocked: 'false' } }), false);
  assert.equal(api.isSettingsControlLockExempt({ dataset: {} }), false);
});
