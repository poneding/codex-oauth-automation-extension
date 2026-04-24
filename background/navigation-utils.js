(function attachBackgroundNavigationUtils(root, factory) {
  root.MultiPageBackgroundNavigationUtils = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundNavigationUtilsModule() {
  function createNavigationUtils(deps = {}) {
    const {
      normalizeLocalCpaStep9Mode,
    } = deps;

    function parseUrlSafely(rawUrl) {
      if (!rawUrl) return null;
      try {
        return new URL(rawUrl);
      } catch {
        return null;
      }
    }

    function normalizeSub2ApiUrl(rawUrl) {
      return String(rawUrl || '').trim();
    }

    function getPanelMode() {
      return 'cpa';
    }

    function getPanelModeLabel() {
      return 'CPA';
    }

    function isSignupPageHost(hostname = '') {
      return ['auth0.openai.com', 'auth.openai.com', 'accounts.openai.com'].includes(hostname);
    }

    function isSignupEntryHost(hostname = '') {
      return ['chatgpt.com', 'chat.openai.com'].includes(hostname);
    }

    function isSignupPasswordPageUrl(rawUrl) {
      const parsed = parseUrlSafely(rawUrl);
      if (!parsed) return false;
      return isSignupPageHost(parsed.hostname)
        && /\/create-account\/password(?:[/?#]|$)/i.test(parsed.pathname || '');
    }

    function isSignupEmailVerificationPageUrl(rawUrl) {
      const parsed = parseUrlSafely(rawUrl);
      if (!parsed) return false;
      return isSignupPageHost(parsed.hostname)
        && /\/email-verification(?:[/?#]|$)/i.test(parsed.pathname || '');
    }

    function is163MailHost() {
      return false;
    }

    function isLocalhostOAuthCallbackUrl(rawUrl) {
      const parsed = parseUrlSafely(rawUrl);
      if (!parsed) return false;
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
      if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) return false;
      if (!['/auth/callback', '/codex/callback'].includes(parsed.pathname)) return false;

      const code = (parsed.searchParams.get('code') || '').trim();
      const state = (parsed.searchParams.get('state') || '').trim();
      return Boolean(code && state);
    }

    function isLocalCpaUrl(rawUrl) {
      const parsed = parseUrlSafely(rawUrl);
      if (!parsed) return false;
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
      return ['localhost', '127.0.0.1'].includes(parsed.hostname);
    }

    function shouldBypassStep9ForLocalCpa(state) {
      return normalizeLocalCpaStep9Mode(state?.localCpaStep9Mode) === 'bypass'
        && Boolean(state?.localhostUrl)
        && isLocalCpaUrl(state?.vpsUrl);
    }

    function matchesSourceUrlFamily(source, candidateUrl, referenceUrl) {
      const candidate = parseUrlSafely(candidateUrl);
      if (!candidate) return false;

      const reference = parseUrlSafely(referenceUrl);

      switch (source) {
        case 'signup-page':
          return isSignupPageHost(candidate.hostname) || isSignupEntryHost(candidate.hostname);
        case 'gmail-mail':
          return candidate.hostname === 'mail.google.com';
        case 'vps-panel':
          return Boolean(reference)
            && candidate.origin === reference.origin
            && candidate.pathname === reference.pathname;
        default:
          return false;
      }
    }

    function getStep8CallbackUrlFromNavigation(details, signupTabId) {
      if (!Number.isInteger(signupTabId) || !details) return '';
      if (details.tabId !== signupTabId) return '';
      if (details.frameId !== 0) return '';
      return isLocalhostOAuthCallbackUrl(details.url) ? details.url : '';
    }

    function getStep8CallbackUrlFromTabUpdate(tabId, changeInfo, tab, signupTabId) {
      if (!Number.isInteger(signupTabId) || tabId !== signupTabId) return '';
      const candidates = [changeInfo?.url, tab?.url];
      for (const candidate of candidates) {
        if (isLocalhostOAuthCallbackUrl(candidate)) {
          return candidate;
        }
      }
      return '';
    }

    return {
      getPanelMode,
      getPanelModeLabel,
      getStep8CallbackUrlFromNavigation,
      getStep8CallbackUrlFromTabUpdate,
      is163MailHost,
      isLocalCpaUrl,
      isLocalhostOAuthCallbackUrl,
      isSignupEmailVerificationPageUrl,
      isSignupEntryHost,
      isSignupPageHost,
      isSignupPasswordPageUrl,
      matchesSourceUrlFamily,
      normalizeSub2ApiUrl,
      parseUrlSafely,
      shouldBypassStep9ForLocalCpa,
    };
  }

  return {
    createNavigationUtils,
  };
});
