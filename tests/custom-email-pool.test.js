const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/custom-email-pool.js', 'utf8');
const globalScope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundCustomEmailPool;`)(globalScope);

test('custom email pool normalizes list text into ordered unique emails', () => {
  assert.deepStrictEqual(
    api.normalizeCustomEmailList(`
      Foo@Example.com
      bar@example.com
      foo@example.com
      invalid-value
      baz@example.com;bar@example.com
    `),
    ['foo@example.com', 'bar@example.com', 'baz@example.com']
  );
});

test('custom email pool trims used map to known list entries', () => {
  assert.deepStrictEqual(
    api.normalizeCustomEmailUsedMap(
      {
        'Foo@Example.com': true,
        'skip@example.com': true,
        invalid: true,
        'bar@example.com': false,
      },
      ['foo@example.com', 'bar@example.com']
    ),
    {
      'foo@example.com': true,
    }
  );
});

test('custom email pool picks next unused email in list order', () => {
  assert.equal(
    api.pickNextCustomEmail(
      ['foo@example.com', 'bar@example.com', 'baz@example.com'],
      { 'foo@example.com': true, 'baz@example.com': true }
    ),
    'bar@example.com'
  );
});

test('custom email pool reuses current email when requested', () => {
  assert.equal(
    api.pickNextCustomEmail(
      ['foo@example.com', 'bar@example.com'],
      { 'foo@example.com': true },
      {
        currentEmail: 'manual@example.com',
        reuseCurrentEmail: true,
      }
    ),
    'manual@example.com'
  );
});

test('custom email pool reports remaining count and next email', () => {
  assert.deepStrictEqual(
    api.getCustomEmailPoolStats(
      ['foo@example.com', 'bar@example.com', 'baz@example.com'],
      { 'foo@example.com': true }
    ),
    {
      total: 3,
      used: 1,
      remaining: 2,
      nextEmail: 'bar@example.com',
    }
  );
});
