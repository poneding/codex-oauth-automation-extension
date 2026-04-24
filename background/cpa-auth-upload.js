(function attachBackgroundCpaAuthUpload(root, factory) {
  root.MultiPageBackgroundCpaAuthUpload = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundCpaAuthUploadModule() {
  const DEFAULT_CPA_UPLOAD_TIMEOUT_MS = 120000;

  function normalizeCpaApiUrl(rawValue = '') {
    const value = String(rawValue || '').trim();
    if (!value) {
      return '';
    }

    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return '';
      }
      if (
        parsed.pathname === '/management.html'
        || parsed.pathname === '/management.html/'
        || parsed.pathname === '/oauth'
      ) {
        parsed.pathname = '';
      }
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return '';
    }
  }

  function getConfiguredCpaApiUrl(state = {}) {
    return normalizeCpaApiUrl(state?.cpaApiUrl || state?.vpsUrl || '');
  }

  function getConfiguredCpaManagementKey(state = {}) {
    return String(state?.cpaManagementKey || state?.vpsPassword || '').trim();
  }

  function createCpaAuthUploadService(deps = {}) {
    const {
      callNativeHost,
      defaultTimeoutMs = DEFAULT_CPA_UPLOAD_TIMEOUT_MS,
    } = deps;

    async function exchangeAndUploadAuthFile(state = {}) {
      if (typeof callNativeHost !== 'function') {
        throw new Error('当前未启用 Native Host，无法执行后台 CPA 认证文件上传。');
      }

      const localhostUrl = String(state?.localhostUrl || '').trim();
      const oauthRuntime = state?.oauthRuntime && typeof state.oauthRuntime === 'object'
        ? state.oauthRuntime
        : null;
      const cpaApiUrl = getConfiguredCpaApiUrl(state);
      const cpaManagementKey = getConfiguredCpaManagementKey(state);

      if (!localhostUrl) {
        throw new Error('缺少 localhost OAuth 回调地址。');
      }
      if (!oauthRuntime?.state || !oauthRuntime?.codeVerifier || !oauthRuntime?.redirectUri || !oauthRuntime?.clientId) {
        throw new Error('缺少完整的本地 OAuth 运行时上下文，请返回步骤 7 重新开始。');
      }
      if (!cpaApiUrl) {
        throw new Error('尚未填写 CPA API 地址，请先在侧边栏输入。');
      }
      if (!cpaManagementKey) {
        throw new Error('尚未填写 CPA 管理密钥，请先在侧边栏输入。');
      }

      const tokenBundle = await callNativeHost('oauth.exchangeCallback', {
        callbackUrl: localhostUrl,
        expectedState: oauthRuntime.state,
        codeVerifier: oauthRuntime.codeVerifier,
        redirectUri: oauthRuntime.redirectUri,
        clientId: oauthRuntime.clientId,
      }, {
        timeoutMs: Math.max(30000, Math.floor(Number(defaultTimeoutMs) || DEFAULT_CPA_UPLOAD_TIMEOUT_MS)),
      });

      const accountEmail = String(tokenBundle?.email || state?.email || '').trim().toLowerCase();
      const uploadResult = await callNativeHost('cpa.uploadAuthFile', {
        cpaApiUrl,
        cpaManagementKey,
        accountEmail,
        accessToken: String(tokenBundle?.accessToken || ''),
        refreshToken: String(tokenBundle?.refreshToken || ''),
        idToken: String(tokenBundle?.idToken || ''),
      }, {
        timeoutMs: Math.max(30000, Math.floor(Number(defaultTimeoutMs) || DEFAULT_CPA_UPLOAD_TIMEOUT_MS)),
      });

      return {
        uploaded: uploadResult?.uploaded !== false,
        accountEmail: String(uploadResult?.accountEmail || accountEmail || '').trim().toLowerCase(),
        filename: uploadResult?.filename || '',
        tokenBundle,
        uploadResult,
      };
    }

    return {
      exchangeAndUploadAuthFile,
      getConfiguredCpaApiUrl,
      getConfiguredCpaManagementKey,
      normalizeCpaApiUrl,
    };
  }

  return {
    DEFAULT_CPA_UPLOAD_TIMEOUT_MS,
    createCpaAuthUploadService,
    getConfiguredCpaApiUrl,
    getConfiguredCpaManagementKey,
    normalizeCpaApiUrl,
  };
});
