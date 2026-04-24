const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('managed-alias-utils.js', 'utf8');
const scope = {};
const api = new Function('self', `${source}; return self.MultiPageManagedAliasUtils;`)(scope);

test('managed alias utils build gmail +tag email from full base email', () => {
  assert.equal(
    api.buildManagedAliasEmail('gmail', 'demo@gmail.com', 'riverstone'),
    'demo+riverstone@gmail.com'
  );
});

test('managed alias utils validate provider email with or without configured base email', () => {
  assert.equal(api.isManagedAliasEmail('demo+riverstone@gmail.com', 'gmail', 'demo@gmail.com'), true);
  assert.equal(api.isManagedAliasEmail('manual@gmail.com', 'gmail', ''), true);
  assert.equal(api.isManagedAliasEmail('manual@example.com', 'gmail', ''), false);
});
