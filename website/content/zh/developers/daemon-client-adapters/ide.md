# IDE Daemon 适配器草案

## 目标

让 VS Code 伴随扩展通过 `DaemonSessionClient` 从 extension host 连接到 `qwen serve`，以此对 Mode B 进行内部测试（dogfood）。

webview 不得直接调用 daemon。extension host 负责持有 daemon URL、token、session id 和 SSE replay 状态，再将经过净化的应用事件转发给 webview。

## 建议的入口

VS Code 设置：

```json
{
  "qwen-code.experimentalDaemon.enabled": true,
  "qwen-code.experimentalDaemon.url": "http://127.0.0.1:4170",
  "qwen-code.experimentalDaemon.token": ""
}
```

本地 dogfood 的环境变量回退：

```bash
QWEN_IDE_DAEMON_URL=http://127.0.0.1:4170 code .
```

## 最小流程

1. Extension host 创建 `DaemonClient`。
2. 请求 `/capabilities` 并验证工作区兼容性。
3. 通过 `DaemonSessionClient.createOrAttach()` 创建或附加 session。
4. 在 extension host 中订阅 `session.events()`。
5. 将 daemon 事件转换为现有的 webview 消息。
6. 通过 `session.prompt()` 发送用户提示。
7. 通过 `session.cancel()` 和 `session.setModel()` 路由取消/模型切换。
8. 通过 `session.respondToPermission()` 路由权限决策。

## 与现有 ACP 连接的关系

首个实现引入了一条并列的连接路径，而非替换 `AcpConnection`：

```text
QwenAgentManager
  current default -> AcpConnection -> qwen --acp child
  experimental    -> DaemonIdeConnection -> qwen serve HTTP/SSE
```

两条路径在条件允许时应共用同一套上层 webview 回调。若某个事件暂时无法被精确映射，daemon 路径应明确显示"不支持"的状态警告，而非静默地假装已达到同等能力。

本 PR 将 `DaemonIdeConnection` 作为可本地验证的 extension host 适配器 spike 加入。它尚未接入默认的 `QwenAgentManager` 路径，因此现有 VS Code 行为仍基于 ACP 子进程。

## 事件映射约定

| Daemon 事件                              | IDE 处理方式                                 |
| ---------------------------------------- | -------------------------------------------- |
| `session_update` / `agent_message_chunk` | 现有的 assistant 流式回调                    |
| `session_update` / `agent_thought_chunk` | 现有的 thinking 流式回调                     |
| `session_update` / `tool_call`           | 现有的工具调用更新回调                       |
| `permission_request`                     | 现有的审批 UI 回调                           |
| `permission_resolved`                    | 关闭/更新审批 UI                             |
| `model_switched`                         | 现有的模型状态回调（尽可能覆盖）             |
| `session_died`                           | 断开连接 UI + 重连入口                       |

未知事件必须被忽略或以 debug 元数据形式记录。

## 运行时位置 UX

扩展必须让 daemon 的位置对用户可见：

- workspace/files 是 daemon 宿主机上的路径
- MCP server 运行在 daemon 宿主机上
- skill 从 daemon 文件系统加载
- provider 凭据在 daemon 进程环境中解析

不要暗示本地 VS Code 扩展、本地浏览器 profile、本地 localhost 服务或本地 SSH/kube 凭据可自动供 daemon 使用。

## 明确的非目标

- 不默认迁移离开 `AcpConnection`。
- 不允许 webview 直接连接 daemon 传输层。
- 在文件服务边界落地之前，不通过 IDE 在 daemon 端进行文件 CRUD。
- 暂不支持编辑器/浏览器/剪贴板的反向 RPC。
- 不进行完整的远程控制集成。

## 合并安全性

- 默认关闭，通过设置/环境变量开启。
- 以附加的并列连接路径方式引入。
- 现有 VS Code ACP 子进程路径保持不变。
- Daemon token 不会流入 webview JavaScript。

## 验证计划

- 单元测试 daemon session 工厂连接及 SSE 事件消费。
- 单元测试 daemon 事件到现有 extension host 回调的映射。
- 单元测试 prompt、cancel、模型切换及权限响应转发。
- 单元测试 feature flag 接入后的设置/环境变量解析。
- 对本地 extension host 与 `qwen serve` 进行冒烟测试：
  - prompt 流式输出到聊天界面
  - cancel 正常工作
  - 权限 UI 能够处理请求
  - SSE 重连使用已追踪的 `Last-Event-ID`

## 默认迁移前的阻塞项

- 有类型的 daemon 事件 schema。
- Daemon 标记的客户端身份。
- Session 范围的权限路由。
- 只读运行时诊断。
- FileSystemService 边界及安全文件读取路由。
- 用于 CLI/TUI 对等的输出接收器重构。
