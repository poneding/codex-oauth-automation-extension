(function attachBackgroundVerificationFlow(root, factory) {
  root.MultiPageBackgroundVerificationFlow = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundVerificationFlowModule() {
  function createVerificationFlowHelpers(deps = {}) {
    const {
      addLog,
      callNativeHost,
      chrome,
      completeStepFromBackground,
      confirmCustomVerificationStepBypassRequest,
      getState,
      getTabId,
      isStopError,
      recoverVerificationSubmitResult = async () => null,
      sendToContentScript,
      sendToMailContentScriptResilient,
      setState,
      sleepWithStop,
      throwIfStopped,
      VERIFICATION_POLL_MAX_ROUNDS,
    } = deps;

    function getVerificationCodeStateKey(step) {
      return step === 4 ? 'lastSignupCode' : 'lastLoginCode';
    }

    function getVerificationCodeLabel(step) {
      return step === 4 ? '注册' : '登录';
    }

    function normalizeVerificationResendCount(value, fallback = 0) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return Math.max(0, Math.floor(Number(fallback) || 0));
      }
      return Math.min(20, Math.max(0, Math.floor(numeric)));
    }

    function normalizeNativeHostPollIntervalSeconds(value, fallback = 1) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return Math.min(10, Math.max(1, Math.floor(Number(fallback) || 1)));
      }
      return Math.min(10, Math.max(1, Math.floor(numeric)));
    }

    function getConfiguredVerificationResendCount(state) {
      return normalizeVerificationResendCount(state?.verificationResendCount, Math.max(0, Math.floor(Number(VERIFICATION_POLL_MAX_ROUNDS) || 1) - 1));
    }

    function isGmailMailConfig(mail) {
      return mail?.source === 'gmail-mail';
    }

    function isGmailImapConfig(mail) {
      return mail?.source === 'gmail-imap';
    }

    function tagRoundScopedVerificationFailure(error) {
      if (error && typeof error === 'object') {
        error.verificationFlowFailure = true;
        error.roundScopedFailure = true;
      }
      return error;
    }

    async function logNativeHostDiagnostics(step, diagnostics = []) {
      if (!Array.isArray(diagnostics) || !diagnostics.length) {
        return;
      }

      for (const entry of diagnostics) {
        const message = typeof entry === 'string'
          ? String(entry).trim()
          : String(entry?.message || '').trim();
        if (!message) {
          continue;
        }

        const level = typeof entry === 'string'
          ? 'info'
          : String(entry?.level || 'info').trim().toLowerCase() || 'info';
        await addLog(`步骤 ${step}：[Gmail IMAP] ${message}`, level);
      }
    }

    async function resolveVerificationRemainingTimeMs(step, pollOverrides = {}, actionLabel = '') {
      if (step !== 8 || typeof pollOverrides.getRemainingTimeMs !== 'function') {
        return null;
      }

      const remainingMs = await pollOverrides.getRemainingTimeMs({
        step,
        actionLabel: actionLabel || '登录验证码流程',
      });
      const numeric = Number(remainingMs);
      if (!Number.isFinite(numeric)) {
        return null;
      }
      return Math.max(0, Math.floor(numeric));
    }

    function buildStep8RestartStep7Error(actionLabel, remainingMs) {
      const remainingSeconds = Math.max(0, Math.ceil(Math.max(0, Number(remainingMs) || 0) / 1000));
      const remainingLabel = Number.isFinite(remainingSeconds) ? ` 剩余时间：${remainingSeconds} 秒。` : '';
      return new Error(`STEP8_RESTART_STEP7::步骤 8：${actionLabel || '登录验证码流程'}剩余时间不足，请回到步骤 7 重新开始。${remainingLabel}`.trim());
    }

    async function ensureVerificationWindowAvailable(step, pollOverrides = {}, options = {}) {
      const {
        actionLabel = '登录验证码流程',
        minimumMs = 0,
      } = options;
      const remainingMs = await resolveVerificationRemainingTimeMs(step, pollOverrides, actionLabel);
      if (remainingMs === null) {
        return null;
      }
      if (remainingMs <= Math.max(0, Number(minimumMs) || 0)) {
        throw buildStep8RestartStep7Error(actionLabel, remainingMs);
      }
      return remainingMs;
    }

    function getVerificationPollPayload(step, state, overrides = {}) {
      const maxAttempts = Math.max(1, Math.floor(Number(overrides.maxAttempts) || 5));
      const intervalMs = Math.max(1000, Math.floor(Number(overrides.intervalMs) || 10000));
      const fallbackToExistingAfterAttempts = overrides.fallbackToExistingAfterAttempts === undefined
        ? undefined
        : Math.max(0, Math.floor(Number(overrides.fallbackToExistingAfterAttempts) || 0));
      const maxMatchingRows = overrides.maxMatchingRows === undefined
        ? undefined
        : Math.max(1, Math.floor(Number(overrides.maxMatchingRows) || 1));

      return {
        filterAfterTimestamp: Number(overrides.filterAfterTimestamp) || 0,
        targetEmail: overrides.targetEmail || '',
        senderFilters: Array.isArray(overrides.senderFilters) && overrides.senderFilters.length
          ? overrides.senderFilters
          : ['openai', 'noreply', 'verify', 'auth', 'chatgpt', 'forward'],
        subjectFilters: Array.isArray(overrides.subjectFilters) && overrides.subjectFilters.length
          ? overrides.subjectFilters
          : ['verify', 'verification', 'code', '验证码', 'confirm', 'login'],
        excludeCodes: Array.isArray(overrides.excludeCodes) ? overrides.excludeCodes.filter(Boolean) : [],
        mailboxSection: String(overrides.mailboxSection || 'inbox').trim().toLowerCase() === 'spam' ? 'spam' : 'inbox',
        maxAttempts,
        intervalMs,
        forceOpenMessage: Boolean(overrides.forceOpenMessage),
        refreshBeforeStart: Boolean(overrides.refreshBeforeStart),
        refreshEachAttempt: overrides.refreshEachAttempt === undefined ? true : Boolean(overrides.refreshEachAttempt),
        allowExistingMatching: Boolean(overrides.allowExistingMatching),
        ignoreTimeFilter: Boolean(overrides.ignoreTimeFilter),
        ...(fallbackToExistingAfterAttempts === undefined ? {} : { fallbackToExistingAfterAttempts }),
        ...(maxMatchingRows === undefined ? {} : { maxMatchingRows }),
      };
    }

    async function executeMailContentScriptPoll(step, mail, payload, options = {}) {
      const result = await sendToMailContentScriptResilient(
        mail,
        {
          type: 'POLL_EMAIL',
          step,
          source: 'background',
          payload,
        },
        {
          timeoutMs: options.timeoutMs ?? 45000,
          maxRecoveryAttempts: options.maxRecoveryAttempts ?? 2,
          responseTimeoutMs: options.responseTimeoutMs ?? 45000,
        }
      );

      if (result?.error) {
        throw new Error(result.error);
      }
      if (!result?.code) {
        throw new Error(`步骤 ${step}：邮箱轮询结束，但未获取到验证码。`);
      }

      return result;
    }

    async function pollFreshVerificationCodeFromGmail(step, state, mail, rejectedCodes, filterAfterTimestamp, pollOverrides = {}) {
      const pollAttemptsPerPass = Math.max(1, Math.floor(Number(pollOverrides.gmailPollAttemptsPerPass) || 5));
      const pollIntervalMs = Math.max(1000, Math.floor(Number(pollOverrides.gmailPollIntervalMs) || 15000));
      const excludedCodes = [...rejectedCodes];

      const phaseOnePayload = getVerificationPollPayload(step, state, {
        ...pollOverrides,
        excludeCodes: excludedCodes,
        filterAfterTimestamp,
        mailboxSection: 'inbox',
        maxAttempts: pollAttemptsPerPass,
        intervalMs: pollIntervalMs,
        refreshBeforeStart: false,
        refreshEachAttempt: false,
        allowExistingMatching: true,
        fallbackToExistingAfterAttempts: 0,
      });

      try {
        await addLog(`步骤 ${step}：开始 Gmail 轮询 ${pollAttemptsPerPass} 次，每次间隔 ${Math.floor(pollIntervalMs / 1000)} 秒。`, 'info');
        return await executeMailContentScriptPoll(step, mail, phaseOnePayload);
      } catch (error) {
        if (isStopError(error)) {
          throw error;
        }
      }

      const spamPayload = getVerificationPollPayload(step, state, {
        ...pollOverrides,
        excludeCodes: excludedCodes,
        filterAfterTimestamp,
        mailboxSection: 'spam',
        maxAttempts: 1,
        intervalMs: 1000,
        refreshBeforeStart: false,
        refreshEachAttempt: false,
        allowExistingMatching: true,
        fallbackToExistingAfterAttempts: 0,
      });

      try {
        await addLog(`步骤 ${step}：首次轮询未获取到验证码，开始检查 Gmail 垃圾邮件。`, 'warn');
        return await executeMailContentScriptPoll(step, mail, spamPayload);
      } catch (error) {
        if (isStopError(error)) {
          throw error;
        }
      }

      const phaseTwoPayload = getVerificationPollPayload(step, state, {
        ...pollOverrides,
        excludeCodes: excludedCodes,
        filterAfterTimestamp,
        mailboxSection: 'inbox',
        maxAttempts: pollAttemptsPerPass,
        intervalMs: pollIntervalMs,
        refreshBeforeStart: true,
        refreshEachAttempt: false,
        allowExistingMatching: true,
        fallbackToExistingAfterAttempts: 0,
      });

      await addLog(`步骤 ${step}：垃圾邮件中未获取到验证码，返回收件箱开始第二轮 Gmail 轮询 ${pollAttemptsPerPass} 次。`, 'warn');
      return executeMailContentScriptPoll(step, mail, phaseTwoPayload);
    }

    async function pollFinalFallbackVerificationCodeFromGmail(step, state, mail, rejectedCodes, filterAfterTimestamp, pollOverrides = {}) {
      const fallbackPayload = getVerificationPollPayload(step, state, {
        ...pollOverrides,
        excludeCodes: [...rejectedCodes],
        filterAfterTimestamp,
        mailboxSection: 'inbox',
        maxAttempts: 1,
        intervalMs: 1000,
        refreshBeforeStart: false,
        refreshEachAttempt: false,
        allowExistingMatching: true,
        forceOpenMessage: Boolean(pollOverrides.targetEmail),
        ignoreTimeFilter: true,
        fallbackToExistingAfterAttempts: 0,
        maxMatchingRows: 1,
      });

      await addLog(`步骤 ${step}：所有轮询与重发均未获取到验证码，开始检查首封匹配邮件。`, 'warn');
      return executeMailContentScriptPoll(step, mail, fallbackPayload);
    }

    async function confirmCustomVerificationStepBypass(step) {
      const verificationLabel = getVerificationCodeLabel(step);
      await addLog(`步骤 ${step}：当前为自定义邮箱模式，请手动在页面中输入${verificationLabel}验证码并进入下一页面。`, 'warn');

      let response = null;
      try {
        response = await confirmCustomVerificationStepBypassRequest(step);
      } catch {
        throw new Error(`步骤 ${step}：无法打开确认弹窗，请先保持侧边栏打开后重试。`);
      }

      if (response?.error) {
        throw new Error(response.error);
      }
      if (!response?.confirmed) {
        throw new Error(`步骤 ${step}：已取消手动${verificationLabel}验证码确认。`);
      }

      await setState({
        lastEmailTimestamp: null,
        signupVerificationRequestedAt: null,
        loginVerificationRequestedAt: null,
      });
      await deps.setStepStatus(step, 'skipped');
      await addLog(`步骤 ${step}：已确认手动完成${verificationLabel}验证码输入，当前步骤已跳过。`, 'warn');
    }

    async function requestVerificationCodeResend(step) {
      throwIfStopped();
      const signupTabId = await getTabId('signup-page');
      if (!signupTabId) {
        throw new Error('认证页面标签页已关闭，无法重新请求验证码。');
      }

      await chrome.tabs.update(signupTabId, { active: true });
      const result = await sendToContentScript('signup-page', {
        type: 'RESEND_VERIFICATION_CODE',
        step,
        source: 'background',
        payload: {},
      }, {
        responseTimeoutMs: 30000,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      await addLog(`步骤 ${step}：已请求新的${getVerificationCodeLabel(step)}验证码。`, 'warn');

      const requestedAt = Date.now();
      if (step === 4) {
        await setState({ signupVerificationRequestedAt: requestedAt });
      }
      if (step === 8) {
        await setState({ loginVerificationRequestedAt: requestedAt });
      }
      return requestedAt;
    }

    async function pollFreshVerificationCode(step, state, mail, pollOverrides = {}) {
      const stateKey = getVerificationCodeStateKey(step);
      const rejectedCodes = new Set();
      if (state[stateKey]) {
        rejectedCodes.add(state[stateKey]);
      }
      for (const code of (pollOverrides.excludeCodes || [])) {
        if (code) rejectedCodes.add(code);
      }

      const filterAfterTimestamp = Number(pollOverrides.filterAfterTimestamp) || 0;
      let result = null;
      if (isGmailMailConfig(mail)) {
        result = await pollFreshVerificationCodeFromGmail(step, state, mail, rejectedCodes, filterAfterTimestamp, pollOverrides);
      } else if (isGmailImapConfig(mail)) {
        if (typeof callNativeHost !== 'function') {
          throw new Error(`步骤 ${step}：当前未启用 Native Host，无法通过 Gmail IMAP 获取验证码。`);
        }
        const bridgeTimeoutMs = Math.max(30000, Math.floor(Number(pollOverrides?.nativeHostTimeoutMs) || 90000));
        const nativeHostWaitTimeoutMs = Math.max(15000, bridgeTimeoutMs - 10000);
        result = await callNativeHost('gmail.waitForVerificationCode', {
          step,
          gmailImapEmail: String(state?.gmailImapEmail || '').trim(),
          gmailImapAppPassword: String(state?.gmailImapAppPassword || ''),
          gmailImapHost: String(state?.gmailImapHost || 'imap.gmail.com').trim() || 'imap.gmail.com',
          gmailImapPort: Math.max(1, Math.floor(Number(state?.gmailImapPort) || 993)),
          timeoutMs: nativeHostWaitTimeoutMs,
          pollIntervalSeconds: normalizeNativeHostPollIntervalSeconds(pollOverrides?.nativeHostPollIntervalSeconds, 1),
          filterAfterTimestamp,
          targetEmail: String(pollOverrides?.targetEmail || '').trim().toLowerCase(),
          excludeCodes: [...rejectedCodes],
          senderFilters: Array.isArray(pollOverrides?.senderFilters) ? pollOverrides.senderFilters : undefined,
          subjectFilters: Array.isArray(pollOverrides?.subjectFilters) ? pollOverrides.subjectFilters : undefined,
          actionLabel: `${getVerificationCodeLabel(step)}验证码`,
        }, {
          timeoutMs: bridgeTimeoutMs,
        });
        await logNativeHostDiagnostics(step, result?.diagnostics);
        if (result?.error) {
          throw new Error(String(result.error));
        }
      } else {
        result = await executeMailContentScriptPoll(
          step,
          mail,
          getVerificationPollPayload(step, state, {
            ...pollOverrides,
            excludeCodes: [...rejectedCodes],
            filterAfterTimestamp,
          }),
        );
      }

      if (rejectedCodes.has(result.code)) {
        throw new Error(`步骤 ${step}：再次收到了相同的${getVerificationCodeLabel(step)}验证码：${result.code}`);
      }

      return result;
    }

    async function submitVerificationCode(step, state, code, options = {}) {
      const signupTabId = await getTabId('signup-page');
      if (!signupTabId) {
        throw new Error('认证页面标签页已关闭，无法填写验证码。');
      }

      let response = null;
      try {
        response = await sendToContentScript('signup-page', {
          type: 'SUBMIT_VERIFICATION_CODE',
          step,
          source: 'background',
          payload: {
            code,
            targetEmail: options.targetEmail || '',
          },
        }, {
          responseTimeoutMs: 30000,
        });
      } catch (error) {
        const recoveredResult = await recoverVerificationSubmitResult(step, state, code, error, options);
        if (!recoveredResult?.success) {
          throw error;
        }
        response = recoveredResult;
      }

      if (response?.error) {
        throw new Error(response.error);
      }
      if (response?.invalidCode) {
        const errorText = String(response?.errorText || '提交后仍停留在验证码页面。').trim();
        const error = new Error(`步骤 ${step}：验证码被拒绝：${errorText}`);
        error.invalidCode = true;
        error.submittedCode = code;
        throw error;
      }

      const emailTimestamp = response?.emailTimestamp || Date.now();
      await setState({
        [getVerificationCodeStateKey(step)]: code,
        lastEmailTimestamp: emailTimestamp,
      });
      return {
        ...(response || {}),
        emailTimestamp,
      };
    }

    async function resolveVerificationStep(step, state, mail, options = {}) {
      if (state.mailProvider === 'custom' && mail?.manual) {
        await confirmCustomVerificationStepBypass(step);
        return;
      }

      const stateKey = getVerificationCodeStateKey(step);
      const rejectedCodes = new Set();
      if (state[stateKey]) {
        rejectedCodes.add(state[stateKey]);
      }
      for (const code of (options.excludeCodes || [])) {
        if (code) rejectedCodes.add(code);
      }

      let filterAfterTimestamp = Number(options.filterAfterTimestamp) || 0;
      const maxResendRequests = normalizeVerificationResendCount(
        options.maxResendRequests,
        getConfiguredVerificationResendCount(state)
      );
      const totalAttempts = maxResendRequests + 1;
      const resendIntervalMs = Math.max(0, Number(options.resendIntervalMs) || 0);
      let shouldRequestFreshCode = Boolean(options.requestFreshCodeFirst);
      let lastError = null;

      for (let attempt = 1; attempt <= totalAttempts; attempt++) {
        throwIfStopped();
        await ensureVerificationWindowAvailable(step, options, {
          actionLabel: '登录验证码流程',
        });

        if (shouldRequestFreshCode) {
          await ensureVerificationWindowAvailable(step, options, {
            actionLabel: `重新请求${getVerificationCodeLabel(step)}验证码`,
            minimumMs: resendIntervalMs,
          });
          const requestedAt = await requestVerificationCodeResend(step);
          if (requestedAt > filterAfterTimestamp) {
            filterAfterTimestamp = requestedAt;
          }
          if (resendIntervalMs > 0) {
            await sleepWithStop(resendIntervalMs);
          }
        }

        try {
          const pollResult = await pollFreshVerificationCode(step, state, mail, {
            ...options,
            excludeCodes: [...rejectedCodes],
            filterAfterTimestamp,
            requestFreshCodeFirst: false,
          });
          const submitResult = await submitVerificationCode(step, state, pollResult.code, options);

          await completeStepFromBackground(step, {
            code: pollResult.code,
            emailTimestamp: submitResult?.emailTimestamp || pollResult?.emailTimestamp || Date.now(),
          });
          return;
        } catch (err) {
          if (isStopError(err)) {
            throw err;
          }
          lastError = err;
          if (err?.invalidCode && err?.submittedCode) {
            rejectedCodes.add(String(err.submittedCode));
          }
          await addLog(`步骤 ${step}：${err.message}`, 'warn');
          if (attempt < totalAttempts) {
            shouldRequestFreshCode = true;
            continue;
          }
        }
      }

      if (isGmailMailConfig(mail)) {
        try {
          const pollResult = await pollFinalFallbackVerificationCodeFromGmail(
            step,
            state,
            mail,
            rejectedCodes,
            filterAfterTimestamp,
            options
          );
          const submitResult = await submitVerificationCode(step, state, pollResult.code, options);

          await completeStepFromBackground(step, {
            code: pollResult.code,
            emailTimestamp: submitResult?.emailTimestamp || pollResult?.emailTimestamp || Date.now(),
          });
          return;
        } catch (err) {
          if (isStopError(err)) {
            throw err;
          }
          lastError = err;
          await addLog(`步骤 ${step}：${err.message}`, 'warn');
        }
      }

      throw tagRoundScopedVerificationFailure(lastError || new Error(`步骤 ${step}：无法获取新的${getVerificationCodeLabel(step)}验证码。`));
    }

    return {
      confirmCustomVerificationStepBypass,
      getVerificationPollPayload,
      pollFreshVerificationCode,
      pollFreshVerificationCodeWithResendInterval: pollFreshVerificationCode,
      resolveVerificationStep,
      requestVerificationCodeResend,
      submitVerificationCode,
    };
  }

  return {
    createVerificationFlowHelpers,
  };
});
