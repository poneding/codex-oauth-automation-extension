(function attachBackgroundCustomEmailPool(root, factory) {
  root.MultiPageBackgroundCustomEmailPool = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundCustomEmailPoolModule() {
  function normalizeCustomEmailEntry(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
      return '';
    }
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
  }

  function normalizeCustomEmailList(value) {
    const source = Array.isArray(value)
      ? value
      : String(value || '')
        .split(/[\r\n,;]+/);

    const deduped = new Set();
    source.forEach((item) => {
      const normalized = normalizeCustomEmailEntry(item);
      if (normalized) {
        deduped.add(normalized);
      }
    });

    return [...deduped];
  }

  function normalizeCustomEmailUsedMap(value, emailList = []) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    const normalizedList = normalizeCustomEmailList(emailList);
    const allowedEmails = normalizedList.length ? new Set(normalizedList) : null;
    const normalized = {};

    Object.entries(value).forEach(([key, used]) => {
      if (!used) {
        return;
      }
      const normalizedEmail = normalizeCustomEmailEntry(key);
      if (!normalizedEmail) {
        return;
      }
      if (allowedEmails && !allowedEmails.has(normalizedEmail)) {
        return;
      }
      normalized[normalizedEmail] = true;
    });

    return normalized;
  }

  function normalizeRegisteredEmailList(value) {
    const source = Array.isArray(value)
      ? value
      : String(value || '').split(/[\r\n,;]+/);

    const deduped = new Set();
    source.forEach((item) => {
      const normalized = normalizeCustomEmailEntry(item);
      if (normalized) {
        deduped.add(normalized);
      }
    });

    return [...deduped];
  }

  function getCustomEmailPoolStats(emailList = [], usedMap = {}) {
    const normalizedList = normalizeCustomEmailList(emailList);
    const normalizedUsedMap = normalizeCustomEmailUsedMap(usedMap, normalizedList);
    const total = normalizedList.length;
    const used = normalizedList.filter((email) => normalizedUsedMap[email]).length;
    return {
      total,
      used,
      remaining: Math.max(0, total - used),
      nextEmail: normalizedList.find((email) => !normalizedUsedMap[email]) || '',
    };
  }

  function pickNextCustomEmail(emailList = [], usedMap = {}, options = {}) {
    const normalizedList = normalizeCustomEmailList(emailList);
    const normalizedUsedMap = normalizeCustomEmailUsedMap(usedMap, normalizedList);
    const normalizedCurrentEmail = normalizeCustomEmailEntry(options.currentEmail || '');
    const reuseCurrentEmail = options.reuseCurrentEmail !== false;

    if (reuseCurrentEmail && normalizedCurrentEmail) {
      return normalizedCurrentEmail;
    }

    return normalizedList.find((email) => !normalizedUsedMap[email]) || '';
  }

  function createCustomEmailPool(deps = {}) {
    const {
      broadcastDataUpdate,
      getState,
      setPersistentSettings,
      setState,
    } = deps;

    async function setCustomEmailUsedState(email, used, stateOverride = null) {
      const normalizedEmail = normalizeCustomEmailEntry(email);
      if (!normalizedEmail) {
        throw new Error('自定义邮箱地址无效。');
      }

      const state = stateOverride || await getState();
      const emailList = normalizeCustomEmailList(state?.customEmailList);
      const usedMap = normalizeCustomEmailUsedMap(state?.customEmailUsedMap, emailList);
      if (!emailList.includes(normalizedEmail)) {
        throw new Error(`自定义邮箱 ${normalizedEmail} 不在当前列表中。`);
      }

      const nextUsedMap = { ...usedMap };
      if (used) {
        nextUsedMap[normalizedEmail] = true;
      } else {
        delete nextUsedMap[normalizedEmail];
      }

      await setPersistentSettings({ customEmailUsedMap: nextUsedMap });
      await setState({ customEmailUsedMap: nextUsedMap });
      broadcastDataUpdate?.({ customEmailUsedMap: nextUsedMap });

      return {
        email: normalizedEmail,
        used: Boolean(used),
        customEmailUsedMap: nextUsedMap,
      };
    }

    async function allocateNextCustomEmail(stateOverride = null, options = {}) {
      const {
        markUsed = true,
        reuseCurrentEmail = true,
      } = options;
      const state = stateOverride || await getState();
      const emailList = normalizeCustomEmailList(state?.customEmailList);
      const usedMap = normalizeCustomEmailUsedMap(state?.customEmailUsedMap, emailList);
      const email = pickNextCustomEmail(emailList, usedMap, {
        currentEmail: state?.email,
        reuseCurrentEmail,
      });

      if (!email) {
        return '';
      }

      if (markUsed && emailList.includes(email) && !usedMap[email]) {
        await setCustomEmailUsedState(email, true, state);
      }

      return email;
    }

    async function markEmailRegistrationComplete(email, stateOverride = null) {
      const normalizedEmail = normalizeCustomEmailEntry(email);
      if (!normalizedEmail) {
        throw new Error('已注册邮箱地址无效。');
      }

      const state = stateOverride || await getState();
      const emailList = normalizeCustomEmailList(state?.customEmailList);
      const usedMap = normalizeCustomEmailUsedMap(state?.customEmailUsedMap, emailList);
      const registeredList = normalizeRegisteredEmailList(state?.registeredEmailList);
      const nextEmailList = emailList.filter((item) => item !== normalizedEmail);
      const nextUsedMap = { ...usedMap };
      delete nextUsedMap[normalizedEmail];
      const nextRegisteredList = normalizeRegisteredEmailList([...registeredList, normalizedEmail]);
      const persistedUpdates = {
        customEmailList: nextEmailList,
        customEmailUsedMap: normalizeCustomEmailUsedMap(nextUsedMap, nextEmailList),
        registeredEmailList: nextRegisteredList,
      };
      const sessionUpdates = {
        ...persistedUpdates,
        email: normalizeCustomEmailEntry(state?.email) === normalizedEmail ? null : (state?.email || null),
      };

      await setPersistentSettings(persistedUpdates);
      await setState(sessionUpdates);
      broadcastDataUpdate?.(sessionUpdates);

      return {
        email: normalizedEmail,
        ...sessionUpdates,
      };
    }

    return {
      allocateNextCustomEmail,
      markEmailRegistrationComplete,
      setCustomEmailUsedState,
    };
  }

  return {
    createCustomEmailPool,
    getCustomEmailPoolStats,
    normalizeCustomEmailEntry,
    normalizeCustomEmailList,
    normalizeCustomEmailUsedMap,
    normalizeRegisteredEmailList,
    pickNextCustomEmail,
  };
});
