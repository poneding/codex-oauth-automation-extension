(function attachBackgroundNativeHost(root, factory) {
  root.MultiPageBackgroundNativeHost = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundNativeHostModule() {
  const DEFAULT_NATIVE_HOST_NAME = 'com.codex.oauth.automation';
  const DEFAULT_NATIVE_HOST_TIMEOUT_MS = 30000;

  function createNativeHostBridge(deps = {}) {
    const {
      chrome,
      hostName = DEFAULT_NATIVE_HOST_NAME,
      defaultTimeoutMs = DEFAULT_NATIVE_HOST_TIMEOUT_MS,
    } = deps;

    async function callNativeHost(command, payload = {}, options = {}) {
      if (!chrome?.runtime?.connectNative) {
        throw new Error('当前浏览器不支持 Native Messaging。');
      }

      const timeoutMs = Math.max(1, Math.floor(Number(options.timeoutMs) || defaultTimeoutMs));

      return new Promise((resolve, reject) => {
        const port = chrome.runtime.connectNative(hostName);
        let settled = false;

        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try {
            port.disconnect?.();
          } catch {
            // Ignore disconnect failures during cleanup.
          }
          callback(value);
        };

        const timer = setTimeout(() => {
          finish(reject, new Error(`Native host ${hostName} 响应超时（${timeoutMs}ms）。`));
        }, timeoutMs);

        port.onMessage?.addListener?.((message) => {
          if (message?.ok === false) {
            finish(reject, new Error(String(message?.error || 'Native host 请求失败。')));
            return;
          }
          finish(resolve, message?.result ?? message ?? {});
        });

        port.onDisconnect?.addListener?.(() => {
          if (settled) return;
          const runtimeError = chrome?.runtime?.lastError?.message;
          finish(
            reject,
            new Error(runtimeError || `Native host ${hostName} 连接已断开。`)
          );
        });

        port.postMessage({
          command: String(command || '').trim(),
          payload: payload && typeof payload === 'object' ? payload : {},
        });
      });
    }

    return {
      callNativeHost,
    };
  }

  return {
    DEFAULT_NATIVE_HOST_NAME,
    DEFAULT_NATIVE_HOST_TIMEOUT_MS,
    createNativeHostBridge,
  };
});
