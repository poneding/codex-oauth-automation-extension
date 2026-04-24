(function attachBackgroundStep4(root, factory) {
  root.MultiPageBackgroundStep4 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep4Module() {
  function createStep4Executor(deps = {}) {
    const {
      addLog,
      chrome,
      completeStepFromBackground,
      ensureContentScriptReadyOnTab,
      getMailConfig,
      getTabId,
      isTabAlive,
      resolveVerificationStep,
      reuseOrCreateTab,
      sendToContentScriptResilient,
      STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS,
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

    async function executeStep4(state) {
      const mail = getMailConfig(state);
      if (mail.error) throw new Error(mail.error);
      const usesBackgroundMailbox = mail?.source === 'gmail-imap';
      const stepStartedAt = Date.now();
      const fixedTargetEmail = state.mailProvider === 'custom'
        ? String(state.email || '').trim().toLowerCase()
        : '';
      const signupTabId = await getTabId('signup-page');
      if (!signupTabId) {
        throw new Error('认证页面标签页已关闭，无法继续步骤 4。');
      }

      await chrome.tabs.update(signupTabId, { active: true });
      throwIfStopped();
      await addLog('步骤 4：正在确认注册验证码页面是否就绪，必要时自动恢复密码页超时报错...');
      const prepareResult = await sendToContentScriptResilient(
        'signup-page',
        {
          type: 'PREPARE_SIGNUP_VERIFICATION',
          step: 4,
          source: 'background',
          payload: {
            password: state.password || state.customPassword || '',
            prepareSource: 'step4_execute',
            prepareLogLabel: '步骤 4 执行',
          },
        },
        {
          timeoutMs: 30000,
          retryDelayMs: 700,
          logMessage: '步骤 4：认证页正在切换，等待页面重新就绪后继续检测...',
        }
      );

      if (prepareResult && prepareResult.error) {
        throw new Error(prepareResult.error);
      }
      if (prepareResult?.alreadyVerified) {
        await completeStepFromBackground(4, {});
        return;
      }

      throwIfStopped();
      if (state.mailProvider === 'custom') {
        await addLog(`步骤 4：当前为自定义邮箱模式，注册邮箱 ${state.email || '未设置'} 将通过 ${mail.label} 自动收取转发验证码。`, 'info');
      }
      if (usesBackgroundMailbox) {
        await addLog(`步骤 4：正在通过 ${mail.label} 后台获取注册验证码...`);
      } else {
        await addLog(`步骤 4：正在打开${mail.label}...`);

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

        await ensureMailTabReady(mail, mailTabId, 4);
      }

      await resolveVerificationStep(4, state, mail, {
        filterAfterTimestamp: stepStartedAt,
        gmailPollIntervalMs: 30000,
        nativeHostPollIntervalSeconds: 1,
        requestFreshCodeFirst: false,
        targetEmail: fixedTargetEmail,
        resendIntervalMs: STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS,
      });

      const latestSignupTabId = await getTabId('signup-page');
      if (latestSignupTabId) {
        await chrome.tabs.update(latestSignupTabId, { active: true });
        await addLog('步骤 4：验证码已提交，已切回认证页继续注册流程。', 'info');
      }
    }

    return { executeStep4 };
  }

  return { createStep4Executor };
});
