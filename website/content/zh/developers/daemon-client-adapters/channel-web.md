# Channel 与 Web 后端 Daemon 适配器草案

## 目标

让 channel 适配器和 web 聊天后端通过 `DaemonSessionClient` 消费 `qwen serve`，
同时保持现有 channel ACP 子进程行为作为默认方式。

本草案仅涵盖服务端客户端：

- Channel bot 后端 -> `qwen serve`
- 浏览器 -> web 后端 / BFF -> `qwen serve`

本草案明确不允许浏览器 JavaScript 直接调用 daemon。
Daemon 当前在设计上会拒绝浏览器的 `Origin` 请求。

## 建议的入口点

Channel 后端：

```bash
QWEN_CHANNEL_DAEMON_URL=http://127.0.0.1:4170 qwen channel start telegram
```

Web 后端：

```bash
QWEN_WEB_DAEMON_URL=http://127.0.0.1:4170 qwen web-chat-backend
```

共享可选变量：

```bash
QWEN_DAEMON_TOKEN=...
QWEN_DAEMON_WORKSPACE=/repo
```

## 最小 Channel 流程

本 PR 新增 `DaemonChannelBridge`，这是一个可在本地验证的服务端桥接层，
供 channel 和 web 后端适配器使用。它保留现有 ACP 桥接作为默认方式，
并在后端进程内管理 daemon 会话状态。

1. 将 channel 发送方/线程解析为 channel 会话 key。
2. 使用 `DaemonClient` + `DaemonSessionClient.createOrAttach()`。
3. 通过 `session.prompt()` 提交用户输入文本。
4. 订阅 `session.events()` 并收集助手文本片段。
5. 通过平台适配器将最终文本回复发送出去。
6. 通过 `session.respondToPermission()` 投票处理权限请求。
7. 通过 `session.cancel()` 取消当前任务。

## 最小 Web 后端流程

1. 浏览器与 web 后端建立 WebSocket 或 HTTP 流连接。
2. 后端持有 `DaemonSessionClient`。
3. 后端将浏览器消息转换为 daemon prompt。
4. 后端将 daemon SSE 事件转换为浏览器安全的应用事件。
5. 后端在服务端存储 daemon `sessionId` 和最后收到的事件 id。

浏览器客户端不得接收 daemon bearer token。

## 会话隔离约束

当前 daemon Stage 1 的行为在 daemon 设置层面实际上等效于 `sessionScope: single`。
在每请求 `sessionScope` 支持落地之前，多用户 channel 或 web 部署必须选择以下安全形态之一：

- 每个 channel 线程 / web 房间使用一个 daemon
- 每个用户工作区使用一个 daemon
- 仅限单用户演示

不要将无关的 channel 线程静默复用到同一个 daemon 会话中。

## 事件映射契约

| Daemon 事件                              | Channel/web 后端处理           |
| ---------------------------------------- | ------------------------------ |
| `session_update` / `agent_message_chunk` | 追加助手文本                   |
| `session_update` / `agent_thought_chunk` | 可选的隐藏/调试流              |
| `session_update` / `tool_call`           | 发送工具状态卡片/消息          |
| `permission_request`                     | 平台特定的审批交互             |
| `permission_resolved`                    | 关闭/更新审批交互              |
| `model_switched`                         | 更新后端会话元数据             |
| `session_died`                           | 通知用户并停止流               |

未知 daemon 事件必须被忽略或作为调试元数据转发，不应导致致命错误。

该桥接层尚未接入 `qwen channel start`。现有的 Telegram、Weixin、Dingtalk、
plugin channel 以及浏览器行为保持不变。

## 明确的非目标

- 不支持浏览器直接通过 fetch 或 EventSource 访问 daemon。
- 本适配器 PR 中不放宽 CORS 限制。
- 不默认迁移 Telegram、Weixin、Dingtalk 或 plugin channel。
- 不涉及文件 CRUD、memory CRUD、MCP 重启或 provider 变更。
- 当 daemon 端不支持时，不在客户端模拟 sessionScope。

## 合并安全性

- 默认关闭。
- 现有 ACP channel 桥接保持为默认方式。
- Web 后端是显式的 BFF 层，不是 daemon 安全性变更。
- 任何 channel 适配器都不应将 daemon token 引入前端/浏览器代码。

## 验证计划

- 单元测试 channel 会话 key 到 daemon 会话的绑定。
- 单元测试 daemon 事件到 channel/web 消息的映射。
- 单元测试 prompt、cancel、model switch 及权限响应的转发。
- 对本地 `qwen serve` 进行单用户 channel 后端的冒烟测试。
- 在不暴露 daemon token 的前提下，对浏览器 -> BFF -> daemon 进行冒烟测试。

## 默认迁移的阻塞项

- 每请求 `sessionScope`。
- 会话元数据及关闭/删除生命周期。
- Daemon 签发的客户端身份标识。
- 会话级权限路由。
- MCP、skills、provider 及环境的只读诊断能力。
