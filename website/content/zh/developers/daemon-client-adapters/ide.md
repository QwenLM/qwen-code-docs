# IDE Daemon 适配器草案

## 目标

让 VS Code 配套扩展通过 `DaemonSessionClient` 从扩展宿主连接到 `qwen serve`，从而内部试用 Mode B。

Webview 不得直接调用 daemon。扩展宿主拥有 daemon URL、token、session id 和 SSE 重放状态，然后将清洗后的应用事件转发给 webview。

## 建议的入口点

VS Code 设置：

```json
{
  "qwen-code.experimentalDaemon.enabled": true,
  "qwen-code.experimentalDaemon.url": "http://127.0.0.1:4170",
  "qwen-code.experimentalDaemon.token": ""
}
```

本地内部试用的环境变量回退：

```bash
QWEN_IDE_DAEMON_URL=http://127.0.0.1:4170 code .
```

## 最小流程

1. 扩展宿主创建 `DaemonClient`。
2. 获取 `/capabilities` 并验证工作区兼容性。
3. 使用 `DaemonSessionClient.createOrAttach()` 创建或附加会话。
4. 在扩展宿主中订阅 `session.events()`。
5. 将 daemon 事件转换为现有的 webview 消息。
6. 通过 `session.prompt()` 发送用户提示。
7. 通过 `session.cancel()` 和 `session.setModel()` 路由取消/模型切换。
8. 通过 `session.respondToPermission()` 路由权限决策。

## 与现有 ACP 连接的关系

首次实现引入一条并行的连接路径，而非替换 `AcpConnection`：

```text
QwenAgentManager
  current default -> AcpConnection -> qwen --acp child
  experimental    -> DaemonIdeConnection -> qwen serve HTTP/SSE
```

在可行的情况下，两条路径都应提供相同的高级 webview 回调。如果某个事件暂时无法忠实地映射，daemon 路径应给出明确的"不支持的狀態"警告，而不是静默地假装一致。

此 PR 添加了 `DaemonIdeConnection` 作为本地可验证的扩展宿主适配器原型。它尚未接入默认的 `QwenAgentManager` 路径，因此现有的 VS Code 行为仍然基于 ACP 子进程。

## 事件映射约定

| Daemon 事件                            | IDE 处理方式                             |
| -------------------------------------- | ---------------------------------------- |
| `session_update` / `agent_message_chunk` | 现有的助理流回调                       |
| `session_update` / `agent_thought_chunk` | 现有的思考流回调                       |
| `session_update` / `tool_call`           | 现有的工具调用更新回调                 |
| `permission_request`                     | 现有的审批 UI 回调                     |
| `permission_resolved`                    | 关闭/更新审批 UI                       |
| `model_switched`                         | 现有的模型状态回调（如果可行）         |
| `session_died`                           | 断开 UI + 重新连接选项                 |

未知事件必须被忽略或记录为调试元数据。

## 运行时本地化 UX

扩展必须让 daemon 的本地化特性可见：

- 工作区/文件是 daemon 主机的路径
- MCP 服务器运行在 daemon 主机上
- skill 从 daemon 文件系统加载
- 提供者凭据在 daemon 进程环境中解析

不要暗示本地的 VS Code 扩展、本地浏览器配置文件、本地 localhost 服务或本地 SSH/kube 凭据会自动供 daemon 使用。

## 明确的非目标

- 不默认从 `AcpConnection` 迁移。
- 不引入 webview 直连 daemon 的传输方式。
- 在文件服务边界确立之前，不实现 daemon 侧通过 IDE 进行文件 CRUD。
- 暂不实现反向 RPC 用于编辑器/浏览器/剪贴板。
- 暂不实现完整的远程控制集成。

## 合并安全性

- 默认关闭，通过设置/环境变量启用。
- 添加并行的连接路径。
- 现有的 VS Code ACP 子进程路径保持不变。
- Daemon token 不会传入 webview JavaScript。

## 验证计划

- 对 daemon 会话工厂连接和 SSE 事件消费进行单元测试。
- 对 daemon 事件到现有扩展宿主回调的映射进行单元测试。
- 对 prompt、cancel、模型切换和权限响应转发进行单元测试。
- 在功能标志接线后，对设置/环境变量解析进行单元测试。
- 对本地扩展宿主与 `qwen serve` 进行冒烟测试：
  - prompt 流式输出到聊天
  - 取消功能正常
  - 权限 UI 可以解决一个请求
  - SSE 重连使用跟踪的 `Last-Event-ID`

## 默认迁移前的阻塞项

- 带类型的 daemon 事件 schema。
- Daemon 标记的客户端身份。
- 会话范围的权限路由。
- 只读运行时诊断。
- FileSystemService 边界和安全的文件读取路径。
- 输出接收器重构以实现 CLI/TUI 对等。