(function attachBackgroundStep8(root, factory) {
  root.MultiPageBackgroundStep8 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep8Module() {
  function createStep8Executor(deps = {}) {
    const {
      addLog,
      chrome,
      ensureContentScriptReadyOnTab,
      ensureStep8VerificationPageReady,
      executeStep7,
      getOAuthFlowRemainingMs,
      getOAuthFlowStepTimeoutMs,
      getMailConfig,
      getState,
      getTabId,
      isTabAlive,
      isVerificationMailPollingError,
      resolveVerificationStep,
      reuseOrCreateTab,
      setState,
      setStepStatus,
      sleepWithStop,
      STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS,
      STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS,
      throwIfStopped,
    } = deps;

    async function ensureMailTabReady(mail, tabId, step) {
      if (typeof ensureContentScriptReadyOnTab !== 'function') {
        return;
      }
      if (!Number.isInteger(tabId) || !Array.isArray(mail?.inject) || !mail.inject.length) {
        return;
      }

      await ensureContentScriptReadyOnTab(mail.source, tabId, {
        inject: mail.inject,
        injectSource: mail.injectSource,
        timeoutMs: 30000,
        retryDelayMs: 700,
        logMessage: `步骤 ${step}：${mail.label} 页面正在加载，等待邮箱页就绪后开始轮询...`,
      });
    }

    async function getStep8ReadyTimeoutMs(actionLabel) {
      if (typeof getOAuthFlowStepTimeoutMs !== 'function') {
        return 15000;
      }

      return getOAuthFlowStepTimeoutMs(15000, {
        step: 8,
        actionLabel,
      });
    }

    function getStep8RemainingTimeResolver() {
      if (typeof getOAuthFlowRemainingMs !== 'function') {
        return undefined;
      }

      return async (details = {}) => getOAuthFlowRemainingMs({
        step: 8,
        actionLabel: details.actionLabel || '登录验证码流程',
      });
    }

    function normalizeStep8VerificationTargetEmail(value) {
      return String(value || '').trim().toLowerCase();
    }

    async function runStep8Attempt(state) {
      const mail = getMailConfig(state);
      if (mail.error) throw new Error(mail.error);
      const usesBackgroundMailbox = mail?.source === 'gmail-imap';

      const stepStartedAt = Date.now();
      const authTabId = await getTabId('signup-page');

      if (authTabId) {
        await chrome.tabs.update(authTabId, { active: true });
      } else {
        if (!state.oauthUrl) {
          throw new Error('缺少登录用 OAuth 链接，请先完成步骤 7。');
        }
        await reuseOrCreateTab('signup-page', state.oauthUrl);
      }

      throwIfStopped();
      const pageState = await ensureStep8VerificationPageReady({
        timeoutMs: await getStep8ReadyTimeoutMs('确认登录验证码页已就绪'),
      });
      const displayedVerificationEmail = normalizeStep8VerificationTargetEmail(pageState?.displayedEmail);
      const fixedTargetEmail = displayedVerificationEmail || normalizeStep8VerificationTargetEmail(state?.email);

      await setState({
        step8VerificationTargetEmail: displayedVerificationEmail || '',
      });

      await addLog('步骤 8：登录验证码页面已就绪，开始获取验证码。', 'info');
      if (displayedVerificationEmail) {
        await addLog(`步骤 8：已固定当前验证码页显示邮箱 ${displayedVerificationEmail} 作为后续匹配目标。`, 'info');
      }
      if (state.mailProvider === 'custom') {
        await addLog(
          `步骤 8：当前为自定义邮箱模式，将通过 ${mail.label} 自动匹配登录验证码。注册邮箱：${state.email || '未设置'}；目标邮箱：${fixedTargetEmail || '未识别到页面显示邮箱'}。`,
          'info'
        );
      }

      throwIfStopped();
      if (usesBackgroundMailbox) {
        await addLog(`步骤 8：正在通过 ${mail.label} 后台获取登录验证码...`);
      } else {
        await addLog(`步骤 8：正在打开${mail.label}...`);

        let mailTabId = null;
        const alive = await isTabAlive(mail.source);
        if (alive) {
          if (mail.navigateOnReuse) {
            mailTabId = await reuseOrCreateTab(mail.source, mail.url, {
              inject: mail.inject,
              injectSource: mail.injectSource,
            });
          } else {
            mailTabId = await getTabId(mail.source);
            await chrome.tabs.update(mailTabId, { active: true });
          }
        } else {
          mailTabId = await reuseOrCreateTab(mail.source, mail.url, {
            inject: mail.inject,
            injectSource: mail.injectSource,
          });
        }

        await ensureMailTabReady(mail, mailTabId, 8);
      }

      await resolveVerificationStep(8, {
        ...state,
        step8VerificationTargetEmail: displayedVerificationEmail || '',
      }, mail, {
        filterAfterTimestamp: stepStartedAt,
        gmailPollIntervalMs: 30000,
        nativeHostPollIntervalSeconds: 1,
        getRemainingTimeMs: getStep8RemainingTimeResolver(),
        requestFreshCodeFirst: false,
        targetEmail: fixedTargetEmail,
        resendIntervalMs: STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS,
      });

      const latestAuthTabId = await getTabId('signup-page');
      if (latestAuthTabId) {
        await chrome.tabs.update(latestAuthTabId, { active: true });
        await addLog('步骤 8：验证码已提交，已切回认证页继续后续授权。', 'info');
      }
    }

    async function rerunStep7ForStep8Recovery(options = {}) {
      const {
        logMessage = '步骤 8：正在回到步骤 7，重新发起登录验证码流程...',
        postStepDelayMs = 3000,
      } = options;
      const currentState = await getState();
      await addLog(logMessage, 'warn');
      await executeStep7(currentState);
      if (postStepDelayMs > 0) {
        await sleepWithStop(postStepDelayMs);
      }
    }

    function isStep8RestartStep7Error(error) {
      const message = String(error?.message || error || '');
      return /STEP8_RESTART_STEP7::/i.test(message);
    }

    async function executeStep8(state) {
      let currentState = state;
      let mailPollingAttempt = 1;
      let lastMailPollingError = null;

      while (true) {
        try {
          await runStep8Attempt(currentState);
          return;
        } catch (err) {
          if (!isVerificationMailPollingError(err) && !isStep8RestartStep7Error(err)) {
            throw err;
          }

          lastMailPollingError = err;
          if (mailPollingAttempt >= STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS) {
            break;
          }

          mailPollingAttempt += 1;
          await addLog(
            isStep8RestartStep7Error(err)
              ? `步骤 8：检测到认证页进入重试/超时报错状态，准备从步骤 7 重新开始（${mailPollingAttempt}/${STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS}）...`
              : `步骤 8：检测到邮箱轮询类失败，准备从步骤 7 重新开始（${mailPollingAttempt}/${STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS}）...`,
            'warn'
          );
          await rerunStep7ForStep8Recovery({
            logMessage: isStep8RestartStep7Error(err)
              ? '步骤 8：认证页进入重试/超时报错状态，正在回到步骤 7 重新发起登录流程...'
              : '步骤 8：正在回到步骤 7，重新发起登录验证码流程...',
          });
          currentState = await getState();
        }
      }

      if (lastMailPollingError) {
        throw new Error(
          `步骤 8：登录验证码流程在 ${STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS} 轮邮箱轮询恢复后仍未成功。最后一次原因：${lastMailPollingError.message}`
        );
      }

      throw new Error('步骤 8：登录验证码流程未成功完成。');
    }

    return { executeStep8 };
  }

  return { createStep8Executor };
});
