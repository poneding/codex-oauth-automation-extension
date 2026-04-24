// content/gmail-mail.js — Content script for Gmail polling (steps 4, 7)
// Injected dynamically on: mail.google.com

const GMAIL_PREFIX = '[MultiPage:gmail-mail]';
const GMAIL_SEEN_MESSAGE_KEYS_KEY = 'seenGmailMessageKeys';
const isTopFrame = window === window.top;

console.log(GMAIL_PREFIX, 'Content script loaded on', location.href, 'frame:', isTopFrame ? 'top' : 'child');

if (!isTopFrame) {
  console.log(GMAIL_PREFIX, 'Skipping child frame');
} else {

let seenMessageKeys = new Set();

async function loadSeenMessageKeys() {
  try {
    const data = await chrome.storage.session.get(GMAIL_SEEN_MESSAGE_KEYS_KEY);
    if (Array.isArray(data[GMAIL_SEEN_MESSAGE_KEYS_KEY])) {
      seenMessageKeys = new Set(data[GMAIL_SEEN_MESSAGE_KEYS_KEY]);
      console.log(GMAIL_PREFIX, `Loaded ${seenMessageKeys.size} previously seen Gmail message keys`);
    }
  } catch (err) {
    console.warn(GMAIL_PREFIX, 'Session storage unavailable, using in-memory Gmail message keys:', err?.message || err);
  }
}

async function persistSeenMessageKeys() {
  try {
    await chrome.storage.session.set({ [GMAIL_SEEN_MESSAGE_KEYS_KEY]: [...seenMessageKeys] });
  } catch (err) {
    console.warn(GMAIL_PREFIX, 'Could not persist Gmail message keys, continuing in-memory only:', err?.message || err);
  }
}

loadSeenMessageKeys();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'POLL_EMAIL') {
    resetStopState();
    handlePollEmail(message.step, message.payload).then((result) => {
      sendResponse(result);
    }).catch((err) => {
      if (isStopError(err)) {
        log(`步骤 ${message.step}：已被用户停止。`, 'warn');
        sendResponse({ stopped: true, error: err.message });
        return;
      }
      log(`步骤 ${message.step}：Gmail 轮询失败：${err.message}`, 'warn');
      sendResponse({ error: err.message });
    });
    return true;
  }
});

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isDisplayed(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function isVisibleElement(element) {
  if (!isDisplayed(element)) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function normalizeMinuteTimestamp(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  const date = new Date(timestamp);
  date.setSeconds(0, 0);
  return date.getTime();
}

function normalizeTargetEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmailSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/=\r?\n/g, '')
    .replace(/=40/g, '@')
    .replace(/%40/g, '@')
    .replace(/&#64;|&commat;/g, '@')
    .replace(/\s*@\s*/g, '@')
    .replace(/\s*\.\s*/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTargetEmailMatchState(text, targetEmail) {
  const normalizedTarget = normalizeTargetEmail(targetEmail);
  if (!normalizedTarget) {
    return { matches: true, hasExplicitEmail: false };
  }

  const normalizedText = normalizeEmailSearchText(text);
  if (normalizedText.includes(normalizedTarget)) {
    return { matches: true, hasExplicitEmail: true };
  }

  return { matches: false, hasExplicitEmail: false };
}

function collectMailSearchTextFromRoot(root) {
  if (!root) {
    return '';
  }

  const textParts = [];
  const pushPart = (value) => {
    const normalized = normalizeText(value);
    if (normalized) {
      textParts.push(normalized);
    }
  };

  pushPart(root.innerText || '');
  pushPart(root.textContent || '');

  if (typeof root.querySelectorAll === 'function') {
    const selector = [
      '[email]',
      '[data-hovercard-id]',
      '[jid]',
      '[name]',
      '[title]',
      '[aria-label]',
      '.hb',
      '.ajB',
      '.gL',
    ].join(', ');

    root.querySelectorAll(selector).forEach((element) => {
      if (!element) return;
      if (typeof element.getAttribute === 'function') {
        pushPart(element.getAttribute('email'));
        pushPart(element.getAttribute('data-hovercard-id'));
        pushPart(element.getAttribute('jid'));
        pushPart(element.getAttribute('name'));
        pushPart(element.getAttribute('title'));
        pushPart(element.getAttribute('aria-label'));
      }
      pushPart(element.textContent || '');
    });
  }

  return normalizeText(textParts.join(' '));
}

function buildSeenMessageKey({ rowId = '', code = '', targetEmail = '', previewText = '', openedText = '' } = {}) {
  const normalizedRowId = normalizeText(rowId).toLowerCase();
  const normalizedCode = String(code || '').trim();
  const normalizedTarget = normalizeTargetEmail(targetEmail) || '*';
  const normalizedContent = normalizeText([previewText, openedText].filter(Boolean).join(' '))
    .toLowerCase()
    .slice(0, 160);
  const stableId = normalizedRowId || normalizedContent || 'mail';
  return `${normalizedTarget}::${stableId}::${normalizedCode || 'no-code'}`;
}

const MONTH_INDEX_MAP = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function parseGmailTimestampText(rawText) {
  const text = normalizeText(rawText);
  if (!text) return null;

  const parsedNative = Date.parse(text);
  if (Number.isFinite(parsedNative)) {
    return parsedNative;
  }

  let match = text.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?\s+(\d{1,2}):(\d{2})(?:\s*([AP]M))?/i);
  if (match) {
    const [, year, month, day, hourText, minute, meridiem] = match;
    let hour = Number(hourText);
    if (/pm/i.test(meridiem) && hour < 12) hour += 12;
    if (/am/i.test(meridiem) && hour === 12) hour = 0;
    return new Date(Number(year), Number(month) - 1, Number(day), hour, Number(minute), 0, 0).getTime();
  }

  match = text.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4}),?\s*(\d{1,2}):(\d{2})\s*([AP]M)\b/i);
  if (match) {
    const [, monthText, day, year, hourText, minute, meridiem] = match;
    const month = MONTH_INDEX_MAP[monthText.slice(0, 3).toLowerCase()];
    if (month !== undefined) {
      let hour = Number(hourText);
      if (/pm/i.test(meridiem) && hour < 12) hour += 12;
      if (/am/i.test(meridiem) && hour === 12) hour = 0;
      return new Date(Number(year), month, Number(day), hour, Number(minute), 0, 0).getTime();
    }
  }

  match = text.match(/今天\s*(\d{1,2}):(\d{2})/);
  if (match) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(match[1]), Number(match[2]), 0, 0).getTime();
  }

  match = text.match(/昨天\s*(\d{1,2}):(\d{2})/);
  if (match) {
    const now = new Date();
    now.setDate(now.getDate() - 1);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(match[1]), Number(match[2]), 0, 0).getTime();
  }

  match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(match[1]), Number(match[2]), 0, 0).getTime();
  }

  return null;
}

function extractVerificationCode(text) {
  const normalized = String(text || '');

  const cnMatch = normalized.match(/(?:验证码|代码)[^0-9]{0,16}(\d{6})/i);
  if (cnMatch) return cnMatch[1];

  const enMatch = normalized.match(/(?:verification\s+code|temporary\s+verification\s+code|your\s+chatgpt\s+code|code(?:\s+is)?)[^0-9]{0,16}(\d{6})/i);
  if (enMatch) return enMatch[1];

  const plainMatch = normalized.match(/\b(\d{6})\b/);
  if (plainMatch) return plainMatch[1];

  return null;
}

function findInboxLink() {
  const selectors = [
    'a[href*="#inbox"]',
    'a[aria-label*="收件箱"]',
    'a[aria-label*="Inbox"]',
  ];

  for (const selector of selectors) {
    const candidates = Array.from(document.querySelectorAll(selector));
    const visible = candidates.find(isVisibleElement);
    if (visible) return visible;
    if (candidates[0]) return candidates[0];
  }

  return Array.from(document.querySelectorAll('a, [role="link"]')).find((element) => {
    const text = normalizeText(
      element.getAttribute('aria-label')
      || element.getAttribute('title')
      || element.textContent
    );
    return /收件箱|Inbox/i.test(text);
  }) || null;
}

function scrollElementIntoViewIfPossible(element) {
  try {
    element?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
  } catch {
    try {
      element?.scrollIntoView?.();
    } catch {
      // ignore scroll failures in Gmail virtualized layouts
    }
  }
}

function matchesMailboxLinkText(section = 'inbox', text = '') {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return section === 'spam'
    ? /垃圾邮件|spam/i.test(normalized)
    : /收件箱|inbox/i.test(normalized);
}

function findSpamLink() {
  const selectors = [
    'a[href*="#spam"]',
    'a[aria-label*="垃圾邮件"]',
    'a[aria-label*="Spam"]',
    'a[title*="垃圾邮件"]',
    'a[title*="Spam"]',
    '.TO.ol a',
  ];

  for (const selector of selectors) {
    const candidates = Array.from(document.querySelectorAll(selector));
    const visible = candidates.find(isVisibleElement);
    if (visible) return visible;
    if (candidates[0]) return candidates[0];
  }

  return Array.from(document.querySelectorAll('a, [role="link"]')).find((element) => {
    const text = normalizeText(
      element.getAttribute('aria-label')
      || element.getAttribute('title')
      || element.textContent
    );
    return matchesMailboxLinkText('spam', text);
  }) || null;
}

function getMailboxSectionLabel(section = 'inbox') {
  return section === 'spam' ? 'Gmail 垃圾邮件' : 'Gmail 收件箱';
}

function findMailboxLink(section = 'inbox') {
  return section === 'spam' ? findSpamLink() : findInboxLink();
}

function findMailboxExpandToggle(section = 'inbox') {
  if (section !== 'spam') {
    return null;
  }

  const selectors = [
    '[gh="mll"][role="button"]',
    '[gh="mll"]',
    '.n6 [role="button"]',
    'span[role="button"][aria-label*="显示更多标签"]',
    'span[role="button"][aria-label*="Show more"]',
    'span[role="button"][aria-label*="更多标签"]',
  ];

  for (const selector of selectors) {
    const candidates = Array.from(document.querySelectorAll(selector));
    const toggle = candidates.find((element) => {
      if (!isVisibleElement(element)) return false;
      const text = normalizeText(
        element.getAttribute?.('aria-label')
        || element.getAttribute?.('title')
        || element.textContent
        || ''
      );
      if (!text) return false;
      if (/隐藏部分标签|hide labels|hide more/i.test(text)) {
        return false;
      }
      return /显示更多标签|show more|更多标签/i.test(text);
    });
    if (toggle) {
      return toggle;
    }
  }

  return null;
}

async function ensureMailboxLinkVisible(section = 'inbox') {
  let mailboxLink = findMailboxLink(section);
  if (mailboxLink && isVisibleElement(mailboxLink)) {
    scrollElementIntoViewIfPossible(mailboxLink);
    return mailboxLink;
  }

  const hiddenMailboxLink = Array.from(document.querySelectorAll('a, [role="link"]')).find((element) => {
    const text = normalizeText(
      element.getAttribute?.('aria-label')
      || element.getAttribute?.('title')
      || element.textContent
      || ''
    );
    return matchesMailboxLinkText(section, text)
      || String(element.getAttribute?.('href') || '').toLowerCase().includes(getMailboxHash(section));
  }) || null;

  const expandToggle = findMailboxExpandToggle(section);
  if (expandToggle) {
    scrollElementIntoViewIfPossible(expandToggle);
    simulateClick(expandToggle);
    await sleep(600);
    mailboxLink = findMailboxLink(section);
    if (mailboxLink && isVisibleElement(mailboxLink)) {
      scrollElementIntoViewIfPossible(mailboxLink);
      return mailboxLink;
    }
  }

  if (hiddenMailboxLink) {
    scrollElementIntoViewIfPossible(hiddenMailboxLink);
    mailboxLink = findMailboxLink(section);
    if (mailboxLink && isVisibleElement(mailboxLink)) {
      scrollElementIntoViewIfPossible(mailboxLink);
      return mailboxLink;
    }
  }

  return null;
}

function getMailboxHash(section = 'inbox') {
  return section === 'spam' ? '#spam' : '#inbox';
}

function isMailboxSectionActive(section = 'inbox', href = location.href) {
  const normalized = String(href || '').toLowerCase();
  if (section === 'spam') {
    return /#spam(?:[/?]|$)/i.test(normalized);
  }
  return /#inbox(?:[/?]|$)/i.test(normalized);
}

const GMAIL_CATEGORY_LABELS = {
  primary: [/^primary$/i, /^inbox$/i, /^主要$/],
  updates: [/^updates$/i, /^更新$/],
  promotions: [/^promotions$/i, /^推广$/],
  social: [/^social$/i, /^社交$/],
};

function getCategoryKeyFromText(text) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) return '';

  for (const [key, patterns] of Object.entries(GMAIL_CATEGORY_LABELS)) {
    if (patterns.some((pattern) => pattern.test(normalizedText))) {
      return key;
    }
  }

  return '';
}

function getCategoryTabLabel(tab) {
  const text = normalizeText(
    tab?.getAttribute?.('aria-label')
    || tab?.getAttribute?.('data-tooltip')
    || tab?.getAttribute?.('title')
    || tab?.textContent
    || ''
  );
  return text;
}

function collectCategoryTabs() {
  const tabs = Array.from(document.querySelectorAll('[role="tab"], [data-tooltip-align][role="link"]'));
  const categoryTabs = [];
  const seenKeys = new Set();

  tabs.forEach((tab) => {
    if (!isVisibleElement(tab)) return;
    const label = getCategoryTabLabel(tab);
    const key = getCategoryKeyFromText(label);
    if (!key || seenKeys.has(key)) return;

    seenKeys.add(key);
    categoryTabs.push({
      key,
      label,
      selected: tab.getAttribute('aria-selected') === 'true' || /\bTO\b/.test(tab.className || ''),
      tab,
    });
  });

  return categoryTabs;
}

function getCategoryScanOrder() {
  const categoryTabs = collectCategoryTabs();
  if (!categoryTabs.length) {
    return [{ key: 'primary', label: 'Primary', selected: true, tab: null }];
  }

  const ordered = ['updates', 'primary']
    .map((key) => categoryTabs.find((item) => item.key === key))
    .filter(Boolean);

  return ordered.length
    ? ordered
    : [{ key: 'primary', label: 'Primary', selected: true, tab: null }];
}

async function activateCategoryTab(step, categoryKey) {
  const categoryTabs = collectCategoryTabs();
  const target = categoryTabs.find((item) => item.key === categoryKey);
  if (!target?.tab) {
    return { key: categoryKey, label: categoryKey, switched: false };
  }

  if (target.selected) {
    return { key: target.key, label: target.label, switched: false };
  }

  simulateClick(target.tab);
  for (let i = 0; i < 20; i++) {
    await sleep(200);
    const refreshed = collectCategoryTabs().find((item) => item.key === categoryKey);
    if (refreshed?.selected) {
      await sleep(500);
      log(`步骤 ${step}：已切换到 Gmail 分类 ${refreshed.label}。`);
      return { key: refreshed.key, label: refreshed.label, switched: true };
    }
  }

  await sleep(600);
  log(`步骤 ${step}：已尝试切换到 Gmail 分类 ${target.label}。`, 'info');
  return { key: target.key, label: target.label, switched: true };
}

function findRefreshButton() {
  const selectors = [
    'div[role="button"][data-tooltip="刷新"]',
    'div[role="button"][aria-label="刷新"]',
    'div[role="button"][data-tooltip*="刷新"]',
    'div[role="button"][aria-label*="刷新"]',
    'div[role="button"][data-tooltip="Refresh"]',
    'div[role="button"][aria-label="Refresh"]',
    'div[role="button"][data-tooltip*="Refresh"]',
    'div[role="button"][aria-label*="Refresh"]',
    'div[act="20"][role="button"]',
    'div.asf.T-I-J3.J-J5-Ji',
  ];

  for (const selector of selectors) {
    const matched = document.querySelector(selector);
    const button = matched?.closest?.('[role="button"]') || matched;
    if (button && isVisibleElement(button)) {
      return button;
    }
  }

  return Array.from(document.querySelectorAll('div[role="button"], button')).find((element) => {
    const text = normalizeText(
      element.getAttribute('aria-label')
      || element.getAttribute('data-tooltip')
      || element.getAttribute('title')
      || element.textContent
    );
    return /刷新|Refresh/i.test(text);
  }) || null;
}

function hasOpenedMessageView() {
  return Boolean(
    document.querySelector('div[role="main"] .adn.ads[data-message-id]')
    || document.querySelector('div[role="main"] .ii.gt .adn.ads')
    || document.querySelector('div[role="main"] [data-message-id] .a3s')
  );
}

function isInboxListReady() {
  return !hasOpenedMessageView() && collectThreadRows().length > 0;
}

function isInboxShellReady() {
  if (hasOpenedMessageView()) {
    return false;
  }

  const main = document.querySelector('div[role="main"]');
  if (!main) {
    return false;
  }

  if (main.querySelector('table[role="grid"], [gh="tl"], .Cp, .AO')) {
    return true;
  }

  const mainText = normalizeText(main.innerText || main.textContent || '');
  if (/you'?re all caught up|no new mail|收件箱|没有新邮件|暂时没有邮件|目前没有邮件/i.test(mainText)) {
    return true;
  }

  return Boolean(findRefreshButton() || findInboxLink());
}

function collectThreadRows() {
  const candidates = [
    ...document.querySelectorAll('tr.zA'),
    ...document.querySelectorAll('tr[role="row"]'),
  ];

  const rows = [];
  const seenRows = new Set();

  candidates.forEach((row) => {
    if (!row || seenRows.has(row)) return;
    seenRows.add(row);

    if (!isDisplayed(row)) return;

    const text = normalizeText(row.textContent || row.innerText || '');
    if (!text) return;

    if (
      row.matches('tr.zA')
      || row.querySelector('.bog, .y6, .y2, .afn, [data-thread-id], [data-legacy-thread-id], [data-legacy-last-message-id]')
      || /openai|chatgpt|verify|verification|code|验证码/i.test(text)
    ) {
      rows.push(row);
    }
  });

  return rows;
}

function getRowPreviewText(row) {
  const sender = normalizeText(
    row.querySelector('.zF, .yP, span[email], [email]')?.textContent
    || row.querySelector('[email]')?.getAttribute?.('email')
    || ''
  );

  const subject = normalizeText(
    row.querySelector('.bog [data-thread-id], .bog [data-legacy-thread-id], .bog, .y6, .bqe')?.textContent
    || ''
  );

  const digest = normalizeText(
    row.querySelector('.y2, .afn, .a4W, .bog + .y2')?.textContent
    || ''
  );

  const timeText = normalizeText(
    row.querySelector('td.xW span')?.getAttribute?.('title')
    || row.querySelector('td.xW span, td.xW time')?.getAttribute?.('title')
    || row.querySelector('td.xW span, td.xW time')?.textContent
    || ''
  );

  const fullText = normalizeText(row.textContent || row.innerText || '');

  return {
    sender,
    subject,
    digest,
    timeText,
    fullText,
    combinedText: normalizeText([sender, subject, digest, timeText, fullText].filter(Boolean).join(' ')),
  };
}

function getRowTimestamp(row) {
  const timeCell = row.querySelector('td.xW span, td.xW time, td.xW [title]');
  const candidates = [
    timeCell?.getAttribute?.('title'),
    timeCell?.getAttribute?.('aria-label'),
    timeCell?.textContent,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const parsed = parseGmailTimestampText(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function getRowFingerprint(row, index = 0) {
  const marker = row.querySelector('[data-thread-id], [data-legacy-thread-id], [data-legacy-last-message-id]');
  const stableId = row.getAttribute('data-thread-id')
    || row.getAttribute('data-legacy-thread-id')
    || row.getAttribute('data-legacy-last-message-id')
    || marker?.getAttribute?.('data-thread-id')
    || marker?.getAttribute?.('data-legacy-thread-id')
    || marker?.getAttribute?.('data-legacy-last-message-id')
    || row.getAttribute('id')
    || `row-${index}`;
  const preview = getRowPreviewText(row);
  return `${stableId}::${preview.subject}::${preview.timeText}`.slice(0, 300);
}

function getCurrentMailIds(rows = []) {
  const ids = new Set();
  const sourceRows = rows.length ? rows : collectThreadRows();
  sourceRows.forEach((row, index) => {
    ids.add(getRowFingerprint(row, index));
  });
  return ids;
}

function rowMatchesFilters(preview, senderFilters, subjectFilters) {
  const senderText = normalizeText(preview.sender).toLowerCase();
  const subjectText = normalizeText(preview.subject).toLowerCase();
  const combinedText = normalizeText(preview.combinedText).toLowerCase();

  const senderMatch = senderFilters.some((filter) => {
    const value = String(filter || '').toLowerCase();
    return value && (senderText.includes(value) || combinedText.includes(value));
  });

  const subjectMatch = subjectFilters.some((filter) => {
    const value = String(filter || '').toLowerCase();
    return value && (subjectText.includes(value) || combinedText.includes(value));
  });

  return senderMatch || subjectMatch;
}

async function ensureMailboxSectionReady(step, section = 'inbox') {
  if (!isMailboxSectionActive(section) || hasOpenedMessageView()) {
    const mailboxLink = await ensureMailboxLinkVisible(section);
    if (mailboxLink) {
      simulateClick(mailboxLink);
      await sleep(800);
      log(`步骤 ${step}：已切换到 ${getMailboxSectionLabel(section)}。`);
    } else {
      location.hash = getMailboxHash(section);
      await sleep(800);
    }
  }

  for (let i = 0; i < 20; i++) {
    if (isInboxListReady() || isInboxShellReady()) {
      return collectThreadRows();
    }
    if (i === 4 && hasOpenedMessageView()) {
      const mailboxLink = findMailboxLink(section);
      if (mailboxLink) {
        simulateClick(mailboxLink);
      } else {
        location.hash = getMailboxHash(section);
      }
    }
    await sleep(400);
  }

  return null;
}

async function ensureInboxReady(step) {
  return ensureMailboxSectionReady(step, 'inbox');
}

async function refreshMailboxSection(step, section = 'inbox') {
  if (hasOpenedMessageView()) {
    await returnToMailboxSection(step, section);
  }

  const refreshButton = findRefreshButton();
  if (refreshButton) {
    simulateClick(refreshButton);
    log(`步骤 ${step}：已点击 ${getMailboxSectionLabel(section)} 刷新。`);
    await sleep(1500);
    return;
  }

  const mailboxLink = await ensureMailboxLinkVisible(section);
  if (mailboxLink) {
    simulateClick(mailboxLink);
    log(`步骤 ${step}：未找到刷新按钮，已重新进入 ${getMailboxSectionLabel(section)}。`);
    await sleep(1200);
    return;
  }

  location.hash = getMailboxHash(section);
  log(`步骤 ${step}：未找到刷新按钮，已直接跳转到 ${getMailboxSectionLabel(section)}。`);
  await sleep(2500);
}

async function refreshInbox(step) {
  return refreshMailboxSection(step, 'inbox');
}

async function returnToMailboxSection(step = 0, section = 'inbox') {
  if (isInboxListReady()) {
    return;
  }

  const mailboxLink = await ensureMailboxLinkVisible(section);
  if (mailboxLink) {
    simulateClick(mailboxLink);
  } else {
    location.hash = getMailboxHash(section);
  }

  for (let i = 0; i < 20; i++) {
    if (isInboxListReady()) {
      if (step) {
        log(`步骤 ${step}：已从邮件详情返回 ${getMailboxSectionLabel(section)}。`);
      }
      return;
    }
    await sleep(250);
  }
}

async function returnToInbox(step = 0) {
  return returnToMailboxSection(step, 'inbox');
}

async function openRowAndGetMessageText(row, mailboxSection = 'inbox') {
  simulateClick(row);

  for (let i = 0; i < 20; i++) {
    const messageContainer = document.querySelector('div[role="main"] .a3s, div[role="main"] [data-message-id], h2[data-thread-perm-id]');
    if (messageContainer || !/#inbox/i.test(location.href)) {
      break;
    }
    await sleep(250);
  }

  await sleep(900);
  const messageRoot = document.querySelector('div[role="main"] .adn.ads[data-message-id]')
    || document.querySelector('div[role="main"]')
    || document.body;
  const text = collectMailSearchTextFromRoot(messageRoot);
  await returnToMailboxSection(0, mailboxSection);
  return text;
}

async function handlePollEmail(step, payload) {
  const {
    senderFilters = [],
    subjectFilters = [],
    maxAttempts = 5,
    intervalMs = 3000,
    filterAfterTimestamp = 0,
    excludeCodes = [],
    targetEmail = '',
    mailboxSection = 'inbox',
    forceOpenMessage = false,
    refreshBeforeStart = false,
    refreshEachAttempt = true,
    allowExistingMatching = false,
    ignoreTimeFilter = false,
    fallbackToExistingAfterAttempts = 0,
    maxMatchingRows = Number.POSITIVE_INFINITY,
  } = payload || {};

  const excludedCodeSet = new Set(excludeCodes.filter(Boolean));
  const filterAfterMinute = normalizeMinuteTimestamp(Number(filterAfterTimestamp) || 0);
  const matchingRowLimit = Number.isFinite(Number(maxMatchingRows)) && Number(maxMatchingRows) > 0
    ? Math.max(1, Math.floor(Number(maxMatchingRows)))
    : Number.POSITIVE_INFINITY;
  const fallbackAfterAttempts = Number.isFinite(Number(fallbackToExistingAfterAttempts))
    ? Math.max(0, Math.floor(Number(fallbackToExistingAfterAttempts)))
    : 0;

  log(`步骤 ${step}：开始轮询 Gmail（最多 ${maxAttempts} 次）`);
  if (filterAfterMinute) {
    log(`步骤 ${step}：仅尝试 ${new Date(filterAfterMinute).toLocaleString('zh-CN', { hour12: false })} 及之后时间的邮件。`);
  }

  if (refreshBeforeStart) {
    await refreshMailboxSection(step, mailboxSection);
  }

  let initialRows = await ensureMailboxSectionReady(step, mailboxSection);
  if (initialRows === null) {
    await refreshMailboxSection(step, mailboxSection);
    initialRows = await ensureMailboxSectionReady(step, mailboxSection);
  }

  if (initialRows === null) {
    throw new Error(`${getMailboxSectionLabel(mailboxSection)} 列表未加载完成，请确认当前已打开对应邮箱页面。`);
  }

  const categoryOrder = getCategoryScanOrder();
  const existingMailIdsByCategory = new Map();

  for (const category of categoryOrder) {
    const activeCategory = await activateCategoryTab(step, category.key);
    const rows = collectThreadRows();
    existingMailIdsByCategory.set(activeCategory.key, getCurrentMailIds(rows));
    log(`步骤 ${step}：已记录 Gmail 分类 ${activeCategory.label} 的 ${rows.length} 封旧邮件快照`);
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(`步骤 ${step}：正在轮询 Gmail，第 ${attempt}/${maxAttempts} 次`);

    if (attempt > 1 && refreshEachAttempt) {
      await refreshMailboxSection(step, mailboxSection);
    }

    const useFallback = fallbackAfterAttempts > 0 && attempt > fallbackAfterAttempts;

    for (const category of categoryOrder) {
      const activeCategory = await activateCategoryTab(step, category.key);
      const rows = collectThreadRows();
      const existingMailIds = existingMailIdsByCategory.get(activeCategory.key) || new Set();
      let matchedRowCount = 0;

      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const rowId = getRowFingerprint(row, index);
        const rowTimestamp = getRowTimestamp(row);
        const rowMinute = normalizeMinuteTimestamp(rowTimestamp || 0);
        const passesTimeFilter = ignoreTimeFilter || !filterAfterMinute || (rowMinute && rowMinute >= filterAfterMinute);
        const shouldBypassOldSnapshot = Boolean(filterAfterMinute && passesTimeFilter && rowMinute > 0);

        if (!passesTimeFilter) {
          continue;
        }

        if (!allowExistingMatching && !useFallback && !shouldBypassOldSnapshot && existingMailIds.has(rowId)) {
          continue;
        }

        const preview = getRowPreviewText(row);
        if (!rowMatchesFilters(preview, senderFilters, subjectFilters)) {
          continue;
        }
        matchedRowCount += 1;
        const reachedMatchingRowLimit = matchedRowCount >= matchingRowLimit;

        const previewTargetState = getTargetEmailMatchState(preview.combinedText, targetEmail);
        const previewCode = extractVerificationCode(preview.combinedText);
        const requiresOpenedTargetCheck = Boolean(targetEmail && !previewTargetState.matches);
        const shouldOpenMessage = Boolean(forceOpenMessage) || requiresOpenedTargetCheck || !previewCode;
        let openedText = '';
        let openedTargetState = { matches: false, hasExplicitEmail: false };
        let bodyCode = null;

        if (shouldOpenMessage) {
          openedText = await openRowAndGetMessageText(row, mailboxSection);
          openedTargetState = getTargetEmailMatchState(openedText, targetEmail);
          bodyCode = extractVerificationCode(openedText);
        }

        const targetMatched = !targetEmail
          || (forceOpenMessage ? openedTargetState.matches : (previewTargetState.matches || openedTargetState.matches));
        if (targetEmail && !targetMatched) {
          if (previewCode || bodyCode) {
            log(`步骤 ${step}：跳过 Gmail 邮件 ${rowId}，正文与预览都未命中目标邮箱 ${normalizeTargetEmail(targetEmail)}。`, 'info');
          }
          if (reachedMatchingRowLimit) {
            break;
          }
          continue;
        }

        const resolvedCode = bodyCode || previewCode;
        if (!resolvedCode) {
          if (reachedMatchingRowLimit) {
            break;
          }
          continue;
        }
        if (excludedCodeSet.has(resolvedCode)) {
          log(`步骤 ${step}：跳过排除的验证码：${resolvedCode}`, 'info');
          if (reachedMatchingRowLimit) {
            break;
          }
          continue;
        }

        const messageKey = buildSeenMessageKey({
          rowId,
          code: resolvedCode,
          targetEmail,
          previewText: preview.combinedText,
          openedText,
        });
        if (seenMessageKeys.has(messageKey)) {
          log(`步骤 ${step}：跳过已处理过的 Gmail 邮件 ${rowId}（验证码 ${resolvedCode}）。`, 'info');
          if (reachedMatchingRowLimit) {
            break;
          }
          continue;
        }

        seenMessageKeys.add(messageKey);
        await persistSeenMessageKeys();
        const resolvedSourceLabel = bodyCode
          ? (useFallback && existingMailIds.has(rowId) ? '回退匹配邮件正文' : '新邮件正文')
          : (useFallback && existingMailIds.has(rowId) ? '回退匹配邮件' : '新邮件');
        const resolvedTimeLabel = rowTimestamp ? `，时间：${new Date(rowTimestamp).toLocaleString('zh-CN', { hour12: false })}` : '';
        const resolvedTargetLabel = targetEmail ? `，目标邮箱：${normalizeTargetEmail(targetEmail)}` : '';
        log(`步骤 ${step}：已在 Gmail ${activeCategory.label} 分类获取验证码 ${resolvedCode}（来源：${resolvedSourceLabel}${resolvedTimeLabel}${resolvedTargetLabel}）。`, 'ok');
        return {
          ok: true,
          code: resolvedCode,
          emailTimestamp: Date.now(),
          mailId: rowId,
        };
      }

      if (matchedRowCount >= matchingRowLimit) {
        break;
      }
    }

    if (fallbackAfterAttempts > 0 && attempt === fallbackAfterAttempts + 1) {
      log(`步骤 ${step}：连续 ${fallbackAfterAttempts} 次未发现新邮件，开始回退到首封匹配邮件`, 'warn');
    }

    if (attempt < maxAttempts) {
      await sleep(intervalMs);
    }
  }

  throw new Error(
    `${(maxAttempts * intervalMs / 1000).toFixed(0)} 秒后仍未在 Gmail 中找到匹配邮件。请手动检查 Gmail 收件箱。`
  );
}

}
