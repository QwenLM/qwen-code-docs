# Daemon 多工作空间会话 Rewind 与 Shell

## 状态

最终实现设计。本文档取代 Phase 2a 中关于活跃会话 rewind 快照、rewind 和 shell 的仅主工作空间表述。

## 问题

daemon 暴露单数会话 API，而多工作空间 daemon 为每个工作空间运行时拥有一个 bridge。大多数活跃会话路由已经解析会话 owner，但 rewind 快照、rewind 和 shell 仍绑定到主 bridge 或拒绝次级 owner。这使得一个有效的活跃次级会话在客户端看来与不支持的路由无法区分。

## 决策

保留单数 REST API，并在每个请求上解析所属的活跃运行时：

- `GET /session/:id/rewind/snapshots` 使用 owner 感知的读取路由。
- `POST /session/:id/rewind` 和 `POST /session/:id/shell` 使用 owner 感知的可变路由和共享的会话归档 coordinator。
- SDK rewind 调用总是选择直接 REST，即使客户端配置了 ACP 传输。这保留了严格的 REST 变更闸门。
- SDK shell 保持其配置的传输。默认 REST 传输获得 owner 路由；工作空间限定的 ACP 客户端保留 `_qwen/session/shell`。
- 不引入工作空间限定的会话 REST API、ACP rewind 方法、core 变更、ACP 子进程变更或 FileHistory 迁移。

## 所有权与授权

工作空间 registry 在所有活跃 bridge 摘要中搜索该会话 id。恰好一个受信任 owner 时分发到该运行时。无 owner 返回 `404 session_not_found`；不受信任的 owner 返回 `403 untrusted_workspace`；多个 owner 返回 `500 ambiguous_session_owner`。三种结果都发生在目标 bridge 操作运行之前。持久化会话必须先被 load 或 resume 到一个运行时中。

Rewind 和 shell 保留 `mutate({ strict: true })`。shell 还额外要求有效的 shell 启用、一个有效的会话绑定客户端 id，以及非空命令。Rewind 转发可选的客户端 id，并且只在省略或为布尔值时接受 `rewindFiles`。省略表示 `true`；任何其他 JSON 类型返回 `400 invalid_rewind_files_flag`。

## 行为边界

shell 在所属会话的工作空间 cwd 中启动，不是文件系统路径沙箱。Rewind 只恢复为 `edit` 和 `write_file` 记录的快照。它不撤销 shell、Git、脚本或手动更改。文件恢复是尽力而为：当响应报告带 `filesFailed[]` 的 `rewound: false` 时，对话可能已经被 rewind。活跃 prompt 保留 `409 session_busy` 和 `Retry-After: 5`；无效目标保留 `400 invalid_rewind_target`。Web Shell 继续请求 `rewindFiles: false`。

现有的 `~/.qwen/file-history/<sessionId>` 布局不变。因此一次活跃的 UUID 冲突会通过 owner 歧义 fail closed（失败即拒绝），而不是选择主运行时。

## 能力

`multi_workspace_session_rewind` 只在存在多个运行时才通告。`multi_workspace_session_shell` 还额外要求有效的会话 shell 启用，即启用标志和已配置的 token 两者。

客户端预检是增量的：

- 主 rewind：`session_rewind`。
- 次级 rewind：`session_rewind` 和 `multi_workspace_session_rewind`。
- 主 shell：`session_shell_command`。
- 次级 shell：`session_shell_command` 和 `multi_workspace_session_shell`。

ACP 原生客户端使用 initialize 的 `_qwen.methods`；daemon 不通告 ACP rewind 厂商方法。

## 验证

单元测试覆盖钉住 owner 分发、对非所属 bridge 的零调用、信任和歧义失败、严格校验顺序、`rewindFiles` 语义、SDK REST 回退、不变的 shell 传输、条件能力通告，以及 ACP rewind 映射的缺失。ACP 工作空间测试保留这一不变量：A 连接不能操作 B 会话，而工作空间限定的 B shell 可以成功。

E2E 场景在工作空间 B 中创建会话和被跟踪的编辑，验证快照和 shell cwd 是 B 作用域的，检查两种 rewind 文件模式，证明 shell 创建的文件在 rewind 后幸存，并记录 busy、部分恢复和不受信任次级的结果。
