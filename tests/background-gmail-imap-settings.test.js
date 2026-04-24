const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  const signatureEnd = source.indexOf(')', start);
  const braceStart = source.indexOf('{', signatureEnd);
  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end++) {
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
  "const PERSISTED_SETTING_DEFAULTS = { gmailImapEmail: '', gmailImapAppPassword: '', gmailImapHost: 'imap.gmail.com', gmailImapPort: 993, registeredEmailList: [] };",
  'const PERSISTED_SETTING_KEYS = Object.keys(PERSISTED_SETTING_DEFAULTS);',
  'function resolveLegacyAutoStepDelaySeconds() { return undefined; }',
  "function normalizeCustomEmailEntry(value = '') { const normalized = String(value || '').trim().toLowerCase(); return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(normalized) ? normalized : ''; }",
  'function normalizeCustomEmailList(value) { return Array.isArray(value) ? value : []; }',
  'function normalizeCustomEmailUsedMap(value) { return value && typeof value === "object" ? value : {}; }',
  'function normalizeCloudflareDomains(value) { return value; }',
  'function normalizeCloudflareTempEmailDomains(value) { return value; }',
  extractFunction('normalizeRegisteredEmailList'),
  extractFunction('normalizePersistentSettingValue'),
  extractFunction('buildPersistentSettingsPayload'),
].join('\n');

const api = new Function(`${bundle}; return { buildPersistentSettingsPayload, normalizeRegisteredEmailList };`)();

test('persistent settings normalize gmail imap config and registered list', () => {
  const payload = api.buildPersistentSettingsPayload({
    gmailImapEmail: ' User@gmail.com ',
    gmailImapAppPassword: ' abcd efgh ijkl mnop ',
    gmailImapHost: ' imap.gmail.com ',
    gmailImapPort: '993',
    registeredEmailList: ['Done@example.com', 'done@example.com', ''],
  });

  assert.equal(payload.gmailImapEmail, 'user@gmail.com');
  assert.equal(payload.gmailImapAppPassword, 'abcd efgh ijkl mnop');
  assert.equal(payload.gmailImapHost, 'imap.gmail.com');
  assert.equal(payload.gmailImapPort, 993);
  assert.deepStrictEqual(payload.registeredEmailList, ['done@example.com']);
});
