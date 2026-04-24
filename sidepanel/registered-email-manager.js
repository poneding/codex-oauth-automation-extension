(function attachSidepanelRegisteredEmailManager(globalScope) {
  function createRegisteredEmailManager(context = {}) {
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

    function normalizeRegisteredEmailList(rawValue) {
      const segments = Array.isArray(rawValue)
        ? rawValue.flatMap((item) => String(item ?? '').split(/[\r\n,;]+/))
        : String(rawValue ?? '').split(/[\r\n,;]+/);
      const seen = new Set();
      const normalizedList = [];

      for (const segment of segments) {
        const email = normalizeEmailValue(segment).toLowerCase();
        if (!email || seen.has(email)) {
          continue;
        }
        seen.add(email);
        normalizedList.push(email);
      }

      return normalizedList;
    }

    function stringifyRegisteredEmailList(list = []) {
      return normalizeRegisteredEmailList(list).join('\n');
    }

    function getLatestState() {
      return typeof state.getLatestState === 'function'
        ? (state.getLatestState() || {})
        : {};
    }

    function buildViewModel(sourceState = getLatestState()) {
      const list = normalizeRegisteredEmailList(sourceState?.registeredEmailList);
      return {
        list,
        totalCount: list.length,
        previewItems: list.slice(0, previewLimit),
      };
    }

    function renderPreview(viewModel) {
      if (!dom.registeredEmailPreview) {
        return;
      }

      if (!viewModel.previewItems.length) {
        dom.registeredEmailPreview.innerHTML = '<div class="custom-email-preview-empty">已注册邮箱列表为空，可直接粘贴导入。</div>';
        return;
      }

      dom.registeredEmailPreview.innerHTML = viewModel.previewItems.map((email) => `
        <span class="custom-email-chip used">
          <span class="custom-email-chip-label">已注册</span>
          <span class="custom-email-chip-value mono">${escapeHtml(email)}</span>
        </span>
      `).join('');
    }

    function renderSummary(viewModel) {
      if (!dom.registeredEmailSummary) {
        return;
      }
      if (!viewModel.totalCount) {
        dom.registeredEmailSummary.textContent = '已注册邮箱列表为空，可手动编辑、粘贴导入或等待成功注册后自动归档。';
      } else {
        dom.registeredEmailSummary.textContent = `已登记 ${viewModel.totalCount} 个邮箱，可直接编辑或整段导入。`;
      }
      if (dom.btnRegisteredEmailClear) {
        dom.btnRegisteredEmailClear.disabled = viewModel.totalCount === 0;
      }
    }

    function render(sourceState = getLatestState()) {
      const viewModel = buildViewModel(sourceState);
      renderSummary(viewModel);
      renderPreview(viewModel);
      return viewModel;
    }

    function applyState(sourceState = getLatestState()) {
      const normalizedList = normalizeRegisteredEmailList(sourceState?.registeredEmailList);
      if (dom.inputRegisteredEmailList) {
        dom.inputRegisteredEmailList.value = stringifyRegisteredEmailList(normalizedList);
      }
      return render({ ...(sourceState || {}), registeredEmailList: normalizedList });
    }

    function getRegisteredEmailList() {
      return normalizeRegisteredEmailList(dom.inputRegisteredEmailList?.value);
    }

    async function clearRegisteredEmails() {
      if (typeof runtime.sendMessage !== 'function') {
        return;
      }

      const activeState = getLatestState();
      const list = normalizeRegisteredEmailList(activeState?.registeredEmailList);
      if (!list.length) {
        return;
      }

      try {
        const response = await runtime.sendMessage({
          type: 'SAVE_SETTING',
          source: 'sidepanel',
          payload: {
            registeredEmailList: [],
          },
        });

        if (response?.error) {
          throw new Error(response.error);
        }

        const nextState = response?.state || { registeredEmailList: [] };
        if (typeof state.syncLatestState === 'function') {
          state.syncLatestState(nextState);
        }
        render({ ...getLatestState(), ...nextState });
        if (typeof callbacks.onClear === 'function') {
          callbacks.onClear(nextState);
        }
        helpers.showToast?.('已清空已注册邮箱列表。', 'success', 1800);
      } catch (error) {
        helpers.showToast?.(`清空已注册邮箱列表失败：${error.message}`, 'error');
      }
    }

    function bindEvents() {
      dom.inputRegisteredEmailList?.addEventListener('input', () => {
        const normalizedList = getRegisteredEmailList();
        render({ ...getLatestState(), registeredEmailList: normalizedList });
        if (typeof callbacks.onListInput === 'function') {
          callbacks.onListInput(normalizedList);
        }
      });

      dom.inputRegisteredEmailList?.addEventListener('blur', () => {
        const normalizedList = getRegisteredEmailList();
        if (dom.inputRegisteredEmailList) {
          dom.inputRegisteredEmailList.value = stringifyRegisteredEmailList(normalizedList);
        }
        render({ ...getLatestState(), registeredEmailList: normalizedList });
        if (typeof callbacks.onListCommit === 'function') {
          callbacks.onListCommit(normalizedList);
        }
      });

      dom.btnRegisteredEmailClear?.addEventListener('click', () => {
        clearRegisteredEmails().catch(() => {});
      });
    }

    return {
      applyState,
      bindEvents,
      getRegisteredEmailList,
      getViewModel: buildViewModel,
      normalizeRegisteredEmailList,
      render,
    };
  }

  globalScope.SidepanelRegisteredEmailManager = {
    createRegisteredEmailManager,
  };
})(window);
