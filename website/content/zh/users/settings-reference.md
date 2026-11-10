# 设置参考

本页列出常用及进阶的用户设置。如何选择配置文件、优先级与信任规则见[设置指南](/zh/users/settings/)。键名中的点表示嵌套对象，不应原样作为 JSON 的顶层键。

```json
{
  "ui": { "showLineNumbers": true },
  "general": { "plan": { "enabled": true } }
}
```

表中的缺省值描述源码定义；未设置值可能由宿主、模型或运行时策略决定。需要重启的字段应重启进程验证。`outputStyle` 对新对话生效，请用 `/clear` 或 `/new`。

## 模型与行为

| 键 | 类型 | 缺省 | 重启 | 用途 |
| --- | --- | --- | --- | --- |
| `model.name` | string | 未设置 / 由运行时决定 | 否 | 默认模型标识 |
| `model.reasoningEffort` | enum | 未设置 / 由运行时决定 | 否 | 已废弃：已迁移到 `model.preferences[modelId].reasoning.effort`。支持推理强度档位的模型使用的推理强度。 |
| `model.contextWindow` | number | 未设置 / 由运行时决定 | 否 | 已废弃：已迁移到 `model.preferences[modelId].contextWindow`。支持上下文窗口选项的模型使用的上下文窗口（token 数）。 |
| `outputStyle` | string | 未设置 / 由运行时决定 | 是 | 输出风格 |
| `language` | string | 未设置 / 由运行时决定 | 是 | 偏好的回复语言 |
| `agent` | 'string' as const | 未设置 / 由运行时决定 | 是 | 默认 Agent |
| `general.maxAttempts` | number | 由 CLI 宿主注入 | 否 | 主模型请求最大尝试次数（含首次） |
| `general.retryFetchErrors` | boolean | `true` | 否 | 重试符合条件的 fetch 错误 |
| `output.format` | enum | `text` | 否 | 默认输出格式 |
| `autoMemoryEnabled` | boolean | 未设置 / 由运行时决定 | 是 | 项目自动记忆。未设置时，交互会话中默认开启；非交互运行默认关闭，设置 `QWEN_MEMORY_HEADLESS=1` 可开启。 |
| `autoMemoryUserScopeEnabled` | boolean | 未设置 / 由运行时决定 | 是 | 用户级自动记忆。未设置时，交互会话中默认开启；非交互运行默认关闭，设置 `QWEN_MEMORY_HEADLESS=1` 可开启。 |


## 权限与信任

| 键 | 类型 | 缺省 | 重启 | 用途 |
| --- | --- | --- | --- | --- |
| `general.defaultPermissionMode` | string | `default` | 否 | 默认权限模式 |
| `security.folderTrust.enabled` | boolean | `true` | 是 | 启用文件夹可信检查 |
| `security.disableYoloMode` | boolean | `false` | 是 | 禁止绕过权限模式 |
| `permissions.additionalDirectories` | array | `[]` | 否 | 额外工作目录 |
| `permissions.trustDirectories` | array | `[]` | 否 | 可信目录 |
| `security.enableAllExternalImports` | boolean | `false` | 是 | 允许全部外部指令导入 |
| `security.approvedExternalImportProjects` | array | `[]` | 是 | 批准外部指令导入的项目 |
| `security.environmentVariableRedaction.enabled` | boolean | `false` | 是 | 子进程敏感环境变量过滤 |
| `security.environmentVariableRedaction.allowed` | array | `[]` | 是 | 允许的环境变量规则 |
| `security.environmentVariableRedaction.blocked` | array | `[]` | 是 | 阻止的环境变量规则 |


## 上下文与工作目录

| 键 | 类型 | 缺省 | 重启 | 用途 |
| --- | --- | --- | --- | --- |
| `context.fileName` | string | `AGENTS.md` | 否 | 指令文件名 |
| `context.discoveryMaxDirs` | number | `200` | 否 | 指令发现最多扫描目录数 |
| `context.memoryBoundaryMarkers` | array | `['.git']` | 是 | 指令发现边界标记 |
| `context.loadMemoryFromIncludeDirectories` | boolean | `false` | 否 | 从额外目录加载指令 |
| `context.fileFiltering.respectGitIgnore` | boolean | `true` | 是 | 遵守 Git 忽略规则 |
| `context.fileFiltering.respectBrandIgnore` | boolean | `true` | 是 | 遵守产品忽略文件 |
| `context.fileFiltering.customIgnoreFilePaths` | array | `[]` | 是 | 额外忽略规则文件 |
| `agentsMdExcludes` | array | `[]` | 是 | 排除指令文件的模式 |
| `worktree.baseRef` | string | `'fresh'` | 是 | worktree 起点策略 |
| `worktree.sparsePaths` | array | `[]` | 是 | worktree 稀疏检出路径 |
| `worktree.symlinkDirectories` | array | `[]` | 是 | worktree 链接目录 |
| `general.fileCheckpointing.enabled` | boolean | `true` | 是 | 启用文件检查点 |
| `general.plan.enabled` | boolean | `true` | 是 | 启用规划模式 |
| `general.plan.directory` | string | 未设置 / 由运行时决定 | 是 | 规划文件目录；自定义写入仍需授权 |


## 工具与扩展

| 键 | 类型 | 缺省 | 重启 | 用途 |
| --- | --- | --- | --- | --- |
| `tools.core` | array | 未设置 / 由运行时决定 | 是 | 限制内置工具集合 |
| `tools.exclude` | array | 未设置 / 由运行时决定 | 是 | 排除的工具 |
| `tools.shell.pager` | string | `'cat'` | 否 | Shell 分页器 |
| `tools.shell.showColor` | boolean | `true` | 否 | Shell 输出保留颜色 |
| `tools.shell.inactivityTimeout` | number | `300` | 否 | Shell 无输出超时（秒） |
| `tools.useRipgrep` | boolean | `true` | 否 | 使用 ripgrep 搜索 |
| `mcp.allowed` | array | 未设置 / 由运行时决定 | 是 | 允许的 MCP 服务 |
| `mcp.excluded` | array | 未设置 / 由运行时决定 | 是 | 排除的 MCP 服务 |
| `mcp.enableAllProjectMcpServers` | boolean | `false` | 是 | 批准全部项目 MCP 服务 |
| `mcp.enabledProjectMcpServers` | array | `[]` | 是 | 已批准的项目 MCP 服务 |
| `mcp.disabledProjectMcpServers` | array | `[]` | 是 | 禁用的项目 MCP 服务 |
| `mcp.lazyLoad` | boolean | `false` | 是 | 延迟加载 MCP |
| `skills.enabled` | boolean | `true` | 是 | 启用 Skills |
| `skills.loadFromAgentsDirectory` | boolean | `true` | 是 | 从兼容 agents 目录加载 Skills |
| `skills.disabled` | array | `[]` | 是 | 禁用的 Skills |
| `skills.disableShellExecution` | boolean | `false` | 否 | 禁止 Skill Shell 执行 |
| `plugins.enabled` | array | `[]` | 是 | 已废弃：请改用顶层 `enabledPlugins`。仅为迁移保留。 |
| `plugins.disabled` | array | `[]` | 是 | 已废弃：请改用顶层 `enabledPlugins` 并将值设为 `false`。仅为迁移保留。 |
| `plugins.autoUpdate` | boolean | `true` | 否 | 插件自动更新 |
| `disableAllHooks` | boolean | `false` | 否 | 为 true 时，无论各项单独设置如何，禁用全部 Hook 和 statusLine 执行。顶层总开关。 |
| `allowedHttpHookUrls` | array | 未设置 / 由运行时决定 | 是 | 允许的 HTTP Hook URL 规则 |
| `hooksConfig.enabled` | boolean | `true` | 是 | 启用 Hook 系统 |
| `hooksConfig.notifications` | boolean | `false` | 否 | 显示 Hook 通知 |
| `hooksConfig.headlessFastMode` | boolean | `false` | 是 | 非交互 Hook 快速模式 |
| `experimental.enableAgents` | boolean | `true` | 是 | 启用 Agent 功能（实验设置） |


## 终端界面

| 键 | 类型 | 缺省 | 重启 | 用途 |
| --- | --- | --- | --- | --- |
| `ui.language` | enum | `en` | 否 | 界面语言 |
| `ui.theme` | string | `'auto'` | 否 | 主题 |
| `ui.autoThemeSwitching` | boolean | `true` | 否 | 自动切换主题 |
| `general.preferredEditor` | string | 未设置 / 由运行时决定 | 否 | 首选编辑器 |
| `general.vimMode` | boolean | `false` | 否 | Vim 编辑模式 |
| `ui.hideWindowTitle` | boolean | `false` | 是 | 隐藏窗口标题 |
| `ui.inlineThinkingMode` | enum | `full` | 否 | 思考过程显示方式 |
| `ui.showShortcutsHint` | boolean | `true` | 否 | 显示快捷键提示 |
| `ui.compactToolOutput` | boolean | `true` | 否 | 紧凑工具输出 |
| `ui.copyFullResponse` | boolean | `false` | 否 | 复制完整回答 |
| `ui.hideBanner` | boolean | `false` | 否 | 隐藏横幅 |
| `ui.hideContextSummary` | boolean | `false` | 否 | 隐藏上下文摘要 |
| `ui.hideFooter` | boolean | `false` | 否 | 已废弃并忽略；只为兼容旧配置保留 |
| `ui.showLineNumbers` | boolean | `true` | 否 | 显示行号 |
| `ui.renderMermaid` | boolean | `true` | 否 | 渲染 Mermaid |
| `ui.errorVerbosity` | enum | `low` | 否 | 错误显示详细程度 |
| `ui.accessibility.screenReader` | boolean | `false` | 是 | 屏幕阅读器纯文本输出 |
| `statusLine.type` | string | `command` | 否 | 自定义状态栏类型 |
| `statusLine.command` | string | `""` | 否 | 状态栏脚本命令 |
| `statusLine.padding` | number | `0` | 否 | 状态栏内边距 |


## 更新与数据

| 键 | 类型 | 缺省 | 重启 | 用途 |
| --- | --- | --- | --- | --- |
| `general.enableAutoUpdate` | boolean | `true` | 否 | 自动更新；仍需可用发行源 |
| `general.enableAutoUpdateNotification` | boolean | `true` | 否 | 显示更新通知 |
| `general.enableNotifications` | boolean | `false` | 否 | 运行事件通知 |
| `privacy.usageStatisticsEnabled` | boolean | `true` | 否 | 使用统计；关闭进入隐私模式，并非停止全部遥测 |
| `general.sessionRetention.enabled` | boolean | `false` | 否 | 自动清理会话 |
| `general.sessionRetention.maxAge` | string | `'30d'` | 否 | 会话保留时长 |
| `general.sessionRetention.maxCount` | number | 未设置 / 由运行时决定 | 否 | 按数量清理的目标上限；不适用于所有对话 JSONL |
| `general.sessionRetention.minRetention` | string | 由 CLI 宿主注入 | 否 | 最短保留期保护 |
| `advanced.useProxyFromEnvironment` | boolean | `true` | 是 | 读取环境中的代理配置 |
| `advanced.excludedEnvVars` | array | `['DEBUG', 'DEBUG_MODE']` | 否 | `qwen mcp list` 启动 MCP 服务器时不传递的环境变量。会话和 `.env` 加载不使用此设置。 |


## 复杂配置与高级边界

`providers`、`mcpServers`、`hooks`、`permissions`、插件市场及 Agent 定义有各自结构，不能用上述标量表替代。按[模型](/zh/users/models/)、[MCP](/zh/users/mcp/)、[Hooks](/zh/users/hooks/)、[权限](/zh/users/permissions/)、[插件](/zh/users/plugins/)和[子 Agent](/zh/users/subagents/)中的示例配置。

配置 schema 定义在源码文件 `packages/resource/src/settings/settingsSchema.ts` 中；它也包含宿主集成、兼容和实验字段（源码仓库中的 `schemas/settings.schema.json` 是为另一个产品构建生成的，不适用于 Qwen Code），不应把字段存在解释为稳定公开功能承诺。不要复制陌生的内部设置来绕过功能限制。模型覆盖、团队协议、调试与运行时注入字段不在本页的用户配置承诺内。
