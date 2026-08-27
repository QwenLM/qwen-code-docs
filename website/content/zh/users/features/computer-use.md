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
qwen mcp add --scope user node-repl npx -y @qwen-code/node-repl-mcp@0.1.0
npm install --no-save --package-lock=false @qwen-code/cua-sdk@0.20.0
```

MCP server 首次添加后请重启 Qwen Code。skill 随后通过 `node_repl` 继续执行桌面任务。

SDK 安装不会修改 `package.json` 和 lockfile，但会写入工作区的 `node_modules`。其 postinstall 会下载并验证当前平台的原生 payload。

移除 MCP 配置或工作区中的 SDK 安装即可禁用该执行路径；没有旧版回退。

## 使用

要求 Qwen Code 使用 `$computer-use` 执行桌面任务。引导完成后，它会遵循标准的 Computer Use 工作流：

1. 发现目标应用和窗口；
2. 观察完整的辅助功能状态；
3. 尽可能通过当前的语义元素 token 执行操作；
4. 每次变更后获取最新状态；
5. 验证请求的结果；以及
6. 关闭 SDK 客户端并重置 REPL。

驱动是唯一计算观察差异的组件。模型代码使用类型化的 SDK 方法，不会分发任意的驱动工具名称。

## 权限

Node REPL 是一个 MCP server，以普通 Node.js 权限执行模型编写的 JavaScript。其调用遵循 Qwen Code 正常的[审批流程](./approval-mode.md)。SDK 还会强制执行原生授权。

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
