(function attachSidepanelWindowScope(globalScope) {
  function createSidepanelWindowScope(context = {}) {
    const chromeApi = context.chrome || globalScope.chrome;
    const browserWindow = context.window || globalScope;
    let ownerWindowId = null;

    function normalizeWindowId(value) {
      const numeric = Number(value);
      if (!Number.isInteger(numeric) || numeric < 0) {
        return null;
      }
      return numeric;
    }

    async function registerOwnerWindow() {
      if (!chromeApi?.windows?.getCurrent) {
        return normalizeWindowId(ownerWindowId);
      }

      const currentWindow = await chromeApi.windows.getCurrent();
      const windowId = normalizeWindowId(currentWindow?.id);
      if (!Number.isInteger(windowId)) {
        throw new Error('无法获取当前侧边栏窗口 ID。');
      }

      ownerWindowId = windowId;
      if (chromeApi?.runtime?.sendMessage) {
        await chromeApi.runtime.sendMessage({
          type: 'SET_OWNER_WINDOW',
          source: 'sidepanel',
          payload: { windowId },
        });
      }

      return ownerWindowId;
    }

    async function resolveOwnerWindowId() {
      const cachedWindowId = normalizeWindowId(ownerWindowId);
      if (Number.isInteger(cachedWindowId)) {
        return cachedWindowId;
      }
      return registerOwnerWindow();
    }

    async function openExternalUrl(url) {
      const targetUrl = String(url || '').trim();
      if (!targetUrl) {
        return null;
      }

      if (!chromeApi?.tabs?.create) {
        return typeof browserWindow?.open === 'function'
          ? browserWindow.open(targetUrl, '_blank', 'noopener')
          : null;
      }

      const createTabInWindow = async (windowId) => {
        const payload = { url: targetUrl, active: true };
        if (Number.isInteger(windowId)) {
          payload.windowId = windowId;
        }
        return chromeApi.tabs.create(payload);
      };

      try {
        return await createTabInWindow(await resolveOwnerWindowId());
      } catch (error) {
        try {
          return await createTabInWindow(await registerOwnerWindow());
        } catch (_) {
          if (typeof browserWindow?.open === 'function') {
            return browserWindow.open(targetUrl, '_blank', 'noopener');
          }
          throw error;
        }
      }
    }

    return {
      getOwnerWindowId: () => normalizeWindowId(ownerWindowId),
      openExternalUrl,
      registerOwnerWindow,
    };
  }

  globalScope.SidepanelWindowScope = {
    createSidepanelWindowScope,
  };
})(window);
