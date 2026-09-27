# Computer Use

Qwen Code 包含一个 `computer-use` skill，通过两个独立安装的包来教模型如何操作桌面应用：

```text
bundled computer-use skill
  -> @qwen-code/node-repl-mcp
  -> @qwen-code/cua-sdk/computer-use
  -> native cua-driver accessibility backend
```

Qwen Code 不捆绑 MCP server、SDK 或原生驱动。skill 会在缺少这些外部包时自动安装。

> [!warning]
>
> Computer Use 可以读取应用 UI 并控制鼠标和键盘输入。请仅在受信任的环境中使用，并仔细审查 MCP 审批。

## 自动设置

需要 Node.js 22 或更高版本以及 npm。

首次使用时，skill 会自行运行以下命令：

```bash
qwen mcp add --scope user node-repl npx -y @qwen-code/node-repl-mcp@0.1.6
npm install --no-save --package-lock=false @qwen-code/cua-sdk@0.20.11
```

MCP server 首次添加后请重启 Qwen Code。skill 随后通过 `node_repl` 继续执行桌面任务。

SDK 安装不会修改 `package.json` 和 lockfile，但会写入工作区的 `node_modules`。其 postinstall 会下载并验证当前平台的原生 payload。

移除 MCP 配置或工作区中的 SDK 安装即可禁用该执行路径；没有旧版回退。

## 使用

要求 Qwen Code 使用 `$computer-use` 执行桌面任务。引导完成后，它在 macOS 上使用 app 工作流：

1. 通过 `computer.getApp(nameOrIdentifierOrPath)` 绑定应用；
2. 读取 `app.getState()` 获取紧凑的辅助功能文本，随后进行自动增量更新；
3. 使用该文本中的短元素 ID 执行一个或多个操作；
4. 在决定下一步操作之前获取最新状态；并
5. 仅在没有其他持久状态需要时，才关闭 SDK 客户端并重置 REPL。

驱动是唯一计算观察差异的组件。模型代码使用类型化的 SDK 方法，不会分发任意的驱动工具名称。app 句柄跟踪当前窗口和对话框，在内部保留原生元素标识，并将输入委托给原生驱动。模型代码不选择前台/后台模式。未确认的操作不会被重放。`getState()` 可以打开已发现的已停止应用；操作永远不会重启它。现有的精确窗口 API 在 Windows 和 Linux 上仍然可用。

```js
const app = await computer.getApp('Microsoft Excel');
nodeRepl.write((await app.getState()).text);
// Use an element ID from the returned state.
await app.click(37);
await app.typeText('hello');
nodeRepl.write((await app.getState()).text);
```

在重新使用元素 ID 之前，打开或关闭对话框后请刷新状态。每次 App 状态刷新都会在内部捕获当前截图。默认返回会隐藏截图；当模型需要图像时，通过 `app.getState({ includeScreenshot: true })` 显式请求。

## 权限

Node REPL 是一个 MCP server，以普通 Node.js 权限执行模型编写的 JavaScript。其调用遵循 Qwen Code 正常的[MCP 审批流程](./approval-mode.md)。SDK 还会强制执行原生授权。

在 macOS 上，辅助功能观察和输入需要 Accessibility 权限。截屏还需要 Screen Recording 权限。macOS 可能会将授权归因于启动 Qwen Code 的终端或 IDE。Windows 和 Linux 使用各自平台的辅助功能和输入机制。

## 故障排除

- 如果自动设置后 `node_repl` 仍不可用，请重启 Qwen Code 并使用 `qwen mcp list` 验证 server。
- 如果自动设置后 SDK 导入仍然失败，请确认 Qwen Code 运行在安装该包的工作区中。
- 超时、取消、重置或内核崩溃后，请重新引导 SDK 客户端并请求最新状态。

## 另请参阅

- [Skills](./skills.md)
- [MCP servers](./mcp.md)
- [审批模式](./approval-mode.md)
- [沙箱](./sandbox.md)
