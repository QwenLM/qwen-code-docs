# Daemon MCP 强制重连

## 问题

`POST /workspace/mcp/reload` 会重新加载持久化的设置，但以增量方式调和 MCP 连接。设置未发生变化的服务器会保留其现有 transport。因此，由另一个 Qwen Code 进程写入的 OAuth 凭据要等到该 transport 重连时才会被读取。

## 设计

为两个工作空间 MCP reload 路由及其 SDK/ACP bridge 方法新增可选的 `forceReconnectAll` 和 `forceReconnectWhich` 字段。`forceReconnectAll` 默认为 `false`；`forceReconnectWhich` 选择具名服务器。两个字段互斥。

当提供了任一重连选项时，daemon 首先执行常规的设置调和。然后它会重连该工作空间中所有已配置的 MCP 服务器，或仅重连 `forceReconnectWhich` 选定的名称：

- 池化的服务器通过工作空间 transport 池按服务器名称各重启一次，然后为实时配置刷新模型工具快照；
- 没有池条目的服务器使用现有的每配置发现路径，该路径会在重新发现之前断开并重连。

这有意不发起 OAuth。它只产生一个新的连接，该连接会读取 daemon 令牌存储当前持久化的凭据。

## API

`POST /workspace/mcp/reload` 和 `POST /workspaces/:workspace/mcp/reload` 接受：

```json
{ "forceReconnectAll": true }
```

`forceReconnectWhich` 接受一个非空服务器名称的数组。非法值返回 400。响应仍然是 `202 { "accepted": true }`，因为工作已入队。

## 验证

- 路由测试覆盖默认转发、`true` 转发和非法输入。
- ACP 测试覆盖到每个实时配置的传播和强制重连行为。
- E2E 计划记录一个 OAuth 令牌在外部写入的场景。
