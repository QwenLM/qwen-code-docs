# Hook 事件与协议参考

先阅读 [Hooks 指南](/zh/users/hooks/) 完成配置。下面列出配置 Schema 中显式提供的 27 个事件。事件是否触发取决于对应功能与实际操作；仅配置事件不会创建工作流、团队或文件监视器。

## 事件

| 事件 | 触发场景 |
| --- | --- |
| `PreToolUse` | 工具执行前；检查 tool_name 与 tool_input。 |
| `PostToolUse` | 工具成功执行后；包含 tool_response。 |
| `PostToolUseFailure` | 工具失败后；包含错误与中断信息。 |
| `SubagentStart` | 子 Agent 启动时。 |
| `SubagentStop` | 子 Agent 即将结束时。 |
| `Notification` | 发出通知时；检查 notification_type。 |
| `SessionStart` | 会话初始化；source 标识启动来源。 |
| `SessionEnd` | 会话结束；包含 reason。 |
| `PreCompact` | 上下文压缩前。 |
| `PostCompact` | 上下文压缩后。 |
| `Stop` | 助手即将停止回复时。 |
| `QueryEnd` | 一次查询结束时；仅通知。 |
| `UserPromptSubmit` | 提交的用户提示被处理前。 |
| `ConfigChange` | 处理配置变更时。 |
| `StopFailure` | 错误导致 Agent 停止；仅通知。 |
| `TeammateIdle` | 协作 Agent 尝试进入空闲时。 |
| `InstructionsLoaded` | 指令文件被加载时；仅通知。 |
| `CwdChanged` | 工作目录改变；包含 old_cwd 与 new_cwd。 |
| `FileChanged` | 被监视文件变化；包含 file_path 与 event。 |
| `WorktreeCreate` | 创建 worktree；必须返回路径。 |
| `WorktreeRemove` | 移除 worktree 时。 |
| `Elicitation` | MCP 服务请求结构化用户输入时。 |
| `ElicitationResult` | MCP 用户输入请求产生结果后。 |
| `TaskCreated` | 任务创建时。 |
| `TaskCompleted` | 任务标记完成时。 |
| `PermissionRequest` | 工具操作需要权限决策时。 |
| `PermissionDenied` | 工具操作被拒绝时。 |

## 配置结构

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["-e", "process.stdout.write(JSON.stringify({systemMessage: 'Session started'}))"],
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

事件对应一组定义，每个定义包含 `hooks` 数组，可选 `matcher`、`sequential` 和 `async`。匹配值随事件变化，不要把工具名匹配规则直接套到所有生命周期事件。命令 Hook 的 `args` 启用直接进程调用，不再解析 Shell 管道、重定向或通配符；配置 `shell` 在此时不会生效。

| 类型 | 主要字段 | 行为 |
| --- | --- | --- |
| `command` | `command`, `args?`, `shell?`, `env?`, `timeout?` | 接收标准输入 JSON，输出结果到标准输出 |
| `http` | `url`, `headers?`, `allowedEnvVars?`, `timeout?` | POST 输入 JSON，接收 JSON 响应；受 URL 策略约束 |
| `prompt` | `prompt`, `model?`, `timeout?` | 单次模型请求评估事件 |
| `agent` | `prompt`, `tools?`, `maxTurns?`, `timeout?` | 子 Agent 使用工具验证条件，返回结构化结果 |

`timeout` 单位为秒。`runtime` 属于内部函数形式，不是可直接写入 JSON 的用户 Hook。模型型 Hook 会产生模型请求，不能当成零成本的本地检查。异步结果不保证在原操作前返回，不要用异步 Hook 承担必须同步阻断的校验。

## 输入与输出

公共输入包含 `session_id`、`transcript_path`、`cwd`、`hook_event_name`。`model`、`permission_mode`、`agent_id`、`agent_type` 和 `workspace_dirs` 按事件上下文可选。各事件还携带自己的字段；脚本应忽略不认识的字段并处理可选字段缺失。

```json
{
  "systemMessage": "Validation completed"
}
```

`systemMessage` 用于界面消息，不应假设模型一定读取它。需要向模型补充上下文时，应使用该事件支持的 `hookSpecificOutput` 字段；`SessionStart` 和 `UserPromptSubmit` 对标准输出还有专门的上下文注入处理。向标准输出写 JSON 时，调试文本应写到标准错误，避免破坏解析。

命令 Hook 通常以退出码 `0` 表示成功，退出码 `2` 表示阻断反馈，其他非零值作为非阻断错误处理。但事件有自己的控制语义：`StopFailure` 和 `InstructionsLoaded` 仅通知并忽略输出控制；`WorktreeCreate` 的任意非零退出码都会使创建失败，成功时须返回工作目录路径。不能把任意事件都当成权限拦截器。

HTTP 请求会发送事件载荷。`headers` 支持 `${ENV_VAR}`，可用 `allowedEnvVars` 限定可展开变量；使用 [权限与信任](/zh/users/permissions/) 和 [数据与隐私](/zh/users/data-privacy/) 中的规则审阅配置。调试时先用不改变决策的通知 Hook 验证事件，再添加必要控制字段，避免在停止事件中形成无休止的继续循环。
