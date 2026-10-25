# Computer Use

Computer Use 通过独立的 Node REPL MCP server 运行。其首次 `js` 调用会加载全局 `cua` 并显示当前平台的文档。Computer Use 和 Browser Use 不再需要捆绑 skill。

```text
Qwen Code / any MCP client
  -> @qwen-code/node-repl-mcp (js, js_reset)
  -> @qwen-code/cua-sdk/runtime
     -> native Qwen CUA Driver (desktop applications)
     -> @qwen-code/browser-use (Qwen browser extension)
```

## 安装

需要 Node.js 22 或更高版本以及 npm。注册 MCP server，然后重启 Qwen Code：

```bash
qwen mcp add --scope user node-repl npx -y @qwen-code/node-repl-mcp@0.26.0
```

该 server 会将匹配的 SDK 和浏览器 SDK 作为依赖安装。原生 SDK payload 会为当前平台下载，并根据对应发布的 SHA-256 校验和进行验证。它被缓存在 npm 包之外；无需工作区 SDK 引导命令。版本 0.26.0 是本地开发目标，直到其正式发布。

Windows 默认使用普通输入传递，不会安装 UIAccess worker。通过 `CUA_DRIVER_USE_UIACCESS=1` 启用 UIAccess 需要在 `Program Files\Qwen\CuaDriver` 下放置签名的 worker；请在设置该变量的提升权限终端中安装 SDK。未签名的 worker 无法启用 UIAccess；请勿绕过签名检查。较早的未签名发布版本需要新的签名 driver 发布才能使用 UIAccess，而非重新安装同一版本。

## 应用任务

```js
var app = await cua.getApp('Microsoft Excel');
// Use a short ID from the automatically displayed AX state.
await app.click(37);
await app.typeText('hello');
await app.getAXState();
```

`getApp` 显示完整的 AX 文本，不包含图像。`getAXState` 显示后续差异。`getScreenshot` 仅捕获当前窗口；`getAXStateAndScreenshot` 两者都捕获。观察结果返回字符串并自行显示；`{emit:false}` 会抑制输出。在使用 `{x,y}` 坐标之前先请求截图，这些坐标是该窗口当前截图中的像素。

驱动负责解析应用/窗口、管理当前短 ID 和坐标，并选择输入传递方式。macOS 使用辅助功能和定向事件。Windows 和 Linux 优先尝试后台传递，仅在拒绝证明未发送任何内容时才使用前台输入。当检测到物理用户活动时，前台输入会停止；仅当用户未切换到其他地方时才恢复先前的应用。调度确认并不能证明 UI 已改变：重试前请先观察。

Linux 支持 X11，包括 XWayland 下的 X11 应用。不支持原生 Wayland 应用。需将 DISPLAY、XAUTHORITY 以及桌面辅助功能会话总线传递给 server。

## 桌面与浏览器任务

对于全屏任务，使用显式桌面接口：

```js
await cua.desktop.getScreenshot();
await cua.desktop.click({ x: 300, y: 200 }, { key: 'shift' });
```

桌面坐标是最新主显示器截图中的像素。桌面输入控制可见的前台桌面，并可以移动真实指针。对于持续按住的键，始终使用 `try/finally` 配合 `cua.desktop.keyDown(key)` 和 `keyUp(key)`。持续按住的键属于调用会话，并在优雅重置/结束时释放。在按住键期间，对和弦与桌面指针操作使用 `keyDown/keyUp`，不带显式修饰符；在文本、普通快捷键或应用输入之前释放它们。突然的 OS 进程终止无法保证清理。

```js
var browser = await cua.getBrowser('Chrome');
// Browser documentation and tabs are displayed on first selection.
var tab = await cua.getTab('TAB_ID', { browser: 'Chrome' });
await tab.playwright.domSnapshot();
```

`getBrowser`、`getTab` 和 `createBrowserTab` 返回现有仓库的 browser-use SDK 句柄。请遵循所选浏览器的运行时文档，并像之前一样连接 Qwen 浏览器扩展。该集成不添加浏览器窗口 API、DOM 差异或新的 Windows 支持。

## 权限与生命周期

该 server 以普通 Node.js 权限执行 JavaScript，并遵循客户端的 MCP 审批流程。在 macOS 上，输入/AX 观察需要 Accessibility，截图需要 Screen Recording；文档保存/Finder 重命名可能会请求 Automation。授权归属于宿主进程的 OS 责任链。在 Windows 上，常规安装的守护进程使用现有的 UAC/登录任务路径；其启动的应用使用源自自身令牌的普通用户完整性令牌。UIAccess 是可选的：显式设置 `CUA_DRIVER_USE_UIACCESS=1` 需要 Program Files 下受信任的签名工作进程，不可用时会失败。默认 npm 安装不会暂存该工作进程，也不要求其签名。

`js` 在一次调用中完成，默认超时为 30 秒。超时可能产生外部影响；重试前请先观察。`js_reset` 丢弃绑定并优雅关闭所属的原生/浏览器会话。上下文压缩后，在继续之前调用 `cua.rewriteDocumentation()`。

## 远程桌面中继

对于现有的 macOS 桌面中继设置，安装其匹配的 server：

```bash
npx -y @qwen-code/node-repl-mcp@0.26.0 desktop-relay install
```

这使用现有的本地 launchd socket `127.0.0.1:47821`。在安全的 Web Shell 中，选择 **Use this computer**，然后 **Connect this computer**。桌面会提示每个连接。远程守护进程必须启用 `QWEN_SERVE_CLIENT_MCP_OVER_WS=1`。

## 直接 MCP 与故障排除

`qwen-cua-driver mcp` 直接公开相同的 19 个原生 Computer Use 操作。应用调用使用 `app`；桌面能力的调用使用 `scope:"desktop"`。`key_down/key_up` 仅限桌面。高级原生工具通过宿主可选的 `CUA_DRIVER_EXTRA_TOOLS=1` 仍然可用。

如果 server 不可用，请检查 `qwen mcp list` 并在添加后重启客户端。如果捕获失败，请检查当前桌面会话和 OS 权限。如果原生下载失败，请检查确切的发布版本/校验和资源，或通过 `QWEN_CUA_SDK_NATIVE_DIR` 提供本地构建的匹配 payload。锁定的桌面无法提供 GUI 接受证据。

另请参阅 [MCP servers](./mcp.md)、[审批模式](./approval-mode.md) 和 [沙箱](./sandbox.md)。
