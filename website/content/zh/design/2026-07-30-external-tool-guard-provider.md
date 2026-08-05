# 托管 ACP 的外部工具守卫 Provider

状态：实现设计
跟踪 issue：https://github.com/QwenLM/qwen-code/issues/8102
依赖：https://github.com/QwenLM/qwen-code/pull/8032

## 问题与范围

Qwen Code 已经支持权限规则和 hook，但这些机制无法为托管的 `qwen serve`
部署在每个工具执行器之前提供一个强制的、外部的、机器可验证的决策。
PR #8032 添加了该执行器边界回调。本变更把该回调连接到托管 ACP 部署的一个
小型外部 provider。

范围被刻意限定为一个决策：

> 给定运行时拥有的会话和 prompt 身份、运行时接受的工具调用关联标签、规范
> 工具名和最终参数，这次调用现在可以执行吗？

本变更不添加任务协议、结果回调、观察者/重放服务、通用 hook 替换，也不为
显式的 daemon 控制/管理 API 添加授权层。它也不会让被允许的工具实现变得确定
性，也不会对 provider 选择允许的命令行为做沙箱化。

## 安全契约

- 激活仅在进程启动时：`off`（默认）或 `required`。
- 在 `off` 下，不构造 provider，不发起 provider RPC，也不通告任何能力。在
  没有任何新输入的情况下，独立 CLI / 普通 ACP 行为不变。保留的 token 环境
  变量如果设置了，仍会从后代执行环境中清除。
- 在 `required` 下，daemon 启动时执行带认证的版本化握手。缺失或无效的配置、
  不可用或不兼容的 provider 会让 daemon 启动失败。
- 每个通过现有权限和 `PreToolUse` 闸门并到达最终执行边界的受支持顶层调用，
  恰好执行一次有界的 `prepare` 请求。更早的权限/hook 拒绝不发起 provider
  请求。没有重试。超时、取消、传输失败、格式错误的响应、身份不匹配或显式
  拒绝都会阻止执行器运行。
- 继承自 PR #8032 的顺序是权限处理、`PreToolUse` hook，然后是本 Guard，然后
  是目标执行器。Guard 只授权目标工具执行器；它不授权也不沙箱化 hook 行为。
  需要全效果边界的托管部署必须禁用 hook，或独立地信任并治理它们。
- 斜杠命令动作在模型/工具调度之前解析，不是 Tool Guard 调用。某些内置命令
  可以直接变更文件或设置。除下面明确拒绝的嵌套代理入口外，本变更不对斜杠
  命令分类；托管宿主必须拒绝斜杠命令输入，或用 `slashCommands.disabled` /
  `--disabled-slash-commands` 禁用未批准的命令。
- Provider 凭据保留在 `qwen serve` 进程中。它们绝不会被复制到 ACP 子进程、
  channel worker、工具子进程、MCP server、hook 或子代理环境。CLI 在运行时
  环境快照被冻结之前捕获并删除环境中的 token。
- 子到父的 guard 请求使用现有的私有 ACP 通道。bridge 只为该通道拥有的会话
  接受它，且只在其 prompt ID 等于 bridge 的活跃 prompt ID 时接受。
- 每个 ACP 通道必须在其 initialize 响应中确认 `required-v1`，证明子进程消费
  了私有标记并安装了执行器回调。缺失或不匹配的确认会在任何 Session 创建
  之前拒绝该通道。
- 托管 ACP 不启动交互式建议 speculation 运行时。如果嵌入方独立到达 PR #8032
  的 speculation 路径，apply 之前仍然需要同样的回调。
- V1 只支持在活跃的托管前台 Prompt 期间发起的顶层工具调用。`agent`、
  `workflow`、`create_sub_session`、`send_message`、直接的 `/fork` 入口点，
  以及代理支撑的工作空间内存 remember/dream 控制，都会在它们能够启动、恢复
  或委托给独立的 AgentCore/Session 之前被拒绝。自动/cron 轮次和恢复的后台
  代理不携带活跃的托管 Prompt 上下文，因此其受守卫的工具以 fail closed
  （失败即拒绝）处理。
- 带 `is_background=true` 的顶层 shell 调用，或 `monitor` 调用，仍然是一次
  受守卫的调用：provider 看到其最终参数并可以拒绝它。Guard 不持续授权被启动
  的进程，也不添加新的进程完成审计协议。需要前台完成的托管策略必须拒绝那些
  参数/工具形态。
- 受守卫的 MCP 传输错误被视为模糊结果，不会自动重连/重放。先前的允许不能
  授权第二次执行尝试。
- 现有的 ACP `session/update` 工具生命周期事件仍是执行观察的来源。provider
  请求与这些事件通过 `sessionId`、`promptId` 和 `toolCallId` 关联。

身份强度是刻意显式的：

- `sessionId` 由 daemon/ACP Session 生成并拥有；
- `promptId` 由 daemon 生成，并在调用方元数据被剥离后重新绑定；
- `toolCallId` 是运行时接受的关联标签。它可能源自模型工具调用，因此它不是
  认证主体，也不是独立的幂等键；
- `requestId` 由 `qwen serve` 为这一次 provider RPC 生成。它是 provider 决策
  操作标识符，但现有生命周期事件使用完整的
  `(sessionId, promptId, toolCallId)` 元组关联。

## 配置

```bash
export QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN='replace-with-local-secret'

qwen serve \
  --external-tool-guard-mode=required \
  --external-tool-guard-endpoint=http://127.0.0.1:8787 \
  --external-tool-guard-timeout-ms=3000
```

规则：

- `--external-tool-guard-mode` 接受 `off|required`，默认为 `off`。
- `required` 需要一个仅限 origin 的回环 HTTP(S) 端点，以及来自
  `QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN` 的非空 token，至多 8192 个 UTF-16
  码元且不含控制字符。
- 端点的 userinfo、query、fragment 和非根路径会被拒绝。
- `localhost` 被客户端固定为 `127.0.0.1`（HTTPS 使用 `localhost` SNI）；它绝不
  通过环境 DNS 或代理配置解析。
- 超时是 100 到 30000 ms 之间的整数。默认为 3000 ms。
- 没有 `mode=required` 时，端点和 token 不会激活 provider。保留的 token 仍会
  被消费并清除，而不是暴露给工具。

## 运行时数据流

```mermaid
sequenceDiagram
    participant Host as "DataAgent / operator"
    participant Serve as "qwen serve"
    participant Guard as "External Guard"
    participant ACP as "private qwen --acp"
    participant Exec as "Tool executor"

    Host->>Serve: "start with mode=required"
    Serve->>Guard: "POST /v1/handshake (Bearer token)"
    Guard-->>Serve: "version + nonce + prepare capability"
    Serve->>ACP: "spawn; private ACP capability + required marker"
    ACP-->>Serve: "initialize acknowledgement: required-v1"
    Host->>Serve: "prompt"
    Serve->>ACP: "prompt + runtime-owned sessionId/promptId"
    ACP->>ACP: "permission + PreToolUse gates"
    ACP->>Serve: "private extMethod prepare(sessionId,promptId,toolCallId,name,args)"
    Serve->>Serve: "verify owned session + active prompt"
    Serve->>Guard: "POST /v1/prepare (exactly once)"
    Guard-->>Serve: "allow or deny"
    Serve-->>ACP: "decision"
    alt "allow"
        ACP->>Exec: "execute final invocation"
        ACP-->>Serve: "existing tool_call_update terminal event"
    else "deny / unknown / timeout / cancel"
        ACP-->>Serve: "existing EXECUTION_DENIED/cancelled terminal event"
    end
```

## 线上契约

所有请求体使用 UTF-8 JSON 和 `Content-Type: application/json`。请求使用
`Authorization: Bearer <token>`。不跟随重定向。响应体在 JSON 解析之前有界。
序列化后的请求不得超过 1 MiB，响应不得超过 64 KiB，拒绝理由不得超过 500 个
UTF-16 码元或包含控制字符。

最终工具参数是应用数据，可能包含提供给工具的源代码、路径、查询或凭据。
Provider 必须把它们视为敏感信息，不能仅因为传输是回环就不加区分地持久化。

握手请求：

```json
{
  "protocolVersion": 1,
  "nonce": "runtime-random-value",
  "client": "qwen-code"
}
```

握手响应：

```json
{
  "protocolVersion": 1,
  "nonce": "same-runtime-random-value",
  "capabilities": { "prepare": true }
}
```

Prepare 请求：

```json
{
  "protocolVersion": 1,
  "requestId": "runtime-random-value",
  "sessionId": "runtime-owned-session-id",
  "promptId": "runtime-owned-prompt-id",
  "toolCallId": "runtime-accepted-tool-call-correlation-id",
  "toolName": "canonical_tool_name",
  "arguments": { "final": "tool arguments" }
}
```

允许响应：

```json
{
  "protocolVersion": 1,
  "requestId": "same-runtime-random-value",
  "allowed": true
}
```

拒绝响应：

```json
{
  "protocolVersion": 1,
  "requestId": "same-runtime-random-value",
  "allowed": false,
  "reason": "Safe user-visible policy reason"
}
```

未知字段、错误的版本/nonce/请求 ID、无效布尔值、超大请求体和不安全的拒绝
理由都是协议失败，因此按拒绝处理。

## 源码实现地图

| 关注点                                                                      | 实现点                                                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| CLI 标志、token 捕获和非 serve 引导清除                                     | `packages/cli/src/commands/serve.ts`、`packages/cli/src/cli.ts`                     |
| 公开嵌入选项                                                                | `packages/cli/src/serve/types.ts`                                                   |
| 配置校验、回环 HTTP 客户端、握手、响应解析                                  | `packages/cli/src/serve/external-tool-guard-provider.ts`                            |
| Provider 构造、启动握手、能力和 bridge 接线                                 | `packages/cli/src/serve/run-qwen-serve.ts`                                          |
| 共享私有 ext-method 和处理器类型                                            | `packages/acp-bridge/src/status.ts`、`bridgeOptions.ts`                             |
| 拥有会话 / 活跃 prompt 校验                                                 | `packages/acp-bridge/src/bridgeClient.ts`                                           |
| Bridge 注入                                                                 | `packages/acp-bridge/src/bridge.ts`                                                 |
| 私有 required 标记捕获、token 清除和重启保留                                | `packages/cli/src/gemini.tsx`                                                       |
| 每会话 Config 注入和子进程回调                                              | `packages/cli/src/acp-integration/acpAgent.ts`、`packages/cli/src/config/config.ts` |
| 必需的子进程确认和父侧准入                                                  | `packages/cli/src/acp-integration/acpAgent.ts`、`packages/acp-bridge/src/bridge.ts` |
| 执行器边界的运行时上下文                                                    | `packages/core/src/core/tool-invocation-guard.ts` 和 PR #8032 的三个调用点          |
| 条件式能力通告                                                              | `packages/cli/src/serve/capabilities.ts`                                            |

## 兼容性与失败行为

| 部署形态                                               | 预期行为                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `qwen` 交互式/无头                                     | 在没有新输入时，现有执行行为不变                                 |
| 由 IDE 启动的 `qwen --acp`                             | 无 provider；无私有标记                                          |
| 无新标志的 `qwen serve`                                | 无 provider、无能力，当前的预热/重试行为                         |
| `qwen serve`，有端点/token，mode 省略/off              | 无 provider/能力；保留 token 从子进程中清除                      |
| `qwen serve`，required，有效 provider                  | 通告能力；每个受支持的顶层工具都被守卫                           |
| `qwen serve`，required，无效配置/握手                  | 监听器不启动                                                     |
| Required，子进程未确认已安装的 Guard                   | ACP 通道在 Session 创建之前被拒绝                                |
| Required provider 在轮次中失败                         | 调用变为被拒绝；执行器计数保持为零                               |
| Required，不支持的嵌套/隐藏 AgentCore 入口             | 在嵌套执行开始前本地拒绝                                         |
| Required，MCP 响应丢失/连接关闭                        | 首次尝试失败；不自动重连或重放                                   |

能力为 `external_tool_guard`，只在 required 模式完成其启动握手时通告。

## 验证计划

单元测试和契约测试必须证明：

1. 严格的端点/配置校验；
2. 带认证的握手、nonce/版本/schema 校验和请求体限制；
3. 允许、显式拒绝、超时、中止、连接失败和格式错误的响应，且没有重试；
4. BridgeClient 在调用 provider 之前拒绝未知会话和过期的 prompt 身份；
5. 默认 off 不创建 provider 也不通告能力；
6. token 绝不进入 ACP 子进程的有效环境；
7. required 标记在现有重启路径中存活，但在工具能够继承 ACP 进程环境之前被
   删除；
8. required 模式把回调注入每个活跃 ACP 会话的 Config；
9. 每个 required ACP 通道必须在 Session 创建之前确认已安装的回调；
10. 托管 ACP 不启动建议 speculation，且单独调用的 speculation 路径在 apply
    之前仍需要该回调；
11. 嵌套/委托的 `agent`、`workflow`、`create_sub_session`、`send_message`、
    直接的 `/fork` 以及代理支撑的工作空间内存控制被拒绝，而没有活跃 Prompt
    上下文的自动/后台轮次以 fail closed 处理；
12. 受守卫的 MCP 连接错误执行一次调用且不重连/重放；
13. 托管 ACP 端到端用例把 provider 的 `sessionId/promptId/toolCallId` 与现有
    启动/终态事件匹配，并证明允许时执行器计数为 1、拒绝/失败时为 0。

运行聚焦的包测试、仓库构建/类型检查/lint 和 daemon E2E 套件。PR 报告记录
命令和确切结果。

## 非目标与后续工作

- Unix 域套接字传输；v1 使用仅限 origin 的回环 HTTP(S) 端点。
- Provider 侧的决策重放或幂等重新提交；Qwen Code 不发送重试。
- 嵌套/委托执行的谱系（`agent`、`workflow`、`create_sub_session`、
  `send_message`、`/fork`）、代理支撑的工作空间内存控制，以及未来感知尝试
  次数的 Guard 协议。V1 拒绝那些嵌套/隐藏的代理入口点，而不是声称不支持的
  关联。
- Qwen Code 中的结果报告或审计存储。Provider 和 DataAgent 拥有其审计记录；
  Qwen Code 提供稳定的关联键和现有生命周期事件。
- 后台 shell/monitor 进程在其受守卫启动之后的持续授权或新的终态结果契约。
  Provider 可以根据其最终工具名和参数拒绝那些调用。
- 业务 Task API、plan 审批、授权或 DataAgent 特定策略。
- hook 实现的授权或沙箱化。`PreToolUse` 在 PR #8032 契约下先于本执行器
  Guard 运行。
- 斜杠命令动作的授权。它们在工具调度器之前运行；需要全效果边界的托管宿主
  必须拒绝斜杠命令输入，或在本功能之外维护严格的部署拒绝列表。
- 对被允许的工具实现或 shell 命令的语义检查或沙箱化。Provider 基于规范名称
  和最终参数做决策；托管部署必须把该决策与其现有的工具策略和隔离边界结合。
- 显式 daemon REST/ACP 控制操作的授权；那些仍由 daemon 现有的认证和 API
  契约治理。
