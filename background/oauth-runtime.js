(function attachBackgroundOAuthRuntime(root, factory) {
  root.MultiPageBackgroundOAuthRuntime = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundOAuthRuntimeModule() {
  const DEFAULT_OPENAI_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
  const DEFAULT_OPENAI_OAUTH_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
  const DEFAULT_OPENAI_OAUTH_REDIRECT_URI = 'http://localhost:1455/auth/callback';
  const DEFAULT_OPENAI_OAUTH_SCOPE = 'openid email profile offline_access';

  function getCrypto() {
    const cryptoApi = globalThis.crypto || self?.crypto || null;
    if (!cryptoApi?.getRandomValues || !cryptoApi?.subtle?.digest) {
      throw new Error('当前环境不支持 OAuth PKCE 所需的 Web Crypto API。');
    }
    return cryptoApi;
  }

  function bytesToBase64(bytes) {
    const binary = Array.from(bytes || [], (byte) => String.fromCharCode(byte)).join('');
    if (typeof btoa === 'function') {
      return btoa(binary);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64');
    }
    throw new Error('当前环境不支持 base64 编码。');
  }

  function toBase64Url(bytes) {
    return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function generateRandomString(byteLength = 32) {
    const cryptoApi = getCrypto();
    const bytes = new Uint8Array(Math.max(16, Math.floor(Number(byteLength) || 32)));
    cryptoApi.getRandomValues(bytes);
    return toBase64Url(bytes);
  }

  async function sha256Base64Url(value = '') {
    const cryptoApi = getCrypto();
    const encoder = new TextEncoder();
    const digest = await cryptoApi.subtle.digest('SHA-256', encoder.encode(String(value || '')));
    return toBase64Url(new Uint8Array(digest));
  }

  async function createLocalOAuthRuntime(options = {}) {
    const redirectUri = String(options.redirectUri || DEFAULT_OPENAI_OAUTH_REDIRECT_URI).trim() || DEFAULT_OPENAI_OAUTH_REDIRECT_URI;
    const clientId = String(options.clientId || DEFAULT_OPENAI_OAUTH_CLIENT_ID).trim() || DEFAULT_OPENAI_OAUTH_CLIENT_ID;
    const authorizeUrl = String(options.authorizeUrl || DEFAULT_OPENAI_OAUTH_AUTHORIZE_URL).trim() || DEFAULT_OPENAI_OAUTH_AUTHORIZE_URL;
    const scope = String(options.scope || DEFAULT_OPENAI_OAUTH_SCOPE).trim() || DEFAULT_OPENAI_OAUTH_SCOPE;
    const state = String(options.state || generateRandomString(24)).trim();
    const codeVerifier = String(options.codeVerifier || generateRandomString(64)).trim();
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const authUrl = new URL(authorizeUrl);

    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('prompt', 'login');
    authUrl.searchParams.set('id_token_add_organizations', 'true');
    authUrl.searchParams.set('codex_cli_simplified_flow', 'true');

    return {
      authUrl: authUrl.toString(),
      state,
      codeVerifier,
      redirectUri,
      clientId,
      createdAt: Number.isFinite(Number(options.createdAt)) ? Math.floor(Number(options.createdAt)) : Date.now(),
    };
  }

  function parseOAuthCallbackUrl(rawUrl = '') {
    try {
      const parsed = new URL(String(rawUrl || '').trim());
      return {
        code: String(parsed.searchParams.get('code') || '').trim(),
        state: String(parsed.searchParams.get('state') || '').trim(),
        error: String(parsed.searchParams.get('error') || '').trim(),
        errorDescription: String(parsed.searchParams.get('error_description') || '').trim(),
      };
    } catch {
      return {
        code: '',
        state: '',
        error: '',
        errorDescription: '',
      };
    }
  }

  return {
    DEFAULT_OPENAI_OAUTH_AUTHORIZE_URL,
    DEFAULT_OPENAI_OAUTH_CLIENT_ID,
    DEFAULT_OPENAI_OAUTH_REDIRECT_URI,
    DEFAULT_OPENAI_OAUTH_SCOPE,
    createLocalOAuthRuntime,
    parseOAuthCallbackUrl,
    sha256Base64Url,
  };
});
