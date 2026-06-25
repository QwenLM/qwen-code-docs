# TUI Daemon 适配器草稿

> **已废弃**：本文档描述的是早期 `DaemonTuiAdapter` 的探索实现。旧版适配器仍保留在 `packages/cli/src/ui/daemon/` 中，但可复用的方向现已转向 SDK 共享 UI transcript 层。当前架构请参见 [`../daemon/14-cli-tui-adapter.md`](../daemon/14-cli-tui-adapter.md)。

---

## 目标（历史背景）

添加一个由 flag 控制的 TUI 传输层，通过 `DaemonSessionClient` 与 `qwen serve` 通信，而不是在进程内创建 `Config` 和 agent 运行时。

这是 Mode B 客户端迁移的内部验证路径。在输出 sink、类型化 daemon 事件、会话级权限控制以及生命周期诊断稳定之前，不得用其替换默认 TUI 路径。

## 建议的入口

```bash
QWEN_DAEMON_URL=http://127.0.0.1:4170 qwen --experimental-daemon-tui
```

可选：

```bash
QWEN_DAEMON_TOKEN=... QWEN_DAEMON_WORKSPACE=/repo qwen --experimental-daemon-tui
```

CLI 应在以下两个条件同时满足时才允许此模式：

- 已设置 `QWEN_DAEMON_URL` 或 `--daemon-url`。
- `GET /capabilities` 声明支持 `session_create`、`session_prompt` 和 `session_events`。

## 最小流程

1. 使用 daemon URL 和 token 创建 `DaemonClient`。
2. 获取 `/capabilities`。
3. 通过 `DaemonSessionClient.createOrAttach()` 创建或附加会话。
4. 订阅 `session.events()`。
5. 通过 `session.prompt()` 提交用户提示。
6. 通过 `session.cancel()` 处理取消操作。
7. 通过 `session.setModel()` 处理模型切换。
8. 通过 `session.respondToPermission()` 处理权限投票。

## 渲染契约

第一版实现添加了 `DaemonTuiAdapter`，这是一个可本地验证的 reducer 和传输层探针。它仅映射以下 daemon 事件：

| Daemon 事件                              | TUI 处理方式                             |
| ---------------------------------------- | ---------------------------------------- |
| `session_update` / `agent_message_chunk` | 追加 assistant 文本                      |
| `session_update` / `agent_thought_chunk` | 追加思考文本                             |
| `session_update` / `tool_call`           | 展示工具调用生命周期                     |
| `permission_request`                     | 尽可能复用现有确认 UI                    |
| `permission_resolved`                    | 关闭或更新确认 UI                        |
| `model_switched`                         | 更新页脚/模型显示                        |
| `session_died`                           | 显示断连状态并停止流式输出               |

未知事件必须被忽略，不得导致致命错误。类型化事件 reducer 将在后续协议 PR 中落地。

该适配器尚未接入默认的 Ink 应用。现有的交互式 TUI、JSONL、stream-json 及双输出行为保持不变。

## 明确的非目标

- 不移除当前 TUI 进程内运行时。
- 本 PR 不修改 JSONL、stream-json 或双输出行为。
- 暂不通过 TUI 暴露文件 CRUD、MCP 管理、内存 CRUD 或 provider/auth 变更操作。
- 不做浏览器/Web 直连 daemon 的假设；本功能仅面向终端。

## 合并安全性

- 默认关闭。
- 纯增量代码路径。
- 现有 CLI flag 行为不变。
- 如果 daemon 不可用，实验性路径会在启动 TUI 之前失败，并提示用户运行 `qwen serve`。

## 验证计划

- 对事件到 TUI 状态的映射进行单元测试，使用合成 daemon 事件。
- 对 prompt、cancel、模型切换和权限投票的转发进行单元测试。
- 在 feature flag 接入后，对 flag/env 解析进行单元测试。
- 对本地 `qwen serve` 进行冒烟测试：
  - prompt 文本流式输出到 TUI
  - cancel 能解决活跃 prompt
  - 权限请求可被接受或拒绝
  - 重连时发送已追踪的 `Last-Event-ID`

## 默认迁移前的阻塞项

- 类型化 daemon 事件 schema。
- 会话级权限路由。
- JSONL / stream-json / 双输出一致性的输出 sink 重构。
- 会话生命周期关闭/删除语义。
- 针对 MCP、skills、providers 和 workspace 环境的运行时诊断。
