(function attachSidepanelCustomEmailManager(globalScope) {
  function createCustomEmailManager(context = {}) {
    const {
      state = {},
      dom = {},
      helpers = {},
      runtime = {},
      callbacks = {},
      constants = {},
    } = context;

    const previewLimit = Number.isFinite(constants.previewLimit) && constants.previewLimit > 0
      ? Math.floor(constants.previewLimit)
      : 6;

    function escapeHtml(value) {
      if (typeof helpers.escapeHtml === 'function') {
        return helpers.escapeHtml(value);
      }
      return String(value ?? '');
    }

    function normalizeEmailValue(value = '') {
      return String(value || '').trim();
    }

    function getEmailKey(value = '') {
      return normalizeEmailValue(value).toLowerCase();
    }

    function normalizeCustomEmailList(rawValue) {
      const segments = Array.isArray(rawValue)
        ? rawValue.flatMap((item) => String(item ?? '').split(/[\r\n,;]+/))
        : String(rawValue ?? '').split(/[\r\n,;]+/);
      const seen = new Set();
      const normalizedList = [];

      for (const segment of segments) {
        const email = normalizeEmailValue(segment);
        if (!email) {
          continue;
        }
        const key = getEmailKey(email);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        normalizedList.push(email);
      }

      return normalizedList;
    }

    function normalizeCustomEmailUsedMap(rawValue) {
      if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
        return {};
      }

      return Object.entries(rawValue).reduce((result, [email, used]) => {
        const key = getEmailKey(email);
        if (key && used) {
          result[key] = true;
        }
        return result;
      }, {});
    }

    function stringifyCustomEmailList(list = []) {
      return normalizeCustomEmailList(list).join('\n');
    }

    function getLatestState() {
      return typeof state.getLatestState === 'function'
        ? (state.getLatestState() || {})
        : {};
    }

    function buildViewModel(sourceState = getLatestState()) {
      const normalizedList = normalizeCustomEmailList(sourceState?.customEmailList);
      const usedMap = normalizeCustomEmailUsedMap(sourceState?.customEmailUsedMap);
      const currentEmail = normalizeEmailValue(sourceState?.email);
      const currentKey = getEmailKey(currentEmail);
      const remainingEmails = normalizedList.filter((email) => !usedMap[getEmailKey(email)]);
      const nextEmail = remainingEmails.find((email) => getEmailKey(email) !== currentKey)
        || (currentKey ? '' : (remainingEmails[0] || ''));
      const usedCount = normalizedList.filter((email) => usedMap[getEmailKey(email)]).length;
      const nextKey = getEmailKey(nextEmail);

      return {
        list: normalizedList,
        usedMap,
        totalCount: normalizedList.length,
        usedCount,
        remainingCount: remainingEmails.length,
        currentEmail,
        nextEmail,
        previewItems: normalizedList.slice(0, previewLimit).map((email) => {
          const key = getEmailKey(email);
          let tone = 'pending';
          let label = '待执行';

          if (key && key === currentKey) {
            tone = 'current';
            label = '当前';
          } else if (usedMap[key]) {
            tone = 'used';
            label = '已用';
          } else if (key && key === nextKey) {
            tone = 'next';
            label = '下一封';
          }

          return { email, tone, label };
        }),
      };
    }

    function setText(node, value, fallback = '') {
      if (!node) {
        return;
      }
      node.textContent = value || fallback;
    }

    function renderPreview(viewModel) {
      if (!dom.customEmailPreview) {
        return;
      }

      if (!viewModel.previewItems.length) {
        dom.customEmailPreview.innerHTML = '<div class="custom-email-preview-empty">待注册邮箱列表为空，保存后后台将无法按顺序分配邮箱。</div>';
        return;
      }

      dom.customEmailPreview.innerHTML = viewModel.previewItems.map((item) => `
        <span class="custom-email-chip ${item.tone}">
          <span class="custom-email-chip-label">${escapeHtml(item.label)}</span>
          <span class="custom-email-chip-value mono">${escapeHtml(item.email)}</span>
        </span>
      `).join('');
    }

    function renderSummary(viewModel) {
      if (dom.customEmailSummary) {
        if (!viewModel.totalCount) {
          dom.customEmailSummary.textContent = '按行录入待注册邮箱，后台会按列表顺序消费。';
        } else {
          dom.customEmailSummary.textContent = `已配置 ${viewModel.totalCount} 个待注册邮箱，已用 ${viewModel.usedCount} 个，剩余 ${viewModel.remainingCount} 个。`;
        }
      }

      setText(dom.customEmailCurrent, viewModel.currentEmail, '未分配');
      setText(dom.customEmailNext, viewModel.nextEmail, viewModel.totalCount ? '等待分配' : '待配置');
      setText(dom.customEmailRemaining, String(viewModel.remainingCount), '0');

      if (dom.btnCustomEmailResetProgress) {
        dom.btnCustomEmailResetProgress.disabled = viewModel.usedCount === 0;
      }
    }

    function render(sourceState = getLatestState()) {
      const viewModel = buildViewModel(sourceState);
      renderSummary(viewModel);
      renderPreview(viewModel);
      return viewModel;
    }

    function applyState(sourceState = getLatestState()) {
      const normalizedList = normalizeCustomEmailList(sourceState?.customEmailList);
      if (dom.inputCustomEmailList) {
        dom.inputCustomEmailList.value = stringifyCustomEmailList(normalizedList);
      }
      return render({ ...(sourceState || {}), customEmailList: normalizedList });
    }

    function getCustomEmailList() {
      return normalizeCustomEmailList(dom.inputCustomEmailList?.value);
    }

    async function resetProgress() {
      if (typeof runtime.sendMessage !== 'function') {
        return;
      }

      const activeState = getLatestState();
      const usedMap = normalizeCustomEmailUsedMap(activeState?.customEmailUsedMap);
      if (!Object.keys(usedMap).length) {
        return;
      }

      try {
        const response = await runtime.sendMessage({
          type: 'SAVE_SETTING',
          source: 'sidepanel',
          payload: {
            customEmailUsedMap: {},
          },
        });

        if (response?.error) {
          throw new Error(response.error);
        }

        const nextState = response?.state || { customEmailUsedMap: {} };
        if (typeof state.syncLatestState === 'function') {
          state.syncLatestState(nextState);
        }
        render({ ...getLatestState(), ...nextState });
        if (typeof callbacks.onProgressReset === 'function') {
          callbacks.onProgressReset(nextState);
        }
        helpers.showToast?.('已重置待注册邮箱列表进度。', 'success', 1800);
      } catch (error) {
        helpers.showToast?.(`重置待注册邮箱列表进度失败：${error.message}`, 'error');
      }
    }

    function bindEvents() {
      dom.inputCustomEmailList?.addEventListener('input', () => {
        const normalizedList = getCustomEmailList();
        render({ ...getLatestState(), customEmailList: normalizedList });
        if (typeof callbacks.onListInput === 'function') {
          callbacks.onListInput(normalizedList);
        }
      });

      dom.inputCustomEmailList?.addEventListener('blur', () => {
        const normalizedList = getCustomEmailList();
        if (dom.inputCustomEmailList) {
          dom.inputCustomEmailList.value = stringifyCustomEmailList(normalizedList);
        }
        render({ ...getLatestState(), customEmailList: normalizedList });
        if (typeof callbacks.onListCommit === 'function') {
          callbacks.onListCommit(normalizedList);
        }
      });

      dom.btnCustomEmailResetProgress?.addEventListener('click', () => {
        resetProgress().catch(() => {});
      });
    }

    return {
      applyState,
      bindEvents,
      getViewModel: buildViewModel,
      getCustomEmailList,
      normalizeCustomEmailList,
      normalizeCustomEmailUsedMap,
      render,
    };
  }

  globalScope.SidepanelCustomEmailManager = {
    createCustomEmailManager,
  };
})(window);
