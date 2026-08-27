# TUI 守护进程适配器草案

> **已废弃**：本文档描述了早期 `DaemonTuiAdapter` 的实验性实现。遗留适配器仍然存在于 `packages/cli/src/ui/daemon/` 中，但目前的可复用方向是 SDK 共享 UI 转录层。关于当前架构，请参见 [`../daemon/14-cli-tui-adapter.md`](../daemon/14-cli-tui-adapter.md)。

---

## 目标（历史）

添加一个由标志控制的 TUI 传输层，通过 `DaemonSessionClient` 与 `qwen serve` 通信，而不是在进程内创建 `Config` 和 agent 运行时。

这是用于模式 B 客户端迁移的内部验证路径。在输出 sink、类型化守护进程事件、session 作用域权限和生命周期诊断稳定之前，不得替换默认的 TUI 路径。

## 提议的入口点

```bash
QWEN_DAEMON_URL=http://127.0.0.1:4170 qwen --experimental-daemon-tui
```

可选：

```bash
QWEN_DAEMON_TOKEN=... QWEN_DAEMON_WORKSPACE=/repo qwen --experimental-daemon-tui
```

CLI 在以下两个条件都满足时才可以启用此模式：

- 设置了 `QWEN_DAEMON_URL` 或 `--daemon-url`。
- `GET /capabilities` 声明支持 `session_create`、`session_prompt` 和 `session_events`。

## 最小流程

1. 使用守护进程 URL 和 token 创建 `DaemonClient`。
2. 获取 `/capabilities`。
3. 通过 `DaemonSessionClient.createOrAttach()` 创建或附加 session。
4. 订阅 `session.events()`。
5. 通过 `session.prompt()` 提交用户提示。
6. 通过 `session.cancel()` 路由取消操作。
7. 通过 `session.setModel()` 路由模型切换。
8. 通过 `session.respondToPermission()` 路由权限投票。

## 渲染契约

第一个实现添加了 `DaemonTuiAdapter`，这是一个本地可验证的 reducer 和传输层实验性实现。它仅映射以下守护进程事件：

| 守护进程事件                           | TUI 处理                                   |
| -------------------------------------- | ------------------------------------------ |
| `session_update` / `agent_message_chunk` | 追加助手文本                               |
| `session_update` / `agent_thought_chunk` | 追加思考文本                               |
| `session_update` / `tool_call`           | 显示工具调用生命周期                       |
| `permission_request`                     | 在可能的地方显示现有的确认 UI              |
| `permission_resolved`                    | 关闭或更新确认 UI                          |
| `model_switched`                         | 更新底部/模型显示                          |
| `session_died`                           | 显示断开连接状态并停止流式输出             |

未知事件必须忽略，而不是导致致命错误。类型化事件 reducer 将在后续的协议 PR 中实现。

该适配器尚未接入默认的 Ink 应用。现有的交互式 TUI、JSONL、stream-json 和双输出行为保持不变。

## 明确非目标

- 不要移除当前的 TUI 进程内运行时。
- 不要在此 PR 中更改 JSONL、stream-json 或双输出行为。
- 暂时不要通过 TUI 暴露文件 CRUD、MCP 管理、内存 CRUD 或 provider/auth 变更。
- 不要假设浏览器/web 可直接连接守护进程；此功能仅限终端。

## 合并安全性

- 默认关闭。
- 新增代码路径。
- 不改变现有 CLI 标志的行为。
- 如果守护进程不可用，实验性路径会在启动 TUI 前失败，并提示用户运行 `qwen serve`。

## 验证计划

- 使用合成守护进程事件对事件到 TUI 状态的映射进行单元测试。
- 对 prompt、cancel、模型切换和权限投票的转发进行单元测试。
- 在功能标志启用后，对标志/env 解析进行单元测试。
- 对本地 `qwen serve` 进行冒烟测试：
  - 提示文本流式输入到 TUI
  - cancel 解决当前提示
  - 权限请求可以被接受或拒绝
  - 重连时发送已跟踪的 `Last-Event-ID`

## 默认迁移之前的阻塞项

- 类型化守护进程事件 schema。
- Session 作用域权限路由。
- 输出 sink 重构以实现 JSONL / stream-json / 双输出的对等支持。
- Session 生命周期关闭/删除语义。
- 针对 MCP、skills、providers 和 workspace 环境的运行时诊断。