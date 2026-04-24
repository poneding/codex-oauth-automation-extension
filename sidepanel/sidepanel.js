// sidepanel/sidepanel.js — Side Panel logic

const STATUS_ICONS = {
  pending: '',
  running: '',
  completed: '\u2713',  // ✓
  failed: '\u2717',     // ✗
  stopped: '\u25A0',    // ■
  manual_completed: '跳',
  skipped: '跳',
};

function createDomStub(overrides = {}) {
  return {
    value: '',
    checked: false,
    disabled: false,
    hidden: false,
    textContent: '',
    innerHTML: '',
    files: null,
    dataset: {},
    style: { display: 'none' },
    classList: {
      add() { },
      remove() { },
      toggle() { return false; },
      contains() { return false; },
    },
    addEventListener() { },
    removeEventListener() { },
    appendChild() { },
    remove() { },
    click() { },
    focus() { },
    setAttribute() { },
    getAttribute() { return ''; },
    toggleAttribute() { },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return false; },
    ...overrides,
  };
}

function getDomElement(id, overrides) {
  return document.getElementById(id) || createDomStub(overrides);
}

const logArea = document.getElementById('log-area');
const settingsCard = document.getElementById('settings-card');
const displayOauthUrl = document.getElementById('display-oauth-url');
const displayLocalhostUrl = document.getElementById('display-localhost-url');
const displayStatus = document.getElementById('display-status');
const statusBar = document.getElementById('status-bar');
const inputEmail = document.getElementById('input-email');
const btnPendingEmailTab = document.getElementById('btn-pending-email-tab');
const btnRegisteredEmailTab = document.getElementById('btn-registered-email-tab');
const customEmailPanel = document.getElementById('custom-email-panel');
const inputCustomEmailList = document.getElementById('input-custom-email-list');
const customEmailSummary = document.getElementById('custom-email-summary');
const customEmailCurrent = document.getElementById('custom-email-current');
const customEmailNext = document.getElementById('custom-email-next');
const customEmailRemaining = document.getElementById('custom-email-remaining');
const customEmailPreview = document.getElementById('custom-email-preview');
const btnCustomEmailResetProgress = document.getElementById('btn-custom-email-reset-progress');
const inputPassword = document.getElementById('input-password');
const btnToggleVpsUrl = document.getElementById('btn-toggle-vps-url');
const btnToggleVpsPassword = document.getElementById('btn-toggle-vps-password');
const btnToggleGmailImapAppPassword = document.getElementById('btn-toggle-gmail-imap-app-password');
const btnFetchEmail = document.getElementById('btn-fetch-email');
const btnTogglePassword = document.getElementById('btn-toggle-password');
const btnSaveSettings = document.getElementById('btn-save-settings');
const btnStop = document.getElementById('btn-stop');
const btnReset = document.getElementById('btn-reset');
const stepsProgress = document.getElementById('steps-progress');
const btnAutoRun = document.getElementById('btn-auto-run');
const btnAutoContinue = document.getElementById('btn-auto-continue');
const autoContinueBar = document.getElementById('auto-continue-bar');
const autoScheduleBar = document.getElementById('auto-schedule-bar');
const autoScheduleTitle = document.getElementById('auto-schedule-title');
const autoScheduleMeta = document.getElementById('auto-schedule-meta');
const btnAutoRunNow = document.getElementById('btn-auto-run-now');
const btnAutoCancelSchedule = document.getElementById('btn-auto-cancel-schedule');
const btnClearLog = document.getElementById('btn-clear-log');
const rowVpsUrl = document.getElementById('row-vps-url');
const inputVpsUrl = document.getElementById('input-vps-url');
const rowVpsPassword = document.getElementById('row-vps-password');
const inputVpsPassword = document.getElementById('input-vps-password');
const rowLocalCpaStep9Mode = document.getElementById('row-local-cpa-step9-mode');
const localCpaStep9ModeButtons = Array.from(document.querySelectorAll('[data-local-cpa-step9-mode]'));
const selectMailProvider = document.getElementById('select-mail-provider');
const btnMailLogin = document.getElementById('btn-mail-login');
const inputGmailImapEmail = document.getElementById('input-gmail-imap-email');
const inputGmailImapAppPassword = document.getElementById('input-gmail-imap-app-password');
const inputGmailImapHost = document.getElementById('input-gmail-imap-host');
const inputGmailImapPort = document.getElementById('input-gmail-imap-port');
const registeredEmailPanel = document.getElementById('registered-email-panel');
const inputRegisteredEmailList = document.getElementById('input-registered-email-list');
const registeredEmailSummary = document.getElementById('registered-email-summary');
const registeredEmailPreview = document.getElementById('registered-email-preview');
const btnRegisteredEmailClear = document.getElementById('btn-registered-email-clear');
const inputRunCount = document.getElementById('input-run-count');
const inputAutoSkipFailures = document.getElementById('input-auto-skip-failures');
const inputAutoSkipFailuresThreadIntervalMinutes = document.getElementById('input-auto-skip-failures-thread-interval-minutes');
const inputAutoDelayEnabled = document.getElementById('input-auto-delay-enabled');
const inputAutoDelayMinutes = document.getElementById('input-auto-delay-minutes');
const inputAutoStepDelaySeconds = document.getElementById('input-auto-step-delay-seconds');
const inputVerificationResendCount = document.getElementById('input-verification-resend-count');
const autoStartModal = document.getElementById('auto-start-modal');
const autoStartTitle = autoStartModal?.querySelector('.modal-title');
const autoStartMessage = document.getElementById('auto-start-message');
const autoStartAlert = document.getElementById('auto-start-alert');
const modalOptionRow = document.getElementById('modal-option-row');
const modalOptionInput = document.getElementById('modal-option-input');
const modalOptionText = document.getElementById('modal-option-text');
const btnAutoStartClose = document.getElementById('btn-auto-start-close');
const btnAutoStartCancel = document.getElementById('btn-auto-start-cancel');
const btnAutoStartRestart = document.getElementById('btn-auto-start-restart');
const btnAutoStartContinue = document.getElementById('btn-auto-start-continue');
const autoHintText = document.querySelector('.auto-hint');
const stepDefinitions = (window.MultiPageStepDefinitions?.getSteps?.() || []).sort((left, right) => left.order - right.order);
const STEP_IDS = stepDefinitions.map((step) => Number(step.id)).filter(Number.isFinite);
const STEP_DEFAULT_STATUSES = Object.fromEntries(STEP_IDS.map((stepId) => [stepId, 'pending']));
const SKIPPABLE_STEPS = new Set(STEP_IDS);
const stepsList = document.querySelector('.steps-list');
const AUTO_DELAY_MIN_MINUTES = 1;
const AUTO_DELAY_MAX_MINUTES = 1440;
const AUTO_DELAY_DEFAULT_MINUTES = 30;
const AUTO_FALLBACK_THREAD_INTERVAL_MIN_MINUTES = 0;
const AUTO_FALLBACK_THREAD_INTERVAL_MAX_MINUTES = 1440;
const AUTO_FALLBACK_THREAD_INTERVAL_DEFAULT_MINUTES = 0;
const AUTO_RUN_MAX_RETRIES_PER_ROUND = 3;
const AUTO_STEP_DELAY_MIN_SECONDS = 0;
const AUTO_STEP_DELAY_MAX_SECONDS = 600;
const VERIFICATION_RESEND_COUNT_MIN = 0;
const VERIFICATION_RESEND_COUNT_MAX = 20;
const DEFAULT_VERIFICATION_RESEND_COUNT = 4;
const DEFAULT_LOCAL_CPA_STEP9_MODE = 'submit';
const AUTO_SKIP_FAILURES_PROMPT_DISMISSED_STORAGE_KEY = 'multipage-auto-skip-failures-prompt-dismissed';
const AUTO_RUN_FALLBACK_RISK_PROMPT_DISMISSED_STORAGE_KEY = 'multipage-auto-run-fallback-risk-prompt-dismissed';
const AUTO_RUN_FALLBACK_RISK_WARNING_MIN_RUNS = 15;
const AUTO_RUN_FALLBACK_RISK_RECOMMENDED_THREAD_INTERVAL_MINUTES = 5;
const GMAIL_PROVIDER = 'gmail';
const DISPLAY_TIMEZONE = 'Asia/Shanghai';
function validateCurrentRegistrationEmail(email = inputEmail.value.trim(), options = {}) {
  return true;
}

let latestState = null;
let applyCustomEmailState = () => ({ totalCount: 0, usedCount: 0, remainingCount: 0, currentEmail: '', nextEmail: '' });
let getCustomEmailListForSettingsPayload = () => [];
let getCustomEmailListView = () => ({ totalCount: 0, usedCount: 0, remainingCount: 0, currentEmail: '', nextEmail: '' });
let renderCustomEmailState = () => ({ totalCount: 0, usedCount: 0, remainingCount: 0, currentEmail: '', nextEmail: '' });
let applyRegisteredEmailState = () => ({ totalCount: 0, list: [] });
let getRegisteredEmailListForSettingsPayload = () => [];
let renderRegisteredEmailState = () => ({ totalCount: 0, list: [] });
let openScopedExternalUrl = null;
let currentAutoRun = {
  autoRunning: false,
  phase: 'idle',
  currentRun: 0,
  totalRuns: 1,
  attemptRun: 0,
  scheduledAt: null,
  countdownAt: null,
  countdownTitle: '',
  countdownNote: '',
};
let settingsDirty = false;
let settingsSaveInFlight = false;
let settingsAutoSaveTimer = null;
let modalChoiceResolver = null;
let currentModalActions = [];
let modalResultBuilder = null;
let scheduledCountdownTimer = null;

const EYE_OPEN_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_CLOSED_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19C5 19 1 12 1 12a21.77 21.77 0 0 1 5.06-6.94"/><path d="M9.9 4.24A10.94 10.94 0 0 1 12 5c7 0 11 7 11 7a21.86 21.86 0 0 1-2.16 3.19"/><path d="M1 1l22 22"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>';
const COPY_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const MAIL_PROVIDER_IMAP_CONFIG = {
  label: 'Gmail IMAP',
  buttonLabel: '测试 IMAP',
};

// ============================================================
// Toast Notifications
// ============================================================

const toastContainer = document.getElementById('toast-container');

const TOAST_ICONS = {
  error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
};

const LOG_LEVEL_LABELS = {
  info: '信息',
  ok: '成功',
  warn: '警告',
  error: '错误',
};

function showToast(message, type = 'error', duration = 4000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `${TOAST_ICONS[type] || ''}<span class="toast-msg">${escapeHtml(message)}</span><button class="toast-close">&times;</button>`;

  toast.querySelector('.toast-close').addEventListener('click', () => dismissToast(toast));
  toastContainer.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => dismissToast(toast), duration);
  }
}

function dismissToast(toast) {
  if (!toast.parentNode) return;
  toast.classList.add('toast-exit');
  toast.addEventListener('animationend', () => toast.remove());
}

function resetActionModalOption() {
  if (!modalOptionRow || !modalOptionInput || !modalOptionText) {
    return;
  }

  modalOptionRow.hidden = true;
  modalOptionInput.checked = false;
  modalOptionInput.disabled = false;
  modalOptionText.textContent = '不再提示';
}

function resetActionModalAlert() {
  if (!autoStartAlert) {
    return;
  }

  autoStartAlert.hidden = true;
  autoStartAlert.textContent = '';
  autoStartAlert.className = 'modal-alert';
}

function resetActionModalButtons() {
  const buttons = [btnAutoStartCancel, btnAutoStartRestart, btnAutoStartContinue];
  buttons.forEach((button) => {
    if (!button) return;
    button.hidden = true;
    button.disabled = false;
    button.onclick = null;
  });
  currentModalActions = [];
}

function configureActionModalButton(button, action) {
  if (!button) return;
  if (!action) {
    button.hidden = true;
    button.onclick = null;
    return;
  }

  button.hidden = false;
  button.disabled = false;
  button.textContent = action.label;
  button.className = `btn ${action.variant || 'btn-outline'} btn-sm`;
  button.onclick = () => resolveModalChoice(action.id);
}

function configureActionModalOption(option) {
  if (!modalOptionRow || !modalOptionInput || !modalOptionText) {
    return;
  }

  if (!option) {
    resetActionModalOption();
    return;
  }

  modalOptionRow.hidden = false;
  modalOptionInput.checked = Boolean(option.checked);
  modalOptionInput.disabled = Boolean(option.disabled);
  modalOptionText.textContent = option.label || '不再提示';
}

function configureActionModalAlert(alert) {
  if (!autoStartAlert) {
    return;
  }

  if (!alert?.text) {
    resetActionModalAlert();
    return;
  }

  autoStartAlert.hidden = false;
  autoStartAlert.textContent = alert.text;
  autoStartAlert.className = `modal-alert${alert.tone === 'danger' ? ' is-danger' : ''}`;
}

function resolveModalChoice(choice) {
  const optionChecked = Boolean(modalOptionInput?.checked);
  const result = typeof modalResultBuilder === 'function'
    ? modalResultBuilder(choice, { optionChecked })
    : choice;
  if (modalChoiceResolver) {
    modalChoiceResolver(result);
    modalChoiceResolver = null;
  }
  modalResultBuilder = null;
  resetActionModalButtons();
  resetActionModalAlert();
  resetActionModalOption();
  if (autoStartModal) {
    autoStartModal.hidden = true;
  }
}

function openActionModal({ title, message, actions, option, alert, buildResult }) {
  if (!autoStartModal) {
    return Promise.resolve(null);
  }

  if (modalChoiceResolver) {
    resolveModalChoice(null);
  }

  resetActionModalButtons();
  autoStartTitle.textContent = title;
  autoStartMessage.textContent = message;
  currentModalActions = actions || [];
  modalResultBuilder = typeof buildResult === 'function' ? buildResult : null;
  const buttonSlots = currentModalActions.length <= 2
    ? [btnAutoStartCancel, btnAutoStartContinue]
    : [btnAutoStartCancel, btnAutoStartRestart, btnAutoStartContinue];
  buttonSlots.forEach((button, index) => {
    configureActionModalButton(button, currentModalActions[index]);
  });
  configureActionModalAlert(alert);
  configureActionModalOption(option);
  autoStartModal.hidden = false;

  return new Promise((resolve) => {
    modalChoiceResolver = resolve;
  });
}

function openAutoStartChoiceDialog(startStep, options = {}) {
  const runningStep = Number.isInteger(options.runningStep) ? options.runningStep : null;
  const continueMessage = runningStep
    ? `继续当前会先等待步骤 ${runningStep} 完成，再按最新进度自动执行。`
    : `继续当前会从步骤 ${startStep} 开始自动执行。`;
  return openActionModal({
    title: '启动自动',
    message: `检测到当前已有流程进度。${continueMessage}重新开始会清空当前流程进度并从步骤 1 新开一轮。`,
    actions: [
      { id: null, label: '取消', variant: 'btn-ghost' },
      { id: 'restart', label: '重新开始', variant: 'btn-outline' },
      { id: 'continue', label: '继续当前', variant: 'btn-primary' },
    ],
  });
}

async function openConfirmModal({ title, message, confirmLabel = '确认', confirmVariant = 'btn-primary', alert = null }) {
  const choice = await openActionModal({
    title,
    message,
    alert,
    actions: [
      { id: null, label: '取消', variant: 'btn-ghost' },
      { id: 'confirm', label: confirmLabel, variant: confirmVariant },
    ],
  });
  return choice === 'confirm';
}

async function openConfirmModalWithOption({
  title,
  message,
  confirmLabel = '确认',
  confirmVariant = 'btn-primary',
  alert = null,
  optionLabel = '不再提示',
  optionChecked = false,
  optionDisabled = false,
}) {
  const result = await openActionModal({
    title,
    message,
    alert,
    actions: [
      { id: null, label: '取消', variant: 'btn-ghost' },
      { id: 'confirm', label: confirmLabel, variant: confirmVariant },
    ],
    option: {
      label: optionLabel,
      checked: optionChecked,
      disabled: optionDisabled,
    },
    buildResult: (choice, meta) => ({
      choice,
      optionChecked: Boolean(meta?.optionChecked),
    }),
  });

  return {
    confirmed: result?.choice === 'confirm',
    optionChecked: Boolean(result?.optionChecked),
  };
}

function isPromptDismissed(storageKey) {
  return localStorage.getItem(storageKey) === '1';
}

function setPromptDismissed(storageKey, dismissed) {
  if (dismissed) {
    localStorage.setItem(storageKey, '1');
  } else {
    localStorage.removeItem(storageKey);
  }
}

function isAutoSkipFailuresPromptDismissed() {
  return isPromptDismissed(AUTO_SKIP_FAILURES_PROMPT_DISMISSED_STORAGE_KEY);
}

function setAutoSkipFailuresPromptDismissed(dismissed) {
  setPromptDismissed(AUTO_SKIP_FAILURES_PROMPT_DISMISSED_STORAGE_KEY, dismissed);
}

function isAutoRunFallbackRiskPromptDismissed() {
  return isPromptDismissed(AUTO_RUN_FALLBACK_RISK_PROMPT_DISMISSED_STORAGE_KEY);
}

function setAutoRunFallbackRiskPromptDismissed(dismissed) {
  setPromptDismissed(AUTO_RUN_FALLBACK_RISK_PROMPT_DISMISSED_STORAGE_KEY, dismissed);
}

function shouldWarnAutoRunFallbackRisk(totalRuns, autoRunSkipFailures) {
  return totalRuns >= AUTO_RUN_FALLBACK_RISK_WARNING_MIN_RUNS;
}

async function openAutoSkipFailuresConfirmModal() {
  const result = await openConfirmModalWithOption({
    title: '自动重试说明',
    message: `开启后，自动模式在某一轮失败时，会先在当前轮自动重试；单轮最多重试 ${AUTO_RUN_MAX_RETRIES_PER_ROUND} 次，仍失败则放弃当前轮并继续下一轮。线程间隔只在开启自动重试且总轮数大于 1 时生效。`,
    confirmLabel: '确认开启',
  });

  return {
    confirmed: result.confirmed,
    dismissPrompt: result.optionChecked,
  };
}

async function openAutoRunFallbackRiskConfirmModal(totalRuns, fallbackThreadIntervalMinutes) {
  const intervalLabel = Number.isFinite(fallbackThreadIntervalMinutes)
    ? `${fallbackThreadIntervalMinutes} 分钟`
    : '未设置';

  const result = await openConfirmModalWithOption({
    title: '自动运行风险提醒',
    message: `当前设置为 ${totalRuns} 轮自动化，已开启自动重试，线程间隔为 ${intervalLabel}。轮数过多时，可能会因为 IP 短时间注册过多而集中失败。建议控制在 ${AUTO_RUN_FALLBACK_RISK_WARNING_MIN_RUNS} 轮以下，并将线程间隔设置在 ${AUTO_RUN_FALLBACK_RISK_RECOMMENDED_THREAD_INTERVAL_MINUTES} 分钟以上。是否继续？`,
    confirmLabel: '继续',
  });

  return {
    confirmed: result.confirmed,
    dismissPrompt: result.optionChecked,
  };
}

function isDoneStatus(status) {
  return status === 'completed' || status === 'manual_completed' || status === 'skipped';
}

function getStepStatuses(state = latestState) {
  return { ...STEP_DEFAULT_STATUSES, ...(state?.stepStatuses || {}) };
}

function getFirstUnfinishedStep(state = latestState) {
  const statuses = getStepStatuses(state);
  for (const step of STEP_IDS) {
    if (!isDoneStatus(statuses[step])) {
      return step;
    }
  }
  return null;
}

function getRunningSteps(state = latestState) {
  const statuses = getStepStatuses(state);
  return Object.entries(statuses)
    .filter(([, status]) => status === 'running')
    .map(([step]) => Number(step))
    .sort((a, b) => a - b);
}

function hasSavedProgress(state = latestState) {
  const statuses = getStepStatuses(state);
  return Object.values(statuses).some((status) => status !== 'pending');
}

function shouldOfferAutoModeChoice(state = latestState) {
  return hasSavedProgress(state) && getFirstUnfinishedStep(state) !== null;
}

function syncLatestState(nextState) {
  const mergedStepStatuses = nextState?.stepStatuses
    ? { ...STEP_DEFAULT_STATUSES, ...(latestState?.stepStatuses || {}), ...nextState.stepStatuses }
    : getStepStatuses(latestState);

  latestState = {
    ...(latestState || {}),
    ...(nextState || {}),
    stepStatuses: mergedStepStatuses,
  };

  renderAccountRecords(latestState);
}

function hasOwnStateValue(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function readAutoRunStateValue(source, keys, fallback) {
  for (const key of keys) {
    if (hasOwnStateValue(source, key)) {
      return source[key];
    }
  }
  return fallback;
}

function syncAutoRunState(source = {}) {
  const phase = source.autoRunPhase ?? source.phase ?? currentAutoRun.phase;
  const autoRunning = source.autoRunning !== undefined
    ? Boolean(source.autoRunning)
    : (source.autoRunPhase !== undefined || source.phase !== undefined
      ? ['scheduled', 'running', 'waiting_step', 'waiting_email', 'retrying', 'waiting_interval'].includes(phase)
      : currentAutoRun.autoRunning);

  currentAutoRun = {
    autoRunning,
    phase,
    currentRun: readAutoRunStateValue(source, ['autoRunCurrentRun', 'currentRun'], currentAutoRun.currentRun),
    totalRuns: readAutoRunStateValue(source, ['autoRunTotalRuns', 'totalRuns'], currentAutoRun.totalRuns),
    attemptRun: readAutoRunStateValue(source, ['autoRunAttemptRun', 'attemptRun'], currentAutoRun.attemptRun),
    scheduledAt: readAutoRunStateValue(source, ['scheduledAutoRunAt', 'scheduledAt'], currentAutoRun.scheduledAt),
    countdownAt: readAutoRunStateValue(source, ['autoRunCountdownAt', 'countdownAt'], currentAutoRun.countdownAt),
    countdownTitle: readAutoRunStateValue(source, ['autoRunCountdownTitle', 'countdownTitle'], currentAutoRun.countdownTitle),
    countdownNote: readAutoRunStateValue(source, ['autoRunCountdownNote', 'countdownNote'], currentAutoRun.countdownNote),
  };
}

function isAutoRunLockedPhase() {
  return currentAutoRun.phase === 'running'
    || currentAutoRun.phase === 'waiting_step'
    || currentAutoRun.phase === 'retrying'
    || currentAutoRun.phase === 'waiting_interval';
}

function isAutoRunPausedPhase() {
  return currentAutoRun.phase === 'waiting_email';
}

function isAutoRunWaitingStepPhase() {
  return currentAutoRun.phase === 'waiting_step';
}

function isAutoRunScheduledPhase() {
  return currentAutoRun.phase === 'scheduled';
}

function getAutoRunLabel(payload = currentAutoRun) {
  if ((payload.phase ?? currentAutoRun.phase) === 'scheduled') {
    return (payload.totalRuns || 1) > 1 ? ` (${payload.totalRuns}轮)` : '';
  }
  const attemptLabel = payload.attemptRun ? ` · 尝试${payload.attemptRun}` : '';
  if ((payload.totalRuns || 1) > 1) {
    return ` (${payload.currentRun}/${payload.totalRuns}${attemptLabel})`;
  }
  return attemptLabel ? ` (${attemptLabel.slice(3)})` : '';
}

function normalizeAutoDelayMinutes(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return AUTO_DELAY_DEFAULT_MINUTES;
  }
  return Math.min(AUTO_DELAY_MAX_MINUTES, Math.max(AUTO_DELAY_MIN_MINUTES, Math.floor(numeric)));
}

function normalizeAutoRunThreadIntervalMinutes(value) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    return AUTO_FALLBACK_THREAD_INTERVAL_DEFAULT_MINUTES;
  }

  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return AUTO_FALLBACK_THREAD_INTERVAL_DEFAULT_MINUTES;
  }

  return Math.min(
    AUTO_FALLBACK_THREAD_INTERVAL_MAX_MINUTES,
    Math.max(AUTO_FALLBACK_THREAD_INTERVAL_MIN_MINUTES, Math.floor(numeric))
  );
}

function normalizeAutoStepDelaySeconds(value) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    return null;
  }

  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.min(AUTO_STEP_DELAY_MAX_SECONDS, Math.max(AUTO_STEP_DELAY_MIN_SECONDS, Math.floor(numeric)));
}

function normalizeVerificationResendCount(value, fallback) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    return fallback;
  }

  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(
    VERIFICATION_RESEND_COUNT_MAX,
    Math.max(VERIFICATION_RESEND_COUNT_MIN, Math.floor(numeric))
  );
}

function formatAutoStepDelayInputValue(value) {
  const normalized = normalizeAutoStepDelaySeconds(value);
  return normalized === null ? '' : String(normalized);
}

function getRunCountValue() {
  return Math.min(50, Math.max(1, parseInt(inputRunCount.value, 10) || 1));
}

function updateFallbackThreadIntervalInputState() {
  if (!inputAutoSkipFailuresThreadIntervalMinutes) {
    return;
  }

  inputAutoSkipFailuresThreadIntervalMinutes.disabled = Boolean(inputAutoSkipFailures.disabled);
}

function updateAutoDelayInputState() {
  const scheduled = isAutoRunScheduledPhase();
  inputAutoDelayEnabled.disabled = scheduled;
  inputAutoDelayMinutes.disabled = scheduled || !inputAutoDelayEnabled.checked;
}

function formatCountdown(remainingMs) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatScheduleTime(timestamp) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: DISPLAY_TIMEZONE,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function stopScheduledCountdownTicker() {
  clearInterval(scheduledCountdownTimer);
  scheduledCountdownTimer = null;
}

function getActiveAutoRunCountdown() {
  if (isAutoRunScheduledPhase() && Number.isFinite(currentAutoRun.scheduledAt)) {
    return {
      at: currentAutoRun.scheduledAt,
      title: '已计划自动运行',
      note: `计划于 ${formatScheduleTime(currentAutoRun.scheduledAt)} 开始`,
      tone: 'scheduled',
    };
  }

  if (currentAutoRun.phase !== 'waiting_interval') {
    return null;
  }

  if (!Number.isFinite(currentAutoRun.countdownAt)) {
    return null;
  }

  return {
    at: currentAutoRun.countdownAt,
    title: currentAutoRun.countdownTitle || '等待中',
    note: currentAutoRun.countdownNote || '',
    tone: 'running',
  };
}

function renderScheduledAutoRunInfo() {
  if (!autoScheduleBar) {
    return;
  }

  const countdown = getActiveAutoRunCountdown();
  if (!countdown) {
    autoScheduleBar.style.display = 'none';
    return;
  }

  const remainingMs = countdown.at - Date.now();
  autoScheduleBar.style.display = 'flex';
  if (btnAutoRunNow) {
    btnAutoRunNow.hidden = false;
    btnAutoRunNow.textContent = currentAutoRun.phase === 'waiting_interval' ? '立即继续' : '立即开始';
  }
  if (btnAutoCancelSchedule) {
    btnAutoCancelSchedule.hidden = false;
  }
  autoScheduleTitle.textContent = countdown.title;
  autoScheduleMeta.textContent = remainingMs > 0
    ? `${countdown.note ? `${countdown.note}，` : ''}剩余 ${formatCountdown(remainingMs)}`
    : '倒计时即将结束，正在准备继续...';
  return;
}

function syncScheduledCountdownTicker() {
  renderScheduledAutoRunInfo();
  if (getActiveAutoRunCountdown()) {
    if (scheduledCountdownTimer) {
      return;
    }

    scheduledCountdownTimer = setInterval(() => {
      renderScheduledAutoRunInfo();
      updateStatusDisplay(latestState);
    }, 1000);
    return;
  }

  stopScheduledCountdownTicker();
  return;
}

function setDefaultAutoRunButton() {
  btnAutoRun.disabled = false;
  inputRunCount.disabled = false;
  btnAutoRun.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> 自动';
}

function collectSettingsPayload() {
  const cpaApiUrl = inputVpsUrl.value.trim();
  const cpaManagementKey = inputVpsPassword.value;
  return {
    panelMode: 'cpa',
    cpaApiUrl,
    cpaManagementKey,
    vpsUrl: cpaApiUrl,
    vpsPassword: cpaManagementKey,
    customPassword: inputPassword.value,
    mailProvider: 'custom',
    gmailImapEmail: inputGmailImapEmail.value.trim(),
    gmailImapAppPassword: inputGmailImapAppPassword.value,
    gmailImapHost: inputGmailImapHost.value.trim() || 'imap.gmail.com',
    gmailImapPort: Number(inputGmailImapPort.value || 993),
    customEmailList: getCustomEmailListForSettingsPayload(),
    registeredEmailList: getRegisteredEmailListForSettingsPayload(),
    autoRunSkipFailures: inputAutoSkipFailures.checked,
    autoRunFallbackThreadIntervalMinutes: normalizeAutoRunThreadIntervalMinutes(inputAutoSkipFailuresThreadIntervalMinutes.value),
    autoRunDelayEnabled: inputAutoDelayEnabled.checked,
    autoRunDelayMinutes: normalizeAutoDelayMinutes(inputAutoDelayMinutes.value),
    autoStepDelaySeconds: normalizeAutoStepDelaySeconds(inputAutoStepDelaySeconds.value),
    verificationResendCount: normalizeVerificationResendCount(
      inputVerificationResendCount?.value,
      DEFAULT_VERIFICATION_RESEND_COUNT
    ),
  };
}

function normalizeLocalCpaStep9Mode(value = '') {
  return String(value || '').trim().toLowerCase() === 'bypass'
    ? 'bypass'
    : DEFAULT_LOCAL_CPA_STEP9_MODE;
}

function getSelectedLocalCpaStep9Mode() {
  const activeButton = localCpaStep9ModeButtons.find((button) => button.classList.contains('is-active'));
  return normalizeLocalCpaStep9Mode(activeButton?.dataset.localCpaStep9Mode);
}

function setLocalCpaStep9Mode(mode) {
  const resolvedMode = normalizeLocalCpaStep9Mode(mode);
  localCpaStep9ModeButtons.forEach((button) => {
    const active = button.dataset.localCpaStep9Mode === resolvedMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function setSettingsCardLocked(locked) {
  if (!settingsCard) {
    return;
  }
  settingsCard.classList.toggle('is-locked', locked);
  settingsCard.toggleAttribute('inert', locked);
}

async function setRuntimeEmailState(email) {
  const normalizedEmail = String(email || '').trim() || null;
  const response = await chrome.runtime.sendMessage({
    type: 'SET_EMAIL_STATE',
    source: 'sidepanel',
    payload: { email: normalizedEmail },
  });

  if (response?.error) {
    throw new Error(response.error);
  }

  return normalizedEmail;
}

async function clearRegistrationEmail(options = {}) {
  const { silent = false } = options;
  if (!inputEmail.value.trim() && !latestState?.email) {
    return;
  }

  inputEmail.value = '';
  syncLatestState({ email: null });

  try {
    await setRuntimeEmailState(null);
  } catch (err) {
    if (!silent) {
      showToast(`清空邮箱失败：${err.message}`, 'error');
    }
    throw err;
  }
}

function markSettingsDirty(isDirty = true) {
  settingsDirty = isDirty;
  updateSaveButtonState();
}

function updateSaveButtonState() {
  btnSaveSettings.disabled = settingsSaveInFlight || !settingsDirty;
  btnSaveSettings.textContent = settingsSaveInFlight ? '保存中' : '保存';
}

function scheduleSettingsAutoSave() {
  clearTimeout(settingsAutoSaveTimer);
  settingsAutoSaveTimer = setTimeout(() => {
    saveSettings({ silent: true }).catch(() => { });
  }, 500);
}

async function saveSettings(options = {}) {
  const { silent = false } = options;
  clearTimeout(settingsAutoSaveTimer);

  if (!settingsDirty && !settingsSaveInFlight && silent) {
    return;
  }

  const payload = collectSettingsPayload();
  settingsSaveInFlight = true;
  updateSaveButtonState();

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_SETTING',
      source: 'sidepanel',
      payload,
    });

    if (response?.error) {
      throw new Error(response.error);
    }

    if (response?.state) {
      applySettingsState(response.state);
    } else {
      syncLatestState(payload);
      markSettingsDirty(false);
      updatePanelModeUI();
      updateMailProviderUI();
      updateButtonStates();
    }
    if (!silent) {
      showToast('配置已保存', 'success', 1800);
    }
  } catch (err) {
    markSettingsDirty(true);
    if (!silent) {
      showToast(`保存失败：${err.message}`, 'error');
    }
    throw err;
  } finally {
    settingsSaveInFlight = false;
    updateSaveButtonState();
  }
}

function applyAutoRunStatus(payload = currentAutoRun) {
  syncAutoRunState(payload);
  const runLabel = getAutoRunLabel(currentAutoRun);
  const locked = isAutoRunLockedPhase();
  const paused = isAutoRunPausedPhase();
  const scheduled = isAutoRunScheduledPhase();
  const settingsCardLocked = scheduled || locked;

  setSettingsCardLocked(settingsCardLocked);

  inputRunCount.disabled = currentAutoRun.autoRunning;
  btnAutoRun.disabled = currentAutoRun.autoRunning;
  btnFetchEmail.disabled = locked
    || isCustomMailProvider();
  inputEmail.disabled = locked;
  inputAutoSkipFailures.disabled = scheduled;

  if (currentAutoRun.totalRuns > 0) {
    inputRunCount.value = String(currentAutoRun.totalRuns);
  }

  switch (currentAutoRun.phase) {
    case 'scheduled':
      autoContinueBar.style.display = 'none';
      btnAutoRun.innerHTML = `已计划${runLabel}`;
      break;
    case 'waiting_step':
      autoContinueBar.style.display = 'none';
      btnAutoRun.innerHTML = `等待中${runLabel}`;
      break;
    case 'waiting_email':
      autoContinueBar.style.display = 'flex';
      btnAutoRun.innerHTML = `已暂停${runLabel}`;
      break;
    case 'running':
      autoContinueBar.style.display = 'none';
      btnAutoRun.innerHTML = `运行中${runLabel}`;
      break;
    case 'retrying':
      autoContinueBar.style.display = 'none';
      btnAutoRun.innerHTML = `重试中${runLabel}`;
      break;
    case 'waiting_interval':
      autoContinueBar.style.display = 'none';
      btnAutoRun.innerHTML = `等待中${runLabel}`;
      break;
    default:
      autoContinueBar.style.display = 'none';
      setDefaultAutoRunButton();
      inputEmail.disabled = false;
      if (!locked) {
        btnFetchEmail.disabled = isCustomMailProvider();
      }
      break;
  }

  updateAutoDelayInputState();
  updateFallbackThreadIntervalInputState();
  syncScheduledCountdownTicker();
  updateStopButtonState(scheduled || paused || locked || Object.values(getStepStatuses()).some(status => status === 'running'));
}

function initializeManualStepActions() {
  document.querySelectorAll('.step-row').forEach((row) => {
    const step = Number(row.dataset.step);
    const statusEl = row.querySelector('.step-status');
    if (!statusEl) return;

    const actions = document.createElement('div');
    actions.className = 'step-actions';

    const manualBtn = document.createElement('button');
    manualBtn.type = 'button';
    manualBtn.className = 'step-manual-btn';
    manualBtn.dataset.step = String(step);
    manualBtn.title = '跳过此步';
    manualBtn.setAttribute('aria-label', `跳过步骤 ${step}`);
    manualBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>';
    manualBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      try {
        await handleSkipStep(step);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    statusEl.parentNode.replaceChild(actions, statusEl);
    actions.appendChild(manualBtn);
    actions.appendChild(statusEl);
  });
}

function renderStepsList() {
  if (!stepsList) return;

  stepsList.innerHTML = stepDefinitions.map((step) => `
    <div class="step-row" data-step="${step.id}" data-step-key="${escapeHtml(step.key)}">
      <div class="step-indicator" data-step="${step.id}"><span class="step-num">${step.id}</span></div>
      <button class="step-btn" data-step="${step.id}" data-step-key="${escapeHtml(step.key)}">${escapeHtml(step.title)}</button>
      <span class="step-status" data-step="${step.id}"></span>
    </div>
  `).join('');

  if (stepsProgress) {
    stepsProgress.textContent = `0 / ${STEP_IDS.length}`;
  }
}

// ============================================================
// State Restore on load
// ============================================================

function applySettingsState(state) {
  syncLatestState(state);
  syncAutoRunState(state);

  inputEmail.value = state?.email || '';
  applyCustomEmailState(state);
  applyRegisteredEmailState(state);
  syncPasswordField(state || {});
  syncEditableInputValue(inputVpsUrl, state?.cpaApiUrl || state?.vpsUrl || '');
  syncEditableInputValue(inputVpsPassword, state?.cpaManagementKey || state?.vpsPassword || '');
  syncEditableInputValue(inputGmailImapEmail, state?.gmailImapEmail || '');
  syncEditableInputValue(inputGmailImapAppPassword, state?.gmailImapAppPassword || '');
  syncEditableInputValue(inputGmailImapHost, state?.gmailImapHost || 'imap.gmail.com');
  syncEditableInputValue(inputGmailImapPort, String(state?.gmailImapPort || 993));
  setLocalCpaStep9Mode(state?.localCpaStep9Mode);
  selectMailProvider.value = 'custom';
  inputAutoSkipFailures.checked = Boolean(state?.autoRunSkipFailures);
  inputAutoSkipFailuresThreadIntervalMinutes.value = String(normalizeAutoRunThreadIntervalMinutes(state?.autoRunFallbackThreadIntervalMinutes));
  inputAutoDelayEnabled.checked = Boolean(state?.autoRunDelayEnabled);
  inputAutoDelayMinutes.value = String(normalizeAutoDelayMinutes(state?.autoRunDelayMinutes));
  inputAutoStepDelaySeconds.value = formatAutoStepDelayInputValue(state?.autoStepDelaySeconds);
  if (inputVerificationResendCount) {
    const restoredVerificationResendCount = state?.verificationResendCount !== undefined
      ? state.verificationResendCount
      : (state?.signupVerificationResendCount ?? state?.loginVerificationResendCount);
    inputVerificationResendCount.value = String(
      normalizeVerificationResendCount(restoredVerificationResendCount, DEFAULT_VERIFICATION_RESEND_COUNT)
    );
  }
  if (state?.autoRunTotalRuns) {
    inputRunCount.value = String(state.autoRunTotalRuns);
  }

  applyAutoRunStatus(state);
  markSettingsDirty(false);
  updateAutoDelayInputState();
  updateFallbackThreadIntervalInputState();
  updatePanelModeUI();
  updateMailProviderUI();
  updateButtonStates();
}

async function restoreState() {
  try {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE', source: 'sidepanel' });
    applySettingsState(state);

    if (state.oauthUrl) {
      displayOauthUrl.textContent = state.oauthUrl;
      displayOauthUrl.classList.add('has-value');
    }
    if (state.localhostUrl) {
      displayLocalhostUrl.textContent = state.localhostUrl;
      displayLocalhostUrl.classList.add('has-value');
    }
    if (state.stepStatuses) {
      for (const [step, status] of Object.entries(state.stepStatuses)) {
        updateStepUI(Number(step), status);
      }
    }

    if (state.logs) {
      for (const entry of state.logs) {
        appendLog(entry);
      }
    }

    updateStatusDisplay(latestState);
    updateProgressCounter();
  } catch (err) {
    console.error('Failed to restore state:', err);
  }
}

function openExternalUrl(url) {
  const targetUrl = String(url || '').trim();
  if (!targetUrl) {
    return;
  }

  if (typeof openScopedExternalUrl === 'function') {
    openScopedExternalUrl(targetUrl).catch(() => {
      if (chrome?.tabs?.create) {
        chrome.tabs.create({ url: targetUrl, active: true }).catch(() => {
          window.open(targetUrl, '_blank', 'noopener');
        });
        return;
      }
      window.open(targetUrl, '_blank', 'noopener');
    });
    return;
  }

  if (chrome?.tabs?.create) {
    chrome.tabs.create({ url: targetUrl, active: true }).catch(() => {
      window.open(targetUrl, '_blank', 'noopener');
    });
    return;
  }

  window.open(targetUrl, '_blank', 'noopener');
}

function syncPasswordField(state) {
  inputPassword.value = state.customPassword || state.password || '';
}

function resolveSyncedInputValue(currentValue, syncedValue, options = {}) {
  const isFocused = Boolean(options?.isFocused);
  if (isFocused) {
    return currentValue;
  }
  return syncedValue;
}

function syncEditableInputValue(input, nextValue) {
  if (!input) {
    return;
  }
  input.value = resolveSyncedInputValue(input.value, nextValue, {
    isFocused: document?.activeElement === input,
  });
}

function isCustomMailProvider(provider = selectMailProvider.value) {
  return String(provider || '').trim().toLowerCase() === 'custom';
}

function getCustomVerificationPromptCopy(step) {
  const verificationLabel = step === 4 ? '注册验证码' : '登录验证码';
  return {
    title: `手动处理${verificationLabel}`,
    message: `当前邮箱服务为“自定义邮箱”。请先在页面中手动输入${verificationLabel}，并确认已经进入下一页面后，再点击确认。`,
    alert: {
      text: `点击确认后会跳过步骤 ${step}。`,
      tone: 'danger',
    },
  };
}

function updateMailLoginButtonState() {
  if (!btnMailLogin) {
    return;
  }

  const hasCredentials = Boolean(inputGmailImapEmail?.value.trim() && inputGmailImapAppPassword?.value.trim());
  btnMailLogin.disabled = !hasCredentials;
  btnMailLogin.textContent = MAIL_PROVIDER_IMAP_CONFIG.buttonLabel;
  btnMailLogin.title = hasCredentials
    ? `使用 ${MAIL_PROVIDER_IMAP_CONFIG.label} 测试后台收件连接`
    : '请先填写 Gmail IMAP 邮箱和 App Password';
}

function updateMailProviderUI() {
  const customEmailView = getCustomEmailListView();
  const registeredEmailView = renderRegisteredEmailState();
  updateMailLoginButtonState();
  renderCustomEmailState();
  if (customEmailPanel) {
    customEmailPanel.style.display = '';
  }
  if (registeredEmailPanel) {
    registeredEmailPanel.style.display = '';
  }
  btnFetchEmail.hidden = true;
  btnFetchEmail.disabled = true;
  inputEmail.readOnly = false;
  inputEmail.placeholder = '按列表顺序消费；也可在这里临时覆盖本轮邮箱';
  if (autoHintText) {
    autoHintText.textContent = customEmailView.totalCount > 0
      ? `待注册邮箱 ${customEmailView.totalCount} 个，已注册邮箱 ${registeredEmailView.totalCount || 0} 个；验证码通过 Gmail IMAP 后台获取。`
      : '请先填写本轮要使用的注册邮箱，或在下方录入待注册邮箱列表。';
  }
}

function updatePanelModeUI() {
  if (rowVpsUrl) {
    rowVpsUrl.style.display = '';
  }
  if (rowVpsPassword) {
    rowVpsPassword.style.display = '';
  }
  if (rowLocalCpaStep9Mode) {
    rowLocalCpaStep9Mode.style.display = 'none';
  }
  const step9Btn = document.querySelector('.step-btn[data-step-key="platform-verify"]');
  if (step9Btn) {
    step9Btn.textContent = '上传 CPA 认证文件';
  }
}

// ============================================================
// UI Updates
// ============================================================

function updateStepUI(step, status) {
  const statusEl = document.querySelector(`.step-status[data-step="${step}"]`);
  const row = document.querySelector(`.step-row[data-step="${step}"]`);

  syncLatestState({
    stepStatuses: {
      ...getStepStatuses(),
      [step]: status,
    },
  });

  if (statusEl) statusEl.textContent = STATUS_ICONS[status] || '';
  if (row) {
    row.className = `step-row ${status}`;
  }

  updateButtonStates();
  updateProgressCounter();
}

function updateProgressCounter() {
  const completed = Object.values(getStepStatuses()).filter(isDoneStatus).length;
  stepsProgress.textContent = `${completed} / ${STEP_IDS.length}`;
}

function updateButtonStates() {
  const statuses = getStepStatuses();
  const anyRunning = Object.values(statuses).some(s => s === 'running');
  const autoLocked = isAutoRunLockedPhase();
  const autoScheduled = isAutoRunScheduledPhase();

  for (const step of STEP_IDS) {
    const btn = document.querySelector(`.step-btn[data-step="${step}"]`);
    if (!btn) continue;

    if (anyRunning || autoLocked || autoScheduled) {
      btn.disabled = true;
    } else if (step === 1) {
      btn.disabled = false;
    } else {
    const currentIndex = STEP_IDS.indexOf(step);
    const prevStep = currentIndex > 0 ? STEP_IDS[currentIndex - 1] : null;
    const prevStatus = prevStep === null ? 'completed' : statuses[prevStep];
    const currentStatus = statuses[step];
    btn.disabled = !(isDoneStatus(prevStatus) || currentStatus === 'failed' || isDoneStatus(currentStatus) || currentStatus === 'stopped');
  }
  }

  document.querySelectorAll('.step-manual-btn').forEach((btn) => {
    const step = Number(btn.dataset.step);
    const currentStatus = statuses[step];
    const currentIndex = STEP_IDS.indexOf(step);
    const prevStep = currentIndex > 0 ? STEP_IDS[currentIndex - 1] : null;
    const prevStatus = prevStep === null ? 'completed' : statuses[prevStep];

    if (!SKIPPABLE_STEPS.has(step) || anyRunning || autoLocked || autoScheduled || currentStatus === 'running' || isDoneStatus(currentStatus)) {
      btn.style.display = 'none';
      btn.disabled = true;
      btn.title = '当前不可跳过';
      return;
    }

    if (prevStep !== null && !isDoneStatus(prevStatus)) {
      btn.style.display = 'none';
      btn.disabled = true;
      btn.title = `请先完成步骤 ${prevStep}`;
      return;
    }

    btn.style.display = '';
    btn.disabled = false;
    btn.title = `跳过步骤 ${step}`;
  });

  btnReset.disabled = anyRunning || autoScheduled || isAutoRunPausedPhase() || autoLocked;
  renderCustomEmailState();
  updateStopButtonState(anyRunning || autoScheduled || isAutoRunPausedPhase() || autoLocked);
}

function updateStopButtonState(active) {
  btnStop.disabled = !active;
}

function updateStatusDisplay(state) {
  if (!state || !state.stepStatuses) return;

  statusBar.className = 'status-bar';

  const countdown = getActiveAutoRunCountdown();
  if (countdown) {
    const remainingMs = countdown.at - Date.now();
    displayStatus.textContent = remainingMs > 0
      ? `${countdown.title}，剩余 ${formatCountdown(remainingMs)}`
      : `${countdown.title}，即将结束...`;
    statusBar.classList.add(countdown.tone === 'scheduled' ? 'scheduled' : 'running');
    return;
  }

  if (isAutoRunScheduledPhase()) {
    const remainingMs = Number.isFinite(currentAutoRun.scheduledAt)
      ? currentAutoRun.scheduledAt - Date.now()
      : 0;
    displayStatus.textContent = remainingMs > 0
      ? `自动计划中，剩余 ${formatCountdown(remainingMs)}`
      : '倒计时即将结束，正在准备启动...';
    statusBar.classList.add('scheduled');
    return;
  }

  if (isAutoRunPausedPhase()) {
    displayStatus.textContent = `自动已暂停${getAutoRunLabel()}，等待邮箱后继续`;
    statusBar.classList.add('paused');
    return;
  }

  if (isAutoRunWaitingStepPhase()) {
    const runningSteps = getRunningSteps(state);
    displayStatus.textContent = runningSteps.length
      ? `自动等待步骤 ${runningSteps.join(', ')} 完成后继续${getAutoRunLabel()}`
      : `自动正在按最新进度准备继续${getAutoRunLabel()}`;
    statusBar.classList.add('running');
    return;
  }

  const running = Object.entries(state.stepStatuses).find(([, s]) => s === 'running');
  if (running) {
    displayStatus.textContent = `步骤 ${running[0]} 运行中...`;
    statusBar.classList.add('running');
    return;
  }

  if (isAutoRunLockedPhase()) {
    displayStatus.textContent = `${currentAutoRun.phase === 'retrying' ? '自动重试中' : '自动运行中'}${getAutoRunLabel()}`;
    statusBar.classList.add('running');
    return;
  }

  const failed = Object.entries(state.stepStatuses).find(([, s]) => s === 'failed');
  if (failed) {
    displayStatus.textContent = `步骤 ${failed[0]} 失败`;
    statusBar.classList.add('failed');
    return;
  }

  const stopped = Object.entries(state.stepStatuses).find(([, s]) => s === 'stopped');
  if (stopped) {
    displayStatus.textContent = `步骤 ${stopped[0]} 已停止`;
    statusBar.classList.add('stopped');
    return;
  }

  const lastCompleted = Object.entries(state.stepStatuses)
    .filter(([, s]) => isDoneStatus(s))
    .map(([k]) => Number(k))
    .sort((a, b) => b - a)[0];

  if (lastCompleted === STEP_IDS[STEP_IDS.length - 1]) {
    displayStatus.textContent = (state.stepStatuses[lastCompleted] === 'manual_completed' || state.stepStatuses[lastCompleted] === 'skipped') ? '全部步骤已跳过/完成' : '全部步骤已完成';
    statusBar.classList.add('completed');
  } else if (lastCompleted) {
    displayStatus.textContent = (state.stepStatuses[lastCompleted] === 'manual_completed' || state.stepStatuses[lastCompleted] === 'skipped')
      ? `步骤 ${lastCompleted} 已跳过`
      : `步骤 ${lastCompleted} 已完成`;
  } else {
    displayStatus.textContent = '就绪';
  }
}

function appendLog(entry) {
  const time = new Date(entry.timestamp).toLocaleTimeString('zh-CN', {
    hour12: false,
    timeZone: DISPLAY_TIMEZONE,
  });
  const levelLabel = LOG_LEVEL_LABELS[entry.level] || entry.level;
  const line = document.createElement('div');
  line.className = `log-line log-${entry.level}`;

  const stepMatch = entry.message.match(/(?:Step\s+(\d+)|步骤\s*(\d+))/);
  const stepNum = stepMatch ? (stepMatch[1] || stepMatch[2]) : null;

  let html = `<span class="log-time">${time}</span> `;
  html += `<span class="log-level log-level-${entry.level}">${levelLabel}</span> `;
  if (stepNum) {
    html += `<span class="log-step-tag step-${stepNum}">步${stepNum}</span>`;
  }
  html += `<span class="log-msg">${escapeHtml(entry.message)}</span>`;

  line.innerHTML = html;
  logArea.appendChild(line);
  logArea.scrollTop = logArea.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function fetchGeneratedEmail(options = {}) {
  throw new Error('当前邮箱服务为自定义邮箱，请直接填写注册邮箱。');
}

function syncToggleButtonLabel(button, input, labels) {
  if (!button || !input) return;

  const isHidden = input.type === 'password';
  button.innerHTML = isHidden ? EYE_OPEN_ICON : EYE_CLOSED_ICON;
  button.setAttribute('aria-label', isHidden ? labels.show : labels.hide);
  button.title = isHidden ? labels.show : labels.hide;
}

async function copyTextToClipboard(text) {
  const value = String(text || '').trim();
  if (!value) {
    throw new Error('没有可复制的内容。');
  }
  if (!navigator.clipboard?.writeText) {
    throw new Error('当前环境不支持剪贴板复制。');
  }
  await navigator.clipboard.writeText(value);
}

const customEmailManager = window.SidepanelCustomEmailManager?.createCustomEmailManager({
  state: {
    getLatestState: () => latestState,
    syncLatestState,
  },
  dom: {
    btnCustomEmailResetProgress,
    customEmailCurrent,
    customEmailNext,
    customEmailPreview,
    customEmailRemaining,
    customEmailSummary,
    inputCustomEmailList,
  },
  helpers: {
    escapeHtml,
    showToast,
  },
  runtime: {
    sendMessage: (message) => chrome.runtime.sendMessage(message),
  },
  callbacks: {
    onListInput(customEmailList) {
      syncLatestState({ customEmailList });
      markSettingsDirty(true);
      scheduleSettingsAutoSave();
      updateMailProviderUI();
      updateButtonStates();
    },
    onListCommit(customEmailList) {
      syncLatestState({ customEmailList });
      markSettingsDirty(true);
      saveSettings({ silent: true }).catch(() => { });
      updateMailProviderUI();
      updateButtonStates();
    },
    onProgressReset() {
      markSettingsDirty(false);
      updateMailProviderUI();
      updateButtonStates();
    },
  },
  constants: {
    previewLimit: 6,
  },
});
applyCustomEmailState = customEmailManager?.applyState || applyCustomEmailState;
getCustomEmailListForSettingsPayload = customEmailManager?.getCustomEmailList || getCustomEmailListForSettingsPayload;
getCustomEmailListView = customEmailManager?.getViewModel || getCustomEmailListView;
renderCustomEmailState = customEmailManager?.render || renderCustomEmailState;
const bindCustomEmailEvents = customEmailManager?.bindEvents
  || (() => { });
bindCustomEmailEvents();

const registeredEmailManager = window.SidepanelRegisteredEmailManager?.createRegisteredEmailManager({
  state: {
    getLatestState: () => latestState,
    syncLatestState,
  },
  dom: {
    btnRegisteredEmailClear,
    inputRegisteredEmailList,
    registeredEmailPreview,
    registeredEmailSummary,
  },
  helpers: {
    escapeHtml,
    showToast,
  },
  runtime: {
    sendMessage: (message) => chrome.runtime.sendMessage(message),
  },
  callbacks: {
    onListInput(registeredEmailList) {
      syncLatestState({ registeredEmailList });
      markSettingsDirty(true);
      scheduleSettingsAutoSave();
      updateMailProviderUI();
      updateButtonStates();
    },
    onListCommit(registeredEmailList) {
      syncLatestState({ registeredEmailList });
      markSettingsDirty(true);
      saveSettings({ silent: true }).catch(() => { });
      updateMailProviderUI();
      updateButtonStates();
    },
    onClear() {
      markSettingsDirty(false);
      updateMailProviderUI();
      updateButtonStates();
    },
  },
  constants: {
    previewLimit: 6,
  },
});
applyRegisteredEmailState = registeredEmailManager?.applyState || applyRegisteredEmailState;
getRegisteredEmailListForSettingsPayload = registeredEmailManager?.getRegisteredEmailList || getRegisteredEmailListForSettingsPayload;
renderRegisteredEmailState = registeredEmailManager?.render || renderRegisteredEmailState;
const bindRegisteredEmailEvents = registeredEmailManager?.bindEvents
  || (() => { });
bindRegisteredEmailEvents();

const emailListTabsController = window.SidepanelEmailListTabs?.createEmailListTabsController({
  dom: {
    btnPendingEmailTab,
    btnRegisteredEmailTab,
    customEmailPanel,
    registeredEmailPanel,
  },
}) || null;
emailListTabsController?.bindEvents?.();
emailListTabsController?.render?.('pending');

const sidepanelWindowScope = window.SidepanelWindowScope?.createSidepanelWindowScope({
  chrome,
  window,
}) || null;
openScopedExternalUrl = sidepanelWindowScope?.openExternalUrl
  ? (url) => sidepanelWindowScope.openExternalUrl(url)
  : null;

const initHotmailListExpandedState = () => { };
const renderHotmailAccounts = () => { };
const hideIcloudLoginHelp = () => { };
const hasDeletableUsedIcloudAliases = () => false;
const queueIcloudAliasRefresh = () => { };
const refreshIcloudAliases = async () => { };
const renderIcloudAliases = () => { };
const resetIcloudManager = () => { };
const showIcloudLoginHelp = () => { };
const updateIcloudBulkUI = () => { };
const queueLuckmailPurchaseRefresh = () => { };
const refreshLuckmailPurchases = async () => { };
const renderLuckmailPurchases = () => { };
const resetLuckmailManager = () => { };
const renderAccountRecords = () => { };
renderStepsList();

function syncPasswordToggleLabel() {
  syncToggleButtonLabel(btnTogglePassword, inputPassword, {
    show: '显示密码',
    hide: '隐藏密码',
  });
}

function syncVpsUrlToggleLabel() {
  syncToggleButtonLabel(btnToggleVpsUrl, inputVpsUrl, {
    show: '显示 CPA API 地址',
    hide: '隐藏 CPA API 地址',
  });
}

function syncVpsPasswordToggleLabel() {
  syncToggleButtonLabel(btnToggleVpsPassword, inputVpsPassword, {
    show: '显示管理密钥',
    hide: '隐藏管理密钥',
  });
}

function syncGmailImapAppPasswordToggleLabel() {
  syncToggleButtonLabel(btnToggleGmailImapAppPassword, inputGmailImapAppPassword, {
    show: '显示 Gmail App Password',
    hide: '隐藏 Gmail App Password',
  });
}

async function maybeTakeoverAutoRun(actionLabel) {
  if (!isAutoRunPausedPhase()) {
    return true;
  }

  const confirmed = await openConfirmModal({
    title: '接管自动',
    message: `当前自动流程已暂停。若继续${actionLabel}，将停止自动流程并切换为手动控制。是否继续？`,
    confirmLabel: '确认接管',
    confirmVariant: 'btn-primary',
  });
  if (!confirmed) {
    return false;
  }

  await chrome.runtime.sendMessage({ type: 'TAKEOVER_AUTO_RUN', source: 'sidepanel', payload: {} });
  return true;
}

async function handleSkipStep(step) {
  if (isAutoRunPausedPhase()) {
    const takeoverResponse = await chrome.runtime.sendMessage({
      type: 'TAKEOVER_AUTO_RUN',
      source: 'sidepanel',
      payload: {},
    });
    if (takeoverResponse?.error) {
      throw new Error(takeoverResponse.error);
    }
  }

  const response = await chrome.runtime.sendMessage({
    type: 'SKIP_STEP',
    source: 'sidepanel',
    payload: { step },
  });

  if (response?.error) {
    throw new Error(response.error);
  }

  showToast(`步骤 ${step} 已跳过`, 'success', 2200);
}

// ============================================================
// Button Handlers
// ============================================================

stepsList?.addEventListener('click', async (event) => {
  const btn = event.target.closest('.step-btn');
  if (!btn) {
    return;
  }
  try {
    const step = Number(btn.dataset.step);
    if (!(await maybeTakeoverAutoRun(`执行步骤 ${step}`))) {
      return;
    }
    if (step === 3) {
      if (inputPassword.value !== (latestState?.customPassword || '')) {
        await chrome.runtime.sendMessage({
          type: 'SAVE_SETTING',
          source: 'sidepanel',
          payload: { customPassword: inputPassword.value },
        });
        syncLatestState({ customPassword: inputPassword.value });
      }
      const email = inputEmail.value.trim();
      if (!email) {
        showToast('当前邮箱服务为自定义邮箱，请先填写注册邮箱后再执行第 3 步。', 'warn');
        return;
      }
      const response = await chrome.runtime.sendMessage({
        type: 'EXECUTE_STEP',
        source: 'sidepanel',
        payload: { step, email },
      });
      if (response?.error) {
        throw new Error(response.error);
      }
    } else {
      const response = await chrome.runtime.sendMessage({
        type: 'EXECUTE_STEP',
        source: 'sidepanel',
        payload: { step },
      });
      if (response?.error) {
        throw new Error(response.error);
      }
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});

btnFetchEmail.addEventListener('click', async () => {
  await fetchGeneratedEmail().catch(() => { });
});

btnTogglePassword.addEventListener('click', () => {
  inputPassword.type = inputPassword.type === 'password' ? 'text' : 'password';
  syncPasswordToggleLabel();
});

btnToggleVpsUrl.addEventListener('click', () => {
  inputVpsUrl.type = inputVpsUrl.type === 'password' ? 'text' : 'password';
  syncVpsUrlToggleLabel();
});

btnToggleVpsPassword.addEventListener('click', () => {
  inputVpsPassword.type = inputVpsPassword.type === 'password' ? 'text' : 'password';
  syncVpsPasswordToggleLabel();
});

btnToggleGmailImapAppPassword?.addEventListener('click', () => {
  inputGmailImapAppPassword.type = inputGmailImapAppPassword.type === 'password' ? 'text' : 'password';
  syncGmailImapAppPasswordToggleLabel();
});

btnMailLogin?.addEventListener('click', async () => {
  if (!inputGmailImapEmail.value.trim() || !inputGmailImapAppPassword.value.trim()) {
    showToast('请先填写 Gmail IMAP 邮箱和 App Password。', 'warn');
    return;
  }

  try {
    btnMailLogin.disabled = true;
    const response = await chrome.runtime.sendMessage({
      type: 'TEST_GMAIL_IMAP_CONNECTION',
      source: 'sidepanel',
      payload: {
        gmailImapEmail: inputGmailImapEmail.value.trim(),
        gmailImapAppPassword: inputGmailImapAppPassword.value,
        gmailImapHost: inputGmailImapHost.value.trim() || 'imap.gmail.com',
        gmailImapPort: Number(inputGmailImapPort.value || 993),
      },
    });
    if (response?.error) {
      throw new Error(response.error);
    }
    showToast('Gmail IMAP 连接测试成功。', 'success', 1800);
  } catch (err) {
    showToast(`Gmail IMAP 连接测试失败：${err.message}`, 'error');
  } finally {
    updateMailLoginButtonState();
  }
});

localCpaStep9ModeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const nextMode = button.dataset.localCpaStep9Mode;
    if (getSelectedLocalCpaStep9Mode() === normalizeLocalCpaStep9Mode(nextMode)) {
      return;
    }
    setLocalCpaStep9Mode(nextMode);
    markSettingsDirty(true);
    saveSettings({ silent: true }).catch(() => { });
  });
});

btnSaveSettings.addEventListener('click', async () => {
  if (!settingsDirty) {
    showToast('配置已是最新', 'info', 1400);
    return;
  }
  await saveSettings({ silent: false }).catch(() => { });
});

btnStop.addEventListener('click', async () => {
  btnStop.disabled = true;
  await chrome.runtime.sendMessage({ type: 'STOP_FLOW', source: 'sidepanel', payload: {} });
  showToast(isAutoRunScheduledPhase() ? '正在取消倒计时计划...' : '正在停止当前流程...', 'warn', 2000);
});

autoStartModal?.addEventListener('click', (event) => {
  if (event.target === autoStartModal) {
    resolveModalChoice(null);
  }
});
btnAutoStartClose?.addEventListener('click', () => resolveModalChoice(null));

// Auto Run
btnAutoRun.addEventListener('click', async () => {
  try {
    const totalRuns = getRunCountValue();
    let mode = 'restart';
    const autoRunSkipFailures = inputAutoSkipFailures.checked;
    const fallbackThreadIntervalMinutes = normalizeAutoRunThreadIntervalMinutes(
      inputAutoSkipFailuresThreadIntervalMinutes.value
    );
    inputAutoSkipFailuresThreadIntervalMinutes.value = String(fallbackThreadIntervalMinutes);

    if (shouldOfferAutoModeChoice()) {
      const startStep = getFirstUnfinishedStep();
      const runningStep = getRunningSteps()[0] ?? null;
      const choice = await openAutoStartChoiceDialog(startStep, { runningStep });
      if (!choice) {
        return;
      }
      mode = choice;
    }

    if (shouldWarnAutoRunFallbackRisk(totalRuns, autoRunSkipFailures)
      && !isAutoRunFallbackRiskPromptDismissed()) {
      const result = await openAutoRunFallbackRiskConfirmModal(totalRuns, fallbackThreadIntervalMinutes);
      if (!result.confirmed) {
        return;
      }
      if (result.dismissPrompt) {
        setAutoRunFallbackRiskPromptDismissed(true);
      }
    }

    btnAutoRun.disabled = true;
    inputRunCount.disabled = true;
    const delayEnabled = inputAutoDelayEnabled.checked;
    const delayMinutes = normalizeAutoDelayMinutes(inputAutoDelayMinutes.value);
    inputAutoDelayMinutes.value = String(delayMinutes);
    btnAutoRun.innerHTML = delayEnabled
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> 计划中...'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> 运行中...';
    const response = await chrome.runtime.sendMessage({
      type: delayEnabled ? 'SCHEDULE_AUTO_RUN' : 'AUTO_RUN',
      source: 'sidepanel',
      payload: {
        totalRuns,
        delayMinutes,
        autoRunSkipFailures,
        mode,
      },
    });
    if (response?.error) {
      throw new Error(response.error);
    }
  } catch (err) {
    setDefaultAutoRunButton();
    inputRunCount.disabled = false;
    showToast(err.message, 'error');
  }
});

btnAutoContinue.addEventListener('click', async () => {
  const email = inputEmail.value.trim();
  if (!email) {
    showToast(
      isCustomMailProvider() ? '请先填写自定义注册邮箱。' : '请先获取或粘贴邮箱。',
      'warn'
    );
    return;
  }
  autoContinueBar.style.display = 'none';
  await chrome.runtime.sendMessage({ type: 'RESUME_AUTO_RUN', source: 'sidepanel', payload: { email } });
});

btnAutoRunNow?.addEventListener('click', async () => {
  try {
    btnAutoRunNow.disabled = true;
    const waitingInterval = currentAutoRun.phase === 'waiting_interval';
    await chrome.runtime.sendMessage({
      type: waitingInterval ? 'SKIP_AUTO_RUN_COUNTDOWN' : 'START_SCHEDULED_AUTO_RUN_NOW',
      source: 'sidepanel',
      payload: {},
    });
    if (waitingInterval) {
      showToast('已跳过当前倒计时，自动流程将立即继续。', 'info', 1800);
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnAutoRunNow.disabled = false;
  }
});

btnAutoCancelSchedule?.addEventListener('click', async () => {
  try {
    btnAutoCancelSchedule.disabled = true;
    await chrome.runtime.sendMessage({ type: 'CANCEL_SCHEDULED_AUTO_RUN', source: 'sidepanel', payload: {} });
    showToast('已取消倒计时计划。', 'info', 1800);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnAutoCancelSchedule.disabled = false;
  }
});

// Reset
btnReset.addEventListener('click', async () => {
  const confirmed = await openConfirmModal({
    title: '重置流程',
    message: '确认重置全部步骤和数据吗？',
    confirmLabel: '确认重置',
    confirmVariant: 'btn-danger',
  });
  if (!confirmed) {
    return;
  }

  await chrome.runtime.sendMessage({ type: 'RESET', source: 'sidepanel' });
  syncLatestState({
    stepStatuses: STEP_DEFAULT_STATUSES,
    email: null,
  });
  syncAutoRunState({
    autoRunning: false,
    autoRunPhase: 'idle',
    autoRunCurrentRun: 0,
    autoRunTotalRuns: 1,
    autoRunAttemptRun: 0,
    scheduledAutoRunAt: null,
    autoRunCountdownAt: null,
    autoRunCountdownTitle: '',
    autoRunCountdownNote: '',
  });
  displayOauthUrl.textContent = '等待中...';
  displayOauthUrl.classList.remove('has-value');
  displayLocalhostUrl.textContent = '等待中...';
  displayLocalhostUrl.classList.remove('has-value');
  inputEmail.value = '';
  displayStatus.textContent = '就绪';
  statusBar.className = 'status-bar';
  logArea.innerHTML = '';
  document.querySelectorAll('.step-row').forEach(row => row.className = 'step-row');
  document.querySelectorAll('.step-status').forEach(el => el.textContent = '');
  setDefaultAutoRunButton();
  applyAutoRunStatus(currentAutoRun);
  markSettingsDirty(false);
  updateStopButtonState(false);
  updateButtonStates();
  updateProgressCounter();
});

// Clear log
btnClearLog.addEventListener('click', () => {
  logArea.innerHTML = '';
});

// Save settings on change
inputEmail.addEventListener('change', async () => {
  const email = inputEmail.value.trim();
  inputEmail.value = email;
  try {
    if (email) {
      if (!validateCurrentRegistrationEmail(email, { showToastOnFailure: true })) {
        return;
      }
      const response = await chrome.runtime.sendMessage({ type: 'SAVE_EMAIL', source: 'sidepanel', payload: { email } });
      if (response?.error) {
        throw new Error(response.error);
      }
    } else {
      await setRuntimeEmailState(null);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});
inputEmail.addEventListener('input', updateButtonStates);
inputVpsUrl.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputVpsUrl.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

inputVpsPassword.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputVpsPassword.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

inputGmailImapEmail.addEventListener('input', () => {
  markSettingsDirty(true);
  updateMailLoginButtonState();
  scheduleSettingsAutoSave();
});
inputGmailImapEmail.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

inputGmailImapAppPassword.addEventListener('input', () => {
  markSettingsDirty(true);
  updateMailLoginButtonState();
  scheduleSettingsAutoSave();
});
inputGmailImapAppPassword.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

inputGmailImapHost.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputGmailImapHost.addEventListener('blur', () => {
  inputGmailImapHost.value = inputGmailImapHost.value.trim() || 'imap.gmail.com';
  saveSettings({ silent: true }).catch(() => { });
});

inputGmailImapPort.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputGmailImapPort.addEventListener('blur', () => {
  inputGmailImapPort.value = String(Math.max(1, Number(inputGmailImapPort.value || 993)));
  saveSettings({ silent: true }).catch(() => { });
});

inputPassword.addEventListener('input', () => {
  markSettingsDirty(true);
  updateButtonStates();
  scheduleSettingsAutoSave();
});
inputPassword.addEventListener('blur', () => {
  saveSettings({ silent: true }).catch(() => { });
});

selectMailProvider.addEventListener('change', async () => {
  selectMailProvider.value = 'custom';
  updateMailProviderUI();
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
});

inputRunCount.addEventListener('input', () => {
  updateFallbackThreadIntervalInputState();
});
inputRunCount.addEventListener('blur', () => {
  inputRunCount.value = String(getRunCountValue());
  updateFallbackThreadIntervalInputState();
});

inputAutoSkipFailures.addEventListener('change', async () => {
  if (inputAutoSkipFailures.checked && !isAutoSkipFailuresPromptDismissed()) {
    const result = await openAutoSkipFailuresConfirmModal();
    if (!result.confirmed) {
      inputAutoSkipFailures.checked = false;
      updateFallbackThreadIntervalInputState();
      return;
    }
    if (result.dismissPrompt) {
      setAutoSkipFailuresPromptDismissed(true);
    }
  }
  updateFallbackThreadIntervalInputState();
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
});

inputAutoSkipFailuresThreadIntervalMinutes.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputAutoSkipFailuresThreadIntervalMinutes.addEventListener('blur', () => {
  inputAutoSkipFailuresThreadIntervalMinutes.value = String(
    normalizeAutoRunThreadIntervalMinutes(inputAutoSkipFailuresThreadIntervalMinutes.value)
  );
  saveSettings({ silent: true }).catch(() => { });
});

inputAutoDelayEnabled.addEventListener('change', () => {
  updateAutoDelayInputState();
  markSettingsDirty(true);
  saveSettings({ silent: true }).catch(() => { });
});

inputAutoDelayMinutes.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputAutoDelayMinutes.addEventListener('blur', () => {
  inputAutoDelayMinutes.value = String(normalizeAutoDelayMinutes(inputAutoDelayMinutes.value));
  saveSettings({ silent: true }).catch(() => { });
});

function syncAutoStepDelayInputs() {
  inputAutoStepDelaySeconds.value = formatAutoStepDelayInputValue(inputAutoStepDelaySeconds.value);
}

inputAutoStepDelaySeconds.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputAutoStepDelaySeconds.addEventListener('blur', () => {
  syncAutoStepDelayInputs();
  saveSettings({ silent: true }).catch(() => { });
});

inputVerificationResendCount?.addEventListener('input', () => {
  markSettingsDirty(true);
  scheduleSettingsAutoSave();
});
inputVerificationResendCount?.addEventListener('blur', () => {
  inputVerificationResendCount.value = String(
    normalizeVerificationResendCount(
      inputVerificationResendCount.value,
      DEFAULT_VERIFICATION_RESEND_COUNT
    )
  );
  saveSettings({ silent: true }).catch(() => { });
});

// ============================================================
// Listen for Background broadcasts
// ============================================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'REQUEST_CUSTOM_VERIFICATION_BYPASS_CONFIRMATION': {
      (async () => {
        const step = Number(message.payload?.step);
        const promptCopy = getCustomVerificationPromptCopy(step);
        const confirmed = await openConfirmModal({
          title: promptCopy.title,
          message: promptCopy.message,
          confirmLabel: '确认跳过',
          confirmVariant: 'btn-danger',
          alert: promptCopy.alert,
        });
        sendResponse({ confirmed });
      })().catch((err) => {
        sendResponse({ error: err.message });
      });
      return true;
    }

    case 'SECURITY_BLOCKED_ALERT': {
      openConfirmModal({
        title: message.payload?.title || '流程已完全停止',
        message: message.payload?.message || '检测到安全风控，当前流程已完全停止。',
        alert: message.payload?.alert || { text: '检测到 Cloudflare 风控，请暂停当前操作。', tone: 'danger' },
        confirmLabel: '我知道了',
        confirmVariant: 'btn-danger',
      }).catch(() => {});
      break;
    }

    case 'LOG_ENTRY':
      appendLog(message.payload);
      if (message.payload.level === 'error') {
        showToast(message.payload.message, 'error');
      }
      break;

    case 'STEP_STATUS_CHANGED': {
      const { step, status } = message.payload;
      updateStepUI(step, status);
      chrome.runtime.sendMessage({ type: 'GET_STATE', source: 'sidepanel' }).then(state => {
        syncLatestState(state);
        syncAutoRunState(state);
        updateStatusDisplay(latestState);
        updateButtonStates();
        if (status === 'completed' || status === 'manual_completed' || status === 'skipped') {
          syncPasswordField(state);
          if (state.oauthUrl) {
            displayOauthUrl.textContent = state.oauthUrl;
            displayOauthUrl.classList.add('has-value');
          }
          if (state.localhostUrl) {
            displayLocalhostUrl.textContent = state.localhostUrl;
            displayLocalhostUrl.classList.add('has-value');
          }
        }
      }
      ).catch(() => { });
      break;
    }

    case 'AUTO_RUN_RESET': {
      // Full UI reset for next run
      syncLatestState({
        oauthUrl: null,
        localhostUrl: null,
        email: null,
        password: null,
        stepStatuses: STEP_DEFAULT_STATUSES,
        logs: [],
        scheduledAutoRunAt: null,
        autoRunCountdownAt: null,
        autoRunCountdownTitle: '',
        autoRunCountdownNote: '',
      });
      displayOauthUrl.textContent = '等待中...';
      displayOauthUrl.classList.remove('has-value');
      displayLocalhostUrl.textContent = '等待中...';
      displayLocalhostUrl.classList.remove('has-value');
      inputEmail.value = '';
      displayStatus.textContent = '就绪';
      statusBar.className = 'status-bar';
      logArea.innerHTML = '';
      document.querySelectorAll('.step-row').forEach(row => row.className = 'step-row');
      document.querySelectorAll('.step-status').forEach(el => el.textContent = '');
      syncAutoRunState({
        autoRunning: false,
        autoRunPhase: 'idle',
        autoRunCurrentRun: 0,
        autoRunTotalRuns: 1,
        autoRunAttemptRun: 0,
        scheduledAutoRunAt: null,
        autoRunCountdownAt: null,
        autoRunCountdownTitle: '',
        autoRunCountdownNote: '',
      });
      applyAutoRunStatus(currentAutoRun);
      updateProgressCounter();
      updateButtonStates();
      break;
    }

    case 'DATA_UPDATED': {
      syncLatestState(message.payload);
      if (message.payload.customEmailList !== undefined || message.payload.customEmailUsedMap !== undefined) {
        applyCustomEmailState(latestState);
      }
      if (message.payload.registeredEmailList !== undefined) {
        applyRegisteredEmailState(latestState);
      }
      if (message.payload.email !== undefined) {
        inputEmail.value = message.payload.email || '';
        renderCustomEmailState(latestState);
      }
      if (message.payload.password !== undefined) {
        inputPassword.value = message.payload.password || '';
      }
      if (message.payload.localCpaStep9Mode !== undefined) {
        setLocalCpaStep9Mode(message.payload.localCpaStep9Mode);
      }
      if (message.payload.cpaApiUrl !== undefined || message.payload.vpsUrl !== undefined) {
        syncEditableInputValue(inputVpsUrl, message.payload.cpaApiUrl || message.payload.vpsUrl || '');
      }
      if (message.payload.cpaManagementKey !== undefined || message.payload.vpsPassword !== undefined) {
        syncEditableInputValue(inputVpsPassword, message.payload.cpaManagementKey || message.payload.vpsPassword || '');
      }
      if (message.payload.gmailImapEmail !== undefined) {
        syncEditableInputValue(inputGmailImapEmail, message.payload.gmailImapEmail || '');
      }
      if (message.payload.gmailImapAppPassword !== undefined) {
        syncEditableInputValue(inputGmailImapAppPassword, message.payload.gmailImapAppPassword || '');
      }
      if (message.payload.gmailImapHost !== undefined) {
        syncEditableInputValue(inputGmailImapHost, message.payload.gmailImapHost || 'imap.gmail.com');
      }
      if (message.payload.gmailImapPort !== undefined) {
        syncEditableInputValue(inputGmailImapPort, String(message.payload.gmailImapPort || 993));
      }
      if (message.payload.oauthUrl !== undefined) {
        displayOauthUrl.textContent = message.payload.oauthUrl || '等待中...';
        displayOauthUrl.classList.toggle('has-value', Boolean(message.payload.oauthUrl));
      }
      if (message.payload.localhostUrl !== undefined) {
        displayLocalhostUrl.textContent = message.payload.localhostUrl || '等待中...';
        displayLocalhostUrl.classList.toggle('has-value', Boolean(message.payload.localhostUrl));
      }
      if (message.payload.autoRunSkipFailures !== undefined) {
        inputAutoSkipFailures.checked = Boolean(message.payload.autoRunSkipFailures);
        updateFallbackThreadIntervalInputState();
      }
      if (message.payload.autoRunDelayEnabled !== undefined) {
        inputAutoDelayEnabled.checked = Boolean(message.payload.autoRunDelayEnabled);
        updateAutoDelayInputState();
      }
      if (message.payload.autoRunDelayMinutes !== undefined) {
        inputAutoDelayMinutes.value = String(normalizeAutoDelayMinutes(message.payload.autoRunDelayMinutes));
      }
      if (message.payload.autoRunFallbackThreadIntervalMinutes !== undefined) {
        inputAutoSkipFailuresThreadIntervalMinutes.value = String(
          normalizeAutoRunThreadIntervalMinutes(message.payload.autoRunFallbackThreadIntervalMinutes)
        );
        updateFallbackThreadIntervalInputState();
      }
      if (message.payload.autoStepDelaySeconds !== undefined) {
        inputAutoStepDelaySeconds.value = formatAutoStepDelayInputValue(message.payload.autoStepDelaySeconds);
      }
      if (
        (
          message.payload.verificationResendCount !== undefined
          || message.payload.signupVerificationResendCount !== undefined
          || message.payload.loginVerificationResendCount !== undefined
        )
        && inputVerificationResendCount
      ) {
        const nextVerificationResendCount = message.payload.verificationResendCount !== undefined
          ? message.payload.verificationResendCount
          : (message.payload.signupVerificationResendCount ?? message.payload.loginVerificationResendCount);
        inputVerificationResendCount.value = String(
          normalizeVerificationResendCount(
            nextVerificationResendCount,
            DEFAULT_VERIFICATION_RESEND_COUNT
          )
        );
      }
      if (
        message.payload.customEmailList !== undefined
        || message.payload.customEmailUsedMap !== undefined
        || message.payload.registeredEmailList !== undefined
        || message.payload.email !== undefined
        || message.payload.gmailImapEmail !== undefined
        || message.payload.gmailImapAppPassword !== undefined
        || message.payload.gmailImapHost !== undefined
        || message.payload.gmailImapPort !== undefined
      ) {
        updateMailProviderUI();
        updateButtonStates();
      }
      break;
    }

    case 'AUTO_RUN_STATUS': {
      syncLatestState({
        autoRunning: ['scheduled', 'running', 'waiting_step', 'waiting_email', 'retrying', 'waiting_interval'].includes(message.payload.phase),
        autoRunPhase: message.payload.phase,
        autoRunCurrentRun: message.payload.currentRun,
        autoRunTotalRuns: message.payload.totalRuns,
        autoRunAttemptRun: message.payload.attemptRun,
        scheduledAutoRunAt: message.payload.scheduledAt ?? null,
        autoRunCountdownAt: message.payload.countdownAt ?? null,
        autoRunCountdownTitle: message.payload.countdownTitle ?? '',
        autoRunCountdownNote: message.payload.countdownNote ?? '',
      });
      applyAutoRunStatus(message.payload);
      updateStatusDisplay(latestState);
      updateButtonStates();
      break;
    }
  }
});

// ============================================================
// Init
// ============================================================

async function initializeSidepanel() {
  initializeManualStepActions();
  updateSaveButtonState();
  setLocalCpaStep9Mode(DEFAULT_LOCAL_CPA_STEP9_MODE);
  emailListTabsController?.render?.('pending');

  try {
    await sidepanelWindowScope?.registerOwnerWindow?.();
  } catch (error) {
    console.warn('Failed to register sidepanel owner window:', error);
  }

  await restoreState();
  syncPasswordToggleLabel();
  syncVpsUrlToggleLabel();
  syncVpsPasswordToggleLabel();
  syncGmailImapAppPasswordToggleLabel();
  updatePanelModeUI();
  updateMailLoginButtonState();
  updateButtonStates();
  updateStatusDisplay(latestState);
}

initializeSidepanel().catch((error) => {
  console.error('Failed to initialize sidepanel:', error);
});
