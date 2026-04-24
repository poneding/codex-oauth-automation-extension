const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const routerSource = fs.readFileSync('background/message-router.js', 'utf8');
const routerGlobalScope = {};
const routerApi = new Function('self', `${routerSource}; return self.MultiPageBackgroundMessageRouter;`)(routerGlobalScope);

test('message router proxies Gmail IMAP connection test through the background helper', async () => {
  const calls = [];
  const router = routerApi.createMessageRouter({
    testGmailImapConnection: async (payload) => {
      calls.push(payload);
      return { status: 'ok' };
    },
  });

  const response = await router.handleMessage({
    type: 'TEST_GMAIL_IMAP_CONNECTION',
    source: 'sidepanel',
    payload: {
      gmailImapEmail: 'user@gmail.com',
      gmailImapAppPassword: 'app-password',
      gmailImapHost: 'imap.gmail.com',
      gmailImapPort: 993,
    },
  }, {});

  assert.deepStrictEqual(calls, [{
    gmailImapEmail: 'user@gmail.com',
    gmailImapAppPassword: 'app-password',
    gmailImapHost: 'imap.gmail.com',
    gmailImapPort: 993,
  }]);
  assert.deepStrictEqual(response, {
    ok: true,
    result: {
      status: 'ok',
    },
  });
});
