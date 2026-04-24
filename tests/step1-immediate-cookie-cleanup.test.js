const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('step 1 clears login cookies before opening the signup entry tab', async () => {
  const source = fs.readFileSync('background/steps/open-chatgpt.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundStep1;`)(globalScope);

  const events = [];
  const executor = api.createStep1Executor({
    addLog: async () => {},
    completeStepFromBackground: async () => {
      events.push('complete');
    },
    openSignupEntryTab: async () => {
      events.push('open');
    },
    runImmediateCookieCleanup: async () => {
      events.push('cleanup');
    },
  });

  await executor.executeStep1();

  assert.deepStrictEqual(events, ['cleanup', 'open', 'complete']);
});

test('step 6 no longer runs the delayed cookie cleanup helper', async () => {
  const source = fs.readFileSync('background/steps/clear-login-cookies.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundStep6;`)(globalScope);

  let cleanupCalls = 0;
  const completedSteps = [];

  const executor = api.createStep6Executor({
    completeStepFromBackground: async (step) => {
      completedSteps.push(step);
    },
    runPreStep6CookieCleanup: async () => {
      cleanupCalls += 1;
    },
  });

  await executor.executeStep6();

  assert.equal(cleanupCalls, 0);
  assert.deepStrictEqual(completedSteps, [6]);
});
