# 通道与Web后端守护进程适配器草案

## 目标

让通道适配器和 Web 聊天后端通过 `DaemonSessionClient` 接入 `qwen serve`，同时保持现有通道 ACP 子进程行为作为默认方式。

本草案仅涵盖服务端客户端：

- 频道机器人后端 → `qwen serve`
- Web 浏览器 → Web 后端 / BFF → `qwen serve`

它明确不允许浏览器 JavaScript 直接调用守护进程。守护进程当前在设计上会拒绝浏览器的 `Origin` 请求。

## 提议的入口点

通道后端：

```bash
QWEN_CHANNEL_DAEMON_URL=http://127.0.0.1:4170 qwen channel start telegram
```

Web 后端：

```bash
QWEN_WEB_DAEMON_URL=http://127.0.0.1:4170 qwen web-chat-backend
```

共享的可选变量：

```bash
QWEN_DAEMON_TOKEN=...
QWEN_DAEMON_WORKSPACE=/repo
```

## 最小通道流程

此 PR 添加了 `DaemonChannelBridge`，一个可在本地验证的服务端桥接器，用于通道和 Web 后端适配器。它保持现有 ACP 桥接器作为默认方式，并在后端进程内维护守护进程会话状态。

1. 将通道发送者/线程解析为通道会话键。
2. 使用 `DaemonClient` + `DaemonSessionClient.createOrAttach()`。
3. 使用 `session.prompt()` 提交入站用户文本。
4. 订阅 `session.events()` 并收集助手文本片段。
5. 通过平台适配器将最终文本发送回去。
6. 通过 `session.respondToPermission()` 投递权限投票。
7. 通过 `session.cancel()` 取消进行中的工作。

## 最小 Web 后端流程

1. 浏览器打开一个 websocket 或 HTTP 流连接到 Web 后端。
2. 后端拥有 `DaemonSessionClient`。
3. 后端将浏览器消息转换为守护进程的提示。
4. 后端将守护进程 SSE 事件转换为浏览器安全的应用事件。
5. 后端在服务端存储守护进程的 `sessionId` 和最后看到的事件 ID。

浏览器客户端不得接收守护进程的 bearer 令牌。

## 会话隔离约束

当前守护进程的 Stage 1 行为在守护进程设置级别上实际上是 `sessionScope: single`。在按请求的 `sessionScope` 落地之前，多用户通道或 Web 部署必须选择以下安全形态之一：

- 每个通道会话/Web 房间一个守护进程
- 每个用户工作区一个守护进程
- 仅单用户演示

请勿将不相关的通道线程静默复用到一个守护进程会话中。

## 事件映射约定

| 守护进程事件                              | 通道/Web 后端处理                     |
| ----------------------------------------- | ------------------------------------- |
| `session_update` / `agent_message_chunk`  | 追加助手文本                          |
| `session_update` / `agent_thought_chunk`  | 可选的隐藏/调试流                     |
| `session_update` / `tool_call`            | 发出工具状态卡片/消息                 |
| `permission_request`                      | 特定平台的审批交互                    |
| `permission_resolved`                     | 关闭/更新审批交互                     |
| `model_switched`                          | 更新后端会话元数据                    |
| `session_died`                            | 通知用户并停止流                      |

未知的守护进程事件必须被忽略或作为调试元数据转发，而非致命错误。

该桥接器尚未接入 `qwen channel start`。现有的 Telegram、Weixin、Dingtalk、插件通道和浏览器行为保持不变。

## 明确非目标

- 浏览器不能直接通过 fetch 或 EventSource 连接守护进程。
- 此适配器 PR 不放松 CORS。
- 不默认迁移 Telegram、Weixin、Dingtalk 或插件通道。
- 不涉及文件 CRUD、内存 CRUD、MCP 重启或提供者变更。
- 当守护进程侧不支持 sessionScope 时，不在客户端模拟 sessionScope。

## 合并安全性

- 默认关闭。
- 现有 ACP 通道桥接器保持为默认。
- Web 后端是明确的 BFF 层，而非守护进程安全变更。
- 任何通道适配器不得将守护进程令牌引入前端/浏览器代码。

## 验证计划

- 单元测试通道会话键到守护进程会话的绑定。
- 单元测试守护进程事件到通道/Web 消息的映射。
- 单元测试提示、取消、模型切换和权限响应的转发。
- 针对本地 `qwen serve` 对单用户通道后端进行冒烟测试。
- 浏览器 → BFF → 守护进程的冒烟测试，不暴露守护进程令牌。

## 默认迁移前的阻塞项

- 按请求的 `sessionScope`。
- 会话元数据 + 关闭/删除生命周期。
- 守护进程盖章的客户端身份。
- 会话作用域的权限路由。
- MCP、技能、提供者和环境的只读诊断。