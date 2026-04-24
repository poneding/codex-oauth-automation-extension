(function attachBackgroundStep6(root, factory) {
  root.MultiPageBackgroundStep6 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep6Module() {
  function createStep6Executor(deps = {}) {
    const {
      addLog = async () => {},
      completeStepFromBackground,
    } = deps;

    async function executeStep6() {
      await addLog('步骤 6：登录 Cookies 已在步骤 1 页面就绪后即时清理，本步骤不再重复执行。', 'info');
      await completeStepFromBackground(6);
    }

    return { executeStep6 };
  }

  return { createStep6Executor };
});
