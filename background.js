// background.js — Service Worker: orchestration, state, tab management, message routing

importScripts(
  'managed-alias-utils.js',
  'background/native-host.js',
  'background/oauth-runtime.js',
  'background/cpa-auth-upload.js',
  'background/custom-email-pool.js',
  'background/panel-bridge.js',
  'background/generated-email-helpers.js',
  'background/signup-flow-helpers.js',
  'background/message-router.js',
  'background/verification-flow.js',
  'background/auto-run-controller.js',
  'background/tab-runtime.js',
  'background/navigation-utils.js',
  'background/logging-status.js',
  'background/steps/registry.js',
  'data/step-definitions.js',
  'background/steps/open-chatgpt.js',
  'background/steps/submit-signup-email.js',
  'background/steps/fill-password.js',
  'background/steps/fetch-signup-code.js',
  'background/steps/fill-profile.js',
  'background/steps/clear-login-cookies.js',
  'background/steps/oauth-login.js',
  'background/steps/fetch-login-code.js',
  'background/steps/confirm-oauth.js',
  'background/steps/platform-verify.js',
  'data/names.js',
  'content/activation-utils.js'
);

const SHARED_STEP_DEFINITIONS = self.MultiPageStepDefinitions?.getSteps?.() || [];
const STEP_IDS = SHARED_STEP_DEFINITIONS
  .map((definition) => Number(definition?.id))
  .filter(Number.isFinite)
  .sort((left, right) => left - right);
const LAST_STEP_ID = STEP_IDS[STEP_IDS.length - 1] || 10;
const FINAL_OAUTH_CHAIN_START_STEP = 7;

const customEmailPoolApi = self.MultiPageBackgroundCustomEmailPool || {};
const {
  isRecoverableStep9AuthFailure,
} = self.MultiPageActivationUtils;
const extractVerificationCodeFromMessage = () => '';
const normalizeHotmailServiceMode = () => 'local';
const normalizeCloudflareTempEmailAddress = (value = '') => String(value || '').trim().toLowerCase();
const normalizeCloudflareTempEmailBaseUrl = (value = '') => String(value || '').trim();
const normalizeCloudflareTempEmailDomain = (value = '') => String(value || '').trim().toLowerCase();
const normalizeCloudflareTempEmailDomains = (value) => Array.isArray(value)
  ? value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
  : [];
const findIcloudAliasByEmail = () => null;
const getConfiguredIcloudHostPreference = () => '';
const getIcloudHostHintFromMessage = () => '';
const getIcloudLoginUrlForHost = () => '';
const getIcloudMailUrlForHost = () => '';
const getIcloudSetupUrlForHost = () => '';
const normalizeBooleanMap = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => [key, true])
  );
};
const normalizeIcloudAliasList = (value) => Array.isArray(value) ? value : [];
const normalizeIcloudHost = () => '';
const pickReusableIcloudAlias = () => null;
const toNormalizedEmailSet = (value) => new Set(Array.isArray(value)
  ? value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
  : []);

const LOG_PREFIX = '[MultiPage:bg]';
const DUCK_AUTOFILL_URL = 'https://duckduckgo.com/email/settings/autofill';
const ICLOUD_SETUP_URLS = [
  'https://setup.icloud.com.cn/setup/ws/1',
  'https://setup.icloud.com/setup/ws/1',
];
const ICLOUD_LOGIN_URLS = [
  'https://www.icloud.com.cn/',
  'https://www.icloud.com/',
];
const GMAIL_PROVIDER = 'gmail';
const HOTMAIL_PROVIDER = 'hotmail-api';
const CLOUDFLARE_TEMP_EMAIL_GENERATOR = 'cloudflare-temp-email';
const HOTMAIL_MAILBOXES = ['INBOX', 'Junk'];
const STOP_ERROR_MESSAGE = '流程已被用户停止。';
const CLOUDFLARE_SECURITY_BLOCK_ERROR_PREFIX = 'CF_SECURITY_BLOCKED::';
const CLOUDFLARE_SECURITY_BLOCK_USER_MESSAGE = '您已触发Cloudflare 安全防护系统，已完全停止流程，请不要短时间内多次进行重新发送验证码，连续刷新、反复点击重试会加重风控；请先关闭页面等待 15-30 分钟，让系统的临时限制自动解除。或者更换浏览器';
const HUMAN_STEP_DELAY_MIN = 700;
const HUMAN_STEP_DELAY_MAX = 2200;
const STEP6_MAX_ATTEMPTS = 3;
const STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS = 8;
const OAUTH_FLOW_TIMEOUT_MS = 6 * 60 * 1000;
const SUB2API_STEP1_RESPONSE_TIMEOUT_MS = 90000;
const SUB2API_STEP9_RESPONSE_TIMEOUT_MS = 120000;
const DEFAULT_SUB2API_URL = 'https://sub2api.hisence.fun/admin/accounts';
const DEFAULT_SUB2API_GROUP_NAME = 'codex';
const DEFAULT_SUB2API_PROXY_NAME = '';
const DEFAULT_SUB2API_REDIRECT_URI = 'http://localhost:1455/auth/callback';
const AUTO_RUN_TIMER_ALARM_NAME = 'auto-run-timer';
const AUTO_RUN_TIMER_KIND_SCHEDULED_START = 'scheduled_start';
const AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS = 'between_rounds';
const AUTO_RUN_TIMER_KIND_BEFORE_RETRY = 'before_retry';
const AUTO_RUN_DELAY_MIN_MINUTES = 1;
const AUTO_RUN_DELAY_MAX_MINUTES = 1440;
const AUTO_RUN_RETRY_DELAY_MS = 3000;
const AUTO_RUN_MAX_RETRIES_PER_ROUND = 3;
const AUTO_STEP_DELAY_MIN_ALLOWED_SECONDS = 0;
const AUTO_STEP_DELAY_MAX_ALLOWED_SECONDS = 600;
const VERIFICATION_RESEND_COUNT_MIN = 0;
const VERIFICATION_RESEND_COUNT_MAX = 20;
const DEFAULT_VERIFICATION_RESEND_COUNT = 4;
const LEGACY_AUTO_STEP_DELAY_KEYS = ['autoStepRandomDelayMinSeconds', 'autoStepRandomDelayMaxSeconds'];
const LEGACY_VERIFICATION_RESEND_COUNT_KEYS = ['signupVerificationResendCount', 'loginVerificationResendCount'];
const DEFAULT_LOCAL_CPA_STEP9_MODE = 'submit';
const MAIL_2925_MODE_PROVIDE = 'provide';
const MAIL_2925_MODE_RECEIVE = 'receive';
const DEFAULT_MAIL_2925_MODE = MAIL_2925_MODE_PROVIDE;
const HOTMAIL_SERVICE_MODE_REMOTE = 'remote';
const HOTMAIL_SERVICE_MODE_LOCAL = 'local';
const DEFAULT_HOTMAIL_REMOTE_BASE_URL = '';
const DEFAULT_HOTMAIL_LOCAL_BASE_URL = 'http://127.0.0.1:17373';
const DEFAULT_ACCOUNT_RUN_HISTORY_HELPER_BASE_URL = DEFAULT_HOTMAIL_LOCAL_BASE_URL;
const HOTMAIL_LOCAL_HELPER_TIMEOUT_MS = 45000;
const DEFAULT_LUCKMAIL_PROJECT_CODE = 'openai';
const DISPLAY_TIMEZONE = 'Asia/Shanghai';
const MICROSOFT_TOKEN_DNR_RULE_ID = 1001;
const PERSISTENT_ALIAS_STATE_KEYS = ['manualAliasUsage', 'preservedAliases'];
const ACCOUNT_RUN_HISTORY_STORAGE_KEY = 'accountRunHistory';

function normalizeCustomEmailEntry(value = '') {
  return typeof customEmailPoolApi.normalizeCustomEmailEntry === 'function'
    ? customEmailPoolApi.normalizeCustomEmailEntry(value)
    : '';
}

function normalizeCustomEmailList(value) {
  return typeof customEmailPoolApi.normalizeCustomEmailList === 'function'
    ? customEmailPoolApi.normalizeCustomEmailList(value)
    : [];
}

function normalizeCustomEmailUsedMap(value, emailList = []) {
  return typeof customEmailPoolApi.normalizeCustomEmailUsedMap === 'function'
    ? customEmailPoolApi.normalizeCustomEmailUsedMap(value, emailList)
    : {};
}

function pickNextCustomEmail(emailList = [], usedMap = {}, options = {}) {
  return typeof customEmailPoolApi.pickNextCustomEmail === 'function'
    ? customEmailPoolApi.pickNextCustomEmail(emailList, usedMap, options)
    : '';
}

function getCustomEmailPoolStats(emailList = [], usedMap = {}) {
  return typeof customEmailPoolApi.getCustomEmailPoolStats === 'function'
    ? customEmailPoolApi.getCustomEmailPoolStats(emailList, usedMap)
    : {
      total: 0,
      used: 0,
      remaining: 0,
      nextEmail: '',
    };
}

initializeSessionStorageAccess();
setupDeclarativeNetRequestRules();

function setupDeclarativeNetRequestRules() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) {
    return;
  }

  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [MICROSOFT_TOKEN_DNR_RULE_ID],
    addRules: [{
      id: MICROSOFT_TOKEN_DNR_RULE_ID,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Origin', operation: 'remove' },
        ],
      },
      condition: {
        urlFilter: 'login.microsoftonline.com/*/oauth2/v2.0/token',
        resourceTypes: ['xmlhttprequest'],
      },
    }],
  }).catch((error) => {
    console.warn(LOG_PREFIX, 'Failed to setup declarativeNetRequest rules:', error?.message || error);
  });
}

// ============================================================
// 状态管理（chrome.storage.session + chrome.storage.local）
// ============================================================

const PERSISTED_SETTING_DEFAULTS = {
  panelMode: 'cpa',
  vpsUrl: '',
  vpsPassword: '',
  cpaApiUrl: '',
  cpaManagementKey: '',
  gmailImapEmail: '',
  gmailImapAppPassword: '',
  gmailImapHost: 'imap.gmail.com',
  gmailImapPort: 993,
  localCpaStep9Mode: DEFAULT_LOCAL_CPA_STEP9_MODE,
  customPassword: '',
  autoRunSkipFailures: false,
  autoRunFallbackThreadIntervalMinutes: 0,
  autoRunDelayEnabled: false,
  autoRunDelayMinutes: 30,
  autoStepDelaySeconds: null,
  verificationResendCount: DEFAULT_VERIFICATION_RESEND_COUNT,
  mailProvider: 'custom',
  customEmailList: [],
  customEmailUsedMap: {},
  registeredEmailList: [],
};

const PERSISTED_SETTING_KEYS = Object.keys(PERSISTED_SETTING_DEFAULTS);
const SETTINGS_EXPORT_SCHEMA_VERSION = 1;
const SETTINGS_EXPORT_FILENAME_PREFIX = 'multipage-settings';
const STEP6_PRE_LOGIN_COOKIE_CLEAR_DELAY_MS = 25000;
const PRE_LOGIN_COOKIE_CLEAR_DOMAINS = [
  'chatgpt.com',
  'chat.openai.com',
  'openai.com',
  'auth.openai.com',
  'auth0.openai.com',
  'accounts.openai.com',
];
const PRE_LOGIN_COOKIE_CLEAR_ORIGINS = [
  'https://chatgpt.com',
  'https://chat.openai.com',
  'https://auth.openai.com',
  'https://auth0.openai.com',
  'https://accounts.openai.com',
  'https://openai.com',
];

const DEFAULT_STATE = {
  currentStep: 0, // 当前流程执行到的步骤编号。
  stepStatuses: Object.fromEntries(STEP_IDS.map((stepId) => [stepId, 'pending'])),
  oauthUrl: null, // 运行时抓取到的 OAuth 地址，不要手动预填。
  email: null, // 运行时邮箱，由程序自动获取并写入，不能手动预填。
  password: null, // 运行时实际密码，由 customPassword 或程序自动生成后写入。
  accounts: [], // 已生成账号记录：{ email, password, createdAt }。
  manualAliasUsage: {},
  preservedAliases: {},
  lastEmailTimestamp: null, // 最近一次获取到邮箱数据的运行时时间戳。
  lastSignupCode: null, // 注册验证码，运行时由程序自动读取并写入。
  lastLoginCode: null, // 登录验证码，运行时由程序自动读取并写入。
  localhostUrl: null, // 运行时捕获到的 localhost 回调地址，不要手动预填。
  oauthRuntime: null, // Step 7 本地生成的 OAuth PKCE 运行时上下文。
  flowStartTime: null, // 当前流程开始时间。
  tabRegistry: {}, // 程序维护的标签页注册表。
  sourceLastUrls: {}, // 各来源页面最近一次打开的地址记录。
  ownerWindowId: null, // 当前侧边栏所属窗口，扩展打开的新页会优先复用该窗口。
  logs: [], // 侧边栏展示的运行日志。
  ...PERSISTED_SETTING_DEFAULTS, // 合并 chrome.storage.local 中持久化保存的用户配置。
  autoRunning: false, // 当前是否处于自动运行中。
  autoRunPhase: 'idle', // 当前自动运行阶段。
  autoRunCurrentRun: 0, // 自动运行当前执行到第几轮。
  autoRunTotalRuns: 1, // 自动运行计划总轮数。
  autoRunAttemptRun: 0, // 当前轮次的重试序号。
  autoRunSessionId: 0,
  autoRunRoundSummaries: [], // 自动运行轮次摘要。
  scheduledAutoRunAt: null, // 自动运行计划启动时间戳。
  autoRunTimerPlan: null, // 自动运行可恢复计时计划快照。
  autoRunCountdownAt: null,
  autoRunCountdownTitle: '',
  autoRunCountdownNote: '',
  signupVerificationRequestedAt: null,
  loginVerificationRequestedAt: null,
  oauthFlowDeadlineAt: null,
};

function normalizeAutoRunDelayMinutes(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return PERSISTED_SETTING_DEFAULTS.autoRunDelayMinutes;
  }
  return Math.min(
    AUTO_RUN_DELAY_MAX_MINUTES,
    Math.max(AUTO_RUN_DELAY_MIN_MINUTES, Math.floor(numeric))
  );
}

function normalizeAutoRunFallbackThreadIntervalMinutes(value) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    return 0;
  }

  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.min(
    AUTO_RUN_DELAY_MAX_MINUTES,
    Math.max(0, Math.floor(numeric))
  );
}

function normalizeAutoStepDelaySeconds(value, fallback = null) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    return fallback;
  }

  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(
    AUTO_STEP_DELAY_MAX_ALLOWED_SECONDS,
    Math.max(AUTO_STEP_DELAY_MIN_ALLOWED_SECONDS, Math.floor(numeric))
  );
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

function resolveLegacyAutoStepDelaySeconds(input = {}) {
  const hasLegacyMin = input.autoStepRandomDelayMinSeconds !== undefined;
  const hasLegacyMax = input.autoStepRandomDelayMaxSeconds !== undefined;
  if (!hasLegacyMin && !hasLegacyMax) {
    return undefined;
  }

  const minSeconds = normalizeAutoStepDelaySeconds(input.autoStepRandomDelayMinSeconds, null);
  const maxSeconds = normalizeAutoStepDelaySeconds(input.autoStepRandomDelayMaxSeconds, null);
  if (minSeconds === null && maxSeconds === null) {
    return null;
  }
  if (minSeconds === null) {
    return maxSeconds;
  }
  if (maxSeconds === null) {
    return minSeconds;
  }
  return Math.round((minSeconds + maxSeconds) / 2);
}

function normalizeRunCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.max(1, Math.floor(numeric));
}

function normalizeAutoRunTimerKind(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === AUTO_RUN_TIMER_KIND_SCHEDULED_START) {
    return AUTO_RUN_TIMER_KIND_SCHEDULED_START;
  }
  if (normalized === AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS) {
    return AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS;
  }
  if (normalized === AUTO_RUN_TIMER_KIND_BEFORE_RETRY) {
    return AUTO_RUN_TIMER_KIND_BEFORE_RETRY;
  }
  return '';
}

function normalizeAutoRunSessionId(value) {
  const numeric = Math.floor(Number(value) || 0);
  return numeric > 0 ? numeric : 0;
}

function createAutoRunSessionId() {
  autoRunSessionSeed = Math.max(autoRunSessionSeed + 1, Date.now());
  autoRunSessionId = autoRunSessionSeed;
  return autoRunSessionId;
}

function setCurrentAutoRunSessionId(value) {
  autoRunSessionId = normalizeAutoRunSessionId(value);
  return autoRunSessionId;
}

function clearCurrentAutoRunSessionId(expectedSessionId = null) {
  if (expectedSessionId === null) {
    autoRunSessionId = 0;
    return autoRunSessionId;
  }

  const normalizedExpected = normalizeAutoRunSessionId(expectedSessionId);
  if (!normalizedExpected || normalizedExpected === autoRunSessionId) {
    autoRunSessionId = 0;
  }
  return autoRunSessionId;
}

function isCurrentAutoRunSessionId(value) {
  const normalized = normalizeAutoRunSessionId(value);
  return normalized > 0 && normalized === autoRunSessionId;
}

function throwIfAutoRunSessionStopped(sessionId) {
  const normalizedSessionId = normalizeAutoRunSessionId(sessionId);
  if (normalizedSessionId && !isCurrentAutoRunSessionId(normalizedSessionId)) {
    throw new Error(STOP_ERROR_MESSAGE);
  }
  throwIfStopped();
}

function normalizeAutoRunTimerPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return null;
  }

  const kind = normalizeAutoRunTimerKind(plan.kind);
  if (!kind) {
    return null;
  }

  const fireAt = Number(plan.fireAt);
  if (!Number.isFinite(fireAt)) {
    return null;
  }

  const totalRuns = normalizeRunCount(plan.totalRuns);
  const autoRunSkipFailures = Boolean(plan.autoRunSkipFailures);
  const mode = plan.mode === 'continue' ? 'continue' : 'restart';
  const currentRun = Math.max(0, Math.min(totalRuns, Math.floor(Number(plan.currentRun) || 0)));
  const attemptRun = Math.max(
    0,
    Math.min(AUTO_RUN_MAX_RETRIES_PER_ROUND + 1, Math.floor(Number(plan.attemptRun) || 0))
  );
  const autoRunSessionId = normalizeAutoRunSessionId(plan.autoRunSessionId ?? plan.sessionId);
  const roundSummaries = serializeAutoRunRoundSummaries(totalRuns, plan.roundSummaries);
  const countdownTitle = String(plan.countdownTitle || '').trim();
  const countdownNote = String(plan.countdownNote || '').trim();

  if (kind === AUTO_RUN_TIMER_KIND_SCHEDULED_START) {
    return {
      kind,
      fireAt,
      totalRuns,
      autoRunSkipFailures,
      mode,
      currentRun: 0,
      attemptRun: 0,
      autoRunSessionId,
      roundSummaries: [],
      countdownTitle: countdownTitle || '已计划自动运行',
      countdownNote: countdownNote || `计划于 ${formatAutoRunScheduleTime(fireAt)} 开始`,
    };
  }

  if (kind === AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS) {
    const normalizedCurrentRun = Math.max(1, Math.min(totalRuns, currentRun));
    const normalizedAttemptRun = Math.max(1, attemptRun);
    return {
      kind,
      fireAt,
      totalRuns,
      autoRunSkipFailures,
      mode: 'restart',
      currentRun: normalizedCurrentRun,
      attemptRun: normalizedAttemptRun,
      autoRunSessionId,
      roundSummaries,
      countdownTitle: countdownTitle || '线程间隔中',
      countdownNote: countdownNote || `第 ${Math.min(normalizedCurrentRun + 1, totalRuns)}/${totalRuns} 轮即将开始`,
    };
  }

  const normalizedCurrentRun = Math.max(1, Math.min(totalRuns, currentRun));
  const normalizedAttemptRun = Math.max(1, attemptRun);
  return {
    kind,
    fireAt,
    totalRuns,
    autoRunSkipFailures,
    mode: 'restart',
    currentRun: normalizedCurrentRun,
    attemptRun: normalizedAttemptRun,
    autoRunSessionId,
    roundSummaries,
    countdownTitle: countdownTitle || '线程间隔中',
    countdownNote: countdownNote || `第 ${normalizedCurrentRun}/${totalRuns} 轮第 ${normalizedAttemptRun} 次尝试即将开始`,
  };
}

function normalizeAutoRunTimerPlanFromState(state = {}) {
  const directPlan = normalizeAutoRunTimerPlan(state.autoRunTimerPlan);
  if (directPlan) {
    return directPlan;
  }

  if (state.autoRunPhase !== 'scheduled') {
    return null;
  }

  const legacyScheduledAt = Number(state.scheduledAutoRunAt);
  if (!Number.isFinite(legacyScheduledAt)) {
    return null;
  }

  return normalizeAutoRunTimerPlan({
    kind: AUTO_RUN_TIMER_KIND_SCHEDULED_START,
    fireAt: legacyScheduledAt,
    totalRuns: state.scheduledAutoRunPlan?.totalRuns ?? state.autoRunTotalRuns,
    autoRunSkipFailures: state.scheduledAutoRunPlan?.autoRunSkipFailures ?? state.autoRunSkipFailures,
    autoRunSessionId: state.autoRunSessionId,
    mode: state.scheduledAutoRunPlan?.mode,
  });
}

function getAutoRunTimerPlanPhase(kind = '') {
  return kind === AUTO_RUN_TIMER_KIND_SCHEDULED_START ? 'scheduled' : 'waiting_interval';
}

function getAutoRunTimerStatusPayload(plan) {
  const normalizedPlan = normalizeAutoRunTimerPlan(plan);
  if (!normalizedPlan) {
    return null;
  }

  const phase = getAutoRunTimerPlanPhase(normalizedPlan.kind);
  return {
    phase,
    currentRun: normalizedPlan.currentRun,
    totalRuns: normalizedPlan.totalRuns,
    attemptRun: normalizedPlan.attemptRun,
    sessionId: normalizedPlan.autoRunSessionId,
    scheduledAt: phase === 'scheduled' ? normalizedPlan.fireAt : null,
    countdownAt: normalizedPlan.fireAt,
    countdownTitle: normalizedPlan.countdownTitle,
    countdownNote: normalizedPlan.countdownNote,
  };
}

function normalizeEmailGenerator(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'custom' || normalized === 'manual') {
    return 'custom';
  }
  return 'custom';
}

function normalizePanelMode(value = '') {
  return 'cpa';
}

function normalizeMailProvider(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === GMAIL_PROVIDER) {
    return GMAIL_PROVIDER;
  }
  return 'custom';
}

function normalizeMail2925Mode(value = '') {
  return String(value || '').trim().toLowerCase() === MAIL_2925_MODE_RECEIVE
    ? MAIL_2925_MODE_RECEIVE
    : DEFAULT_MAIL_2925_MODE;
}

function normalizeLocalCpaStep9Mode(value = '') {
  return String(value || '').trim().toLowerCase() === 'bypass'
    ? 'bypass'
    : DEFAULT_LOCAL_CPA_STEP9_MODE;
}

function normalizeCloudflareDomain(rawValue = '') {
  let value = String(rawValue || '').trim().toLowerCase();
  if (!value) return '';
  value = value.replace(/^@+/, '');
  value = value.replace(/^https?:\/\//, '');
  value = value.replace(/\/.*$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(value)) return '';
  return value;
}

function normalizeCloudflareDomains(values) {
  const normalizedDomains = [];
  const seen = new Set();

  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizeCloudflareDomain(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    normalizedDomains.push(normalized);
  }

  return normalizedDomains;
}

function normalizeHotmailRemoteBaseUrl(rawValue = '') {
  const value = String(rawValue || '').trim();
  if (!value) return DEFAULT_HOTMAIL_REMOTE_BASE_URL;

  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return DEFAULT_HOTMAIL_REMOTE_BASE_URL;
    }

    if (parsed.pathname.endsWith('/api/mail-new') || parsed.pathname.endsWith('/api/mail-all') || parsed.pathname === '/api.html') {
      parsed.pathname = '';
      parsed.search = '';
      parsed.hash = '';
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return DEFAULT_HOTMAIL_REMOTE_BASE_URL;
  }
}

function normalizeHotmailLocalBaseUrl(rawValue = '') {
  const value = String(rawValue || '').trim();
  if (!value) return DEFAULT_HOTMAIL_LOCAL_BASE_URL;

  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return DEFAULT_HOTMAIL_LOCAL_BASE_URL;
    }

    if (['/messages', '/code', '/clear', '/token'].includes(parsed.pathname)) {
      parsed.pathname = '';
      parsed.search = '';
      parsed.hash = '';
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return DEFAULT_HOTMAIL_LOCAL_BASE_URL;
  }
}

function normalizeAccountRunHistoryHelperBaseUrl(rawValue = '') {
  const value = String(rawValue || '').trim();
  if (!value) return DEFAULT_ACCOUNT_RUN_HISTORY_HELPER_BASE_URL;

  try {
    const parsed = new URL(value);
    if (parsed.pathname === '/append-account-log' || parsed.pathname === '/sync-account-run-records') {
      parsed.pathname = '';
      parsed.search = '';
      parsed.hash = '';
    }
    return normalizeHotmailLocalBaseUrl(parsed.toString());
  } catch {
    return normalizeHotmailLocalBaseUrl(value);
  }
}

function normalizeCloudflareTempEmailReceiveMailbox(value = '') {
  const normalized = normalizeCloudflareTempEmailAddress(value);
  if (!normalized) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
}

function normalizePersistentSettingValue(key, value) {
  switch (key) {
    case 'panelMode':
      return normalizePanelMode(value);
    case 'vpsUrl':
      return String(value || '').trim();
    case 'vpsPassword':
      return String(value || '');
    case 'cpaApiUrl':
      return String(value || '').trim();
    case 'cpaManagementKey':
      return String(value || '');
    case 'gmailImapEmail':
      return normalizeCustomEmailEntry(value);
    case 'gmailImapAppPassword':
      return String(value || '').trim();
    case 'gmailImapHost':
      return String(value || '').trim().toLowerCase() || 'imap.gmail.com';
    case 'gmailImapPort': {
      const numeric = Math.floor(Number(value) || 993);
      return numeric > 0 ? numeric : 993;
    }
    case 'localCpaStep9Mode':
      return normalizeLocalCpaStep9Mode(value);
    case 'customPassword':
      return String(value || '');
    case 'autoRunSkipFailures':
    case 'autoRunDelayEnabled':
      return Boolean(value);
    case 'autoRunFallbackThreadIntervalMinutes':
      return normalizeAutoRunFallbackThreadIntervalMinutes(value);
    case 'autoRunDelayMinutes':
      return normalizeAutoRunDelayMinutes(value);
    case 'autoStepDelaySeconds':
      return normalizeAutoStepDelaySeconds(value, PERSISTED_SETTING_DEFAULTS.autoStepDelaySeconds);
    case 'verificationResendCount':
      return normalizeVerificationResendCount(value, DEFAULT_VERIFICATION_RESEND_COUNT);
    case 'mailProvider':
      return normalizeMailProvider(value);
    case 'mail2925Mode':
      return normalizeMail2925Mode(value);
    case 'emailGenerator':
      return normalizeEmailGenerator(value);
    case 'autoDeleteUsedIcloudAlias':
      return Boolean(value);
    case 'icloudHostPreference':
      return normalizeIcloudHost(value) || 'auto';
    case 'customEmailList':
      return normalizeCustomEmailList(value);
    case 'customEmailUsedMap':
      return normalizeCustomEmailUsedMap(value);
    case 'registeredEmailList':
      return normalizeRegisteredEmailList(value);
    case 'gmailBaseEmail':
    case 'mail2925BaseEmail':
    case 'emailPrefix':
      return String(value || '').trim();
    case 'inbucketHost':
      return String(value || '').trim();
    case 'inbucketMailbox':
      return String(value || '').trim();
    case 'hotmailServiceMode':
      return normalizeHotmailServiceMode(value);
    case 'hotmailRemoteBaseUrl':
      return normalizeHotmailRemoteBaseUrl(value);
    case 'hotmailLocalBaseUrl':
      return normalizeHotmailLocalBaseUrl(value);
    case 'cloudflareDomain':
      return normalizeCloudflareDomain(value);
    case 'cloudflareDomains':
      return normalizeCloudflareDomains(value);
    case 'cloudflareTempEmailBaseUrl':
      return normalizeCloudflareTempEmailBaseUrl(value);
    case 'cloudflareTempEmailAdminAuth':
    case 'cloudflareTempEmailCustomAuth':
      return String(value || '');
    case 'cloudflareTempEmailReceiveMailbox':
      return normalizeCloudflareTempEmailReceiveMailbox(value);
    case 'cloudflareTempEmailDomain':
      return normalizeCloudflareTempEmailDomain(value);
    case 'cloudflareTempEmailDomains':
      return normalizeCloudflareTempEmailDomains(value);
    case 'hotmailAccounts':
      return normalizeHotmailAccounts(value);
    default:
      return value;
  }
}

function buildPersistentSettingsPayload(input = {}, options = {}) {
  const { fillDefaults = false, requireKnownKeys = false } = options;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('\u914d\u7f6e\u5185\u5bb9\u683c\u5f0f\u65e0\u6548\u3002');
  }

  const normalizedInput = { ...input };
  if (normalizedInput.autoStepDelaySeconds === undefined) {
    const legacyAutoStepDelaySeconds = resolveLegacyAutoStepDelaySeconds(normalizedInput);
    if (legacyAutoStepDelaySeconds !== undefined) {
      normalizedInput.autoStepDelaySeconds = legacyAutoStepDelaySeconds;
    }
  }
  if (normalizedInput.verificationResendCount === undefined) {
    const legacyVerificationResendCount = normalizedInput.signupVerificationResendCount !== undefined
      ? normalizedInput.signupVerificationResendCount
      : normalizedInput.loginVerificationResendCount;
    if (legacyVerificationResendCount !== undefined) {
      normalizedInput.verificationResendCount = legacyVerificationResendCount;
    }
  }

  const payload = {};
  let matchedKeyCount = 0;
  for (const key of PERSISTED_SETTING_KEYS) {
    if (normalizedInput[key] !== undefined) {
      payload[key] = normalizePersistentSettingValue(key, normalizedInput[key]);
      matchedKeyCount += 1;
    } else if (fillDefaults) {
      payload[key] = normalizePersistentSettingValue(key, PERSISTED_SETTING_DEFAULTS[key]);
    }
  }

  if (requireKnownKeys && matchedKeyCount === 0) {
    throw new Error('\u914d\u7f6e\u6587\u4ef6\u4e2d\u6ca1\u6709\u53ef\u8bc6\u522b\u7684\u914d\u7f6e\u5185\u5bb9\u3002');
  }

  if (payload.cloudflareDomains) {
    const domains = normalizeCloudflareDomains(payload.cloudflareDomains);
    if (payload.cloudflareDomain && !domains.includes(payload.cloudflareDomain)) {
      domains.unshift(payload.cloudflareDomain);
    }
    payload.cloudflareDomains = domains;
  }
  if (payload.cloudflareTempEmailDomains) {
    const domains = normalizeCloudflareTempEmailDomains(payload.cloudflareTempEmailDomains);
    if (payload.cloudflareTempEmailDomain && !domains.includes(payload.cloudflareTempEmailDomain)) {
      domains.unshift(payload.cloudflareTempEmailDomain);
    }
    payload.cloudflareTempEmailDomains = domains;
  }
  if (
    Object.prototype.hasOwnProperty.call(payload, 'customEmailList')
    || Object.prototype.hasOwnProperty.call(payload, 'customEmailUsedMap')
  ) {
    const normalizedCustomEmailList = Object.prototype.hasOwnProperty.call(payload, 'customEmailList')
      ? normalizeCustomEmailList(payload.customEmailList)
      : undefined;
    if (normalizedCustomEmailList !== undefined) {
      payload.customEmailList = normalizedCustomEmailList;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'customEmailUsedMap')) {
      payload.customEmailUsedMap = normalizeCustomEmailUsedMap(
        payload.customEmailUsedMap,
        normalizedCustomEmailList
      );
    }
  }

  return payload;
}

async function getPersistedSettings() {
  const stored = await chrome.storage.local.get([
    ...PERSISTED_SETTING_KEYS,
    ...LEGACY_AUTO_STEP_DELAY_KEYS,
    ...LEGACY_VERIFICATION_RESEND_COUNT_KEYS,
  ]);
  return buildPersistentSettingsPayload(stored, { fillDefaults: true });
}

async function getPersistedAliasState() {
  return {
    manualAliasUsage: {},
    preservedAliases: {},
  };
}

async function getState() {
  const [state, persistedSettings, persistedAliasState] = await Promise.all([
    chrome.storage.session.get(null),
    getPersistedSettings(),
    getPersistedAliasState(),
  ]);
  return { ...DEFAULT_STATE, ...persistedSettings, ...persistedAliasState, ...state };
}

async function initializeSessionStorageAccess() {
  try {
    if (chrome.storage?.session?.setAccessLevel) {
      await chrome.storage.session.setAccessLevel({
        accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
      });
      console.log(LOG_PREFIX, 'Enabled storage.session for content scripts');
    }
  } catch (err) {
    console.warn(LOG_PREFIX, 'Failed to enable storage.session for content scripts:', err?.message || err);
  }
}

async function setState(updates) {
  console.log(LOG_PREFIX, 'storage.set:', JSON.stringify(updates).slice(0, 200));
  if (Object.keys(updates || {}).length > 0) {
    await chrome.storage.session.set(updates);
    const persistentAliasUpdates = {};
    if (Object.prototype.hasOwnProperty.call(updates, 'manualAliasUsage')) {
      persistentAliasUpdates.manualAliasUsage = normalizeBooleanMap(updates.manualAliasUsage);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'preservedAliases')) {
      persistentAliasUpdates.preservedAliases = normalizeBooleanMap(updates.preservedAliases);
    }
    if (Object.keys(persistentAliasUpdates).length > 0) {
      await chrome.storage.local.set(persistentAliasUpdates);
    }
  }
}

async function setPersistentSettings(updates) {
  const persistedUpdates = buildPersistentSettingsPayload(updates);

  if (Object.keys(persistedUpdates).length > 0) {
    await chrome.storage.local.set(persistedUpdates);
  }
}

function broadcastDataUpdate(payload) {
  chrome.runtime.sendMessage({
    type: 'DATA_UPDATED',
    payload,
  }).catch(() => { });
}

function broadcastIcloudAliasesChanged(payload = {}) {
  chrome.runtime.sendMessage({
    type: 'ICLOUD_ALIASES_CHANGED',
    payload,
  }).catch(() => { });
}

async function setEmailStateSilently(email) {
  await setState({ email });
  broadcastDataUpdate({ email });
}

async function setEmailState(email) {
  await setEmailStateSilently(email);
  if (email) {
    await appendManualAccountRunRecordIfNeeded('step2_stopped', null, '步骤 2 已使用邮箱，流程尚未完成。');
    await resumeAutoRunIfWaitingForEmail();
  }
}

async function setPasswordState(password) {
  await setState({ password });
  broadcastDataUpdate({ password });
}

function getManualAliasUsageMap(state) {
  return normalizeBooleanMap(state?.manualAliasUsage);
}

function getPreservedAliasMap(state) {
  return normalizeBooleanMap(state?.preservedAliases);
}

function isAliasPreserved(state, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return false;
  return Boolean(getPreservedAliasMap(state)[normalizedEmail]);
}

function getEffectiveUsedEmails(state) {
  return toNormalizedEmailSet(getManualAliasUsageMap(state));
}

async function resetState() {
  console.log(LOG_PREFIX, 'Resetting all state');
  // Preserve settings and persistent data across resets
  const [prev, persistedSettings, persistedAliasState] = await Promise.all([
    chrome.storage.session.get([
      'seenCodes',
      'seenInbucketMailIds',
      'accounts',
      'tabRegistry',
      'sourceLastUrls',
      'ownerWindowId',
    ]),
    getPersistedSettings(),
    getPersistedAliasState(),
  ]);
  await chrome.storage.session.clear();
  await chrome.storage.session.set({
    ...DEFAULT_STATE,
    ...persistedSettings,
    ...persistedAliasState,
    seenCodes: prev.seenCodes || [],
    seenInbucketMailIds: prev.seenInbucketMailIds || [],
    accounts: prev.accounts || [],
    tabRegistry: prev.tabRegistry || {},
    sourceLastUrls: prev.sourceLastUrls || {},
    ownerWindowId: prev.ownerWindowId ?? null,
  });
}

/**
 * Generate a random password: 14 chars, mix of uppercase, lowercase, digits, symbols.
 */
function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*?';
  const all = upper + lower + digits + symbols;

  // Ensure at least one of each type
  let pw = '';
  pw += upper[Math.floor(Math.random() * upper.length)];
  pw += lower[Math.floor(Math.random() * lower.length)];
  pw += digits[Math.floor(Math.random() * digits.length)];
  pw += symbols[Math.floor(Math.random() * symbols.length)];

  // Fill remaining 10 chars
  for (let i = 0; i < 10; i++) {
    pw += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle
  return pw.split('').sort(() => Math.random() - 0.5).join('');
}

function normalizeHotmailAccount(account = {}) {
  const normalizedLastAuthAt = Number.isFinite(Number(account.lastAuthAt)) ? Number(account.lastAuthAt) : 0;
  const normalizedStatus = String(
    account.status
    || (normalizedLastAuthAt > 0 ? 'authorized' : 'pending')
  );
  return {
    id: String(account.id || crypto.randomUUID()),
    email: String(account.email || '').trim(),
    password: String(account.password || ''),
    clientId: String(account.clientId || '').trim(),
    refreshToken: String(account.refreshToken || ''),
    status: normalizedStatus,
    enabled: account.enabled !== undefined ? Boolean(account.enabled) : true,
    used: Boolean(account.used),
    lastUsedAt: Number.isFinite(Number(account.lastUsedAt)) ? Number(account.lastUsedAt) : 0,
    lastAuthAt: normalizedLastAuthAt,
    lastError: String(account.lastError || ''),
  };
}

function normalizeHotmailAccounts(accounts) {
  if (!Array.isArray(accounts)) return [];

  const deduped = new Map();
  for (const account of accounts) {
    const normalized = normalizeHotmailAccount(account);
    if (!normalized.email && !normalized.id) continue;
    deduped.set(normalized.id, normalized);
  }
  return [...deduped.values()];
}

function normalizeRegisteredEmailList(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || '').split(/[\r\n,;]+/);
  const seen = new Set();
  const normalized = [];

  for (const item of source) {
    const email = normalizeCustomEmailEntry(item);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    normalized.push(email);
  }

  return normalized;
}

function isHotmailProvider(stateOrProvider) {
  const provider = typeof stateOrProvider === 'string'
    ? stateOrProvider
    : stateOrProvider?.mailProvider;
  return provider === HOTMAIL_PROVIDER;
}

function isCustomMailProvider(stateOrProvider) {
  const provider = typeof stateOrProvider === 'string'
    ? stateOrProvider
    : stateOrProvider?.mailProvider;
  return provider === 'custom';
}

function getCustomEmailPoolState(state = {}) {
  const customEmailList = normalizeCustomEmailList(state?.customEmailList);
  const customEmailUsedMap = normalizeCustomEmailUsedMap(state?.customEmailUsedMap, customEmailList);
  return {
    customEmailList,
    customEmailUsedMap,
    stats: getCustomEmailPoolStats(customEmailList, customEmailUsedMap),
  };
}

function hasConfiguredCustomEmailList(state = {}) {
  return getCustomEmailPoolState(state).customEmailList.length > 0;
}

async function setCustomEmailUsedState(email, used, stateOverride = null) {
  const normalizedEmail = normalizeCustomEmailEntry(email);
  if (!normalizedEmail) {
    throw new Error('自定义邮箱地址无效。');
  }

  const state = stateOverride || await getState();
  const { customEmailList, customEmailUsedMap } = getCustomEmailPoolState(state);
  if (!customEmailList.includes(normalizedEmail)) {
    throw new Error(`自定义邮箱 ${normalizedEmail} 不在当前列表中。`);
  }

  const nextUsedMap = { ...customEmailUsedMap };
  if (used) {
    nextUsedMap[normalizedEmail] = true;
  } else {
    delete nextUsedMap[normalizedEmail];
  }

  await setPersistentSettings({ customEmailUsedMap: nextUsedMap });
  await setState({ customEmailUsedMap: nextUsedMap });
  broadcastDataUpdate({ customEmailUsedMap: nextUsedMap });

  return {
    email: normalizedEmail,
    used: Boolean(used),
    customEmailUsedMap: nextUsedMap,
  };
}

async function markEmailRegistrationComplete(email, stateOverride = null) {
  const normalizedEmail = normalizeCustomEmailEntry(email);
  if (!normalizedEmail) {
    throw new Error('已注册邮箱地址无效。');
  }

  const state = stateOverride || await getState();
  const { customEmailList, customEmailUsedMap } = getCustomEmailPoolState(state);
  const registeredEmailList = normalizeRegisteredEmailList(state?.registeredEmailList);
  const nextCustomEmailList = customEmailList.filter((item) => item !== normalizedEmail);
  const nextCustomEmailUsedMap = { ...customEmailUsedMap };
  delete nextCustomEmailUsedMap[normalizedEmail];
  const persistedUpdates = {
    customEmailList: nextCustomEmailList,
    customEmailUsedMap: normalizeCustomEmailUsedMap(nextCustomEmailUsedMap, nextCustomEmailList),
    registeredEmailList: normalizeRegisteredEmailList([...registeredEmailList, normalizedEmail]),
  };
  const sessionUpdates = {
    ...persistedUpdates,
    email: normalizeCustomEmailEntry(state?.email) === normalizedEmail ? null : (state?.email || null),
  };

  await setPersistentSettings(persistedUpdates);
  await setState(sessionUpdates);
  broadcastDataUpdate(sessionUpdates);

  return {
    email: normalizedEmail,
    ...sessionUpdates,
  };
}

async function ensureCustomEmailForFlow(state = {}, options = {}) {
  const {
    markUsed = true,
    reuseCurrentEmail = true,
  } = options;
  const currentEmail = normalizeCustomEmailEntry(state?.email);
  if (reuseCurrentEmail && currentEmail) {
    const { customEmailList, customEmailUsedMap } = getCustomEmailPoolState(state);
    if (markUsed && customEmailList.includes(currentEmail) && !customEmailUsedMap[currentEmail]) {
      await setCustomEmailUsedState(currentEmail, true, state);
    }
    return currentEmail;
  }

  const { customEmailList, customEmailUsedMap } = getCustomEmailPoolState(state);
  const nextEmail = pickNextCustomEmail(customEmailList, customEmailUsedMap, {
    currentEmail,
    reuseCurrentEmail: false,
  });

  if (!nextEmail) {
    return '';
  }

  if (markUsed && !customEmailUsedMap[nextEmail]) {
    await setCustomEmailUsedState(nextEmail, true, state);
  }
  return nextEmail;
}

function getMail2925Mode(stateOrMode) {
  if (typeof stateOrMode === 'string') {
    return normalizeMail2925Mode(stateOrMode);
  }
  return normalizeMail2925Mode(stateOrMode?.mail2925Mode);
}

function parseGmailBaseEmail(rawValue) {
  const utils = getManagedAliasUtils();
  if (utils?.parseManagedAliasBaseEmail) {
    return utils.parseManagedAliasBaseEmail(rawValue, GMAIL_PROVIDER);
  }

  const value = String(rawValue || '').trim().toLowerCase();
  const match = value.match(/^([^@\s+]+)@((?:gmail|googlemail)\.com)$/i);
  if (!match) return null;
  return {
    localPart: match[1],
    domain: match[2].toLowerCase(),
  };
}

function getManagedAliasUtils() {
  return (typeof self !== 'undefined' ? self : globalThis).MultiPageManagedAliasUtils || null;
}

function parseManagedAliasBaseEmail(rawValue, provider) {
  const utils = getManagedAliasUtils();
  if (utils?.parseManagedAliasBaseEmail) {
    return utils.parseManagedAliasBaseEmail(rawValue, provider);
  }

  if (provider === GMAIL_PROVIDER) {
    return parseGmailBaseEmail(rawValue);
  }

  const value = String(rawValue || '').trim().toLowerCase();
  const match = value.match(/^([^@\s+]+)@(2925\.com)$/i);
  if (!match) return null;
  return {
    localPart: match[1],
    domain: match[2].toLowerCase(),
  };
}

function isManagedAliasEmail(value, provider, baseEmail = '') {
  const utils = getManagedAliasUtils();
  if (utils?.isManagedAliasEmail) {
    return utils.isManagedAliasEmail(value, provider, baseEmail);
  }

  const normalizedValue = String(value || '').trim().toLowerCase();
  if (!normalizedValue) return false;
  const parsedEmail = normalizedValue.match(/^([^@\s]+)@([^@\s]+\.[^@\s]+)$/);
  if (!parsedEmail) return false;

  const candidateLocalPart = parsedEmail[1];
  const candidateDomain = parsedEmail[2];
  if (provider === GMAIL_PROVIDER) {
    if (!/^(?:gmail|googlemail)\.com$/i.test(candidateDomain)) {
      return false;
    }
    const parsedBaseEmail = parseManagedAliasBaseEmail(baseEmail, provider);
    if (!parsedBaseEmail) {
      return true;
    }
    return candidateDomain === parsedBaseEmail.domain
      && candidateLocalPart.split('+')[0] === parsedBaseEmail.localPart;
  }

  if (provider !== '2925' || candidateDomain !== '2925.com') {
    return false;
  }

  const parsedBaseEmail = parseManagedAliasBaseEmail(baseEmail, provider);
  if (!parsedBaseEmail) {
    return true;
  }

  return candidateLocalPart === parsedBaseEmail.localPart || candidateLocalPart.startsWith(parsedBaseEmail.localPart);
}

function getManagedAliasBaseEmail(state = {}, provider = state?.mailProvider) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const legacyEmailPrefix = String(state?.emailPrefix || '').trim();
  if (normalizedProvider === GMAIL_PROVIDER) {
    const gmailBaseEmail = String(state?.gmailBaseEmail || '').trim();
    if (gmailBaseEmail) {
      return gmailBaseEmail;
    }
    return parseManagedAliasBaseEmail(legacyEmailPrefix, normalizedProvider) ? legacyEmailPrefix : '';
  }

  if (normalizedProvider === '2925') {
    const mail2925BaseEmail = String(state?.mail2925BaseEmail || '').trim();
    if (mail2925BaseEmail) {
      return mail2925BaseEmail;
    }
    return parseManagedAliasBaseEmail(legacyEmailPrefix, normalizedProvider) ? legacyEmailPrefix : '';
  }

  return '';
}

function isGeneratedAliasProvider(stateOrProvider, mail2925Mode = undefined) {
  const provider = typeof stateOrProvider === 'string'
    ? stateOrProvider
    : stateOrProvider?.mailProvider;
  const utils = (typeof self !== 'undefined' ? self : globalThis).MultiPageManagedAliasUtils || null;
  if (utils?.isManagedAliasProvider) {
    return utils.isManagedAliasProvider(provider);
  }
  return provider === GMAIL_PROVIDER || provider === '2925';
}

function shouldUseCustomRegistrationEmail(state = {}) {
  return isCustomMailProvider(state)
    || (!isHotmailProvider(state)
      && !isGeneratedAliasProvider(state)
      && normalizeEmailGenerator(state.emailGenerator) === 'custom');
}

function isReusableGeneratedAliasEmail(state = {}, email = state?.email) {
  if (!isGeneratedAliasProvider(state)) {
    return false;
  }

  return isManagedAliasEmail(email, state?.mailProvider, getManagedAliasBaseEmail(state));
}

function buildGeneratedAliasEmail(state) {
  const provider = state.mailProvider || '163';
  const baseEmail = getManagedAliasBaseEmail(state, provider);
  const baseLabel = provider === GMAIL_PROVIDER ? 'Gmail 原邮箱' : '2925 基邮箱';
  const exampleEmail = provider === GMAIL_PROVIDER ? 'name@gmail.com' : 'name@2925.com';

  if (!baseEmail) {
    throw new Error(`${baseLabel}未设置，请先在侧边栏填写，或直接在“注册邮箱”中手动填写完整邮箱。`);
  }

  if (!parseManagedAliasBaseEmail(baseEmail, provider)) {
    throw new Error(`${baseLabel}格式不正确，请填写类似 ${exampleEmail} 的地址。`);
  }

  const utils = getManagedAliasUtils();
  if (utils?.buildManagedAliasEmail) {
    return utils.buildManagedAliasEmail(
      provider,
      baseEmail,
      provider === GMAIL_PROVIDER ? generateRandomWordAliasTag() : generateRandomSuffix(6)
    );
  }

  const parsedBaseEmail = parseManagedAliasBaseEmail(baseEmail, provider);
  if (provider === GMAIL_PROVIDER) {
    return `${parsedBaseEmail.localPart}+${generateRandomWordAliasTag()}@${parsedBaseEmail.domain}`;
  }
  if (provider === '2925') {
    return `${parsedBaseEmail.localPart}${generateRandomSuffix(6)}@${parsedBaseEmail.domain}`;
  }

  throw new Error(`未支持的别名邮箱类型：${provider}`);
}

async function getOpenIcloudHostPreference() {
  try {
    const tabs = await chrome.tabs.query({
      url: [
        'https://www.icloud.com/*',
        'https://www.icloud.com.cn/*',
      ],
    });

    const activeTab = tabs.find((tab) => tab.active);
    const candidates = activeTab ? [activeTab, ...tabs.filter((tab) => tab.id !== activeTab.id)] : tabs;
    for (const tab of candidates) {
      try {
        const host = normalizeIcloudHost(new URL(tab.url).host);
        if (host) return host;
      } catch {}
    }
  } catch {}

  return '';
}

async function getPreferredIcloudLoginUrl(error = null, state = null) {
  const currentState = state || await getState();
  const configuredHost = getConfiguredIcloudHostPreference(currentState);
  if (configuredHost) {
    return getIcloudLoginUrlForHost(configuredHost);
  }

  const messageHint = getIcloudHostHintFromMessage(getErrorMessage(error));
  if (messageHint) {
    return getIcloudLoginUrlForHost(messageHint);
  }

  const savedHost = normalizeIcloudHost(currentState?.preferredIcloudHost);
  if (savedHost) {
    return getIcloudLoginUrlForHost(savedHost);
  }

  const openHost = await getOpenIcloudHostPreference();
  if (openHost) {
    return getIcloudLoginUrlForHost(openHost);
  }

  return ICLOUD_LOGIN_URLS[0];
}

async function getPreferredIcloudSetupUrls(state = null, error = null) {
  const preferredLoginUrl = await getPreferredIcloudLoginUrl(error, state);
  const preferredHost = normalizeIcloudHost(new URL(preferredLoginUrl).host);
  const preferredSetupUrl = getIcloudSetupUrlForHost(preferredHost);
  if (!preferredSetupUrl) {
    return [...ICLOUD_SETUP_URLS];
  }
  return [
    preferredSetupUrl,
    ...ICLOUD_SETUP_URLS.filter((url) => url !== preferredSetupUrl),
  ];
}

function isIcloudLoginRequiredError(error) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('could not validate icloud session')
    || message.includes('hide my email service was unavailable')
    || /\bstatus (401|403|409|421)\b/.test(message);
}

let lastIcloudLoginPromptAt = 0;

async function openIcloudLoginPage(preferredUrl) {
  const tabs = await chrome.tabs.query({
    url: [
      'https://www.icloud.com/*',
      'https://www.icloud.com.cn/*',
    ],
  });
  const preferredHost = new URL(preferredUrl).host;
  const existing = tabs.find((tab) => {
    try {
      return new URL(tab.url).host === preferredHost;
    } catch {
      return false;
    }
  });

  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.url !== preferredUrl) {
      await chrome.tabs.update(existing.id, { url: preferredUrl });
    }
    return existing.id;
  }

  const created = await chrome.tabs.create({ url: preferredUrl, active: true });
  return created.id;
}

async function promptIcloudLogin(error, actionLabel = 'iCloud 操作') {
  const now = Date.now();
  const preferredUrl = await getPreferredIcloudLoginUrl(error);
  const originalError = getErrorMessage(error);

  chrome.runtime.sendMessage({
    type: 'ICLOUD_LOGIN_REQUIRED',
    payload: {
      actionLabel,
      loginUrl: preferredUrl,
      message: '需要先登录 iCloud，我已经为你打开登录页。',
      detail: originalError,
    },
  }).catch(() => { });

  if (now - lastIcloudLoginPromptAt < 15000) {
    return;
  }
  lastIcloudLoginPromptAt = now;

  await addLog(`iCloud：${actionLabel}时需要登录，正在打开 ${new URL(preferredUrl).host} ...`, 'warn');

  try {
    await openIcloudLoginPage(preferredUrl);
  } catch (tabErr) {
    await addLog(`iCloud：自动打开登录页失败：${getErrorMessage(tabErr)}`, 'warn');
  }
}

async function withIcloudLoginHelp(actionLabel, action) {
  try {
    return await action();
  } catch (err) {
    if (isIcloudLoginRequiredError(err)) {
      await promptIcloudLogin(err, actionLabel);
      throw new Error('请先在新打开的 iCloud 页面中完成登录，再回来点击“我已登录”。');
    }
    throw err;
  }
}

async function icloudRequest(method, url, options = {}) {
  const { data } = options;
  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'include',
      headers: data !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  } catch (err) {
    throw new Error(`iCloud 请求失败：${method} ${url}，${err.message}`);
  }

  if (!response.ok) {
    throw new Error(`iCloud 请求失败：${method} ${url}，status ${response.status}`);
  }

  try {
    return await response.json();
  } catch (err) {
    throw new Error(`iCloud 返回的 JSON 无法解析：${method} ${url}，${err.message}`);
  }
}

async function validateIcloudSession(setupUrl) {
  const data = await icloudRequest('POST', `${setupUrl}/validate`);
  if (!data?.webservices?.premiummailsettings?.url) {
    throw new Error('Could not validate iCloud session. Hide My Email service was unavailable.');
  }
  return data;
}

async function resolveIcloudPremiumMailService() {
  const errors = [];
  const state = await getState();
  const setupUrls = await getPreferredIcloudSetupUrls(state);

  for (const setupUrl of setupUrls) {
    try {
      const data = await validateIcloudSession(setupUrl);
      const preferredIcloudHost = normalizeIcloudHost(new URL(setupUrl).host);
      if (preferredIcloudHost && preferredIcloudHost !== normalizeIcloudHost(state.preferredIcloudHost)) {
        await setState({ preferredIcloudHost });
      }
      return {
        setupUrl,
        serviceUrl: String(data.webservices.premiummailsettings.url || '').replace(/\/$/, ''),
      };
    } catch (err) {
      errors.push(`${new URL(setupUrl).host}: ${getErrorMessage(err)}`);
    }
  }

  throw new Error(errors.length
    ? `Could not validate iCloud session. ${errors.join(' | ')}`
    : 'Could not validate iCloud session. 请先在当前浏览器登录 icloud.com.cn 或 icloud.com。');
}

function getIcloudAliasLabel() {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `MultiPage ${dateStr}`;
}

async function fetchIcloudHideMyEmail() {
  return withIcloudLoginHelp('获取 iCloud 隐私邮箱', async () => {
    throwIfStopped();
    await addLog('iCloud：正在校验当前浏览器登录状态...', 'info');

    const { serviceUrl, setupUrl } = await resolveIcloudPremiumMailService();
    await addLog(`iCloud：已通过 ${new URL(setupUrl).host} 验证会话`, 'ok');

    const existingAliasesResponse = await icloudRequest('GET', `${serviceUrl}/v2/hme/list`);
    const state = await getState();
    const existingAliases = normalizeIcloudAliasList(existingAliasesResponse, {
      usedEmails: getEffectiveUsedEmails(state),
      preservedEmails: getPreservedAliasMap(state),
    });

    const reusableAlias = pickReusableIcloudAlias(existingAliases);
    if (reusableAlias) {
      await setEmailState(reusableAlias.email);
      await addLog(`iCloud：复用未使用别名 ${reusableAlias.email}`, 'ok');
      broadcastIcloudAliasesChanged({ reason: 'selected', email: reusableAlias.email });
      return reusableAlias.email;
    }

    await addLog('iCloud：没有可复用别名，开始生成新的 Hide My Email 地址...', 'warn');

    const generated = await icloudRequest('POST', `${serviceUrl}/v1/hme/generate`);
    if (!generated?.success || !generated?.result?.hme) {
      throw new Error(generated?.error?.errorMessage || 'iCloud 隐私邮箱生成失败。');
    }

    const reserved = await icloudRequest('POST', `${serviceUrl}/v1/hme/reserve`, {
      data: {
        hme: generated.result.hme,
        label: getIcloudAliasLabel(),
        note: 'Generated through Multi-Page Automation',
      },
    });

    if (!reserved?.success || !reserved?.result?.hme?.hme) {
      throw new Error(reserved?.error?.errorMessage || 'iCloud 隐私邮箱保留失败。');
    }

    const alias = String(reserved.result.hme.hme || '').trim().toLowerCase();
    await setEmailState(alias);
    await addLog(`iCloud：已创建并保留新别名 ${alias}`, 'ok');
    broadcastIcloudAliasesChanged({ reason: 'created', email: alias });
    return alias;
  });
}

// ============================================================
// Tab Registry
// ============================================================

async function getTabRegistry() {
  return tabRuntime.getTabRegistry();
}

async function registerTab(source, tabId) {
  return tabRuntime.registerTab(source, tabId);
}

async function isTabAlive(source) {
  return tabRuntime.isTabAlive(source);
}

async function getTabId(source) {
  return tabRuntime.getTabId(source);
}

function parseUrlSafely(rawUrl) {
  if (typeof navigationUtils !== 'undefined' && navigationUtils?.parseUrlSafely) {
    return navigationUtils.parseUrlSafely(rawUrl);
  }
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function normalizeSub2ApiUrl(rawUrl) {
  if (typeof navigationUtils !== 'undefined' && navigationUtils?.normalizeSub2ApiUrl) {
    return navigationUtils.normalizeSub2ApiUrl(rawUrl);
  }
  const input = (rawUrl || '').trim() || DEFAULT_SUB2API_URL;
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const parsed = new URL(withProtocol);
  if (!parsed.pathname || parsed.pathname === '/') {
    parsed.pathname = '/admin/accounts';
  }
  parsed.hash = '';
  return parsed.toString();
}

function getPanelMode(state = {}) {
  if (typeof navigationUtils !== 'undefined' && navigationUtils?.getPanelMode) {
    return navigationUtils.getPanelMode(state);
  }
  return state.panelMode === 'sub2api' ? 'sub2api' : 'cpa';
}

function getPanelModeLabel(modeOrState) {
  if (typeof navigationUtils !== 'undefined' && navigationUtils?.getPanelModeLabel) {
    return navigationUtils.getPanelModeLabel(modeOrState);
  }
  const mode = typeof modeOrState === 'string' ? modeOrState : getPanelMode(modeOrState);
  return mode === 'sub2api' ? 'SUB2API' : 'CPA';
}

function isSignupPageHost(hostname = '') {
  if (typeof navigationUtils !== 'undefined' && navigationUtils?.isSignupPageHost) {
    return navigationUtils.isSignupPageHost(hostname);
  }
  return ['auth0.openai.com', 'auth.openai.com', 'accounts.openai.com'].includes(hostname);
}

function isSignupEntryHost(hostname = '') {
  if (typeof navigationUtils !== 'undefined' && navigationUtils?.isSignupEntryHost) {
    return navigationUtils.isSignupEntryHost(hostname);
  }
  return ['chatgpt.com', 'chat.openai.com'].includes(hostname);
}

function isSignupPasswordPageUrl(rawUrl) {
  if (typeof navigationUtils !== 'undefined' && navigationUtils?.isSignupPasswordPageUrl) {
    return navigationUtils.isSignupPasswordPageUrl(rawUrl);
  }
  const parsed = parseUrlSafely(rawUrl);
  if (!parsed) return false;
  return isSignupPageHost(parsed.hostname)
    && /\/create-account\/password(?:[/?#]|$)/i.test(parsed.pathname || '');
}

function isSignupEmailVerificationPageUrl(rawUrl) {
  if (typeof navigationUtils !== 'undefined' && navigationUtils?.isSignupEmailVerificationPageUrl) {
    return navigationUtils.isSignupEmailVerificationPageUrl(rawUrl);
  }
  const parsed = parseUrlSafely(rawUrl);
  if (!parsed) return false;
  return isSignupPageHost(parsed.hostname)
    && /\/email-verification(?:[/?#]|$)/i.test(parsed.pathname || '');
}

function is163MailHost(hostname = '') {
  if (typeof navigationUtils !== 'undefined' && navigationUtils?.is163MailHost) {
    return navigationUtils.is163MailHost(hostname);
  }
  return hostname === 'mail.163.com'
    || hostname.endsWith('.mail.163.com')
    || hostname === 'webmail.vip.163.com';
}

function isLocalhostOAuthCallbackUrl(rawUrl) {
  if (typeof navigationUtils !== 'undefined' && navigationUtils?.isLocalhostOAuthCallbackUrl) {
    return navigationUtils.isLocalhostOAuthCallbackUrl(rawUrl);
  }
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
  if (typeof navigationUtils !== 'undefined' && navigationUtils?.isLocalCpaUrl) {
    return navigationUtils.isLocalCpaUrl(rawUrl);
  }
  const parsed = parseUrlSafely(rawUrl);
  if (!parsed) return false;
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  return ['localhost', '127.0.0.1'].includes(parsed.hostname);
}

function shouldBypassStep9ForLocalCpa(state) {
  if (typeof navigationUtils !== 'undefined' && navigationUtils?.shouldBypassStep9ForLocalCpa) {
    return navigationUtils.shouldBypassStep9ForLocalCpa(state);
  }
  return normalizeLocalCpaStep9Mode(state?.localCpaStep9Mode) === 'bypass'
    && Boolean(state?.localhostUrl)
    && isLocalCpaUrl(state?.vpsUrl);
}

function matchesSourceUrlFamily(source, candidateUrl, referenceUrl) {
  if (typeof navigationUtils !== 'undefined' && navigationUtils?.matchesSourceUrlFamily) {
    return navigationUtils.matchesSourceUrlFamily(source, candidateUrl, referenceUrl);
  }
  const candidate = parseUrlSafely(candidateUrl);
  if (!candidate) return false;
  const reference = parseUrlSafely(referenceUrl);
  switch (source) {
    case 'signup-page':
      return isSignupPageHost(candidate.hostname) || isSignupEntryHost(candidate.hostname);
    case 'duck-mail':
      return candidate.hostname === 'duckduckgo.com' && candidate.pathname.startsWith('/email/');
    case 'qq-mail':
      return candidate.hostname === 'mail.qq.com' || candidate.hostname === 'wx.mail.qq.com';
    case 'mail-163':
      return is163MailHost(candidate.hostname);
    case 'gmail-mail':
      return candidate.hostname === 'mail.google.com';
    case 'inbucket-mail':
      return Boolean(reference) && candidate.origin === reference.origin && candidate.pathname.startsWith('/m/');
    case 'mail-2925':
      return candidate.hostname === '2925.com' || candidate.hostname === 'www.2925.com';
    case 'vps-panel':
      return Boolean(reference) && candidate.origin === reference.origin && candidate.pathname === reference.pathname;
    case 'sub2api-panel':
      return Boolean(reference)
        && candidate.origin === reference.origin
        && (candidate.pathname.startsWith('/admin/accounts') || candidate.pathname.startsWith('/login') || candidate.pathname === '/');
    default:
      return false;
  }
}

async function rememberSourceLastUrl(source, url) {
  return tabRuntime.rememberSourceLastUrl(source, url);
}

async function closeConflictingTabsForSource(source, currentUrl, options = {}) {
  return tabRuntime.closeConflictingTabsForSource(source, currentUrl, options);
}

function isLocalhostOAuthCallbackTabMatch(callbackUrl, candidateUrl) {
  return tabRuntime.isLocalhostOAuthCallbackTabMatch(callbackUrl, candidateUrl);
}

async function closeLocalhostCallbackTabs(callbackUrl, options = {}) {
  return tabRuntime.closeLocalhostCallbackTabs(callbackUrl, options);
}

function buildLocalhostCleanupPrefix(rawUrl) {
  return tabRuntime.buildLocalhostCleanupPrefix(rawUrl);
}

async function closeTabsByUrlPrefix(prefix, options = {}) {
  return tabRuntime.closeTabsByUrlPrefix(prefix, options);
}

async function pingContentScriptOnTab(tabId) {
  return tabRuntime.pingContentScriptOnTab(tabId);
}

async function waitForTabUrlFamily(source, tabId, referenceUrl, options = {}) {
  return tabRuntime.waitForTabUrlFamily(source, tabId, referenceUrl, options);
}

async function waitForTabUrlMatch(tabId, matcher, options = {}) {
  return tabRuntime.waitForTabUrlMatch(tabId, matcher, options);
}

async function waitForTabComplete(tabId, options = {}) {
  return tabRuntime.waitForTabComplete(tabId, options);
}

async function ensureContentScriptReadyOnTab(source, tabId, options = {}) {
  return tabRuntime.ensureContentScriptReadyOnTab(source, tabId, options);
}

// ============================================================
// Command Queue (for content scripts not yet ready)
// ============================================================

const pendingCommands = new Map(); // source -> { message, resolve, reject, timer }

function getContentScriptResponseTimeoutMs(message) {
  return tabRuntime.getContentScriptResponseTimeoutMs(message);
}

function getMessageDebugLabel(source, message, tabId = null) {
  return tabRuntime.getMessageDebugLabel(source, message, tabId);
}

function summarizeMessageResultForDebug(result) {
  return tabRuntime.summarizeMessageResultForDebug(result);
}

function sendTabMessageWithTimeout(tabId, source, message, responseTimeoutMs = getContentScriptResponseTimeoutMs(message)) {
  return tabRuntime.sendTabMessageWithTimeout(tabId, source, message, responseTimeoutMs);
}

function queueCommand(source, message, timeout = 15000) {
  return tabRuntime.queueCommand(source, message, timeout);
}

function flushCommand(source, tabId) {
  return tabRuntime.flushCommand(source, tabId);
}

function cancelPendingCommands(reason = STOP_ERROR_MESSAGE) {
  return tabRuntime.cancelPendingCommands(reason);
}

// ============================================================
// Reuse or create tab
// ============================================================

async function reuseOrCreateTab(source, url, options = {}) {
  return tabRuntime.reuseOrCreateTab(source, url, options);
}

// ============================================================
// Send command to content script (with readiness check)
// ============================================================

async function sendToContentScript(source, message, options = {}) {
  return tabRuntime.sendToContentScript(source, message, options);
}

async function sendToContentScriptResilient(source, message, options = {}) {
  return tabRuntime.sendToContentScriptResilient(source, message, options);
}

async function sendToMailContentScriptResilient(mail, message, options = {}) {
  return tabRuntime.sendToMailContentScriptResilient(mail, message, options);
}

// ============================================================
// Logging
// ============================================================

async function addLog(message, level = 'info') {
  if (typeof loggingStatus !== 'undefined' && loggingStatus?.addLog) {
    return loggingStatus.addLog(message, level);
  }
  const state = await getState();
  const logs = state.logs || [];
  const entry = { message, level, timestamp: Date.now() };
  logs.push(entry);
  if (logs.length > 500) logs.splice(0, logs.length - 500);
  await setState({ logs });
  chrome.runtime.sendMessage({ type: 'LOG_ENTRY', payload: entry }).catch(() => { });
}

function getStep8CallbackUrlFromNavigation(details, signupTabId) {
  if (typeof navigationUtils !== 'undefined' && navigationUtils?.getStep8CallbackUrlFromNavigation) {
    return navigationUtils.getStep8CallbackUrlFromNavigation(details, signupTabId);
  }
  if (!Number.isInteger(signupTabId) || !details) return '';
  if (details.tabId !== signupTabId) return '';
  if (details.frameId !== 0) return '';
  return isLocalhostOAuthCallbackUrl(details.url) ? details.url : '';
}

function getStep8CallbackUrlFromTabUpdate(tabId, changeInfo, tab, signupTabId) {
  if (typeof navigationUtils !== 'undefined' && navigationUtils?.getStep8CallbackUrlFromTabUpdate) {
    return navigationUtils.getStep8CallbackUrlFromTabUpdate(tabId, changeInfo, tab, signupTabId);
  }
  if (!Number.isInteger(signupTabId) || tabId !== signupTabId) return '';
  const candidates = [changeInfo?.url, tab?.url];
  for (const candidate of candidates) {
    if (isLocalhostOAuthCallbackUrl(candidate)) return candidate;
  }
  return '';
}

function getSourceLabel(source) {
  if (typeof loggingStatus !== 'undefined' && loggingStatus?.getSourceLabel) {
    return loggingStatus.getSourceLabel(source);
  }
  const labels = {
    'gmail-imap': 'Gmail IMAP',
    'gmail-mail': 'Gmail 邮箱',
    'sidepanel': '侧边栏',
    'signup-page': '认证页',
    'vps-panel': 'CPA 面板',
    'sub2api-panel': 'SUB2API 后台',
    'qq-mail': 'QQ 邮箱',
    'mail-163': '163 邮箱',
    'mail-2925': '2925 邮箱',
    'inbucket-mail': 'Inbucket 邮箱',
    'duck-mail': 'Duck 邮箱',
    'hotmail-api': 'Hotmail（API对接/本地助手）',
    'luckmail-api': 'LuckMail（API 购邮）',
    'cloudflare-temp-email': 'Cloudflare Temp Email',
  };
  return labels[source] || source || '未知来源';
}

// ============================================================
// Step Status Management
// ============================================================

async function setStepStatus(step, status) {
  if (typeof loggingStatus !== 'undefined' && loggingStatus?.setStepStatus) {
    return loggingStatus.setStepStatus(step, status);
  }
  const state = await getState();
  const statuses = { ...state.stepStatuses };
  statuses[step] = status;
  await setState({ stepStatuses: statuses, currentStep: step });
  chrome.runtime.sendMessage({
    type: 'STEP_STATUS_CHANGED',
    payload: { step, status },
  }).catch(() => { });
}

function isStopError(error) {
  const message = typeof error === 'string' ? error : error?.message;
  return message === STOP_ERROR_MESSAGE;
}

function isRetryableContentScriptTransportError(error) {
  const message = String(typeof error === 'string' ? error : error?.message || '');
  return /back\/forward cache|message channel is closed|Receiving end does not exist|port closed before a response was received|A listener indicated an asynchronous response|did not respond in \d+s/i.test(message);
}

const navigationUtils = self.MultiPageBackgroundNavigationUtils?.createNavigationUtils({
  DEFAULT_SUB2API_URL,
  normalizeLocalCpaStep9Mode,
});

const loggingStatus = self.MultiPageBackgroundLoggingStatus?.createLoggingStatus({
  chrome,
  DEFAULT_STATE,
  getState,
  isRecoverableStep9AuthFailure,
  LOG_PREFIX,
  setState,
  STOP_ERROR_MESSAGE,
});

const tabRuntime = self.MultiPageBackgroundTabRuntime?.createTabRuntime({
  addLog,
  chrome,
  getSourceLabel,
  getState,
  isLocalhostOAuthCallbackUrl,
  isRetryableContentScriptTransportError,
  LOG_PREFIX,
  matchesSourceUrlFamily,
  setState,
  sleepWithStop,
  STOP_ERROR_MESSAGE,
  throwIfStopped,
});

function getErrorMessage(error) {
  if (typeof loggingStatus !== 'undefined' && loggingStatus?.getErrorMessage) {
    return loggingStatus.getErrorMessage(error);
  }
  return String(typeof error === 'string' ? error : error?.message || '');
}

function isCloudflareSecurityBlockedError(error) {
  return getErrorMessage(error).startsWith(CLOUDFLARE_SECURITY_BLOCK_ERROR_PREFIX);
}

function isTerminalSecurityBlockedError(error) {
  return isCloudflareSecurityBlockedError(error);
}

function getCloudflareSecurityBlockedMessage(error) {
  const message = getErrorMessage(error);
  if (message.startsWith(CLOUDFLARE_SECURITY_BLOCK_ERROR_PREFIX)) {
    return message.slice(CLOUDFLARE_SECURITY_BLOCK_ERROR_PREFIX.length).trim() || CLOUDFLARE_SECURITY_BLOCK_USER_MESSAGE;
  }
  return CLOUDFLARE_SECURITY_BLOCK_USER_MESSAGE;
}

function getTerminalSecurityBlockedMessage(error) {
  return getCloudflareSecurityBlockedMessage(error);
}

function getTerminalSecurityBlockedAlertText(error) {
  return '检测到 Cloudflare 风控，请暂停当前操作。';
}

function getTerminalSecurityBlockedTitle(error) {
  return 'Cloudflare 风控拦截';
}

function broadcastSecurityBlockedAlert(title = '流程已完全停止', message = CLOUDFLARE_SECURITY_BLOCK_USER_MESSAGE, alertText = '检测到 Cloudflare 风控，请暂停当前操作。') {
  chrome.runtime.sendMessage({
    type: 'SECURITY_BLOCKED_ALERT',
    payload: {
      title,
      message,
      alert: {
        text: alertText,
        tone: 'danger',
      },
    },
  }).catch(() => { });
}

async function handleCloudflareSecurityBlocked(error) {
  const title = getTerminalSecurityBlockedTitle(error);
  const message = getTerminalSecurityBlockedMessage(error);
  const alertText = getTerminalSecurityBlockedAlertText(error);
  await requestStop({ logMessage: message });
  broadcastSecurityBlockedAlert(title, message, alertText);
  return message;
}

function isVerificationMailPollingError(error) {
  if (typeof loggingStatus !== 'undefined' && loggingStatus?.isVerificationMailPollingError) {
    return loggingStatus.isVerificationMailPollingError(error);
  }
  const message = getErrorMessage(error);
  return /未在 .*邮箱中找到新的匹配邮件|未在 Hotmail 收件箱中找到新的匹配验证码|邮箱轮询结束，但未获取到验证码|无法获取新的(?:注册|登录)验证码|验证码被拒绝|列表未加载完成|页面未能重新就绪|页面通信异常|did not respond in \d+s/i.test(message);
}

function isAddPhoneAuthFailure(error) {
  if (typeof loggingStatus !== 'undefined' && loggingStatus?.isAddPhoneAuthFailure) {
    return loggingStatus.isAddPhoneAuthFailure(error);
  }
  const message = getErrorMessage(error);
  return /https:\/\/auth\.openai\.com\/add-phone(?:[/?#]|$)|\badd-phone\b|添加手机号|手机号码|手机号页|手机号页面|手机号|phone\s+number|telephone/i.test(message);
}

function getLoginAuthStateLabel(state) {
  if (typeof loggingStatus !== 'undefined' && loggingStatus?.getLoginAuthStateLabel) {
    return loggingStatus.getLoginAuthStateLabel(state);
  }
  state = state === 'oauth_consent_page' ? 'unknown' : state;
  switch (state) {
    case 'verification_page': return '登录验证码页';
    case 'password_page': return '密码页';
    case 'email_page': return '邮箱输入页';
    case 'login_timeout_error_page': return '登录超时报错页';
    case 'oauth_consent_page': return 'OAuth 授权页';
    case 'add_phone_page': return '手机号页';
    default: return '未知页面';
  }
}

function isRestartCurrentAttemptError(error) {
  if (typeof loggingStatus !== 'undefined' && loggingStatus?.isRestartCurrentAttemptError) {
    return loggingStatus.isRestartCurrentAttemptError(error);
  }
  const message = String(typeof error === 'string' ? error : error?.message || '');
  return /当前邮箱已存在，需要重新开始新一轮/.test(message);
}

function isStep9RecoverableAuthError(error) {
  const message = String(typeof error === 'string' ? error : error?.message || '');
  return /STEP9_OAUTH_RETRY::/i.test(message)
    || isRecoverableStep9AuthFailure(message);
}

function isLegacyStep9RecoverableAuthError(error) {
  const message = String(typeof error === 'string' ? error : error?.message || '');
  return /STEP9_OAUTH_TIMEOUT::|认证失败:\s*(?:Timeout waiting for OAuth callback|timeout of \d+ms exceeded)/i.test(message);
}

function isStepDoneStatus(status) {
  return status === 'completed' || status === 'manual_completed' || status === 'skipped';
}

function getFirstUnfinishedStep(statuses = {}) {
  if (typeof loggingStatus !== 'undefined' && loggingStatus?.getFirstUnfinishedStep) {
    return loggingStatus.getFirstUnfinishedStep(statuses);
  }
  for (const step of STEP_IDS) {
    if (!isStepDoneStatus(statuses[step] || 'pending')) return step;
  }
  return null;
}

function hasSavedProgress(statuses = {}) {
  if (typeof loggingStatus !== 'undefined' && loggingStatus?.hasSavedProgress) {
    return loggingStatus.hasSavedProgress(statuses);
  }
  return Object.values({ ...DEFAULT_STATE.stepStatuses, ...statuses }).some((status) => status !== 'pending');
}

function getDownstreamStateResets(step) {
  if (step <= 1) {
    return {
      oauthUrl: null,
      flowStartTime: null,
      password: null,
      lastEmailTimestamp: null,
      signupVerificationRequestedAt: null,
      loginVerificationRequestedAt: null,
      oauthFlowDeadlineAt: null,
      lastSignupCode: null,
      lastLoginCode: null,
      localhostUrl: null,
    };
  }
  if (step === 2) {
    return {
      password: null,
      lastEmailTimestamp: null,
      signupVerificationRequestedAt: null,
      loginVerificationRequestedAt: null,
      oauthFlowDeadlineAt: null,
      lastSignupCode: null,
      lastLoginCode: null,
      localhostUrl: null,
    };
  }
  if (step === 3 || step === 4) {
    return {
      lastEmailTimestamp: null,
      signupVerificationRequestedAt: null,
      loginVerificationRequestedAt: null,
      oauthFlowDeadlineAt: null,
      lastSignupCode: null,
      lastLoginCode: null,
      localhostUrl: null,
    };
  }
  if (step === 5 || step === 6 || step === 7 || step === 8) {
    return {
      lastLoginCode: null,
      loginVerificationRequestedAt: null,
      oauthFlowDeadlineAt: null,
      localhostUrl: null,
    };
  }
  if (step === 9) {
    return {
      localhostUrl: null,
    };
  }
  return {};
}

async function invalidateDownstreamAfterStepRestart(step, options = {}) {
  const { logLabel = `步骤 ${step} 重新执行` } = options;
  const state = await getState();
  const statuses = { ...(state.stepStatuses || {}) };
  const changedSteps = [];

  for (let downstream = step + 1; downstream <= LAST_STEP_ID; downstream++) {
    if (statuses[downstream] !== 'pending') {
      statuses[downstream] = 'pending';
      changedSteps.push(downstream);
    }
  }

  if (changedSteps.length) {
    await setState({ stepStatuses: statuses });
    for (const downstream of changedSteps) {
      chrome.runtime.sendMessage({
        type: 'STEP_STATUS_CHANGED',
        payload: { step: downstream, status: 'pending' },
      }).catch(() => { });
    }
    await addLog(`${logLabel}，已重置后续步骤状态：${changedSteps.join(', ')}`, 'warn');
  }

  const resets = getDownstreamStateResets(step);
  if (Object.keys(resets).length) {
    await setState(resets);
    broadcastDataUpdate(resets);
  }
}

function clearStopRequest() {
  stopRequested = false;
}

function getRunningSteps(statuses = {}) {
  if (typeof loggingStatus !== 'undefined' && loggingStatus?.getRunningSteps) {
    return loggingStatus.getRunningSteps(statuses);
  }
  return Object.entries({ ...DEFAULT_STATE.stepStatuses, ...statuses })
    .filter(([, status]) => status === 'running')
    .map(([step]) => Number(step))
    .sort((a, b) => a - b);
}

function getAutoRunStatusPayload(phase, payload = {}) {
  const normalizedPayload = {
    ...payload,
    currentRun: payload.currentRun ?? autoRunCurrentRun,
    totalRuns: payload.totalRuns ?? autoRunTotalRuns,
    attemptRun: payload.attemptRun ?? autoRunAttemptRun,
    sessionId: payload.sessionId ?? payload.autoRunSessionId ?? autoRunSessionId,
  };
  if (typeof loggingStatus !== 'undefined' && loggingStatus?.getAutoRunStatusPayload) {
    return loggingStatus.getAutoRunStatusPayload(phase, normalizedPayload);
  }
  return {
    autoRunning: phase === 'scheduled'
      || phase === 'running'
      || phase === 'waiting_step'
      || phase === 'waiting_email'
      || phase === 'retrying'
      || phase === 'waiting_interval',
    autoRunPhase: phase,
    autoRunCurrentRun: normalizedPayload.currentRun ?? 0,
    autoRunTotalRuns: normalizedPayload.totalRuns ?? 1,
    autoRunAttemptRun: normalizedPayload.attemptRun ?? 0,
    autoRunSessionId: normalizeAutoRunSessionId(normalizedPayload.sessionId),
    scheduledAutoRunAt: Number.isFinite(Number(normalizedPayload.scheduledAt)) ? Number(normalizedPayload.scheduledAt) : null,
    autoRunCountdownAt: Number.isFinite(Number(normalizedPayload.countdownAt)) ? Number(normalizedPayload.countdownAt) : null,
    autoRunCountdownTitle: normalizedPayload.countdownTitle === undefined ? '' : String(normalizedPayload.countdownTitle || ''),
    autoRunCountdownNote: normalizedPayload.countdownNote === undefined ? '' : String(normalizedPayload.countdownNote || ''),
  };
}

async function broadcastAutoRunStatus(phase, payload = {}, extraState = {}) {
  const rawScheduledAt = phase === 'scheduled'
    ? (payload.scheduledAt ?? payload.scheduledAutoRunAt ?? null)
    : null;
  const rawCountdownAt = payload.countdownAt ?? payload.autoRunCountdownAt ?? null;
  const statusPayload = {
    phase,
    currentRun: payload.currentRun ?? autoRunCurrentRun,
    totalRuns: payload.totalRuns ?? autoRunTotalRuns,
    attemptRun: payload.attemptRun ?? autoRunAttemptRun,
    sessionId: payload.sessionId ?? payload.autoRunSessionId ?? autoRunSessionId,
    scheduledAt: rawScheduledAt === null ? null : Number(rawScheduledAt),
    countdownAt: rawCountdownAt === null ? null : Number(rawCountdownAt),
    countdownTitle: payload.countdownTitle === undefined ? '' : String(payload.countdownTitle || ''),
    countdownNote: payload.countdownNote === undefined ? '' : String(payload.countdownNote || ''),
  };

  await setState({
    ...extraState,
    ...getAutoRunStatusPayload(phase, statusPayload),
  });
  chrome.runtime.sendMessage({
    type: 'AUTO_RUN_STATUS',
    payload: statusPayload,
  }).catch(() => { });
}

function isAutoRunLockedState(state) {
  return Boolean(state.autoRunning)
    && (
      state.autoRunPhase === 'running'
      || state.autoRunPhase === 'waiting_step'
      || state.autoRunPhase === 'retrying'
      || state.autoRunPhase === 'waiting_interval'
    );
}

function isAutoRunPausedState(state) {
  return Boolean(state.autoRunning) && state.autoRunPhase === 'waiting_email';
}

function isAutoRunScheduledState(state) {
  const plan = normalizeAutoRunTimerPlanFromState(state);
  const scheduledAt = state.scheduledAutoRunAt === null ? null : Number(state.scheduledAutoRunAt);
  return Boolean(state.autoRunning)
    && state.autoRunPhase === 'scheduled'
    && Number.isFinite(scheduledAt)
    && plan?.kind === AUTO_RUN_TIMER_KIND_SCHEDULED_START;
}

function getPendingAutoRunTimerPlan(state = {}) {
  return normalizeAutoRunTimerPlanFromState(state);
}

function formatAutoRunScheduleTime(timestamp) {
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

async function setAutoRunDelayEnabledState(enabled) {
  const normalized = Boolean(enabled);
  await setPersistentSettings({ autoRunDelayEnabled: normalized });
  await setState({ autoRunDelayEnabled: normalized });
  broadcastDataUpdate({ autoRunDelayEnabled: normalized });
}

async function ensureAutoRunTimerAlarm(fireAt) {
  if (!Number.isFinite(fireAt) || fireAt <= Date.now()) {
    return false;
  }

  const existingAlarm = await chrome.alarms.get(AUTO_RUN_TIMER_ALARM_NAME);
  if (!existingAlarm || Math.abs((existingAlarm.scheduledTime || 0) - fireAt) > 1000) {
    await chrome.alarms.clear(AUTO_RUN_TIMER_ALARM_NAME);
    await chrome.alarms.create(AUTO_RUN_TIMER_ALARM_NAME, { when: fireAt });
  }

  return true;
}

async function clearAutoRunTimerAlarm() {
  await chrome.alarms.clear(AUTO_RUN_TIMER_ALARM_NAME);
}

async function persistAutoRunTimerPlan(plan, extraState = {}) {
  const normalizedPlan = normalizeAutoRunTimerPlan(plan);
  if (!normalizedPlan) {
    throw new Error('自动运行计时计划无效。');
  }

  const statusPayload = getAutoRunTimerStatusPayload(normalizedPlan);
  await broadcastAutoRunStatus(
    statusPayload.phase,
    statusPayload,
    {
      ...extraState,
      autoRunTimerPlan: normalizedPlan,
      scheduledAutoRunPlan: null,
    }
  );
  await ensureAutoRunTimerAlarm(normalizedPlan.fireAt);
  return normalizedPlan;
}

function getAutoRunTimerResumeOptions(plan) {
  const normalizedPlan = normalizeAutoRunTimerPlan(plan);
  if (!normalizedPlan) {
    return null;
  }

  if (normalizedPlan.kind === AUTO_RUN_TIMER_KIND_SCHEDULED_START) {
    return {
      loopOptions: {
        autoRunSessionId: normalizedPlan.autoRunSessionId,
        autoRunSkipFailures: normalizedPlan.autoRunSkipFailures,
        mode: normalizedPlan.mode,
      },
      statusPayload: {
        currentRun: 0,
        totalRuns: normalizedPlan.totalRuns,
        attemptRun: 0,
        sessionId: normalizedPlan.autoRunSessionId,
      },
    };
  }

  if (normalizedPlan.kind === AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS) {
    const nextRun = Math.min(normalizedPlan.currentRun + 1, normalizedPlan.totalRuns);
    return {
      loopOptions: {
        autoRunSessionId: normalizedPlan.autoRunSessionId,
        autoRunSkipFailures: normalizedPlan.autoRunSkipFailures,
        mode: 'restart',
        resumeCurrentRun: nextRun,
        resumeAttemptRun: 1,
        resumeRoundSummaries: normalizedPlan.roundSummaries,
      },
      statusPayload: {
        currentRun: nextRun,
        totalRuns: normalizedPlan.totalRuns,
        attemptRun: 1,
        sessionId: normalizedPlan.autoRunSessionId,
      },
    };
  }

  return {
    loopOptions: {
      autoRunSessionId: normalizedPlan.autoRunSessionId,
      autoRunSkipFailures: normalizedPlan.autoRunSkipFailures,
      mode: 'restart',
      resumeCurrentRun: normalizedPlan.currentRun,
      resumeAttemptRun: normalizedPlan.attemptRun,
      resumeRoundSummaries: normalizedPlan.roundSummaries,
    },
    statusPayload: {
      currentRun: normalizedPlan.currentRun,
      totalRuns: normalizedPlan.totalRuns,
      attemptRun: normalizedPlan.attemptRun,
      sessionId: normalizedPlan.autoRunSessionId,
    },
  };
}

let autoRunTimerLaunching = false;

async function launchAutoRunTimerPlan(trigger = 'alarm', options = {}) {
  const { expectedKinds = [] } = options;
  if (autoRunTimerLaunching) {
    return false;
  }

  autoRunTimerLaunching = true;
  try {
    const state = await getState();
    const plan = getPendingAutoRunTimerPlan(state);
    if (!plan) {
      return false;
    }
    if (expectedKinds.length && !expectedKinds.includes(plan.kind)) {
      return false;
    }
    if (autoRunActive) {
      return false;
    }
    if (plan.autoRunSessionId && !isCurrentAutoRunSessionId(plan.autoRunSessionId)) {
      return false;
    }

    const resumeOptions = getAutoRunTimerResumeOptions(plan);
    if (!resumeOptions) {
      await clearAutoRunTimerAlarm();
      await broadcastAutoRunStatus('idle', {
        currentRun: 0,
        totalRuns: 1,
        attemptRun: 0,
      }, {
        autoRunRoundSummaries: [],
        autoRunTimerPlan: null,
        scheduledAutoRunPlan: null,
      });
      return false;
    }

    await clearAutoRunTimerAlarm();
    if (plan.autoRunSessionId && !isCurrentAutoRunSessionId(plan.autoRunSessionId)) {
      return false;
    }
    autoRunCurrentRun = resumeOptions.statusPayload.currentRun;
    autoRunTotalRuns = plan.totalRuns;
    autoRunAttemptRun = resumeOptions.statusPayload.attemptRun;
    autoRunSessionId = normalizeAutoRunSessionId(plan.autoRunSessionId);
    if (plan.kind === AUTO_RUN_TIMER_KIND_SCHEDULED_START && trigger !== 'manual' && state.autoRunDelayEnabled) {
      await setAutoRunDelayEnabledState(false);
    }
    await broadcastAutoRunStatus(
      'running',
      resumeOptions.statusPayload,
      {
        autoRunSkipFailures: plan.autoRunSkipFailures,
        autoRunRoundSummaries: serializeAutoRunRoundSummaries(plan.totalRuns, plan.roundSummaries),
        autoRunTimerPlan: null,
        scheduledAutoRunPlan: null,
      }
    );

    if (plan.autoRunSessionId && !isCurrentAutoRunSessionId(plan.autoRunSessionId)) {
      return false;
    }
    clearStopRequest();
    let logMessage = '倒计时结束，自动运行开始执行。';
    if (plan.kind === AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS) {
      logMessage = trigger === 'manual'
        ? '已手动跳过线程间隔，自动流程立即开始下一轮。'
        : '线程间隔结束，自动流程开始下一轮。';
    } else if (plan.kind === AUTO_RUN_TIMER_KIND_BEFORE_RETRY) {
      logMessage = trigger === 'manual'
        ? `已手动跳过线程间隔，立即开始第 ${plan.currentRun}/${plan.totalRuns} 轮第 ${plan.attemptRun} 次尝试。`
        : `线程间隔结束，开始第 ${plan.currentRun}/${plan.totalRuns} 轮第 ${plan.attemptRun} 次尝试。`;
    } else if (trigger === 'manual') {
      logMessage = '已手动跳过倒计时，自动运行立即开始。';
    }
    await addLog(logMessage, 'info');
    if (plan.autoRunSessionId && !isCurrentAutoRunSessionId(plan.autoRunSessionId)) {
      return false;
    }

    startAutoRunLoop(plan.totalRuns, resumeOptions.loopOptions);
    return true;
  } finally {
    autoRunTimerLaunching = false;
  }
}

async function scheduleAutoRun(totalRuns, options = {}) {
  const state = await getState();
  if (isAutoRunLockedState(state) || isAutoRunPausedState(state) || autoRunActive) {
    throw new Error('自动运行已在进行中，请先停止后再重新计划。');
  }
  if (getPendingAutoRunTimerPlan(state)) {
    throw new Error('已有自动运行倒计时计划，请先取消或立即开始。');
  }

  const delayMinutes = normalizeAutoRunDelayMinutes(options.delayMinutes);
  const sessionId = createAutoRunSessionId();
  const timerPlan = normalizeAutoRunTimerPlan({
    kind: AUTO_RUN_TIMER_KIND_SCHEDULED_START,
    fireAt: Date.now() + delayMinutes * 60 * 1000,
    totalRuns,
    autoRunSkipFailures: options.autoRunSkipFailures,
    autoRunSessionId: sessionId,
    mode: options.mode,
  });

  autoRunCurrentRun = 0;
  autoRunTotalRuns = timerPlan.totalRuns;
  autoRunAttemptRun = 0;
  autoRunSessionId = sessionId;

  await persistAutoRunTimerPlan(timerPlan, {
    autoRunSkipFailures: timerPlan.autoRunSkipFailures,
    autoRunRoundSummaries: serializeAutoRunRoundSummaries(timerPlan.totalRuns, []),
  });
  await addLog(
    `自动运行已计划：${delayMinutes} 分钟后启动（${formatAutoRunScheduleTime(timerPlan.fireAt)}），目标 ${timerPlan.totalRuns} 轮。`,
    'info'
  );
  return { ok: true, scheduledAt: timerPlan.fireAt };
}

async function cancelScheduledAutoRun(options = {}) {
  const state = await getState();
  const plan = getPendingAutoRunTimerPlan(state);
  if (!plan || plan.kind !== AUTO_RUN_TIMER_KIND_SCHEDULED_START) {
    return false;
  }

  autoRunCurrentRun = 0;
  autoRunTotalRuns = plan.totalRuns;
  autoRunAttemptRun = 0;
  clearCurrentAutoRunSessionId(plan.autoRunSessionId);
  await broadcastAutoRunStatus(
    'idle',
    {
      currentRun: 0,
      totalRuns: plan.totalRuns,
      attemptRun: 0,
      sessionId: 0,
    },
    {
      autoRunSessionId: 0,
      autoRunRoundSummaries: [],
      autoRunTimerPlan: null,
      scheduledAutoRunPlan: null,
    }
  );
  await clearAutoRunTimerAlarm();
  if (options.logMessage !== false) {
    await addLog(options.logMessage || '已取消自动运行倒计时计划。', 'warn');
  }
  return true;
}

async function restoreAutoRunTimerIfNeeded() {
  const state = await getState();
  let plan = getPendingAutoRunTimerPlan(state);
  if (!plan) {
    clearCurrentAutoRunSessionId();
    if (state.autoRunPhase === 'scheduled' || state.autoRunPhase === 'waiting_interval') {
      await clearAutoRunTimerAlarm();
      await broadcastAutoRunStatus('idle', {
        currentRun: 0,
        totalRuns: 1,
        attemptRun: 0,
        sessionId: 0,
      }, {
        autoRunSessionId: 0,
        autoRunRoundSummaries: [],
        autoRunTimerPlan: null,
        scheduledAutoRunPlan: null,
      });
    }
    return;
  }

  if (!plan.autoRunSessionId) {
    const restoredSessionId = createAutoRunSessionId();
    plan = await persistAutoRunTimerPlan({
      ...plan,
      autoRunSessionId: restoredSessionId,
    }, {
      autoRunSkipFailures: plan.autoRunSkipFailures,
      autoRunRoundSummaries: serializeAutoRunRoundSummaries(plan.totalRuns, plan.roundSummaries),
    });
  } else {
    setCurrentAutoRunSessionId(plan.autoRunSessionId);
  }

  if (plan.fireAt <= Date.now()) {
    await launchAutoRunTimerPlan('restore');
    return;
  }

  const statusPayload = getAutoRunTimerStatusPayload(plan);
  await broadcastAutoRunStatus(
    statusPayload.phase,
    statusPayload,
    {
      autoRunSessionId: plan.autoRunSessionId,
      autoRunSkipFailures: plan.autoRunSkipFailures,
      autoRunRoundSummaries: serializeAutoRunRoundSummaries(plan.totalRuns, plan.roundSummaries),
      autoRunTimerPlan: plan,
      scheduledAutoRunPlan: null,
    }
  );
  await ensureAutoRunTimerAlarm(plan.fireAt);
}

async function ensureManualInteractionAllowed(actionLabel) {
  const state = await getState();

  if (isAutoRunLockedState(state)) {
    throw new Error(`自动流程运行中，请先停止后再${actionLabel}。`);
  }
  if (isAutoRunPausedState(state)) {
    throw new Error(`自动流程当前已暂停。请点击“继续”，或先确认接管自动流程后再${actionLabel}。`);
  }
  if (isAutoRunScheduledState(state)) {
    throw new Error(`自动流程已计划启动。请先取消计划，或立即开始后再${actionLabel}。`);
  }

  return state;
}

async function skipStep(step) {
  const state = await ensureManualInteractionAllowed('跳过步骤');

  if (!Number.isInteger(step) || !STEP_IDS.includes(step)) {
    throw new Error(`无效步骤：${step}`);
  }

  const statuses = { ...(state.stepStatuses || {}) };
  const currentStatus = statuses[step];
  if (currentStatus === 'running') {
    throw new Error(`步骤 ${step} 正在运行中，不能跳过。`);
  }
  if (isStepDoneStatus(currentStatus)) {
    throw new Error(`步骤 ${step} 已完成，无需再跳过。`);
  }

  if (step > 1) {
    const prevStatus = statuses[step - 1];
    if (!isStepDoneStatus(prevStatus)) {
      throw new Error(`请先完成步骤 ${step - 1}，再跳过步骤 ${step}。`);
    }
  }

  await setStepStatus(step, 'skipped');
  await addLog(`步骤 ${step} 已跳过`, 'warn');

  if (step === 1) {
    const latestState = await getState();
    const skippedSteps = [];
    for (let linkedStep = 2; linkedStep <= 5; linkedStep += 1) {
      const linkedStatus = latestState.stepStatuses?.[linkedStep];
      if (!isStepDoneStatus(linkedStatus) && linkedStatus !== 'running') {
        await setStepStatus(linkedStep, 'skipped');
        skippedSteps.push(linkedStep);
      }
    }
    if (skippedSteps.length) {
      await addLog(`步骤 1 已跳过，步骤 ${skippedSteps.join('、')} 也已同时跳过。`, 'warn');
    }
  }

  return { ok: true, step, status: 'skipped' };
}

function throwIfStopped() {
  if (stopRequested) {
    throw new Error(STOP_ERROR_MESSAGE);
  }
}

async function sleepWithStop(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    throwIfStopped();
    await new Promise(r => setTimeout(r, Math.min(100, ms - (Date.now() - start))));
  }
}

async function humanStepDelay(min = HUMAN_STEP_DELAY_MIN, max = HUMAN_STEP_DELAY_MAX) {
  const duration = Math.floor(Math.random() * (max - min + 1)) + min;
  await sleepWithStop(duration);
}

async function clickWithDebugger(tabId, rect) {
  throwIfStopped();
  if (!tabId) {
    throw new Error('未找到用于调试点击的认证页面标签页。');
  }
  if (!rect || !Number.isFinite(rect.centerX) || !Number.isFinite(rect.centerY)) {
    throw new Error('步骤 9 的调试器兜底点击需要有效的按钮坐标。');
  }

  const target = { tabId };
  try {
    await chrome.debugger.attach(target, '1.3');
  } catch (err) {
    throw new Error(
      `步骤 9 的调试器兜底点击附加失败：${err.message}。` +
      '如果认证页标签已打开 DevTools，请先关闭后重试。'
    );
  }

  try {
    throwIfStopped();
    const x = Math.round(rect.centerX);
    const y = Math.round(rect.centerY);

    await chrome.debugger.sendCommand(target, 'Page.bringToFront');
    throwIfStopped();
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'none',
      buttons: 0,
      clickCount: 0,
    });
    throwIfStopped();
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    throwIfStopped();
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
  } finally {
    await chrome.debugger.detach(target).catch(() => { });
  }
}

async function broadcastStopToContentScripts() {
  const registry = await getTabRegistry();
  for (const entry of Object.values(registry)) {
    if (!entry?.tabId) continue;
    try {
      await chrome.tabs.sendMessage(entry.tabId, {
        type: 'STOP_FLOW',
        source: 'background',
        payload: {},
      });
    } catch { }
  }
}

let stopRequested = false;

// ============================================================
// Message Handler (central router)
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(LOG_PREFIX, `Received: ${message.type} from ${message.source || 'sidepanel'}`, message);

  handleMessage(message, sender).then(response => {
    sendResponse(response);
  }).catch(err => {
    console.error(LOG_PREFIX, 'Handler error:', err);
    sendResponse({ error: err.message });
  });

  return true; // async response
});

async function handleMessage(message, sender) {
  return messageRouter.handleMessage(message, sender);
}

// ============================================================
// Step Data Handlers
// ============================================================

async function handleStepData(step, payload) {
  if (typeof messageRouter !== 'undefined' && messageRouter?.handleStepData) {
    return messageRouter.handleStepData(step, payload);
  }

  switch (step) {
    case 1: {
      const updates = {};
      if (payload.oauthUrl) {
        updates.oauthUrl = payload.oauthUrl;
        broadcastDataUpdate({ oauthUrl: payload.oauthUrl });
      }
      if (Object.keys(updates).length) {
        await setState(updates);
      }
      break;
    }
    case 2:
      if (payload.email) await setEmailState(payload.email);
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
    case 7:
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
        await setState({
          localhostUrl: payload.localhostUrl,
          oauthFlowDeadlineAt: null,
        });
        broadcastDataUpdate({ localhostUrl: payload.localhostUrl });
      }
      break;
    case 10: {
      if (payload.localhostUrl) {
        await closeLocalhostCallbackTabs(payload.localhostUrl);
      }
      const latestState = await getState();
      const localhostPrefix = buildLocalhostCleanupPrefix(payload.localhostUrl);
      if (localhostPrefix) {
        await closeTabsByUrlPrefix(localhostPrefix, {
          excludeUrls: [payload.localhostUrl],
          excludeLocalhostCallbacks: true,
        });
      }
      if (shouldUseCustomRegistrationEmail(latestState) && latestState.email) {
        await addLog(`流程成功：当前自定义邮箱 ${latestState.email} 已完成本轮使用，准备清空运行态邮箱，下一轮将继续按配置分配。`, 'info');
        await setEmailStateSilently(null);
      }
      break;
    }
  }
}

// ============================================================
// Step Completion Waiting
// ============================================================

// Map of step -> { resolve, reject } for waiting on step completion
const stepWaiters = new Map();
let resumeWaiter = null;
const AUTO_RUN_SIGNAL_COMPLETION_TIMEOUT_MS = 120000;
const AUTO_RUN_BACKGROUND_COMPLETED_STEPS = new Set([1, 2, 4, 6, 7, 8, 9]);
const STEP_COMPLETION_SIGNAL_STEPS = new Set([3, 5, 10]);

function waitForStepComplete(step, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    throwIfStopped();
    if (stepWaiters.has(step)) {
      console.warn(LOG_PREFIX, `[waitForStepComplete] replacing existing waiter for step ${step}`);
    }
    console.log(LOG_PREFIX, `[waitForStepComplete] register step ${step}, timeout=${timeoutMs}ms`);
    const timer = setTimeout(() => {
      stepWaiters.delete(step);
      console.warn(LOG_PREFIX, `[waitForStepComplete] timeout for step ${step} after ${timeoutMs}ms`);
      reject(new Error(`步骤 ${step} 等待超时（>${timeoutMs / 1000} 秒）`));
    }, timeoutMs);

    stepWaiters.set(step, {
      resolve: (data) => { clearTimeout(timer); stepWaiters.delete(step); resolve(data); },
      reject: (err) => { clearTimeout(timer); stepWaiters.delete(step); reject(err); },
    });
  });
}

function doesStepUseCompletionSignal(step) {
  return STEP_COMPLETION_SIGNAL_STEPS.has(step);
}

function notifyStepComplete(step, payload) {
  const waiter = stepWaiters.get(step);
  console.log(LOG_PREFIX, `[notifyStepComplete] step ${step}, hasWaiter=${Boolean(waiter)}`);
  if (waiter) waiter.resolve(payload);
}

function notifyStepError(step, error) {
  const waiter = stepWaiters.get(step);
  console.warn(LOG_PREFIX, `[notifyStepError] step ${step}, hasWaiter=${Boolean(waiter)}, error=${error}`);
  if (waiter) waiter.reject(new Error(error));
}

async function completeStepFromBackground(step, payload = {}) {
  if (stopRequested) {
    await setStepStatus(step, 'stopped');
    await appendManualAccountRunRecordIfNeeded(`step${step}_stopped`, null, STOP_ERROR_MESSAGE);
    notifyStepError(step, STOP_ERROR_MESSAGE);
    return;
  }

  const completionState = step === LAST_STEP_ID ? await getState() : null;
  await setStepStatus(step, 'completed');
  await addLog(`步骤 ${step} 已完成`, 'ok');
  await handleStepData(step, payload);
  if (step === LAST_STEP_ID) {
    await appendAndBroadcastAccountRunRecord('success', completionState);
  }
  notifyStepComplete(step, payload);
}

async function appendManualAccountRunRecordIfNeeded(status, stateOverride = null, reason = '') {
  return null;
}

async function finalizeDeferredStepExecutionError(step, error) {
  const latestState = await getState();
  const currentStatus = latestState.stepStatuses?.[step];
  if (currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'stopped') {
    return;
  }

  if (isStopError(error)) {
    await setStepStatus(step, 'stopped');
    await addLog(`步骤 ${step} 已被用户停止`, 'warn');
    await appendManualAccountRunRecordIfNeeded(`step${step}_stopped`, latestState, getErrorMessage(error));
    return;
  }

  await setStepStatus(step, 'failed');
  await addLog(`步骤 ${step} 失败：${getErrorMessage(error)}`, 'error');
  await appendManualAccountRunRecordIfNeeded(`step${step}_failed`, latestState, getErrorMessage(error));
}

async function executeStepViaCompletionSignal(step, timeoutMs = AUTO_RUN_SIGNAL_COMPLETION_TIMEOUT_MS) {
  const completionResultPromise = waitForStepComplete(step, timeoutMs).then(
    payload => ({ ok: true, payload }),
    error => ({ ok: false, error }),
  );

  let executeError = null;
  try {
    await executeStep(step, { deferRetryableTransportError: true });
  } catch (err) {
    executeError = err;
    if (isStopError(err) || !isRetryableContentScriptTransportError(err)) {
      notifyStepError(step, getErrorMessage(err));
    }
  }

  const completionResult = await completionResultPromise;
  if (completionResult.ok) {
    if (executeError) {
      console.warn(
        LOG_PREFIX,
        `[executeStepViaCompletionSignal] step ${step} completed after deferred execute error: ${getErrorMessage(executeError)}`
      );
    }
    return completionResult.payload;
  }

  if (executeError && isRetryableContentScriptTransportError(executeError)) {
    const completionMessage = getErrorMessage(completionResult.error);
    if (/等待超时/.test(completionMessage)) {
      await finalizeDeferredStepExecutionError(step, executeError);
      throw executeError;
    }
    throw completionResult.error;
  }

  if (executeError) {
    throw executeError;
  }

  throw completionResult.error;
}

async function waitForRunningStepsToFinish(payload = {}) {
  let currentState = await getState();
  let runningSteps = getRunningSteps(currentState.stepStatuses);
  if (!runningSteps.length) {
    return currentState;
  }

  await addLog(`自动继续：检测到步骤 ${runningSteps.join(', ')} 正在运行，等待完成后再继续自动流程...`, 'info');
  await broadcastAutoRunStatus('waiting_step', payload);

  while (runningSteps.length) {
    await sleepWithStop(250);
    currentState = await getState();
    runningSteps = getRunningSteps(currentState.stepStatuses);
  }

  await addLog('自动继续：当前运行步骤已结束，准备按最新进度继续自动流程...', 'info');
  return currentState;
}

async function markRunningStepsStopped() {
  const state = await getState();
  const runningSteps = getRunningSteps(state.stepStatuses);

  for (const step of runningSteps) {
    await setStepStatus(step, 'stopped');
  }
}

async function requestStop(options = {}) {
  const { logMessage = '已收到停止请求，正在取消当前操作...' } = options;
  const state = await getState();
  const timerPlan = getPendingAutoRunTimerPlan(state);

  if (timerPlan?.kind === AUTO_RUN_TIMER_KIND_SCHEDULED_START && !autoRunActive) {
    await cancelScheduledAutoRun({
      logMessage: options.logMessage === false
        ? false
        : (options.logMessage || '已取消自动运行倒计时计划。'),
    });
    return;
  }

  if (timerPlan && !autoRunActive) {
    autoRunCurrentRun = timerPlan.currentRun;
    autoRunTotalRuns = timerPlan.totalRuns;
    autoRunAttemptRun = timerPlan.attemptRun;
    clearCurrentAutoRunSessionId(timerPlan.autoRunSessionId);
    if (options.logMessage !== false) {
      await addLog(options.logMessage || '已停止等待中的自动流程。', 'warn');
    }
    await broadcastAutoRunStatus('stopped', {
      currentRun: timerPlan.currentRun,
      totalRuns: timerPlan.totalRuns,
      attemptRun: timerPlan.attemptRun,
      sessionId: 0,
    }, {
      autoRunSessionId: 0,
      autoRunSkipFailures: timerPlan.autoRunSkipFailures,
      autoRunRoundSummaries: serializeAutoRunRoundSummaries(timerPlan.totalRuns, timerPlan.roundSummaries),
      autoRunTimerPlan: null,
      scheduledAutoRunPlan: null,
    });
    await clearAutoRunTimerAlarm();
    clearStopRequest();
    return;
  }

  if (stopRequested) return;

  stopRequested = true;
  clearCurrentAutoRunSessionId();
  cancelPendingCommands();
  cleanupStep8NavigationListeners();
  rejectPendingStep8(new Error(STOP_ERROR_MESSAGE));

  await addLog(logMessage, 'warn');
  await broadcastStopToContentScripts();

  for (const waiter of stepWaiters.values()) {
    waiter.reject(new Error(STOP_ERROR_MESSAGE));
  }
  stepWaiters.clear();

  if (resumeWaiter) {
    resumeWaiter.reject(new Error(STOP_ERROR_MESSAGE));
    resumeWaiter = null;
  }

  await markRunningStepsStopped();
  autoRunActive = false;
  await broadcastAutoRunStatus('stopped', {
    currentRun: autoRunCurrentRun,
    totalRuns: autoRunTotalRuns,
    attemptRun: autoRunAttemptRun,
    sessionId: 0,
  }, {
    autoRunSessionId: 0,
    autoRunTimerPlan: null,
    scheduledAutoRunPlan: null,
  });
}

// ============================================================
// Step Execution
// ============================================================

async function executeStep(step, options = {}) {
  const { deferRetryableTransportError = false } = options;
  console.log(LOG_PREFIX, `Executing step ${step}`);
  throwIfStopped();
  await setStepStatus(step, 'running');
  await addLog(`步骤 ${step} 开始执行`);
  await humanStepDelay();

  const state = await getState();

  // Set flow start time on first step
  if (step === 1 && !state.flowStartTime) {
    await setState({ flowStartTime: Date.now() });
  }

  try {
    await stepRegistry.executeStep(step, state);
  } catch (err) {
    if (isStopError(err)) {
      await setStepStatus(step, 'stopped');
      await addLog(`步骤 ${step} 已被用户停止`, 'warn');
      await appendManualAccountRunRecordIfNeeded(`step${step}_stopped`, state, getErrorMessage(err));
      throw err;
    }
    if (isTerminalSecurityBlockedError(err)) {
      await handleCloudflareSecurityBlocked(err);
      throw new Error(STOP_ERROR_MESSAGE);
    }
    if (!(deferRetryableTransportError && doesStepUseCompletionSignal(step) && isRetryableContentScriptTransportError(err))) {
      await setStepStatus(step, 'failed');
      await addLog(`步骤 ${step} 失败：${err.message}`, 'error');
      await appendManualAccountRunRecordIfNeeded(`step${step}_failed`, state, getErrorMessage(err));
    } else {
      console.warn(
        LOG_PREFIX,
        `[executeStep] deferring retryable transport error for step ${step}: ${getErrorMessage(err)}`
      );
    }
    throw err;
  }
}

/**
 * Execute a step and wait for it to complete before returning.
 * @param {number} step
 * @param {number} delayAfter - ms to wait after completion (for page transitions)
 */
async function executeStepAndWait(step, delayAfter = 2000) {
  throwIfStopped();

  const delaySeconds = normalizeAutoStepDelaySeconds((await getState()).autoStepDelaySeconds, null);
  if (delaySeconds > 0) {
    await addLog(
      `自动运行：步骤 ${step} 执行前额外等待 ${delaySeconds} 秒，避免节奏过快。`,
      'info'
    );
    await sleepWithStop(delaySeconds * 1000);
  }

  if (AUTO_RUN_BACKGROUND_COMPLETED_STEPS.has(step)) {
    await addLog(`自动运行：步骤 ${step} 由后台流程负责收尾，执行函数返回后将直接进入下一步。`, 'info');
    await executeStep(step);
    const latestState = await getState();
    await addLog(`自动运行：步骤 ${step} 已执行返回，当前状态为 ${latestState.stepStatuses?.[step] || 'pending'}，准备继续后续步骤。`, 'info');
  } else if (doesStepUseCompletionSignal(step)) {
    await addLog(`自动运行：步骤 ${step} 已发起，正在等待完成信号（超时 ${AUTO_RUN_SIGNAL_COMPLETION_TIMEOUT_MS / 1000} 秒）。`, 'info');
    await executeStepViaCompletionSignal(step, AUTO_RUN_SIGNAL_COMPLETION_TIMEOUT_MS);
    await addLog(`自动运行：步骤 ${step} 已收到完成信号，准备继续后续步骤。`, 'info');
  } else {
    await executeStep(step);
  }

  if (step === 5) {
    const signupTabId = await getTabId('signup-page');
    if (signupTabId) {
      await addLog('自动运行：步骤 5 已收到完成信号，正在等待当前页面完成加载...', 'info');
      await waitForTabComplete(signupTabId, {
        timeoutMs: 15000,
        retryDelayMs: 300,
      });
    }
  }

  // Extra delay for page transitions / DOM updates
  if (delayAfter > 0) {
    await sleepWithStop(delayAfter + Math.floor(Math.random() * 1200));
  }
}

function getEmailGeneratorLabel(generator) {
  if (generator === 'custom') {
    return '自定义邮箱';
  }
  if (generator === 'icloud') {
    return 'iCloud 隐私邮箱';
  }
  if (generator === 'cloudflare') return 'Cloudflare 邮箱';
  if (generator === CLOUDFLARE_TEMP_EMAIL_GENERATOR) return 'Cloudflare Temp Email';
  return 'Duck 邮箱';
}

// ============================================================
// Auto Run Flow
// ============================================================

let autoRunActive = false;
let autoRunCurrentRun = 0;
let autoRunTotalRuns = 1;
let autoRunAttemptRun = 0;
let autoRunSessionId = 0;
let autoRunSessionSeed = 0;
const VERIFICATION_POLL_MAX_ROUNDS = 5;
const STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS = 25000;
const MAIL_2925_VERIFICATION_MAX_ATTEMPTS = 15;
const MAIL_2925_VERIFICATION_INTERVAL_MS = 15000;
const AUTO_STEP_DELAYS = {
  1: 2000,
  2: 2000,
  3: 3000,
  4: 2000,
  5: 0,
  6: 3000,
  7: 2000,
  8: 2000,
  9: 1000,
};
async function broadcastAccountRunHistoryUpdate() {
  return [];
}

async function appendAndBroadcastAccountRunRecord(status, stateOverride = null, reason = '') {
  return null;
}

const autoRunController = self.MultiPageBackgroundAutoRunController?.createAutoRunController({
  addLog,
  appendAccountRunRecord: (...args) => appendAndBroadcastAccountRunRecord(...args),
  AUTO_RUN_MAX_RETRIES_PER_ROUND,
  AUTO_RUN_RETRY_DELAY_MS,
  AUTO_RUN_TIMER_KIND_BEFORE_RETRY,
  AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS,
  broadcastAutoRunStatus,
  broadcastStopToContentScripts,
  cancelPendingCommands,
  clearStopRequest: () => clearStopRequest(),
  createAutoRunSessionId: () => createAutoRunSessionId(),
  getAutoRunStatusPayload,
  getErrorMessage,
  getFirstUnfinishedStep,
  getPendingAutoRunTimerPlan,
  getRunningSteps,
  getState,
  getStopRequested: () => stopRequested,
  hasSavedProgress,
  isAddPhoneAuthFailure,
  isRestartCurrentAttemptError,
  isStopError,
  launchAutoRunTimerPlan,
  normalizeAutoRunFallbackThreadIntervalMinutes,
  persistAutoRunTimerPlan,
  resetState,
  runAutoSequenceFromStep: (...args) => runAutoSequenceFromStep(...args),
  runtime: {
    get: () => ({
      autoRunActive,
      autoRunCurrentRun,
      autoRunTotalRuns,
      autoRunAttemptRun,
      autoRunSessionId,
    }),
    set: (updates = {}) => {
      if (updates.autoRunActive !== undefined) autoRunActive = Boolean(updates.autoRunActive);
      if (updates.autoRunCurrentRun !== undefined) autoRunCurrentRun = Number(updates.autoRunCurrentRun) || 0;
      if (updates.autoRunTotalRuns !== undefined) autoRunTotalRuns = Number(updates.autoRunTotalRuns) || 0;
      if (updates.autoRunAttemptRun !== undefined) autoRunAttemptRun = Number(updates.autoRunAttemptRun) || 0;
      if (updates.autoRunSessionId !== undefined) autoRunSessionId = normalizeAutoRunSessionId(updates.autoRunSessionId);
    },
  },
  setState,
  sleepWithStop,
  throwIfAutoRunSessionStopped: (sessionId) => throwIfAutoRunSessionStopped(sessionId),
  waitForRunningStepsToFinish,
  throwIfStopped: () => throwIfStopped(),
  chrome,
});

async function resumeAutoRunIfWaitingForEmail(options = {}) {
  const { silent = false } = options;
  const state = await getState();
  if (!state.email || !isAutoRunPausedState(state)) {
    return false;
  }

  if (resumeWaiter) {
    if (!silent) {
      await addLog('邮箱已就绪，自动继续后续步骤...', 'info');
    }
    resumeWaiter.resolve();
    resumeWaiter = null;
    return true;
  }

  return false;
}

async function ensureAutoEmailReady(targetRun, totalRuns, attemptRuns) {
  const currentState = await getState();
  const currentEmail = normalizeCustomEmailEntry(currentState.email);
  if (currentEmail) {
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：自定义邮箱已就绪：${currentEmail}（第 ${attemptRuns} 次尝试）===`, 'ok');
    return currentEmail;
  }

  const nextCustomEmail = await ensureCustomEmailForFlow(currentState, {
    markUsed: true,
    reuseCurrentEmail: false,
  });
  if (nextCustomEmail) {
    await setEmailStateSilently(nextCustomEmail);
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：已分配自定义邮箱 ${nextCustomEmail}（第 ${attemptRuns} 次尝试）===`, 'ok');
    return nextCustomEmail;
  }

  if (hasConfiguredCustomEmailList(currentState)) {
    throw new Error('自定义邮箱列表已耗尽，请补充新的自定义邮箱后重试。');
  }

  await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮已暂停：请先填写自定义注册邮箱，然后继续 ===`, 'warn');
  await broadcastAutoRunStatus('waiting_email', {
    currentRun: targetRun,
    totalRuns,
    attemptRun: attemptRuns,
  });

  await waitForResume();

  const resumedState = await getState();
  if (!resumedState.email) {
    throw new Error('无法继续：当前没有注册邮箱。');
  }
  return resumedState.email;
}

async function runAutoSequenceFromStep(startStep, context = {}) {
  const { targetRun, totalRuns, attemptRuns, continued = false } = context;
  let postStep7RestartCount = 0;
  let step4RestartCount = 0;
  let currentStartStep = startStep;
  let continueCurrentAttempt = continued;

  while (true) {

  if (continueCurrentAttempt) {
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：继续当前进度，从步骤 ${startStep} 开始（第 ${attemptRuns} 次尝试）===`, 'info');
  } else {
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：第 ${attemptRuns} 次尝试，阶段 1，打开官网并进入密码页 ===`, 'info');
  }

  if (currentStartStep <= 1) {
    await executeStepAndWait(1, AUTO_STEP_DELAYS[1]);
  }

  if (currentStartStep <= 2) {
    await ensureAutoEmailReady(targetRun, totalRuns, attemptRuns);
    await executeStepAndWait(2, AUTO_STEP_DELAYS[2]);
  }

  if (currentStartStep <= 3) {
    const latestState = await getState();
    const step3Status = latestState.stepStatuses?.[3] || 'pending';
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：阶段 2，填写密码、验证、登录并完成授权（第 ${attemptRuns} 次尝试）===`, 'info');
    await broadcastAutoRunStatus('running', {
      currentRun: targetRun,
      totalRuns,
      attemptRun: attemptRuns,
    });
    if (isStepDoneStatus(step3Status)) {
      await addLog(`自动运行：步骤 3 当前状态为 ${step3Status}，将直接继续后续流程。`, 'info');
    } else {
      await executeStepAndWait(3, AUTO_STEP_DELAYS[3]);
    }
  } else {
    await addLog(`=== 目标 ${targetRun}/${totalRuns} 轮：继续执行剩余流程（第 ${attemptRuns} 次尝试）===`, 'info');
  }

  const signupTabId = await getTabId('signup-page');
  if (signupTabId) {
    await chrome.tabs.update(signupTabId, { active: true });
  }

  let restartFromStep1WithCurrentEmail = false;
  let step = Math.max(currentStartStep, 4);
  while (step <= LAST_STEP_ID) {
    try {
      await executeStepAndWait(step, AUTO_STEP_DELAYS[step]);
      const latestState = await getState();
      step += 1;
    } catch (err) {
      if (isStopError(err)) {
        throw err;
      }

      if (step === 4 && !err?.roundScopedFailure) {
        step4RestartCount += 1;
        const preservedState = await getState();
        const preservedEmail = String(preservedState.email || '').trim();
        const preservedPassword = String(preservedState.password || '').trim();
        const emailSuffix = preservedEmail ? `当前邮箱：${preservedEmail}；` : '';
        await addLog(
          `步骤 4：执行失败，准备沿用当前邮箱回到步骤 1 重新开始（第 ${step4RestartCount} 次重开）。${emailSuffix}原因：${getErrorMessage(err)}`,
          'warn'
        );
        await invalidateDownstreamAfterStepRestart(1, {
          logLabel: `步骤 4 报错后准备回到步骤 1 沿用当前邮箱重试（第 ${step4RestartCount} 次重开）`,
        });
        const restorePayload = {};
        if (preservedEmail) restorePayload.email = preservedEmail;
        if (preservedPassword) restorePayload.password = preservedPassword;
        if (Object.keys(restorePayload).length) {
          await setState(restorePayload);
        }
        currentStartStep = 1;
        continueCurrentAttempt = true;
        restartFromStep1WithCurrentEmail = true;
        break;
      }

      const restartDecision = await getPostStep6AutoRestartDecision(step, err);
      if (restartDecision.shouldRestart) {
        postStep7RestartCount += 1;
        const authState = restartDecision.authState;
        const authStateLabel = authState?.state ? getLoginAuthStateLabel(authState.state) : '未知页面';
        const authStateSuffix = authState?.url
          ? `当前认证页：${authStateLabel}（${authState.url}）`
          : authState?.state
            ? `当前认证页：${authStateLabel}`
            : '未获取到认证页状态';
        await addLog(
          `步骤 ${step}：检测到报错且当前未进入 add-phone，正在回到步骤 7 重新开始授权流程（第 ${postStep7RestartCount} 次重开）。${authStateSuffix}；原因：${restartDecision.errorMessage || '未知错误'}`,
          'warn'
        );
        await invalidateDownstreamAfterStepRestart(6, {
          logLabel: `步骤 ${step} 报错后准备回到步骤 7 重试（第 ${postStep7RestartCount} 次重开）`,
        });
        step = 7;
        continue;
      }

      if (restartDecision.blockedByAddPhone) {
        const addPhoneUrl = restartDecision.authState?.url || 'https://auth.openai.com/add-phone';
        await addLog(`步骤 ${step}：检测到认证流程进入 add-phone（${addPhoneUrl}），停止自动回到步骤 7 重开。`, 'warn');
      }
      throw err;
    }
  }

  if (restartFromStep1WithCurrentEmail) {
    continue;
  }

  break;
}
}

async function waitForResume() {
  throwIfStopped();
  const state = await getState();
  if (state.email) {
    await addLog('邮箱已就绪，自动继续后续步骤...', 'info');
    return;
  }

  return new Promise((resolve, reject) => {
    resumeWaiter = { resolve, reject };
  });
}

function createAutoRunRoundSummary(round) {
  return autoRunController.createAutoRunRoundSummary(round);
}

function normalizeAutoRunRoundSummary(summary, round) {
  return autoRunController.normalizeAutoRunRoundSummary(summary, round);
}

function buildAutoRunRoundSummaries(totalRuns, rawSummaries = []) {
  return autoRunController.buildAutoRunRoundSummaries(totalRuns, rawSummaries);
}

function serializeAutoRunRoundSummaries(totalRuns, roundSummaries = []) {
  return autoRunController.serializeAutoRunRoundSummaries(totalRuns, roundSummaries);
}

function getAutoRunRoundRetryCount(summary) {
  return autoRunController.getAutoRunRoundRetryCount(summary);
}

function formatAutoRunFailureReasons(reasons = []) {
  return autoRunController.formatAutoRunFailureReasons(reasons);
}

async function logAutoRunFinalSummary(totalRuns, roundSummaries = []) {
  return autoRunController.logAutoRunFinalSummary(totalRuns, roundSummaries);
}

async function skipAutoRunCountdown() {
  return autoRunController.skipAutoRunCountdown();
}

async function waitBetweenAutoRunRounds(targetRun, totalRuns, roundSummary, options = {}) {
  return autoRunController.waitBetweenAutoRunRounds(targetRun, totalRuns, roundSummary, options);
}

async function waitBeforeAutoRunRetry(targetRun, totalRuns, nextAttemptRun, options = {}) {
  return autoRunController.waitBeforeAutoRunRetry(targetRun, totalRuns, nextAttemptRun, options);
}

async function handleAutoRunLoopUnhandledError(error) {
  return autoRunController.handleAutoRunLoopUnhandledError(error);
}

function startAutoRunLoop(totalRuns, options = {}) {
  return autoRunController.startAutoRunLoop(totalRuns, options);
}

async function autoRunLoop(totalRuns, options = {}) {
  return autoRunController.autoRunLoop(totalRuns, options);
}

async function resumeAutoRun() {
  throwIfStopped();
  const state = await getState();
  if (!state.email) {
    await addLog('无法继续：当前没有邮箱地址，请先在侧边栏填写邮箱。', 'error');
    return false;
  }

  const resumedInMemory = await resumeAutoRunIfWaitingForEmail({ silent: true });
  if (resumedInMemory) {
    return true;
  }

  if (!isAutoRunPausedState(state)) {
    return false;
  }

  if (autoRunActive) {
    return false;
  }

  const totalRuns = state.autoRunTotalRuns || 1;
  const currentRun = state.autoRunCurrentRun || 1;
  const attemptRun = state.autoRunAttemptRun || 1;

  await addLog('检测到自动流程暂停上下文已丢失，正在从当前进度恢复自动运行...', 'warn');
  startAutoRunLoop(totalRuns, {
    autoRunSessionId: normalizeAutoRunSessionId(state.autoRunSessionId),
    autoRunSkipFailures: Boolean(state.autoRunSkipFailures),
    mode: 'continue',
    resumeCurrentRun: currentRun,
    resumeAttemptRun: attemptRun,
    resumeRoundSummaries: state.autoRunRoundSummaries,
  });
  return true;
}

// ============================================================
// Signup / OAuth Helpers
// ============================================================

const SIGNUP_ENTRY_URL = 'https://chatgpt.com/';
const SIGNUP_PAGE_INJECT_FILES = ['content/utils.js', 'content/auth-page-recovery.js', 'content/signup-page.js'];
const panelBridge = self.MultiPageBackgroundPanelBridge?.createPanelBridge({
  chrome,
  addLog,
  closeConflictingTabsForSource,
  ensureContentScriptReadyOnTab,
  getState,
  getPanelMode,
  normalizeSub2ApiUrl,
  rememberSourceLastUrl,
  sendToContentScript,
  sendToContentScriptResilient,
  waitForTabUrlFamily,
  DEFAULT_SUB2API_GROUP_NAME,
  SUB2API_STEP1_RESPONSE_TIMEOUT_MS,
});
const signupFlowHelpers = self.MultiPageSignupFlowHelpers?.createSignupFlowHelpers({
  addLog,
  chrome,
  ensureContentScriptReadyOnTab,
  ensureCustomEmailForFlow,
  getTabId,
  isCustomMailProvider,
  isSignupEmailVerificationPageUrl,
  isSignupPasswordPageUrl,
  isTabAlive,
  reuseOrCreateTab,
  sendToContentScriptResilient,
  setEmailState,
  SIGNUP_ENTRY_URL,
  SIGNUP_PAGE_INJECT_FILES,
  waitForTabUrlMatch,
});
const nativeHostBridge = self.MultiPageBackgroundNativeHost?.createNativeHostBridge({
  chrome,
});
const oauthRuntimeHelpers = self.MultiPageBackgroundOAuthRuntime || {};
const cpaAuthUploadService = self.MultiPageBackgroundCpaAuthUpload?.createCpaAuthUploadService({
  callNativeHost: (...args) => nativeHostBridge.callNativeHost(...args),
});

async function testGmailImapConnection(payload = {}) {
  return nativeHostBridge.callNativeHost('gmail.testConnection', {
    gmailImapEmail: String(payload?.gmailImapEmail || '').trim().toLowerCase(),
    gmailImapAppPassword: String(payload?.gmailImapAppPassword || ''),
    gmailImapHost: String(payload?.gmailImapHost || 'imap.gmail.com').trim() || 'imap.gmail.com',
    gmailImapPort: Math.max(1, Math.floor(Number(payload?.gmailImapPort) || 993)),
  }, {
    timeoutMs: 45000,
  });
}

const verificationFlowHelpers = self.MultiPageBackgroundVerificationFlow?.createVerificationFlowHelpers({
  addLog,
  callNativeHost: (...args) => nativeHostBridge.callNativeHost(...args),
  chrome,
  completeStepFromBackground,
  confirmCustomVerificationStepBypassRequest: (step) => chrome.runtime.sendMessage({
    type: 'REQUEST_CUSTOM_VERIFICATION_BYPASS_CONFIRMATION',
    payload: { step },
  }),
  getState,
  getTabId,
  isStopError,
  recoverVerificationSubmitResult,
  sendToContentScript,
  sendToMailContentScriptResilient,
  setState,
  setStepStatus,
  sleepWithStop,
  throwIfStopped,
  VERIFICATION_POLL_MAX_ROUNDS,
});
const step1Executor = self.MultiPageBackgroundStep1?.createStep1Executor({
  addLog,
  completeStepFromBackground,
  openSignupEntryTab,
  runImmediateCookieCleanup,
});
const step2Executor = self.MultiPageBackgroundStep2?.createStep2Executor({
  addLog,
  chrome,
  completeStepFromBackground,
  ensureContentScriptReadyOnTab,
  ensureSignupEntryPageReady,
  ensureSignupPostEmailPageReadyInTab,
  getTabId,
  isTabAlive,
  resolveSignupEmailForFlow,
  sendToContentScriptResilient,
  SIGNUP_PAGE_INJECT_FILES,
});
const step3Executor = self.MultiPageBackgroundStep3?.createStep3Executor({
  addLog,
  chrome,
  ensureContentScriptReadyOnTab,
  generatePassword,
  getTabId,
  isTabAlive,
  sendToContentScript,
  setPasswordState,
  setState,
  SIGNUP_PAGE_INJECT_FILES,
});
const step4Executor = self.MultiPageBackgroundStep4?.createStep4Executor({
  addLog,
  chrome,
  completeStepFromBackground,
  ensureContentScriptReadyOnTab,
  getMailConfig,
  getTabId,
  isTabAlive,
  resolveVerificationStep: verificationFlowHelpers.resolveVerificationStep,
  reuseOrCreateTab,
  sendToContentScriptResilient,
  STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS,
  throwIfStopped,
});
const step5Executor = self.MultiPageBackgroundStep5?.createStep5Executor({
  addLog,
  generateRandomBirthday,
  generateRandomName,
  sendToContentScript,
});
const step6Executor = self.MultiPageBackgroundStep6?.createStep6Executor({
  addLog,
  completeStepFromBackground,
});
const step7Executor = self.MultiPageBackgroundStep7?.createStep7Executor({
  addLog,
  completeStepFromBackground,
  createLocalOAuthRuntime: (options) => oauthRuntimeHelpers.createLocalOAuthRuntime?.(options),
  getErrorMessage,
  getLoginAuthStateLabel,
  getOAuthFlowStepTimeoutMs,
  getState,
  isAddPhoneAuthFailure,
  isStep6RecoverableResult,
  isStep6SuccessResult,
  refreshOAuthUrlBeforeStep6,
  reuseOrCreateTab,
  sendToContentScriptResilient,
  setState,
  startOAuthFlowTimeoutWindow,
  STEP6_MAX_ATTEMPTS,
  throwIfStopped,
});
const step8Executor = self.MultiPageBackgroundStep8?.createStep8Executor({
  addLog,
  chrome,
  ensureContentScriptReadyOnTab,
  ensureStep8VerificationPageReady,
  executeStep7: (...args) => executeStep7(...args),
  getOAuthFlowRemainingMs,
  getOAuthFlowStepTimeoutMs,
  getPanelMode,
  getMailConfig,
  getState,
  getTabId,
  isTabAlive,
  isVerificationMailPollingError,
  resolveVerificationStep: verificationFlowHelpers.resolveVerificationStep,
  reuseOrCreateTab,
  setState,
  setStepStatus,
  sleepWithStop,
  STANDARD_MAIL_VERIFICATION_RESEND_INTERVAL_MS,
  STEP7_MAIL_POLLING_RECOVERY_MAX_ATTEMPTS,
  throwIfStopped,
});
const step10Executor = self.MultiPageBackgroundStep10?.createStep10Executor({
  addLog,
  completeStepFromBackground,
  exchangeAndUploadAuthFile: (state) => cpaAuthUploadService.exchangeAndUploadAuthFile(state),
  getConfiguredCpaApiUrl: (state) => cpaAuthUploadService.getConfiguredCpaApiUrl(state),
  getConfiguredCpaManagementKey: (state) => cpaAuthUploadService.getConfiguredCpaManagementKey(state),
  isLocalhostOAuthCallbackUrl,
  shouldBypassStep9ForLocalCpa,
});
const stepDefinitions = SHARED_STEP_DEFINITIONS;
const stepExecutorsByKey = {
  'open-chatgpt': () => step1Executor.executeStep1(),
  'submit-signup-email': (state) => step2Executor.executeStep2(state),
  'fill-password': (state) => step3Executor.executeStep3(state),
  'fetch-signup-code': (state) => step4Executor.executeStep4(state),
  'fill-profile': (state) => step5Executor.executeStep5(state),
  'clear-login-cookies': () => step6Executor.executeStep6(),
  'oauth-login': (state) => step7Executor.executeStep7(state),
  'fetch-login-code': (state) => step8Executor.executeStep8(state),
  'confirm-oauth': (state) => step9Executor.executeStep9(state),
  'platform-verify': (state) => step10Executor.executeStep10(state),
};
const messageRouter = self.MultiPageBackgroundMessageRouter?.createMessageRouter({
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
  finalizeStep3Completion: async () => {
    const currentState = await getState();
    const signupTabId = await getTabId('signup-page');
    return signupFlowHelpers.finalizeSignupPasswordSubmitInTab(
      signupTabId,
      currentState.password || currentState.customPassword || '',
      3
    );
  },
  flushCommand,
  getPendingAutoRunTimerPlan,
  getSourceLabel,
  getState,
  getStopRequested: () => stopRequested,
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
});
const stepRegistry = self.MultiPageBackgroundStepRegistry?.createStepRegistry(
  stepDefinitions.map((definition) => ({
    ...definition,
    execute: stepExecutorsByKey[definition.key],
  }))
);

async function requestOAuthUrlFromPanel(state, options = {}) {
  return panelBridge.requestOAuthUrlFromPanel(state, options);
}

async function requestCpaOAuthUrl(state, options = {}) {
  return panelBridge.requestCpaOAuthUrl(state, options);
}

async function requestSub2ApiOAuthUrl(state, options = {}) {
  return panelBridge.requestSub2ApiOAuthUrl(state, options);
}

async function openSignupEntryTab(step = 1) {
  return signupFlowHelpers.openSignupEntryTab(step);
}

async function ensureSignupEntryPageReady(step = 1) {
  return signupFlowHelpers.ensureSignupEntryPageReady(step);
}

async function ensureSignupPasswordPageReadyInTab(tabId, step = 2, options = {}) {
  return signupFlowHelpers.ensureSignupPasswordPageReadyInTab(tabId, step, options);
}

async function ensureSignupPostEmailPageReadyInTab(tabId, step = 2, options = {}) {
  return signupFlowHelpers.ensureSignupPostEmailPageReadyInTab(tabId, step, options);
}

async function resolveSignupEmailForFlow(state) {
  return signupFlowHelpers.resolveSignupEmailForFlow(state);
}

// ============================================================
// Step 1: Open ChatGPT homepage
// ============================================================

async function executeStep1() {
  return step1Executor.executeStep1();
}

// ============================================================
// Step 2: Click signup, fill email, continue to password page
// ============================================================

async function executeStep2(state) {
  return step2Executor.executeStep2(state);
}

// ============================================================
// Step 3: Fill Password (via signup-page.js)
// ============================================================

async function executeStep3(state) {
  return step3Executor.executeStep3(state);
}

// ============================================================
// Step 4: Get Signup Verification Code (gmail-mail.js polls, then fills in signup-page.js)
// ============================================================

function getMailConfig(state) {
  return {
    source: 'gmail-imap',
    label: 'Gmail IMAP 后台收件箱',
  };
}

async function executeStep4(state) {
  return step4Executor.executeStep4(state);
}

// ============================================================
// Step 5: Fill Name & Birthday (via signup-page.js)
// ============================================================

async function executeStep5(state) {
  return step5Executor.executeStep5(state);
}

// ============================================================
// Step 6 Cookie Cleanup
// ============================================================

function normalizeCookieDomainForMatch(domain) {
  return String(domain || '').trim().replace(/^\.+/, '').toLowerCase();
}

function normalizeCookieStoreId(storeId) {
  const normalized = String(storeId || '').trim();
  return normalized || null;
}

function shouldClearPreLoginCookie(cookie) {
  const domain = normalizeCookieDomainForMatch(cookie?.domain);
  if (!domain) return false;
  return PRE_LOGIN_COOKIE_CLEAR_DOMAINS.some((target) => (
    domain === target || domain.endsWith(`.${target}`)
  ));
}

function buildCookieRemovalUrl(cookie) {
  const host = normalizeCookieDomainForMatch(cookie?.domain);
  const path = String(cookie?.path || '/').startsWith('/')
    ? String(cookie?.path || '/')
    : `/${String(cookie?.path || '')}`;
  return `https://${host}${path}`;
}

async function resolveCookieStoreIdsForWindow(windowId) {
  const normalizedWindowId = Number(windowId);
  if (!Number.isInteger(normalizedWindowId) || normalizedWindowId < 0) {
    return [];
  }

  if (!chrome.tabs?.query || !chrome.cookies?.getAllCookieStores) {
    return [];
  }

  const tabs = await chrome.tabs.query({ windowId: normalizedWindowId });
  const tabIds = new Set(
    (tabs || [])
      .map((tab) => Number(tab?.id))
      .filter((tabId) => Number.isInteger(tabId) && tabId >= 0)
  );
  if (!tabIds.size) {
    return [];
  }

  const storeIds = [];
  const stores = await chrome.cookies.getAllCookieStores();
  for (const store of stores || []) {
    const storeId = normalizeCookieStoreId(store?.id);
    if (!storeId) continue;
    const storeTabIds = Array.isArray(store?.tabIds) ? store.tabIds : [];
    if (storeTabIds.some((tabId) => tabIds.has(Number(tabId)))) {
      storeIds.push(storeId);
    }
  }

  return Array.from(new Set(storeIds));
}

async function collectCookiesForPreLoginCleanup(options = {}) {
  if (!chrome.cookies?.getAll) {
    return [];
  }

  const storeIds = Array.from(new Set(
    (Array.isArray(options?.storeIds) ? options.storeIds : [])
      .map((storeId) => normalizeCookieStoreId(storeId))
      .filter(Boolean)
  ));
  if (!storeIds.length) {
    return [];
  }

  const cookies = [];
  const seen = new Set();

  for (const storeId of storeIds) {
    const batch = await chrome.cookies.getAll({ storeId });
    for (const cookie of batch || []) {
      if (!shouldClearPreLoginCookie(cookie)) continue;
      const key = [
        normalizeCookieStoreId(cookie.storeId) || storeId,
        cookie.domain || '',
        cookie.path || '',
        cookie.name || '',
        cookie.partitionKey ? JSON.stringify(cookie.partitionKey) : '',
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      cookies.push(cookie);
    }
  }

  return cookies;
}

async function removeCookieDirectly(cookie) {
  const details = {
    url: buildCookieRemovalUrl(cookie),
    name: cookie.name,
  };

  if (cookie.storeId) {
    details.storeId = cookie.storeId;
  }
  if (cookie.partitionKey) {
    details.partitionKey = cookie.partitionKey;
  }

  try {
    const result = await chrome.cookies.remove(details);
    return Boolean(result);
  } catch (err) {
    console.warn(LOG_PREFIX, '[removeCookieDirectly] failed', {
      domain: cookie?.domain,
      name: cookie?.name,
      message: getErrorMessage(err),
    });
    return false;
  }
}

async function runPreStep6CookieCleanup() {
  return runChatgptCookieCleanup({
    stepLabel: '步骤 6',
    delayMs: STEP6_PRE_LOGIN_COOKIE_CLEAR_DELAY_MS,
  });
}

async function runImmediateCookieCleanup() {
  return runChatgptCookieCleanup({
    stepLabel: '步骤 1',
    delayMs: 0,
  });
}

async function runChatgptCookieCleanup(options = {}) {
  const {
    stepLabel = '步骤 6',
    delayMs = 0,
  } = options;

  if (delayMs > 0) {
    await addLog(
      `${stepLabel}：开始前等待 ${Math.round(delayMs / 1000)} 秒，然后直接删除 ChatGPT / OpenAI cookies...`,
      'info'
    );
    await sleepWithStop(delayMs);
  } else {
    await addLog(`${stepLabel}：页面已就绪，正在立即删除 ChatGPT / OpenAI cookies...`, 'info');
  }

  if (!chrome.cookies?.getAll || !chrome.cookies?.remove) {
    await addLog(`${stepLabel}：当前浏览器不支持 cookies API，无法直接删除 cookies。`, 'warn');
    return;
  }

  const ownerWindowId = Number((await getState())?.ownerWindowId);
  const storeIds = await resolveCookieStoreIdsForWindow(ownerWindowId);
  if (!storeIds.length) {
    await addLog(`${stepLabel}：未找到当前窗口对应的 Cookie 存储，已跳过登录 Cookies 清理以避免影响其他窗口。`, 'warn');
    return;
  }

  const cookies = await collectCookiesForPreLoginCleanup({ storeIds });
  let removedCount = 0;

  for (const cookie of cookies) {
    throwIfStopped();
    if (await removeCookieDirectly(cookie)) {
      removedCount += 1;
    }
  }

  await addLog(
    `${stepLabel}：已在当前窗口对应的 Cookie 存储中直接删除 ${removedCount} 个 ChatGPT / OpenAI cookies。`,
    'ok'
  );
}

// ============================================================
// Step 7: Login and ensure the auth page reaches the login verification page
// ============================================================

async function refreshOAuthUrlBeforeStep6(state) {
  await addLog(`步骤 7：正在刷新登录用的 ${getPanelModeLabel(state)} OAuth 链接...`);
  console.log(LOG_PREFIX, '[refreshOAuthUrlBeforeStep6] requesting fresh OAuth directly from panel');
  const refreshResult = await requestOAuthUrlFromPanel(state, { logLabel: '步骤 7' });
  await handleStepData(1, refreshResult);

  if (!refreshResult?.oauthUrl) {
    throw new Error('刷新 OAuth 链接后仍未拿到可用链接。');
  }

  return refreshResult.oauthUrl;
}

function buildOAuthFlowTimeoutError(step, actionLabel = '后续授权流程') {
  return new Error(
    `步骤 ${step}：从拿到 OAuth 登录地址开始，${Math.round(OAUTH_FLOW_TIMEOUT_MS / 60000)} 分钟内未完成${actionLabel}，结束当前链路，准备从步骤 7 重新开始。`
  );
}

function normalizeOAuthFlowDeadlineAt(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.floor(numeric);
}

async function startOAuthFlowTimeoutWindow(options = {}) {
  const step = Number(options.step) || 7;
  const deadlineAt = Date.now() + OAUTH_FLOW_TIMEOUT_MS;
  await setState({ oauthFlowDeadlineAt: deadlineAt });
  await addLog(`步骤 ${step}：已拿到新的 OAuth 登录地址，开始 6 分钟倒计时。`, 'info');
  return deadlineAt;
}

async function getOAuthFlowRemainingMs(options = {}) {
  const step = Number(options.step) || 7;
  const actionLabel = String(options.actionLabel || '后续授权流程').trim() || '后续授权流程';
  const state = options.state || await getState();
  const deadlineAt = normalizeOAuthFlowDeadlineAt(state?.oauthFlowDeadlineAt);
  if (!deadlineAt) {
    return null;
  }

  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) {
    throw buildOAuthFlowTimeoutError(step, actionLabel);
  }

  return remainingMs;
}

async function getOAuthFlowStepTimeoutMs(defaultTimeoutMs, options = {}) {
  const normalizedDefault = Math.max(1000, Number(defaultTimeoutMs) || 1000);
  const reserveMs = Math.max(0, Number(options.reserveMs) || 0);
  const remainingMs = await getOAuthFlowRemainingMs(options);
  if (remainingMs === null) {
    return normalizedDefault;
  }

  const budgetMs = remainingMs - reserveMs;
  if (budgetMs <= 0) {
    throw buildOAuthFlowTimeoutError(
      Number(options.step) || 7,
      String(options.actionLabel || '后续授权流程').trim() || '后续授权流程'
    );
  }

  return Math.max(1000, Math.min(normalizedDefault, budgetMs));
}

function isStep6SuccessResult(result) {
  return result?.step6Outcome === 'success';
}

function isStep6RecoverableResult(result) {
  return result?.step6Outcome === 'recoverable';
}

function isAddPhoneAuthUrl(url) {
  return /https:\/\/auth\.openai\.com\/add-phone(?:[/?#]|$)/i.test(String(url || '').trim());
}

function isAddPhoneAuthState(authState = {}) {
  return authState?.state === 'add_phone_page'
    || Boolean(authState?.addPhonePage)
    || isAddPhoneAuthUrl(authState?.url);
}

async function getPostStep6AutoRestartDecision(step, error) {
  const normalizedStep = Number(step);
  const errorMessage = getErrorMessage(error);
  if (!Number.isFinite(normalizedStep) || normalizedStep < 7 || normalizedStep > LAST_STEP_ID) {
    return {
      shouldRestart: false,
      blockedByAddPhone: false,
      errorMessage,
      authState: null,
    };
  }

  if (isAddPhoneAuthFailure(error) || isAddPhoneAuthUrl(errorMessage)) {
    return {
      shouldRestart: false,
      blockedByAddPhone: true,
      errorMessage,
      authState: null,
    };
  }

  let authState = null;
  try {
    authState = await getLoginAuthStateFromContent({
      logMessage: `步骤 ${normalizedStep}：正在确认当前认证页状态，以决定是否回到步骤 7 重开...`,
    });
  } catch (inspectError) {
    console.warn(LOG_PREFIX, '[AutoRun] failed to inspect login auth state after post-step6 error', {
      step: normalizedStep,
      sourceError: errorMessage,
      inspectError: inspectError?.message || inspectError,
    });
  }

  if (isAddPhoneAuthState(authState)) {
    return {
      shouldRestart: false,
      blockedByAddPhone: true,
      errorMessage,
      authState,
    };
  }

  return {
    shouldRestart: true,
    blockedByAddPhone: false,
    errorMessage,
    authState,
  };
}

async function getLoginAuthStateFromContent(options = {}) {
  const { logMessage = '步骤 8：认证页正在切换，等待页面重新就绪后继续确认验证码页状态...' } = options;
  const result = await sendToContentScriptResilient(
    'signup-page',
    {
      type: 'GET_LOGIN_AUTH_STATE',
      source: 'background',
      payload: {},
    },
    {
      timeoutMs: options.timeoutMs ?? 15000,
      retryDelayMs: options.retryDelayMs ?? 600,
      responseTimeoutMs: options.responseTimeoutMs ?? (options.timeoutMs ?? 15000),
      logMessage,
    }
  );

  if (result?.error) {
    throw new Error(result.error);
  }

  return result || {};
}

async function ensureStep8VerificationPageReady(options = {}) {
  const pageState = await getLoginAuthStateFromContent(options);
  if (pageState.state === 'verification_page') {
    return pageState;
  }

  if (pageState.maxCheckAttemptsBlocked) {
    throw new Error(`${CLOUDFLARE_SECURITY_BLOCK_ERROR_PREFIX}${CLOUDFLARE_SECURITY_BLOCK_USER_MESSAGE}`);
  }

  if (pageState.state === 'login_timeout_error_page') {
    const urlPart = pageState.url ? ` URL: ${pageState.url}` : '';
    throw new Error(`STEP8_RESTART_STEP7::步骤 8：当前认证页进入登录超时报错页，请回到步骤 7 重新开始。${urlPart}`.trim());
  }

  if (pageState.state === 'add_phone_page') {
    const urlPart = pageState.url ? ` URL: ${pageState.url}` : '';
    throw new Error(`步骤 8：当前认证页进入手机号页面，当前流程无法继续自动授权。${urlPart}`.trim());
  }

  const stateLabel = getLoginAuthStateLabel(pageState.state);
  const urlPart = pageState.url ? ` URL: ${pageState.url}` : '';
  throw new Error(`当前未进入登录验证码页面，请先重新完成步骤 7。当前状态：${stateLabel}.${urlPart}`.trim());
}

async function recoverVerificationSubmitResult(step, state, code, error, options = {}) {
  if (!isRetryableContentScriptTransportError(error)) {
    return null;
  }

  await addLog(
    `步骤 ${step}：验证码提交后页面发生切换，内容脚本消息通道中断（${getErrorMessage(error)}），正在回查当前页面状态...`,
    'warn'
  );

  if (step === 4) {
    try {
      const signupTabId = await getTabId('signup-page');
      if (!signupTabId) {
        await addLog('步骤 4：提交后回查时未找到认证页标签页，无法确认页面是否已进入下一阶段。', 'warn');
        return null;
      }
      await ensureContentScriptReadyOnTab('signup-page', signupTabId, {
        inject: SIGNUP_PAGE_INJECT_FILES,
        injectSource: 'signup-page',
        timeoutMs: 15000,
        retryDelayMs: 700,
        logMessage: '步骤 4：提交后页面正在切换，等待认证页内容脚本重新就绪以确认结果...',
      });
      const result = await sendToContentScriptResilient(
        'signup-page',
        {
          type: 'PREPARE_SIGNUP_VERIFICATION',
          step: 4,
          source: 'background',
          payload: {
            password: state?.password || state?.customPassword || '',
            prepareSource: 'step4_transport_recovery',
            prepareLogLabel: '步骤 4 提交后回查',
          },
        },
        {
          timeoutMs: 50000,
          responseTimeoutMs: 45000,
          retryDelayMs: 700,
          logMessage: '步骤 4：提交验证码后页面正在切换，等待认证页重新就绪以确认结果...',
        }
      );

      if (result?.alreadyVerified) {
        await addLog(`步骤 4：验证码 ${code} 提交后虽然消息通道中断，但页面已进入下一阶段，按成功处理。`, 'warn');
        return { success: true, recoveredAfterTransportError: true };
      }
    } catch (recoveryError) {
      await addLog(`步骤 4：提交后回查失败：${getErrorMessage(recoveryError)}`, 'warn');
    }

    return null;
  }

  if (step === 8) {
    try {
      const signupTabId = await getTabId('signup-page');
      if (!signupTabId) {
        await addLog('步骤 8：提交后回查时未找到认证页标签页，无法确认页面是否已进入授权阶段。', 'warn');
        return null;
      }
      await ensureContentScriptReadyOnTab('signup-page', signupTabId, {
        inject: SIGNUP_PAGE_INJECT_FILES,
        injectSource: 'signup-page',
        timeoutMs: 15000,
        retryDelayMs: 700,
        logMessage: '步骤 8：提交后页面正在切换，等待认证页内容脚本重新就绪以确认结果...',
      });
      const pageState = await getLoginAuthStateFromContent({
        timeoutMs: 20000,
        responseTimeoutMs: 15000,
        retryDelayMs: 700,
        logMessage: '步骤 8：提交登录验证码后页面正在切换，等待认证页重新就绪以确认结果...',
      });

      if (pageState?.consentReady || (pageState?.oauthConsentPage && !pageState?.verificationVisible)) {
        await addLog(`步骤 8：验证码 ${code} 提交后虽然消息通道中断，但页面已进入 OAuth 授权页，按成功处理。`, 'warn');
        return { success: true, recoveredAfterTransportError: true, url: pageState?.url || '' };
      }

      if (pageState?.addPhonePage) {
        await addLog(`步骤 8：验证码 ${code} 提交后虽然消息通道中断，但页面已进入手机号页。`, 'warn');
        return { success: true, recoveredAfterTransportError: true, addPhonePage: true, url: pageState?.url || '' };
      }
    } catch (recoveryError) {
      await addLog(`步骤 8：提交后回查失败：${getErrorMessage(recoveryError)}`, 'warn');
    }
  }

  return null;
}

async function executeStep6() {
  return step6Executor.executeStep6();
}

// ============================================================
// Step 7: Refresh OAuth and log in
// ============================================================

async function executeStep7(state) {
  return step7Executor.executeStep7(state);
}

// ============================================================
// Step 8: Poll login verification mail and submit the login code
// ============================================================

async function executeStep8(state) {
  return step8Executor.executeStep8(state);
}

// ============================================================
// Step 9: 完成 OAuth（自动点击 + localhost 回调监听）
// ============================================================

let webNavListener = null;
let webNavCommittedListener = null;
let step8TabUpdatedListener = null;
let step8PendingReject = null;
const STEP8_CLICK_EFFECT_TIMEOUT_MS = 15000;
const STEP8_CLICK_RETRY_DELAY_MS = 500;
const STEP8_READY_WAIT_TIMEOUT_MS = 30000;
const STEP8_MAX_ROUNDS = 5;
const STEP8_STRATEGIES = [
  { mode: 'content', strategy: 'requestSubmit', label: 'form.requestSubmit' },
  { mode: 'debugger', label: 'debugger click' },
  { mode: 'content', strategy: 'nativeClick', label: 'element.click' },
  { mode: 'content', strategy: 'dispatchClick', label: 'dispatch click' },
  { mode: 'debugger', label: 'debugger click retry' },
];

function setWebNavListener(listener) {
  webNavListener = listener;
}

function getWebNavListener() {
  return webNavListener;
}

function setWebNavCommittedListener(listener) {
  webNavCommittedListener = listener;
}

function getWebNavCommittedListener() {
  return webNavCommittedListener;
}

function setStep8TabUpdatedListener(listener) {
  step8TabUpdatedListener = listener;
}

function getStep8TabUpdatedListener() {
  return step8TabUpdatedListener;
}

function setStep8PendingReject(handler) {
  step8PendingReject = handler;
}

function cleanupStep8NavigationListeners() {
  if (webNavListener) {
    chrome.webNavigation.onBeforeNavigate.removeListener(webNavListener);
    webNavListener = null;
  }
  if (webNavCommittedListener) {
    chrome.webNavigation.onCommitted.removeListener(webNavCommittedListener);
    webNavCommittedListener = null;
  }
  if (step8TabUpdatedListener) {
    chrome.tabs.onUpdated.removeListener(step8TabUpdatedListener);
    step8TabUpdatedListener = null;
  }
}

function rejectPendingStep8(error) {
  if (!step8PendingReject) return;
  const reject = step8PendingReject;
  step8PendingReject = null;
  reject(error);
}

function throwIfStep8SettledOrStopped(isSettled = false) {
  if (isSettled || stopRequested) {
    throw new Error(STOP_ERROR_MESSAGE);
  }
}

async function ensureStep8SignupPageReady(tabId, options = {}) {
  await ensureContentScriptReadyOnTab('signup-page', tabId, {
    inject: SIGNUP_PAGE_INJECT_FILES,
    injectSource: 'signup-page',
    timeoutMs: options.timeoutMs ?? 15000,
    retryDelayMs: options.retryDelayMs ?? 600,
    logMessage: options.logMessage || '',
  });
}

async function getStep8PageState(tabId, responseTimeoutMs = 1500) {
  try {
    const result = await sendTabMessageWithTimeout(tabId, 'signup-page', {
      type: 'STEP8_GET_STATE',
      source: 'background',
      payload: {},
    }, responseTimeoutMs);
    if (result?.error) {
      throw new Error(result.error);
    }
    return result;
  } catch (err) {
    if (isRetryableContentScriptTransportError(err)) {
      return null;
    }
    throw err;
  }
}

async function waitForStep8Ready(tabId, timeoutMs = STEP8_READY_WAIT_TIMEOUT_MS) {
  const start = Date.now();
  let recovered = false;
  let retryRecovered = false;

  while (Date.now() - start < timeoutMs) {
    throwIfStopped();
    const pageState = await getStep8PageState(tabId);
    if (pageState?.maxCheckAttemptsBlocked) {
      throw new Error(`${CLOUDFLARE_SECURITY_BLOCK_ERROR_PREFIX}${CLOUDFLARE_SECURITY_BLOCK_USER_MESSAGE}`);
    }
    if (pageState?.addPhonePage) {
      throw new Error('步骤 9：认证页进入了手机号页面，当前不是 OAuth 同意页，无法继续自动授权。');
    }
    if (pageState?.retryPage) {
      await recoverAuthRetryPageOnTab(tabId, {
        flow: 'auth',
        logLabel: '步骤 9：检测到认证页重试页，正在点击“重试”恢复',
        step: 8,
        timeoutMs: Math.max(1000, Math.min(12000, timeoutMs)),
      });
      retryRecovered = true;
      await sleepWithStop(250);
      continue;
    }
    if (pageState?.consentReady) {
      if (retryRecovered) {
        await addLog('步骤 9：认证页重试页已恢复，准备重新定位“继续”按钮...', 'info');
      }
      return pageState;
    }
    if (pageState === null && !recovered) {
      recovered = true;
      await ensureStep8SignupPageReady(tabId, {
        timeoutMs: Math.min(10000, timeoutMs),
        logMessage: '步骤 9：认证页内容脚本已失联，正在等待页面重新就绪...',
      });
      continue;
    }
    recovered = false;
    await sleepWithStop(250);
  }

  throw new Error('步骤 9：长时间未进入 OAuth 同意页，无法定位“继续”按钮。');
}

async function prepareStep8DebuggerClick(tabId, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000;
  const responseTimeoutMs = options.responseTimeoutMs ?? timeoutMs;
  await ensureStep8SignupPageReady(tabId, {
    timeoutMs,
    logMessage: '步骤 9：认证页内容脚本已失联，正在恢复后继续定位按钮...',
  });
  const result = await sendToContentScriptResilient('signup-page', {
    type: 'STEP8_FIND_AND_CLICK',
    source: 'background',
    payload: {},
  }, {
    timeoutMs,
    responseTimeoutMs,
    retryDelayMs: 600,
    logMessage: '步骤 9：认证页正在切换，等待 OAuth 同意页按钮重新就绪...',
  });

  if (result?.error) {
    throw new Error(result.error);
  }

  return result;
}

async function triggerStep8ContentStrategy(tabId, strategy, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000;
  const responseTimeoutMs = options.responseTimeoutMs ?? timeoutMs;
  await ensureStep8SignupPageReady(tabId, {
    timeoutMs,
    logMessage: '步骤 9：认证页内容脚本已失联，正在恢复后继续点击“继续”按钮...',
  });
  const result = await sendToContentScriptResilient('signup-page', {
    type: 'STEP8_TRIGGER_CONTINUE',
    source: 'background',
    payload: {
      strategy,
      findTimeoutMs: 4000,
      enabledTimeoutMs: 3000,
    },
  }, {
    timeoutMs,
    responseTimeoutMs,
    retryDelayMs: 600,
    logMessage: '步骤 9：认证页正在切换，等待“继续”按钮重新就绪...',
  });

  if (result?.error) {
    throw new Error(result.error);
  }

  return result;
}

async function recoverAuthRetryPageOnTab(tabId, payload = {}, options = {}) {
  const readyTimeoutMs = options.readyTimeoutMs ?? 15000;
  const timeoutMs = options.timeoutMs ?? 15000;
  const responseTimeoutMs = options.responseTimeoutMs ?? timeoutMs;
  await ensureStep8SignupPageReady(tabId, {
    timeoutMs: readyTimeoutMs,
    retryDelayMs: options.retryDelayMs ?? 600,
    logMessage: options.readyLogMessage || '步骤 9：认证页内容脚本已失联，正在恢复后继续处理重试页...',
  });
  const result = await sendToContentScriptResilient('signup-page', {
    type: 'RECOVER_AUTH_RETRY_PAGE',
    source: 'background',
    payload,
  }, {
    timeoutMs,
    responseTimeoutMs,
    retryDelayMs: options.retryDelayMs ?? 600,
    logMessage: options.logMessage || '步骤 9：认证页正在切换，等待“重试”按钮重新就绪...',
  });

  if (result?.error) {
    throw new Error(result.error);
  }

  return result;
}

async function reloadStep8ConsentPage(tabId, timeoutMs = 30000) {
  if (!Number.isInteger(tabId)) {
    throw new Error('步骤 9：缺少有效的认证页标签页，无法刷新后重试。');
  }

  await chrome.tabs.update(tabId, { active: true }).catch(() => { });

  await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('步骤 9：刷新认证页后等待页面完成加载超时。'));
    }, timeoutMs);

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status !== 'complete') return;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.reload(tabId, { bypassCache: false }).catch((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      reject(err);
    });
  });

  await ensureStep8SignupPageReady(tabId, {
    timeoutMs: Math.min(15000, timeoutMs),
    logMessage: '步骤 9：认证页刷新后内容脚本尚未就绪，正在等待页面恢复...',
  });
}

async function waitForStep8ClickEffect(tabId, baselineUrl, timeoutMs = STEP8_CLICK_EFFECT_TIMEOUT_MS) {
  const start = Date.now();
  let recovered = false;

  while (Date.now() - start < timeoutMs) {
    throwIfStopped();

    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
      throw new Error('步骤 9：认证页面标签页已关闭，无法继续自动授权。');
    }

    if (baselineUrl && typeof tab.url === 'string' && tab.url !== baselineUrl) {
      return { progressed: true, reason: 'url_changed', url: tab.url };
    }

    const pageState = await getStep8PageState(tabId);
    if (pageState?.maxCheckAttemptsBlocked) {
      throw new Error(`${CLOUDFLARE_SECURITY_BLOCK_ERROR_PREFIX}${CLOUDFLARE_SECURITY_BLOCK_USER_MESSAGE}`);
    }
    if (pageState?.addPhonePage) {
      throw new Error('步骤 9：点击“继续”后页面跳到了手机号页面，当前流程无法继续自动授权。');
    }
    if (pageState?.retryPage) {
      await recoverAuthRetryPageOnTab(tabId, {
        flow: 'auth',
        logLabel: '步骤 9：点击“继续”后进入重试页，正在点击“重试”恢复',
        step: 8,
        timeoutMs: Math.max(1000, Math.min(12000, timeoutMs)),
      });
      return {
        progressed: false,
        reason: 'retry_page_recovered',
        restartCurrentStep: true,
        url: pageState.url || baselineUrl || '',
      };
    }
    if (pageState === null) {
      if (!recovered) {
        recovered = true;
        await ensureStep8SignupPageReady(tabId, {
          timeoutMs: Math.max(1000, Math.min(8000, timeoutMs)),
          logMessage: '步骤 9：点击后认证页正在重载，正在等待内容脚本重新就绪...',
        }).catch(() => null);
        continue;
      }
      await sleepWithStop(200);
      continue;
    }
    recovered = false;

    if (pageState?.consentPage === false && !pageState?.verificationPage) {
      return {
        progressed: true,
        reason: 'left_consent_page',
        url: pageState.url || baselineUrl || '',
      };
    }

    await sleepWithStop(200);
  }

  return { progressed: false, reason: 'no_effect' };
}

function getStep8EffectLabel(effect) {
  switch (effect?.reason) {
    case 'url_changed':
      return `URL 已变化：${effect.url}`;
    case 'retry_page_recovered':
      return '页面进入重试页并已恢复，需要重新执行当前步骤';
    case 'page_reloading':
      return '页面正在跳转或重载';
    case 'left_consent_page':
      return `页面已离开 OAuth 同意页：${effect.url || 'unknown'}`;
    default:
      return '页面仍停留在 OAuth 同意页';
  }
}

const step9Executor = self.MultiPageBackgroundStep9?.createStep9Executor({
  addLog,
  chrome,
  cleanupStep8NavigationListeners,
  clickWithDebugger,
  completeStepFromBackground,
  ensureStep8SignupPageReady,
  getOAuthFlowStepTimeoutMs,
  getStep8CallbackUrlFromNavigation,
  getStep8CallbackUrlFromTabUpdate,
  getStep8EffectLabel,
  getTabId,
  getWebNavCommittedListener,
  getWebNavListener,
  getStep8TabUpdatedListener,
  isTabAlive,
  prepareStep8DebuggerClick,
  reloadStep8ConsentPage,
  reuseOrCreateTab,
  setStep8PendingReject,
  setStep8TabUpdatedListener,
  setWebNavCommittedListener,
  setWebNavListener,
  sleepWithStop,
  STEP8_CLICK_RETRY_DELAY_MS,
  STEP8_MAX_ROUNDS,
  STEP8_READY_WAIT_TIMEOUT_MS,
  STEP8_STRATEGIES,
  throwIfStep8SettledOrStopped,
  triggerStep8ContentStrategy,
  waitForStep8ClickEffect,
  waitForStep8Ready,
});

async function executeStep9(state) {
  return step9Executor.executeStep9(state);
}

// ============================================================
// Step 10: 平台回调验证
// ============================================================

async function executeStep10(state) {
  return step10Executor.executeStep10(state);
}

// ============================================================
// Open Side Panel on extension icon click
// ============================================================

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== AUTO_RUN_TIMER_ALARM_NAME) {
    return;
  }
  launchAutoRunTimerPlan('alarm').catch((err) => {
    console.error(LOG_PREFIX, 'Failed to resume auto run from timer alarm:', err);
  });
});

chrome.runtime.onStartup.addListener(() => {
  restoreAutoRunTimerIfNeeded().catch((err) => {
    console.error(LOG_PREFIX, 'Failed to restore auto run timer on startup:', err);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  restoreAutoRunTimerIfNeeded().catch((err) => {
    console.error(LOG_PREFIX, 'Failed to restore auto run timer on install/update:', err);
  });
});

restoreAutoRunTimerIfNeeded().catch((err) => {
  console.error(LOG_PREFIX, 'Failed to restore auto run timer:', err);
});
