const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
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

const bundle = [
  extractFunction('resolveSyncedInputValue'),
].join('\n');

const api = new Function(`${bundle}; return { resolveSyncedInputValue };`)();

test('resolveSyncedInputValue keeps the in-progress value while the field is focused', () => {
  assert.equal(
    api.resolveSyncedInputValue('worker@gm', '', { isFocused: true }),
    'worker@gm'
  );
});

test('resolveSyncedInputValue applies the synced value once the field is not focused', () => {
  assert.equal(
    api.resolveSyncedInputValue('worker@gm', '', { isFocused: false }),
    ''
  );
});
