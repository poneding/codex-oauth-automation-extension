# Native Host

本目录包含扩展使用的本地 Chrome / Edge Native Messaging companion process。

当前命令协议：

- `gmail.testConnection`
- `gmail.waitForVerificationCode`
- `oauth.exchangeCallback`
- `cpa.uploadAuthFile`

## 命令职责

### `gmail.testConnection`

使用配置的 Gmail IMAP 邮箱、App Password、host、port 测试登录与 `INBOX` 访问。

### `gmail.waitForVerificationCode`

通过 Gmail IMAP 轮询最近邮件，按时间窗口、目标邮箱、排除验证码、发件人 / 主题关键字过滤验证码。

### `oauth.exchangeCallback`

解析 localhost callback URL，校验 `state`，并使用本地保存的 `codeVerifier` 向 OpenAI token endpoint 换取 token。

### `cpa.uploadAuthFile`

根据 token 生成 CPA 兼容 auth JSON，并上传到：

`/v0/management/auth-files`

## 本地检查

```bash
python3 -m unittest native_host.tests.test_gmail_imap native_host.tests.test_openai_oauth native_host.tests.test_cpa_upload
python3 -m py_compile native_host/host.py native_host/messages.py native_host/gmail_imap.py native_host/openai_oauth.py native_host/cpa_upload.py native_host/install_host_manifest.py
```

## 安装

### macOS / Linux（Chrome）

1. 运行 `python3 native_host/install_host_manifest.py`。
2. 重新加载扩展。

安装脚本会从仓库根目录的 `manifest.json` 读取固定 `key`，自动推导解压扩展 ID 并写入 `allowed_origins`，不需要手工替换扩展 ID。

注意：即使在 Edge 中，`allowed_origins` 也仍然使用 `chrome-extension://<扩展ID>/` 格式，这是 Chromium Native Messaging 的要求，不要写成 `edge-extension://...`。

安装脚本还会生成本地可执行 launcher：

- `native_host/host_launcher.sh`

Chrome Native Messaging 将直接启动这个 launcher，再由它使用当前环境的 Python 绝对路径执行 `native_host/host.py`。这样不依赖 `host.py` 的执行权限，也不依赖 Chrome GUI 进程里的 `PATH`。

### Windows（Edge / Chrome）

1. 运行 `py -3 native_host\\install_host_manifest.py`
2. 重新加载扩展。

Windows 安装脚本会：

- 生成 `native_host\\host_launcher.cmd`
- 写入 native host manifest
- 尝试自动注册当前用户注册表：
  - `HKEY_CURRENT_USER\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.codex.oauth.automation`
  - `HKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.codex.oauth.automation`

如果自动写注册表失败，脚本会额外输出一个 `.reg` 文件路径。双击导入或用管理员权限手工导入后，再重新加载扩展。

如果 `edge://extensions` 里显示的当前解压扩展 ID 与 `manifest.json` 的固定 `key` 推导结果不同，请先设置：

```powershell
$env:CODEX_NATIVE_HOST_EXTRA_EXTENSION_IDS="<edge://extensions 里看到的实际扩展 ID>"
python native_host\install_host_manifest.py
```

这样安装器会把实际 Edge 扩展 ID 也追加到 `allowed_origins`。

Windows 原生宿主运行时会把 `stdin/stdout` 切到 binary mode，避免 Python 文本模式破坏 Native Messaging 的长度前缀 framing。

## 运行时要求

- Python 3
- Chrome / Edge Native Messaging
- Gmail 已开启 IMAP
- Gmail 已生成 App Password

## 注意

- 这是本地主机进程，不是远程后端。
- CPA 上传走后台 HTTP 请求，不再打开 CPA 页面。
- Gmail 验证码获取走 IMAP，不再依赖浏览器邮箱页 DOM 轮询。
- Edge 出现 `Specified native messaging host not found.` 时，优先检查注册表项、`.json` manifest，以及 `allowed_origins` 中是否包含当前 `edge://extensions` 里显示的扩展 ID。
