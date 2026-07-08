# 会话 Shell 权限策略

## 问题

`POST /session/:id/shell` 直接通过 daemon 执行 shell 命令，
不经过 LLM 工具调用或常规的 agent 权限调解流程。在此次更改之前，
该端点是一个非严格变更（non-strict mutation），可以通过 daemon token 加上 session id 来访问，
或者在无 token 的 loopback 开发者默认环境下访问。

对于直接的 shell 接口来说，这赋予了过高的权限。除非 daemon 操作员显式启用该接口，
并且调用方证明其已附加到目标 session，否则调用方不应能够执行 shell 命令。

## 目标

- 默认禁用直接的 session shell。
- 要求操作员通过 `qwen serve --enable-session-shell` 显式选择启用。
- 在选择启用生效前，要求配置 bearer-token。
- 要求使用在目标 session 上注册的 client id。
- 在 REST 路由、ACP HTTP 调度器和 bridge 执行 sink 处应用相同的策略。
- 保持常规的 agent shell 工具审批和权限调解不变。

## 非目标

- 不将直接的 shell 路由通过 `PermissionMediator`。
- 不更改 prompt 提交、prompt 排队或 SDK 待处理 prompt 的行为。
- 不添加特定于 shell 的速率限制器。
- 不为选择启用标志添加环境变量别名。

## 设计

`runQwenServe` 会解析并修剪 bearer token 一次。之后，它会计算出一个有效的布尔值：

```ts
sessionShellCommandEnabled =
  opts.enableSessionShell === true && token !== undefined;
```

该值会被传递到 bridge、REST app 和 ACP 调度器中。直接调用 `createServeApp` 的嵌入式调用方
会使用非空字符串检查来计算 token 是否存在，因此 `token: ''` 在严格变更门控和 shell 能力宣告中
的行为与没有 token 相同。

REST 路由使用 `mutate({ strict: true })`。在无 token 的 loopback daemon 上，
严格门控会在 handler 运行前返回 `401 token_required`。当配置了 token 时，
handler 会以 `session_shell_disabled` 拒绝被禁用的 shell，然后要求提供 `X-Qwen-Client-Id`，
接着验证命令 body，最后委托给 bridge。

ACP 调度器保留 `_qwen/session/shell` 以供旧客户端调度，但除非有效策略被启用，
否则不会在 initialize `_qwen.methods` 列表中宣告它。被禁用的 ACP 调用会返回稳定的
`session_shell_disabled` JSON-RPC 错误，而不会记录命令或调用 bridge。
启用的调用仍然要求连接拥有该 session，并且必须使用 bridge 标记的 session 绑定 client id。

bridge 在 `executeShellCommand()` 处执行最终的纵深防御检查：是否禁用、是否缺少 client id、
是否为未知 session，以及是否为未绑定的 client id。只有在这些检查通过后，
它才会发布 shell 事件、执行命令或写入 shell 历史记录。

## 错误规范

REST：

- 无 token：`401`，`code: token_required`
- 已禁用：`403`，`code/errorKind: session_shell_disabled`
- 缺少 client id：`403`，`code/errorKind: client_id_required`
- 格式错误或未绑定的 client id：现有的 `400 invalid_client_id`
- 未知 session：现有的 `404 SessionNotFoundError` 映射

ACP：

- 已禁用：`RPC.INVALID_REQUEST`，`data.errorKind: session_shell_disabled`
- 缺少 session 绑定的 client id：`RPC.INVALID_REQUEST`，
  `data.errorKind: client_id_required`
- 未拥有的 session 和无效的 client id 保持现有的 JSON-RPC 映射

## 兼容性

当 daemon 被显式启用并经过身份验证时，`DaemonSessionClient.shellCommand()` 继续工作，
因为 session 客户端携带了 session 绑定的 client id。直接调用 `DaemonClient.shellCommand(sessionId, command)`
必须传递 `opts.clientId`，否则将收到 `client_id_required` 错误。

## 测试覆盖

该实现由专门的 bridge、REST、ACP 传输、serve 启动和命令解析器测试覆盖。
最高价值的检查包括默认禁用行为、无 token 严格门控、能力宣告、ACP initialize 方法过滤、
bridge sink 强制执行以及 session 绑定 client id 的传播。