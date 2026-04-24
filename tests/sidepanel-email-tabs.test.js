const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function createClassList() {
  const values = new Set();
  return {
    add(...tokens) {
      tokens.forEach((token) => values.add(token));
    },
    remove(...tokens) {
      tokens.forEach((token) => values.delete(token));
    },
    contains(token) {
      return values.has(token);
    },
    toggle(token, force) {
      if (force === true) {
        values.add(token);
        return true;
      }
      if (force === false) {
        values.delete(token);
        return false;
      }
      if (values.has(token)) {
        values.delete(token);
        return false;
      }
      values.add(token);
      return true;
    },
  };
}

function createNode(initial = {}) {
  return {
    hidden: false,
    dataset: {},
    listeners: {},
    attributes: {},
    classList: createClassList(),
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return this.attributes[name] || '';
    },
    ...initial,
  };
}

test('email list tabs default to pending and switch to registered on click', () => {
  const source = fs.readFileSync('sidepanel/email-list-tabs.js', 'utf8');
  const windowObject = {};
  const api = new Function('window', `${source}; return window.SidepanelEmailListTabs;`)(windowObject);

  const dom = {
    btnPendingEmailTab: createNode(),
    btnRegisteredEmailTab: createNode(),
    customEmailPanel: createNode(),
    registeredEmailPanel: createNode(),
  };

  const controller = api.createEmailListTabsController({ dom });
  controller.bindEvents();
  controller.render();

  assert.equal(controller.getActiveTab(), 'pending');
  assert.equal(dom.customEmailPanel.hidden, false);
  assert.equal(dom.registeredEmailPanel.hidden, true);
  assert.equal(dom.btnPendingEmailTab.getAttribute('aria-selected'), 'true');
  assert.equal(dom.btnRegisteredEmailTab.getAttribute('aria-selected'), 'false');
  assert.equal(dom.btnPendingEmailTab.classList.contains('is-active'), true);
  assert.equal(dom.btnRegisteredEmailTab.classList.contains('is-active'), false);

  dom.btnRegisteredEmailTab.listeners.click();

  assert.equal(controller.getActiveTab(), 'registered');
  assert.equal(dom.customEmailPanel.hidden, true);
  assert.equal(dom.registeredEmailPanel.hidden, false);
  assert.equal(dom.btnPendingEmailTab.getAttribute('aria-selected'), 'false');
  assert.equal(dom.btnRegisteredEmailTab.getAttribute('aria-selected'), 'true');
  assert.equal(dom.btnPendingEmailTab.classList.contains('is-active'), false);
  assert.equal(dom.btnRegisteredEmailTab.classList.contains('is-active'), true);
});
