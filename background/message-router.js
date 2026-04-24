(function attachBackgroundMessageRouter(root, factory) {
  root.MultiPageBackgroundMessageRouter = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundMessageRouterModule() {
  function createMessageRouter(deps = {}) {
    const {
      addLog,
      buildPersistentSettingsPayload,
      broadcastDataUpdate,
      cancelScheduledAutoRun,
      clearAutoRunTimerAlarm,
      clearStopRequest,
      closeLocalhostCallbackTabs,
      closeTabsByUrlPrefix,
      doesStepUseCompletionSignal,
      ensureManualInteractionAllowed,
      executeStep,
      executeStepViaCompletionSignal,
      finalizeStep3Completion,
      flushCommand,
      getPendingAutoRunTimerPlan,
      getSourceLabel,
      getState,
      getStopRequested,
      handleAutoRunLoopUnhandledError,
      invalidateDownstreamAfterStepRestart,
      isAutoRunLockedState,
      isLocalhostOAuthCallbackUrl,
      isStopError,
      launchAutoRunTimerPlan,
      markEmailRegistrationComplete,
      normalizeRunCount,
      AUTO_RUN_TIMER_KIND_SCHEDULED_START,
      notifyStepComplete,
      notifyStepError,
      registerTab,
      requestStop,
      resetState,
      resumeAutoRun,
      scheduleAutoRun,
      setEmailState,
      setEmailStateSilently,
      setPersistentSettings,
      setState,
      setStepStatus,
      skipAutoRunCountdown,
      skipStep,
      startAutoRunLoop,
      testGmailImapConnection,
    } = deps;

    async function handleStepData(step, payload) {
      switch (step) {
        case 2:
          if (payload.email) {
            await setEmailState(payload.email);
          }
          if (payload.skippedPasswordStep) {
            const latestState = await getState();
            const step3Status = latestState.stepStatuses?.[3];
            if (step3Status !== 'running' && step3Status !== 'completed' && step3Status !== 'manual_completed') {
              await setStepStatus(3, 'skipped');
              await addLog('步骤 2：提交邮箱后页面直接进入邮箱验证码页，已自动跳过步骤 3。', 'warn');
            }
          }
          break;
        case 3:
          if (payload.email) await setEmailState(payload.email);
          if (payload.signupVerificationRequestedAt) {
            await setState({ signupVerificationRequestedAt: payload.signupVerificationRequestedAt });
          }
          if (payload.loginVerificationRequestedAt) {
            await setState({ loginVerificationRequestedAt: payload.loginVerificationRequestedAt });
          }
          break;
        case 4:
          await setState({
            lastEmailTimestamp: payload.emailTimestamp || null,
            signupVerificationRequestedAt: null,
          });
          break;
        case 7:
          if (payload.loginVerificationRequestedAt) {
            await setState({ loginVerificationRequestedAt: payload.loginVerificationRequestedAt });
          }
          break;
        case 8:
          await setState({
            lastEmailTimestamp: payload.emailTimestamp || null,
            loginVerificationRequestedAt: null,
          });
          break;
        case 9:
          if (payload.localhostUrl) {
            if (!isLocalhostOAuthCallbackUrl(payload.localhostUrl)) {
              throw new Error('步骤 9 返回了无效的 localhost OAuth 回调地址。');
            }
            await setState({ localhostUrl: payload.localhostUrl });
            broadcastDataUpdate({ localhostUrl: payload.localhostUrl });
          }
          break;
        case 10: {
          if (payload.localhostUrl) {
            await closeLocalhostCallbackTabs(payload.localhostUrl);
          }
          const localhostPrefix = deps.buildLocalhostCleanupPrefix?.(payload.localhostUrl);
          if (localhostPrefix) {
            await closeTabsByUrlPrefix(localhostPrefix, {
              excludeUrls: [payload.localhostUrl],
              excludeLocalhostCallbacks: true,
            });
          }
          if (payload.verifiedStatus === 'uploaded' && typeof markEmailRegistrationComplete === 'function') {
            const completedEmail = String(payload.accountEmail || '').trim().toLowerCase()
              || String((await getState())?.email || '').trim().toLowerCase();
            if (completedEmail) {
              await markEmailRegistrationComplete(completedEmail);
            }
          }
          break;
        }
        default:
          break;
      }
    }

    async function handleMessage(message, sender) {
      switch (message.type) {
        case 'CONTENT_SCRIPT_READY': {
          const tabId = sender.tab?.id;
          if (tabId && message.source) {
            await registerTab(message.source, tabId);
            flushCommand(message.source, tabId);
            await addLog(`内容脚本已就绪：${getSourceLabel(message.source)}（标签页 ${tabId}）`);
          }
          return { ok: true };
        }

        case 'LOG': {
          const { message: msg, level } = message.payload;
          await addLog(`[${getSourceLabel(message.source)}] ${msg}`, level);
          return { ok: true };
        }

        case 'STEP_COMPLETE': {
          if (getStopRequested()) {
            await setStepStatus(message.step, 'stopped');
            notifyStepError(message.step, '流程已被用户停止。');
            return { ok: true };
          }

          if (message.step === 3 && typeof finalizeStep3Completion === 'function') {
            await finalizeStep3Completion(message.payload || {});
          }

          await setStepStatus(message.step, 'completed');
          await addLog(`步骤 ${message.step} 已完成`, 'ok');
          await handleStepData(message.step, message.payload || {});
          notifyStepComplete(message.step, message.payload);
          return { ok: true };
        }

        case 'STEP_ERROR': {
          if (isStopError(message.error)) {
            await setStepStatus(message.step, 'stopped');
            await addLog(`步骤 ${message.step} 已被用户停止`, 'warn');
            notifyStepError(message.step, message.error);
          } else {
            await setStepStatus(message.step, 'failed');
            await addLog(`步骤 ${message.step} 失败：${message.error}`, 'error');
            notifyStepError(message.step, message.error);
          }
          return { ok: true };
        }

        case 'GET_STATE':
          return await getState();

        case 'RESET': {
          clearStopRequest();
          await clearAutoRunTimerAlarm();
          await resetState();
          await addLog('流程已重置', 'info');
          return { ok: true };
        }

        case 'EXECUTE_STEP': {
          clearStopRequest();
          if (message.source === 'sidepanel') {
            await ensureManualInteractionAllowed('手动执行步骤');
          }
          const step = message.payload.step;
          if (message.source === 'sidepanel') {
            await invalidateDownstreamAfterStepRestart(step, { logLabel: `步骤 ${step} 重新执行` });
          }
          if (message.payload.email) {
            await setEmailState(message.payload.email);
          }
          if (doesStepUseCompletionSignal(step)) {
            await executeStepViaCompletionSignal(step);
          } else {
            await executeStep(step);
          }
          return { ok: true };
        }

        case 'AUTO_RUN': {
          clearStopRequest();
          const state = await getState();
          if (getPendingAutoRunTimerPlan(state)) {
            throw new Error('已有自动运行倒计时计划，请先取消或立即开始。');
          }
          const totalRuns = normalizeRunCount(message.payload?.totalRuns || 1);
          const autoRunSkipFailures = Boolean(message.payload?.autoRunSkipFailures);
          const mode = message.payload?.mode === 'continue' ? 'continue' : 'restart';
          await setState({ autoRunSkipFailures });
          startAutoRunLoop(totalRuns, { autoRunSkipFailures, mode });
          return { ok: true };
        }

        case 'SCHEDULE_AUTO_RUN': {
          clearStopRequest();
          const totalRuns = normalizeRunCount(message.payload?.totalRuns || 1);
          return await scheduleAutoRun(totalRuns, {
            delayMinutes: message.payload?.delayMinutes,
            autoRunSkipFailures: Boolean(message.payload?.autoRunSkipFailures),
            mode: message.payload?.mode,
          });
        }

        case 'START_SCHEDULED_AUTO_RUN_NOW': {
          clearStopRequest();
          const started = await launchAutoRunTimerPlan('manual', {
            expectedKinds: [AUTO_RUN_TIMER_KIND_SCHEDULED_START],
          });
          if (!started) {
            throw new Error('当前没有可立即开始的倒计时计划。');
          }
          return { ok: true };
        }

        case 'CANCEL_SCHEDULED_AUTO_RUN': {
          const cancelled = await cancelScheduledAutoRun();
          if (!cancelled) {
            throw new Error('当前没有可取消的倒计时计划。');
          }
          return { ok: true };
        }

        case 'SKIP_AUTO_RUN_COUNTDOWN': {
          clearStopRequest();
          const skipped = await skipAutoRunCountdown();
          if (!skipped) {
            throw new Error('当前没有可立即开始的倒计时。');
          }
          return { ok: true };
        }

        case 'RESUME_AUTO_RUN': {
          clearStopRequest();
          if (message.payload.email) {
            await setEmailState(message.payload.email);
          }
          resumeAutoRun().catch((error) => {
            handleAutoRunLoopUnhandledError(error).catch(() => {});
          });
          return { ok: true };
        }

        case 'TAKEOVER_AUTO_RUN': {
          await requestStop({ logMessage: '已确认手动接管，正在停止自动流程并切换为手动控制...' });
          await addLog('自动流程已切换为手动控制。', 'warn');
          return { ok: true };
        }

        case 'SKIP_STEP': {
          const step = Number(message.payload?.step);
          return await skipStep(step);
        }

        case 'SAVE_SETTING': {
          const payload = message.payload || {};
          const updates = buildPersistentSettingsPayload(payload);
          await setPersistentSettings(updates);
          await setState(updates);
          return { ok: true, state: await getState() };
        }

        case 'SET_OWNER_WINDOW': {
          const windowId = Number(message.payload?.windowId);
          if (!Number.isInteger(windowId) || windowId < 0) {
            throw new Error('无效的窗口 ID，无法锁定当前侧边栏窗口。');
          }
          await setState({ ownerWindowId: windowId });
          return { ok: true, windowId };
        }

        case 'TEST_GMAIL_IMAP_CONNECTION': {
          if (typeof testGmailImapConnection !== 'function') {
            throw new Error('当前未启用 Gmail IMAP 后台测试能力。');
          }
          return {
            ok: true,
            result: await testGmailImapConnection(message.payload || {}),
          };
        }

        case 'SET_EMAIL_STATE': {
          const state = await getState();
          if (isAutoRunLockedState(state)) {
            throw new Error('自动流程运行中，当前不能手动修改邮箱。');
          }
          const email = String(message.payload?.email || '').trim() || null;
          await setEmailStateSilently(email);
          return { ok: true, email };
        }

        case 'SAVE_EMAIL': {
          const state = await getState();
          if (isAutoRunLockedState(state)) {
            throw new Error('自动流程运行中，当前不能手动修改邮箱。');
          }
          await setEmailState(message.payload.email);
          await resumeAutoRun();
          return { ok: true, email: message.payload.email };
        }

        case 'STOP_FLOW': {
          await requestStop();
          return { ok: true };
        }

        default:
          console.warn('Unknown message type:', message.type);
          return { error: `Unknown message type: ${message.type}` };
      }
    }

    return {
      handleMessage,
      handleStepData,
    };
  }

  return {
    createMessageRouter,
  };
});
