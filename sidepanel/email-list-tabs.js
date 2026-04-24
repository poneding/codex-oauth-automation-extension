(function attachSidepanelEmailListTabs(globalScope) {
  function createEmailListTabsController(context = {}) {
    const { dom = {} } = context;

    function normalizeTabKey(value = '') {
      return String(value || '').trim().toLowerCase() === 'registered'
        ? 'registered'
        : 'pending';
    }

    let activeTab = 'pending';

    function updateTabButton(button, selected) {
      if (!button) {
        return;
      }
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }

    function render(nextTab = activeTab) {
      activeTab = normalizeTabKey(nextTab);
      const pendingSelected = activeTab === 'pending';
      const registeredSelected = activeTab === 'registered';

      if (dom.customEmailPanel) {
        dom.customEmailPanel.hidden = !pendingSelected;
      }
      if (dom.registeredEmailPanel) {
        dom.registeredEmailPanel.hidden = !registeredSelected;
      }

      updateTabButton(dom.btnPendingEmailTab, pendingSelected);
      updateTabButton(dom.btnRegisteredEmailTab, registeredSelected);
      return activeTab;
    }

    function bindTab(button, tabKey) {
      button?.addEventListener('click', () => {
        render(tabKey);
      });
    }

    function bindEvents() {
      bindTab(dom.btnPendingEmailTab, 'pending');
      bindTab(dom.btnRegisteredEmailTab, 'registered');
    }

    return {
      bindEvents,
      getActiveTab: () => activeTab,
      render,
    };
  }

  globalScope.SidepanelEmailListTabs = {
    createEmailListTabsController,
  };
})(window);
