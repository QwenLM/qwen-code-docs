# Hosted Workspace 操作员恢复


仅在原始主机上的 Linux 持久化本地进程 worker 出现以下情况时使用此流程：该 worker 的不完整 Hosted Shell 捕获仍持有 Workspace 租约。在 `prepare` 和 `complete` 之间重启不会清除围栏；操作员仍必须验证所有潜在的写入者已停止且无法重启，然后使用 `complete` 提交证明。恢复使物理 Workspace 可用于新 Session。它不会完成、重试或认证原始 Shell 调用。

维护命令以 `qwen-managed-agent-server-*-operator-recovery.jar` 形式提供。在原始 worker 主机上以服务 OS 账户身份运行它，使用服务的数据库设置、Runtime 凭证密钥和 `QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY`。为此维护进程设置 `QWEN_MANAGED_AGENT_RUNTIME_DURABLE_LOCAL_PROCESS=true`、`QWEN_MANAGED_AGENT_RUNTIME_PROVISIONER=local-process` 和 `QWEN_MANAGED_AGENT_RUNTIME_OPERATOR_RECOVERY_ENABLED=true`。保持数据库和凭证环境私密。在运行命令之前应用服务数据库迁移。该命令不启动 HTTP 监听器、调度器或 worker。

1. 找到受影响运行的 `runtime.runtimeBindingId` 和 `runtime.generation`。如果运行记录不可用，授权 DBA 可以对受影响的 `tenant_id` 和 `workspace_id` 使用只读查询 `qwen_runtime_binding` 来列出 `binding_id`、`runtime_generation` 和 `binding_state`；检查每个候选项并仅使用具有匹配持有租约和 Shell 捕获的那一个。运行 `java -jar qwen-managed-agent-server-*-operator-recovery.jar inspect <bindingId> <generation>`。记录返回的 `holderKey`、Runtime Session、Shell 调用、`captureStatus` 和 `captureReason`。恢复需要保存的 `producer_lost` Shell 结果和精确的、仍持有的 Workspace 租约。不支持的旧版 worker、缺失的注册身份或缺失的 holder 无法通过创建替代身份记录来修复。
2. 运行 `java -jar qwen-managed-agent-server-*-operator-recovery.jar prepare <bindingId> <generation> <holderKey> '<incident reason>'`。保存返回的 `recoveryId`。活跃或被恢复阻止的 binding 被围栏为 `OPERATOR_RECOVERY`；已 LOST 的 binding 保持 LOST 并从后台恢复扫描中排除。不释放任何 Workspace 租约。重复使用相同的服务 OS 账户和原因是安全的。不同的记录账户、原因、generation 或 holder 会被拒绝。在事故记录中单独记录人类操作员；`operator_id` 标识运行命令的 OS 账户。
3. 停止原始 worker 并检查对 Workspace 的**所有**潜在写入者，包括分离的子进程和外部监督者。防止原始 worker 和写入者被重启。确认它们已停止。进程组死亡、管道 EOF、经过时间和父 PID 丢失本身是不够的。如果无法确定这一点，停在此处并保持 Workspace 围栏状态。
4. 在私有 Runtime 状态目录内直接创建一个常规的、非符号链接的 UTF-8 JSON 文件，最大 8 KiB，模式 `0600`，包含以下字段（替换示例值）：

   ```json
   {
     "version": 1,
     "recoveryId": "<recoveryId>",
     "verifiedAt": "2026-09-29T03:00:00Z",
     "method": "host inspection",
     "actions": "Stopped worker and detached writers; disabled their external restart source; verified no writer remains",
     "restartPrevention": true
   }
   ```

   `verifiedAt` 必须是实际的 UTC 验证时间，不早于 `prepare` 且不超过维护主机时钟提前五分钟。记录具体步骤和重启防止的来源；在完成这些检查之前不要写入该语句。保持文件和事故记录私密。

5. 运行 `java -jar qwen-managed-agent-server-*-operator-recovery.jar complete <recoveryId> <absoluteEvidenceFile>`。该命令检查精确保存的 worker 身份，以及在同一次启动中它的缺失；在原始主机重启后，它检查已更改的启动身份。然后它墓碑化注册，持久化不可变语句，并仅回收原始 holder。在崩溃或临时数据库故障后可以使用**相同文件**重试。更改的语句会被拒绝。成功输出为 `completed`。

完成后，启动一个**新** Session 并验证它可以使用 Workspace。单独检查原始轮次：其部分输出和不确定的效果仍然不确定，并且不会重放任何 Shell 调用。不要手动清除 SQL 表或注册文件以绕过拒绝。如果原始注册不存在或损坏，或者 worker 来自旧的临时模式，则不支持此流程；使用保留的证据进行升级，而不是伪造证据。

该软件可以检查注册的 worker 身份和精确的 SQL holder，但无法证明任意转义的后代已停止。操作员的声明是该事实的信任边界。