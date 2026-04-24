(function activationUtilsModule(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.MultiPageActivationUtils = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createActivationUtils() {
  function normalizeTagName(tagName) {
    return String(tagName || '').trim().toLowerCase();
  }

  function normalizeType(type) {
    return String(type || '').trim().toLowerCase();
  }

  function normalizePathname(pathname) {
    return String(pathname || '').trim().toLowerCase();
  }

  function normalizeActionText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getActivationStrategy(target = {}) {
    const tagName = normalizeTagName(target.tagName);
    const type = normalizeType(target.type);
    const pathname = normalizePathname(target.pathname);
    const actionText = normalizeActionText(
      target.actionText
      || [
        target.textContent,
        target.ariaLabel,
        target.title,
        target.value,
      ].filter(Boolean).join(' ')
    );
    const hasForm = Boolean(target.hasForm);
    const isEmailVerificationRoute = /\/email-verification(?:[/?#]|$)/i.test(pathname);
    const isResendAction = /重新发送|再次发送|重发|resend|send\s+(?:it\s+)?again|send\s+(?:a\s+)?new\s+code|request\s+(?:a\s+)?new\s+code|didn'?t\s+receive/i.test(actionText);
    const isSubmitButton = hasForm
      && (
        (tagName === 'button' && (!type || type === 'submit'))
        || (tagName === 'input' && type === 'submit')
      );

    if (isSubmitButton && isEmailVerificationRoute) {
      if (isResendAction) {
        return { method: 'nonSubmittingClick' };
      }
      return { method: 'requestSubmit' };
    }

    return { method: 'click' };
  }

  function isRecoverableStep9AuthFailure(statusText) {
    const text = String(statusText || '').replace(/\s+/g, ' ').trim();
    if (!text) {
      return false;
    }

    if (/oauth flow is not pending/i.test(text)) {
      return true;
    }

    return /(?:认证失败|回调 URL 提交失败):\s*/i.test(text);
  }

  return {
    getActivationStrategy,
    isRecoverableStep9AuthFailure,
  };
});
