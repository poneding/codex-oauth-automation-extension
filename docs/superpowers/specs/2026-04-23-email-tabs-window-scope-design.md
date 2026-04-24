# Email Tabs And Window Scope Design

## Goal

在 sidepanel 中将“待注册邮箱”和“已注册邮箱”改为 tab 展示，默认显示“待注册”；同时约束扩展运行过程中打开或复用的页面只落在当前 sidepanel 所属窗口内，不再跳转到其他浏览器窗口。

## UI Design

- 在邮箱列表区域增加一个轻量 tab 头：
  - `待注册邮箱`
  - `已注册邮箱`
- 默认激活 `待注册邮箱`。
- tab 切换仅影响展示层，不改变现有数据结构和行为：
  - 待注册列表仍支持编辑、导入、重置进度。
  - 已注册列表仍支持编辑、导入、清空。
- 两个面板继续复用现有 `custom-email-manager` 和 `registered-email-manager`。

## Runtime Window Scope

- sidepanel 初始化时读取当前浏览器 `windowId`，记录为运行时 owner window。
- 后台 `reuseOrCreateTab` 在新建标签页时优先使用 owner window。
- 若已有受控标签页存在但位于其他窗口，不复用那个窗口里的标签页，而是在 owner window 内新建/维护自己的标签页。
- 若 owner window 已被关闭，则回退到当前可用窗口，并刷新 owner window 状态。

## Affected Areas

- `sidepanel/sidepanel.html`
- `sidepanel/sidepanel.css`
- `sidepanel/sidepanel.js`
- `background/tab-runtime.js`
- 相关测试文件

## Risks

- sidepanel 默认展示态需要与恢复状态解耦，避免把临时 tab 选择错误持久化。
- 复用 tab 的窗口限制需要避免影响现有同源冲突清理逻辑。

## Testing

- 验证 sidepanel tabs 默认激活待注册，并能切换到已注册。
- 验证 `reuseOrCreateTab` 在 owner window 内创建标签页。
- 验证已有同 source tab 位于其他窗口时，不会被错误激活或复用。
