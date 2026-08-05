# 工作空间 Skill 安装路径

日期：2026-07-13

## 契约

`GET /workspace/skills` 和 `GET /workspaces/:workspace/skills` 返回的每个 skill 都包含 `installedPath`，即指向其 `SKILL.md` 文件的现有绝对路径 `SkillConfig.filePath`。该值按存储原样复制；状态层不会解析符号链接，也不会再次对其规范化。

## 兼容性

这是一个增量的 v1 字段。当前 daemon 始终发出该字段，而 ACP bridge 和 TypeScript SDK 的公共状态类型将其保持为可选，使客户端与较旧的 daemon 保持兼容。协议版本和能力列表不变。

## 数据流

`SkillManager.listSkills()` 提供 `SkillConfig` 记录。共享的 `mapSkillConfigToStatus()` 函数将 `filePath` 复制到 `installedPath`。实时的 ACP 快照和 daemon 本地回退都使用该映射器，因此项目、用户、内置、extension、失效 extension 以及被禁用的 skill 具有相同的形态。工作空间状态服务将该共享结果转发给两种路由形式。

## 脱敏边界

状态映射器仍然是显式的元数据允许列表。它暴露安装文件路径，但不暴露 skill 正文、hooks、`skillRoot` 或任何其他 skill 配置。此变更不添加任何 UI 行为。
