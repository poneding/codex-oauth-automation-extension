(function attachGeneratedEmailHelpers(root, factory) {
  root.MultiPageGeneratedEmailHelpers = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createGeneratedEmailHelpersModule() {
  function createGeneratedEmailHelpers(deps = {}) {
    const {
      addLog,
      buildGeneratedAliasEmail,
      getState,
      isGeneratedAliasProvider,
      setEmailState,
    } = deps;

    async function fetchManagedAliasEmail(state, options = {}) {
      const provider = String(options.mailProvider || state?.mailProvider || '').trim().toLowerCase();
      const mergedState = {
        ...(state || {}),
        mailProvider: provider,
      };
      if (options.gmailBaseEmail !== undefined) {
        mergedState.gmailBaseEmail = String(options.gmailBaseEmail || '').trim();
      }
      if (options.emailPrefix !== undefined) {
        mergedState.emailPrefix = String(options.emailPrefix || '').trim();
      }

      const email = buildGeneratedAliasEmail(mergedState);
      await setEmailState(email);
      await addLog('Gmail +tag：已生成 ' + email, 'ok');
      return email;
    }

    async function fetchGeneratedEmail(state, options = {}) {
      const currentState = state || await getState();
      const provider = String(options.mailProvider || currentState.mailProvider || '').trim().toLowerCase();
      if (isGeneratedAliasProvider?.(provider)) {
        return fetchManagedAliasEmail(currentState, options);
      }
      throw new Error('当前精简版仅保留 custom 邮箱和 Gmail +tag。');
    }

    return {
      fetchGeneratedEmail,
    };
  }

  return {
    createGeneratedEmailHelpers,
  };
});
