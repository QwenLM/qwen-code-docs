# Conversations writer 锁与恢复

更新后的 daemon 可以共享 Conversations 并同时使用不同的 session。已加载的 session 仍然只有一个 writer。Live 激活仅属于稳定 Live 定位符的确切发布者；失去 Live 发布不会禁用独立 conversations。

## Conversation 无法打开

`session_writer_conflict` 表示 writer fence 阻止了访问。这可能意味着另一个进程已打开该 conversation，或者残留的锁无法安全回收。这并不能证明另一个 writer 当前处于活跃状态。`session_writer_unavailable` 表示无法验证所有权；重试不能授权绕过它。Archive 和 delete 可能对单个 session 返回 HTTP 200 并附带 writer 错误。检查每个结果项。

在拥有该 conversation 的 Qwen 进程中正常关闭它，然后在受影响的 conversation 中使用 **Try again**。你可以继续使用其他 session。不要仅仅为了让错误消失而创建替代 conversation。

在非正常关闭后，Linux 重启或容器重启到新的 PID namespace 可能会留下一个未密封的活跃 writer 记录被无限期隔离。可能没有存活的 owner 可以关闭。请遵循[残留锁的 Operator 恢复](#operator-recovery-for-a-residual-lock)，而不是反复重试；此版本不会自动跨这些身份边界进行回收。

如果问题持续存在，在启动受影响的 daemon 时启用本地调试日志（`QWEN_DEBUG_LOG_FILE=1`），并检查 daemon 和 ACP 子进程的诊断信息。租约获取诊断包括 session ID、错误类型和从该 writer 的运行时存储解析的确切 `lockPath`。不要从主工作区或默认主目录猜测锁路径。公共 HTTP/ACP 错误故意省略路径和所有权记录。保持诊断文件私有；不要发布 owner token 或未编辑的锁内容。

## 哪些状态可以自动恢复？

这些规则适用于 session writer 租约。旧版全局 owner 记录使用下面描述的更有限的兼容性检查。

- 正常关闭会释放租约。只有当其 transcript 证明仍然有效时，才接受认证的密封交接。
- 死亡的活跃 writer 仅在现有身份检查确认其进程属于同一已验证的活跃域时才可回收。
- Live 或停滞的 writer 保持隔离。如果其 ACP writer 子进程存活，杀死 daemon 是不够的。
- 外部或丢失的 boot/process-namespace 身份不能证明死亡。你的 namespace 中缺失的 PID 不能证明外部 writer 已退出。
- 格式错误的记录、不确定的 transcript 身份和残留的转换声明会 fail closed（失败即拒绝）。仅经过的时间永远不会授权接管。

## 残留锁的 Operator 恢复

1. 从本地诊断中识别确切的受影响 session 和存储。保留失败日志及其 transcript 和锁工件的私有备份。记录哪些二进制文件和主机可以访问此存储。
2. 停止或隔离**所有可能的 writer**，包括分离的 ACP 子进程、其他 daemon、容器、namespace 和共享文件系统的机器。从相关主机/namespace 验证隔离。如果你无法建立这一点，停下来并询问能够做到的 operator。
3. 与 maintainer 一起检查确切的记录和任何关联的 claim/retired 工件。确定最后的 transcript 和交接证明是否具有权威性。不要编辑所有权身份字段来制造匹配。
4. 只有在 writer 被隔离且证据已备份后，才在 operator 监督下将单独验证的残留工件移动到私有恢复存储。永远不要递归删除锁目录或删除所有锁。
5. 启动一个更新后的 daemon，恢复原始 session，并在追加之前验证其最后记录的轮次。在确认连续性之前保留备份。只有在该检查之后才将其他更新后的 daemon 带回来。

此版本中没有强制解锁 API 或自动跨启动/TTL 接管。当无法建立安全所有权时，保持隔离。

## 协调升级和回滚

后端切换和 Web Shell 本地错误/重试更改必须在同一版本中发布。这**不是混合版本滚动升级**：旧版 daemon 可以在更新后的 daemon 已启动后创建全局 owner。

升级前，drain 所有旧 session 和计划工作，停止所有旧 daemon 及其 ACP 子进程，保留运行时数据，然后才启动更新后的二进制文件。遇到 live 旧版 owner 的更新后 daemon 会返回 `503 conversation_runtime_in_use`；在该 owner 退出后，无需重启即可重试。只有经过完全重新验证的过期旧版记录才会被退役。格式错误或不安全的旧版状态需要 operator 调查。

旧版 `conversations/runtime-owner.json` 记录带有 PID 和 nonce，但没有 hostname、boot ID 或 PID-namespace 身份。其兼容性检查只能测试该 PID 是否存在于更新后 daemon 自己的主机和 PID namespace 中。它无法检测到在共享存储的其他地方存活的旧版 writer。这是在启动更新后的 daemon 之前隔离所有可能 writer 的另一个原因；该检查不会使混合主机或混合 namespace 升级变得安全。

回滚前，也要 drain 和隔离所有更新后的 daemon 和 writer。清点活跃、密封、claim、retired 和扩展模式的记录。确认目标二进制文件理解每个保留的模式和交接状态；永远不要将不支持的模式提供给旧版 writer，或删除其保护性记录以使回滚继续进行。如果无法建立兼容性，保持 writer 停止并使用 maintainer 指导的恢复或一致的升级前备份。永远不要在明确说明这些轮次的情况下将旧 transcript 恢复到后来的权威轮次之上。