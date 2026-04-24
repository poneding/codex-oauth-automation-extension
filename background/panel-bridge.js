(function attachBackgroundPanelBridge(root, factory) {
  root.MultiPageBackgroundPanelBridge = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundPanelBridgeModule() {
  function createPanelBridge(deps = {}) {
    const {
      chrome,
      addLog,
      closeConflictingTabsForSource,
      ensureContentScriptReadyOnTab,
      getState,
      rememberSourceLastUrl,
      sendToContentScriptResilient,
      waitForTabUrlFamily,
    } = deps;

    async function resolvePreferredWindowId(state) {
      const candidate = Number(state?.ownerWindowId ?? (await getState?.())?.ownerWindowId);
      if (!Number.isInteger(candidate) || candidate < 0) {
        return null;
      }
      if (!chrome?.windows?.get) {
        return candidate;
      }
      try {
        await chrome.windows.get(candidate);
        return candidate;
      } catch (_) {
        return null;
      }
    }

    async function requestCpaOAuthUrl(state, options = {}) {
      const { logLabel = 'OAuth 刷新' } = options;
      if (!state.vpsUrl) {
        throw new Error('尚未配置 CPA 地址，请先在侧边栏填写。');
      }

      await addLog(`${logLabel}：正在打开 CPA 面板...`);

      const injectFiles = ['content/activation-utils.js', 'content/utils.js', 'content/vps-panel.js'];
      await closeConflictingTabsForSource('vps-panel', state.vpsUrl);

      const preferredWindowId = await resolvePreferredWindowId(state);
      const createPayload = { url: state.vpsUrl, active: true };
      if (Number.isInteger(preferredWindowId)) {
        createPayload.windowId = preferredWindowId;
      }
      const tab = await chrome.tabs.create(createPayload);
      const tabId = tab.id;
      await rememberSourceLastUrl('vps-panel', state.vpsUrl);

      await addLog(`${logLabel}：CPA 面板已打开，正在等待页面进入目标地址...`);
      const matchedTab = await waitForTabUrlFamily('vps-panel', tabId, state.vpsUrl, {
        timeoutMs: 15000,
        retryDelayMs: 400,
      });
      if (!matchedTab) {
        await addLog(`${logLabel}：CPA 页面尚未完全进入目标地址，继续尝试连接内容脚本...`, 'warn');
      }

      await ensureContentScriptReadyOnTab('vps-panel', tabId, {
        inject: injectFiles,
        timeoutMs: 45000,
        retryDelayMs: 900,
        logMessage: `${logLabel}：CPA 面板仍在加载，正在重试连接内容脚本...`,
      });

      const result = await sendToContentScriptResilient('vps-panel', {
        type: 'REQUEST_OAUTH_URL',
        source: 'background',
        payload: {
          vpsPassword: state.vpsPassword,
          logStep: 6,
        },
      }, {
        timeoutMs: 30000,
        retryDelayMs: 700,
        logMessage: `${logLabel}：CPA 面板通信未就绪，正在等待页面恢复...`,
      });

      if (result?.error) {
        throw new Error(result.error);
      }
      return result || {};
    }

    async function requestOAuthUrlFromPanel(state, options = {}) {
      return requestCpaOAuthUrl(state, options);
    }

    return {
      requestCpaOAuthUrl,
      requestOAuthUrlFromPanel,
    };
  }

  return {
    createPanelBridge,
  };
});
