# Daemon Skill 开关

## 目标

通过 daemon REST 和 TypeScript SDK 暴露 CLI `/skills` 面板的工作空间
启用/禁用行为，包括对活跃 ACP 会话的即时刷新。

## 公开契约

- `POST /workspace/skills/:name/enable`
- `POST /workspaces/:workspace/skills/:name/enable`
- 请求体：`{ "enabled": boolean }`
- SDK：`DaemonClient.setWorkspaceSkillEnabled` 和
  `WorkspaceDaemonClient.setWorkspaceSkillEnabled`
- Capability：`workspace_skill_toggle`

响应包含规范 skill 名、请求的状态、持久化是否变更、激活状态以及会话刷新
计数。`applied` 表示所有活跃会话都已刷新，`deferred` 表示没有 ACP 子进程
在运行，`partial` 表示持久化提交后至少有一个会话刷新失败。

## 语义

该 API 按需修改工作空间的 `skills.disabled` 和 `skills.enabled`。Skill
查找不区分大小写，但持久化的是规范发现的名称。启用一个默认禁用的 skill
会写入显式 opt-in；禁用它会移除 opt-in 并写入硬性的工作空间禁用。更新某
一个目标会移除目标重复项和大小写变体，但不会删除不可用 skill 的孤儿条目。
第二个相同的请求是 no-op。

该路由拒绝 CLI 面板无法切换的状态：

- 未知 skill：`404 skill_not_found`；
- `userInvocable === false`：`409 skill_not_toggleable`；
- 来自未激活扩展的 skill：`409 skill_not_toggleable`；
- 在系统默认、user 或 system scope 中被禁用：`409 skill_not_toggleable`
  并附带锁定的 scope；
- 不可信工作空间：`403 untrusted_workspace`。

scope 锁检查和工作空间的读-改-写都在 daemon 的每工作空间设置锁内进行。
写入失败会在刷新和事件发布之前停止。

## Skill 可用性与 `disable-model-invocation`

`skills.disabled` 是运维者的硬性拒绝名单，在各 scope 间按不区分大小写的
并集合并。`skills.defaultDisabled` 提供可覆盖的默认值，`skills.enabled`
提供显式 opt-in，优先级为 `disabled > enabled > defaultDisabled`。生效的
禁用会移除匹配的 skill 斜杠命令和模型可见的 skill 条目，并且执行时校验会
拒绝该 skill。daemon 端点写入 `disabled` 和 `enabled` 的工作空间成员。

`disable-model-invocation` 是 SKILL.md 元数据。它对模型调用隐藏 skill，
同时保留用户直接调用。现有的托管 skill ACP 操作就是编辑该元数据，本 API
有意不复用它。

## 激活流程

1. 从工作空间状态快照解析规范的、可切换的 skill。
2. 在工作空间设置锁内重新读取所有 scope，拒绝更高 scope 的锁定，并提交
   规范的工作空间列表。
3. 使 daemon 缓存的 skill 状态失效。
4. 如果 ACP 子进程存活，调用 `qwen/control/workspace/skills/refresh`。
5. 子进程重新加载工作空间 scope 的设置，并刷新所有活跃会话，包括繁忙的
   会话。
6. 每个会话重新加载自己的工作空间设置，重建并推送
   `available_commands_update`，并通知 SkillManager 消费者。
7. 为每个变更的 skill 设置键发布既有的工作空间 `settings_changed` 事件。

进行中的模型请求无法被改写。后续的 skill 执行检查、命令快照和模型上下文
都会读取新状态。

## 下游消费者

- 设置合并：system defaults、user、workspace 和 system 列表按
  `disabled > enabled > defaultDisabled` 优先级构成生效的禁用名称集合。
- 工作空间状态：ACP 和 daemon 本地的 skill 映射暴露禁用状态、禁用原因、
  锁定 scope 以及仅 false 的 `userInvocable`。
- 斜杠命令：可用命令构建移除被禁用的 skill，并向 daemon 客户端发送更新后
  的命令元数据。
- 模型上下文：SkillManager 变更监听器刷新 Skill 工具描述和可用 skill
  上下文。
- 执行校验：Skill 工具在调用前重新读取禁用名称 provider，因此后续调用会
  被立即拒绝。
- 扩展状态：未激活扩展的 skill 即使没有被设置禁用，仍然不可切换。
- Daemon 缓存：缓存的存活子进程 skill 快照在持久化后失效，因此后续 GET
  请求不会重放过期状态。
- SDK 消费者：主工作空间客户端和带工作空间限定的客户端共享同一响应和错误
  契约。
- 事件：既有的 `settings_changed` 消费者观察到每个已提交的
  `skills.disabled` 或 `skills.enabled` 值；没有新的事件类型。

## 失败行为

- 持久化失败：HTTP 请求失败；没有 ACP 刷新，也没有事件。
- 没有子进程：持久化成功并返回 `deferred`；下一个子进程在启动时加载该
  设置。
- 单个会话刷新失败：持久化保持已提交；成功刷新的会话保持已刷新，响应为
  `partial`。
- 子进程传输竞态：如果子进程在存活检查之后消失，响应为 `deferred`；其他
  刷新失败报告为 `partial`。
