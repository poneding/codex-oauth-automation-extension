(function attachBackgroundStep10(root, factory) {
  root.MultiPageBackgroundStep10 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep10Module() {
  function createStep10Executor(deps = {}) {
    const {
      addLog,
      completeStepFromBackground,
      exchangeAndUploadAuthFile,
      getConfiguredCpaApiUrl = (state) => String(state?.cpaApiUrl || state?.vpsUrl || '').trim(),
      getConfiguredCpaManagementKey = (state) => String(state?.cpaManagementKey || state?.vpsPassword || '').trim(),
      isLocalhostOAuthCallbackUrl,
    } = deps;

    function hasCompleteOAuthRuntime(runtime) {
      return Boolean(
        runtime
        && typeof runtime === 'object'
        && runtime.state
        && runtime.codeVerifier
        && runtime.redirectUri
        && runtime.clientId
      );
    }

    async function executeCpaStep10(state) {
      if (state.localhostUrl && !isLocalhostOAuthCallbackUrl(state.localhostUrl)) {
        throw new Error('步骤 9 捕获到的 localhost OAuth 回调地址无效，请重新执行步骤 9。');
      }
      if (!state.localhostUrl) {
        throw new Error('缺少 localhost 回调地址，请先完成步骤 9。');
      }
      if (!hasCompleteOAuthRuntime(state.oauthRuntime)) {
        throw new Error('缺少完整的本地 OAuth 运行时上下文，请返回步骤 7 重新开始。');
      }
      const cpaApiUrl = getConfiguredCpaApiUrl(state);
      const cpaManagementKey = getConfiguredCpaManagementKey(state);
      if (!cpaApiUrl) {
        throw new Error('尚未填写 CPA API 地址，请先在侧边栏输入。');
      }
      if (!cpaManagementKey) {
        throw new Error('尚未填写 CPA 管理密钥，请先在侧边栏输入。');
      }
      if (typeof exchangeAndUploadAuthFile !== 'function') {
        throw new Error('后台 CPA 上传服务不可用。');
      }

      await addLog('步骤 10：正在通过 Native Host 交换 OAuth 回调并上传 CPA 认证文件...');
      const result = await exchangeAndUploadAuthFile({
        ...state,
        cpaApiUrl,
        cpaManagementKey,
      });
      await addLog('步骤 10：CPA 认证文件上传成功。', 'ok');
      await completeStepFromBackground(10, {
        localhostUrl: state.localhostUrl,
        verifiedStatus: 'uploaded',
        accountEmail: String(result?.accountEmail || state?.email || '').trim().toLowerCase(),
        cpaUploadResult: result || null,
      });
    }

    async function executeStep10(state) {
      return executeCpaStep10(state);
    }

    return {
      executeCpaStep10,
      executeStep10,
    };
  }

  return { createStep10Executor };
});
