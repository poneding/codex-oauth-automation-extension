const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const utilsSource = fs.readFileSync('content/utils.js', 'utf8');

function extractFunction(source, name) {
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

const simulateClickSource = extractFunction(utilsSource, 'simulateClick');
const createNonSubmittingClickRestoreSource = extractFunction(utilsSource, 'createNonSubmittingClickRestore');

function createHarness({ strategy = { method: 'click' } } = {}) {
  let requestSubmitCount = 0;
  let clickCount = 0;
  let observedTypeDuringClick = null;
  const logs = [];

  const form = {
    requestSubmit(submitter) {
      requestSubmitCount += 1;
      this.submitter = submitter;
    },
  };

  const element = {
    tagName: 'BUTTON',
    type: 'submit',
    form,
    textContent: '重新发送电子邮件',
    getAttribute(name) {
      if (name === 'type') {
        return this.type;
      }
      return null;
    },
    setAttribute(name, value) {
      if (name === 'type') {
        this.type = String(value);
      }
    },
    removeAttribute(name) {
      if (name === 'type') {
        this.type = '';
      }
    },
    click() {
      clickCount += 1;
      observedTypeDuringClick = this.type;
    },
    dispatchEvent() {
      return true;
    },
    closest(selector) {
      return selector === 'form' ? form : null;
    },
  };

  const simulateClick = new Function(
    'throwIfStopped',
    'getActivationStrategy',
    'location',
    'log',
    'LOG_PREFIX',
    'MouseEvent',
    'console',
    `${createNonSubmittingClickRestoreSource}; ${simulateClickSource}; return simulateClick;`
  )(
    () => {},
    () => strategy,
    { pathname: '/email-verification' },
    (message) => logs.push(message),
    '[test]',
    class MouseEvent {
      constructor(type, init = {}) {
        this.type = type;
        Object.assign(this, init);
      }
    },
    {
      log() {},
      warn() {},
      error() {},
    }
  );

  return {
    element,
    logs,
    simulateClick,
    get clickCount() {
      return clickCount;
    },
    get observedTypeDuringClick() {
      return observedTypeDuringClick;
    },
    get requestSubmitCount() {
      return requestSubmitCount;
    },
  };
}

test('simulateClick temporarily neutralizes submit semantics for nonSubmittingClick buttons', () => {
  const harness = createHarness({ strategy: { method: 'nonSubmittingClick' } });

  harness.simulateClick(harness.element);

  assert.equal(harness.requestSubmitCount, 0);
  assert.equal(harness.clickCount, 1);
  assert.equal(harness.observedTypeDuringClick, 'button');
  assert.equal(harness.element.type, 'submit');
});
