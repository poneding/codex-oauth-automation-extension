const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('content/gmail-mail.js', 'utf8');

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

function createHelperApi() {
  const bundle = [
    extractFunction('normalizeText'),
    extractFunction('normalizeTargetEmail'),
    extractFunction('normalizeEmailSearchText'),
    extractFunction('getTargetEmailMatchState'),
    extractFunction('collectMailSearchTextFromRoot'),
    extractFunction('buildSeenMessageKey'),
  ].join('\n');

  return new Function(`
${bundle}
return {
  collectMailSearchTextFromRoot,
  getTargetEmailMatchState,
  buildSeenMessageKey,
};
`)();
}

function createHandlePollEmailApi({ rows, openedBodies = {}, initialSeenMessageKeys = [] }) {
  const bundle = [
    extractFunction('normalizeText'),
    extractFunction('normalizeMinuteTimestamp'),
    extractFunction('normalizeTargetEmail'),
    extractFunction('normalizeEmailSearchText'),
    extractFunction('getTargetEmailMatchState'),
    extractFunction('extractVerificationCode'),
    extractFunction('buildSeenMessageKey'),
    extractFunction('handlePollEmail'),
  ].join('\n');

  return new Function('rowFixtures', 'openedBodyMap', 'initialSeenKeys', `
const GMAIL_FALLBACK_AFTER = 3;
let seenMessageKeys = new Set(initialSeenKeys);
const logs = [];
const openCalls = [];
const persistedSnapshots = [];
const refreshCalls = [];
const ensuredSections = [];
const rows = rowFixtures;
const openedBodies = openedBodyMap;

function log(message, level = 'info') {
  logs.push({ message, level });
}

function rowMatchesFilters(preview, senderFilters = [], subjectFilters = []) {
  const haystack = String(preview.combinedText || '').toLowerCase();
  return senderFilters.every((filter) => haystack.includes(String(filter).toLowerCase()))
    || subjectFilters.every((filter) => haystack.includes(String(filter).toLowerCase()))
    || true;
}

function getMailboxSectionLabel(section = 'inbox') {
  return section === 'spam' ? 'Gmail 垃圾邮件' : 'Gmail 收件箱';
}

async function ensureMailboxSectionReady(_step, section = 'inbox') {
  ensuredSections.push(section);
  return rows;
}

async function refreshMailboxSection(step, section = 'inbox') {
  refreshCalls.push({ step, section });
}

function getCategoryScanOrder() {
  return [{ key: 'primary', label: 'Primary' }];
}

async function activateCategoryTab(_step, key) {
  return { key, label: 'Primary', switched: false };
}

function collectThreadRows() {
  return rows;
}

function getRowFingerprint(row) {
  return row.id;
}

function getCurrentMailIds(currentRows = []) {
  return new Set(currentRows.map((row) => row.id));
}

function getRowTimestamp(row) {
  return row.timestamp;
}

function getRowPreviewText(row) {
  return row.preview;
}

async function openRowAndGetMessageText(row) {
  openCalls.push(row.id);
  return openedBodies[row.id] || '';
}

async function persistSeenMessageKeys() {
  persistedSnapshots.push([...seenMessageKeys]);
}

async function sleep() {}

${bundle}

return {
  handlePollEmail,
  buildSeenMessageKey,
  getLogs() {
    return logs.slice();
  },
  getOpenCalls() {
    return openCalls.slice();
  },
  getSeenMessageKeys() {
    return [...seenMessageKeys];
  },
  getPersistedSnapshots() {
    return persistedSnapshots.map((snapshot) => snapshot.slice());
  },
  getRefreshCalls() {
    return refreshCalls.slice();
  },
  getEnsuredSections() {
    return ensuredSections.slice();
  },
};
`)(rows, openedBodies, initialSeenMessageKeys);
}

function createInboxNavigationApi() {
  const bundle = [
    extractFunction('getMailboxSectionLabel'),
    extractFunction('hasOpenedMessageView'),
    extractFunction('isInboxListReady'),
    extractFunction('returnToMailboxSection'),
    extractFunction('returnToInbox'),
  ].join('\n');

  return new Function(`
let openedMessage = true;
let rowCount = 0;
let inboxClicks = 0;
const location = { href: 'https://mail.google.com/mail/u/0/#inbox/FMfcgz' };
const document = {
  querySelector(selector) {
    if (
      selector === 'div[role="main"] .adn.ads[data-message-id]'
      || selector === 'div[role="main"] .ii.gt .adn.ads'
      || selector === 'div[role="main"] [data-message-id] .a3s'
    ) {
      return openedMessage ? { id: 'open-message' } : null;
    }
    return null;
  },
};
function collectThreadRows() {
  return Array.from({ length: rowCount }, (_, index) => ({ id: index + 1 }));
}
function findInboxLink() {
  return { id: 'inbox-link' };
}
function findMailboxLink() {
  return { id: 'inbox-link' };
}
async function ensureMailboxLinkVisible() {
  return findMailboxLink();
}
function getMailboxHash() {
  return '#inbox';
}
function simulateClick() {
  inboxClicks += 1;
  openedMessage = false;
  rowCount = 2;
}
function log() {}
async function sleep() {}
${bundle}
return {
  async run() {
    await returnToInbox(8);
    return {
      inboxClicks,
      openedMessage,
      rowCount,
      inboxReady: isInboxListReady(),
    };
  },
};
`)();
}

function createMailboxLinkVisibilityApi() {
  const bundle = [
    extractFunction('normalizeText'),
    extractFunction('isDisplayed'),
    extractFunction('isVisibleElement'),
    extractFunction('scrollElementIntoViewIfPossible'),
    extractFunction('matchesMailboxLinkText'),
    extractFunction('findSpamLink'),
    extractFunction('getMailboxHash'),
    extractFunction('findMailboxExpandToggle'),
    extractFunction('ensureMailboxLinkVisible'),
  ].join('\n');

  return new Function(`
const clicks = [];
const scrolled = [];
let spamVisible = false;

const spamLink = {
  textContent: '垃圾邮件',
  click() {
    clicks.push('spam');
  },
  getAttribute(name) {
    if (name === 'href') return 'https://mail.google.com/mail/u/0/#spam';
    if (name === 'aria-label') return '垃圾邮件';
    return '';
  },
  scrollIntoView() {
    scrolled.push('spam');
  },
  getBoundingClientRect() {
    return spamVisible ? { width: 12, height: 12 } : { width: 0, height: 0 };
  },
};

const expandToggle = {
  textContent: '显示更多标签',
  click() {
    clicks.push('expand');
    spamVisible = true;
  },
  getAttribute(name) {
    if (name === 'aria-label') return '显示更多标签';
    if (name === 'gh') return 'mll';
    return '';
  },
  scrollIntoView() {
    scrolled.push('expand');
  },
  getBoundingClientRect() {
    return { width: 12, height: 12 };
  },
};

const document = {
  querySelectorAll(selector) {
    if (selector.includes('#spam') || selector.includes('垃圾邮件') || selector.includes('Spam') || selector.includes('.TO.ol')) {
      return [spamLink];
    }
    if (selector.includes('gh="mll"') || selector.includes('显示更多标签') || selector.includes('更多标签')) {
      return [expandToggle];
    }
    if (selector === 'a, [role="link"]') {
      return [spamLink];
    }
    return [];
  },
};

const window = {
  getComputedStyle(element) {
    const hidden = element === spamLink && !spamVisible;
    return {
      display: hidden ? 'none' : 'block',
      visibility: 'visible',
    };
  },
};

function findInboxLink() {
  return null;
}

function findMailboxLink(section = 'inbox') {
  return section === 'spam' ? findSpamLink() : null;
}

function simulateClick(element) {
  element.click();
}

async function sleep() {}

${bundle}

return {
  async run() {
    const result = await ensureMailboxLinkVisible('spam');
    return {
      result,
      clicks,
      scrolled,
    };
  },
};
`)();
}

test('getTargetEmailMatchState matches quoted-printable forwarded target addresses', () => {
  const api = createHelperApi();

  assert.equal(
    api.getTargetEmailMatchState('Forwarded-To: expected=40example.com', 'expected@example.com').matches,
    true
  );
  assert.equal(
    api.getTargetEmailMatchState('Forwarded-To: expected=\r\n =40example.com', 'expected@example.com').matches,
    true
  );
  assert.equal(
    api.getTargetEmailMatchState('Forwarded-To: other@example.com', 'expected@example.com').matches,
    false
  );
});

test('collectMailSearchTextFromRoot includes hidden header text and email attributes', () => {
  const api = createHelperApi();
  const attributeNode = {
    textContent: 'Forwarded-To: custom-user@example.com',
    getAttribute(name) {
      if (name === 'email') return 'custom-user@example.com';
      if (name === 'data-hovercard-id') return 'custom-user@example.com';
      return '';
    },
  };
  const hiddenHeaderNode = {
    textContent: '收件人: custom-user@example.com',
    getAttribute() {
      return '';
    },
  };
  const fakeRoot = {
    innerText: '输入此临时验证码以继续： 897324',
    textContent: '你的临时 ChatGPT 登录代码 收件人: custom-user@example.com',
    querySelectorAll() {
      return [attributeNode, hiddenHeaderNode];
    },
  };

  const searchText = api.collectMailSearchTextFromRoot(fakeRoot);

  assert.match(searchText, /897324/);
  assert.match(searchText, /custom-user@example\.com/);
  assert.match(searchText, /收件人/);
});

test('handlePollEmail only returns a forwarded Gmail code when the opened message matches targetEmail', async () => {
  const timestamp = Date.UTC(2026, 3, 19, 10, 5, 30);
  const rows = [
    {
      id: 'mail-1',
      timestamp,
      preview: {
        sender: 'OpenAI',
        subject: 'Verification code 111111',
        digest: 'Forwarded message',
        timeText: '10:05',
        fullText: 'OpenAI verification code 111111 forwarded message',
        combinedText: 'OpenAI verification code 111111 forwarded message',
      },
    },
    {
      id: 'mail-2',
      timestamp,
      preview: {
        sender: 'OpenAI',
        subject: 'Verification code 111111',
        digest: 'Forwarded message',
        timeText: '10:05',
        fullText: 'OpenAI verification code 111111 forwarded message',
        combinedText: 'OpenAI verification code 111111 forwarded message',
      },
    },
  ];

  const api = createHandlePollEmailApi({
    rows,
    openedBodies: {
      'mail-1': 'Forwarded message\nTo: other.user@example.com\nYour verification code is 111111',
      'mail-2': 'Forwarded message\nTo: expected@example.com\nYour verification code is 111111',
    },
  });

  const result = await api.handlePollEmail(4, {
    senderFilters: ['openai'],
    subjectFilters: ['verification'],
    maxAttempts: 1,
    intervalMs: 1,
    filterAfterTimestamp: timestamp,
    targetEmail: 'expected@example.com',
  });

  assert.equal(result.code, '111111');
  assert.equal(result.mailId, 'mail-2');
  assert.deepEqual(api.getOpenCalls(), ['mail-1', 'mail-2']);
  assert.deepEqual(api.getEnsuredSections(), ['inbox']);
});

test('handlePollEmail dedupes Gmail candidates by message key instead of raw code', async () => {
  const timestamp = Date.UTC(2026, 3, 19, 10, 7, 0);
  const helperApi = createHelperApi();
  const firstMessageKey = helperApi.buildSeenMessageKey({
    rowId: 'mail-1',
    code: '222222',
    targetEmail: 'first@example.com',
    previewText: 'OpenAI verification code 222222 for first@example.com',
  });

  const api = createHandlePollEmailApi({
    rows: [
      {
        id: 'mail-2',
        timestamp,
        preview: {
          sender: 'OpenAI',
          subject: 'Verification code 222222',
          digest: 'Forwarded to second@example.com',
          timeText: '10:07',
          fullText: 'OpenAI verification code 222222 second@example.com',
          combinedText: 'OpenAI verification code 222222 second@example.com',
        },
      },
    ],
    initialSeenMessageKeys: [firstMessageKey],
  });

  const result = await api.handlePollEmail(8, {
    senderFilters: ['openai'],
    subjectFilters: ['verification'],
    maxAttempts: 1,
    intervalMs: 1,
    filterAfterTimestamp: timestamp,
    targetEmail: 'second@example.com',
  });

  assert.equal(result.code, '222222');
  assert.equal(result.mailId, 'mail-2');
  assert.deepEqual(api.getOpenCalls(), []);
  assert.equal(api.getSeenMessageKeys().length, 2);
  assert.equal(api.getSeenMessageKeys().every((key) => key !== '222222' && key.includes('::')), true);
  assert.deepEqual(api.getEnsuredSections(), ['inbox']);
});

test('handlePollEmail can limit fallback inspection to the first matching Gmail row without per-attempt refresh', async () => {
  const api = createHandlePollEmailApi({
    rows: [
      {
        id: 'mail-1',
        timestamp: 0,
        preview: {
          sender: 'OpenAI',
          subject: 'Verification code',
          digest: 'Forwarded message',
          timeText: '',
          fullText: 'OpenAI verification message',
          combinedText: 'OpenAI verification message',
        },
      },
      {
        id: 'mail-2',
        timestamp: 0,
        preview: {
          sender: 'OpenAI',
          subject: 'Verification code',
          digest: 'Forwarded message',
          timeText: '',
          fullText: 'OpenAI verification message',
          combinedText: 'OpenAI verification message',
        },
      },
    ],
    openedBodies: {
      'mail-1': 'Forwarded message\nTo: mismatch@example.com\nYour verification code is 123456',
      'mail-2': 'Forwarded message\nTo: expected@example.com\nYour verification code is 654321',
    },
  });

  await assert.rejects(
    api.handlePollEmail(4, {
      senderFilters: ['openai'],
      subjectFilters: ['verification'],
      maxAttempts: 1,
      intervalMs: 1,
      refreshEachAttempt: false,
      allowExistingMatching: true,
      ignoreTimeFilter: true,
      maxMatchingRows: 1,
      targetEmail: 'expected@example.com',
    }),
    /未在 Gmail 中找到匹配邮件/
  );

  assert.deepEqual(api.getOpenCalls(), ['mail-1']);
  assert.deepEqual(api.getRefreshCalls(), []);
  assert.deepEqual(api.getEnsuredSections(), ['inbox']);
});

test('handlePollEmail treats an empty but ready Gmail inbox as pollable instead of failing inbox readiness immediately', async () => {
  const api = createHandlePollEmailApi({
    rows: [],
  });

  await assert.rejects(
    api.handlePollEmail(4, {
      senderFilters: ['openai'],
      subjectFilters: ['verification'],
      maxAttempts: 2,
      intervalMs: 1,
      refreshEachAttempt: false,
      allowExistingMatching: true,
    }),
    /未在 Gmail 中找到匹配邮件/
  );

  assert.deepEqual(api.getRefreshCalls(), []);
  assert.deepEqual(api.getEnsuredSections(), ['inbox']);
});

test('handlePollEmail can scan the Gmail spam section when mailboxSection is spam', async () => {
  const api = createHandlePollEmailApi({
    rows: [
      {
        id: 'spam-1',
        timestamp: 0,
        preview: {
          sender: 'OpenAI',
          subject: 'Verification code 654321',
          digest: 'Forwarded message',
          timeText: '',
          fullText: 'OpenAI verification code 654321',
          combinedText: 'OpenAI verification code 654321',
        },
      },
    ],
  });

  const result = await api.handlePollEmail(4, {
    senderFilters: ['openai'],
    subjectFilters: ['verification'],
    mailboxSection: 'spam',
    maxAttempts: 1,
    intervalMs: 1,
    allowExistingMatching: true,
  });

  assert.equal(result.code, '654321');
  assert.deepEqual(api.getEnsuredSections(), ['spam']);
});

test('handlePollEmail force-opens the final fallback mail when targetEmail is present to avoid preview false positives', async () => {
  const api = createHandlePollEmailApi({
    rows: [
      {
        id: 'mail-1',
        timestamp: 0,
        preview: {
          sender: 'OpenAI',
          subject: 'Verification code 148037',
          digest: 'To expected@example.com',
          timeText: '',
          fullText: 'OpenAI verification code 148037 expected@example.com',
          combinedText: 'OpenAI verification code 148037 expected@example.com',
        },
      },
    ],
    openedBodies: {
      'mail-1': '收件人: other@example.com\n你的 OpenAI 代码为 148037',
    },
  });

  await assert.rejects(
    api.handlePollEmail(4, {
      senderFilters: ['openai'],
      subjectFilters: ['verification'],
      mailboxSection: 'inbox',
      maxAttempts: 1,
      intervalMs: 1,
      allowExistingMatching: true,
      forceOpenMessage: true,
      targetEmail: 'expected@example.com',
    }),
    /未在 Gmail 中找到匹配邮件/
  );

  assert.deepEqual(api.getOpenCalls(), ['mail-1']);
});

test('ensureMailboxLinkVisible expands hidden labels before locating the Gmail spam link', async () => {
  const api = createMailboxLinkVisibilityApi();
  const result = await api.run();

  assert.equal(result.result?.getAttribute('href'), 'https://mail.google.com/mail/u/0/#spam');
  assert.deepEqual(result.clicks, ['expand']);
  assert.deepEqual(result.scrolled, ['expand', 'spam']);
});

test('returnToInbox leaves Gmail detail view and restores the inbox list even when URL still contains #inbox', async () => {
  const api = createInboxNavigationApi();
  const result = await api.run();

  assert.deepStrictEqual(result, {
    inboxClicks: 1,
    openedMessage: false,
    rowCount: 2,
    inboxReady: true,
  });
});
