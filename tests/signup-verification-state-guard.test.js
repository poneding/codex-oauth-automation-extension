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

test('verification visibility text fallback should not treat password retry page as verification page', () => {
  const api = new Function(`
const VERIFICATION_PAGE_PATTERN = /check\\s+your\\s+inbox|we\\s+emailed|resend/i;
const document = {
  querySelector() {
    return null;
  },
};

function getCurrentAuthRetryPageState(flow) {
  if (flow === 'signup_password') {
    return { retryEnabled: true };
  }
  return null;
}

function getVerificationCodeTarget() {
  return null;
}

function findResendVerificationCodeTrigger() {
  return null;
}

function isEmailVerificationPage() {
  return false;
}

function getPageTextSnapshot() {
  return 'Check your inbox and resend email if needed';
}

${extractFunction('isVerificationPageStillVisible')}

return {
  run() {
    return isVerificationPageStillVisible();
  },
};
`)();

  assert.equal(api.run(), false);
});

test('signup verification state should prioritize retry error page over verification visibility', () => {
  const api = new Function(`
function isStep5Ready() {
  return false;
}

function isChatGptAuthenticatedHomeReady() {
  return false;
}

function isVerificationPageStillVisible() {
  return true;
}

function isSignupPasswordErrorPage() {
  return true;
}

function getSignupPasswordTimeoutErrorPageState() {
  return { retryButton: { textContent: 'Try again' } };
}

function isSignupEmailAlreadyExistsPage() {
  return false;
}

function getSignupPasswordInput() {
  return null;
}

function getSignupPasswordSubmitButton() {
  return null;
}

${extractFunction('inspectSignupVerificationState')}

return {
  run() {
    return inspectSignupVerificationState();
  },
};
`)();

  assert.deepStrictEqual(api.run(), {
    state: 'error',
    retryButton: { textContent: 'Try again' },
  });
});

test('signup verification state should recognize authenticated chatgpt home as completion state', () => {
  const api = new Function(`
const location = {
  href: 'https://chatgpt.com/',
  hostname: 'chatgpt.com',
  pathname: '/',
};

const promptTextarea = {
  hidden: false,
  getBoundingClientRect() {
    return { width: 640, height: 120 };
  },
};

const document = {
  querySelectorAll(selector) {
    if (selector.includes('#prompt-textarea')) {
      return [promptTextarea];
    }
    return [];
  },
};

function isVisibleElement(el) {
  return Boolean(el) && !el.hidden;
}

function getActionText() {
  return '';
}

function getPageTextSnapshot() {
  return 'What can I help with today?';
}

function isStep5Ready() {
  return false;
}

function isVerificationPageStillVisible() {
  return false;
}

function isSignupPasswordErrorPage() {
  return false;
}

function getSignupPasswordTimeoutErrorPageState() {
  return null;
}

function isSignupEmailAlreadyExistsPage() {
  return false;
}

function getSignupPasswordInput() {
  return null;
}

function getSignupPasswordSubmitButton() {
  return null;
}

${extractFunction('isChatGptAuthenticatedHomeReady')}
${extractFunction('inspectSignupVerificationState')}

return {
  run() {
    return inspectSignupVerificationState();
  },
};
`)();

  assert.deepStrictEqual(api.run(), {
    state: 'signup_complete_home',
    url: 'https://chatgpt.com/',
  });
});
