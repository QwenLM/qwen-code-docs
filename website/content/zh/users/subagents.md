# 子 Agent

子 Agent 让主 Agent 将明确的子任务委派给专门角色。定义描述角色职责、指令、模型偏好与工具范围。模型根据任务和描述决定何时调用可用角色；创建定义本身不会启动任务。

## 查找与重新加载定义

使用 `/agents` 管理 Agent 并查看可用定义。修改磁盘文件后，运行 `/agents reload` 刷新。不要假设文件保存后就已在当前会话生效。

| 来源 | 默认目录 |
| --- | --- |
| 用户级 | `~/.qwen/agents/` |
| 项目级 | `.qwen/agents/` |

项目发现受到信任和配置限制。插件与 `--agents` 参数也可以提供定义。加载顺序为内置、用户、项目、插件、参数/SDK；同名定义以后加载的为准。自定义用户配置根目录会改变用户级位置。

## 定义 Agent

创建 `.qwen/agents/reviewer.md`：

```markdown
---
name: reviewer
description: 检查范围明确的代码变更，寻找正确性问题和测试缺口。
tools: Read, Glob, Grep
model: inherit
maxTurns: 12
---

检查指定变更和相关调用位置。
报告具体缺陷，给出文件位置并说明影响。
不要修改文件，明确哪些内容尚未验证。
```

`name` 和 `description` 均为必填，Markdown 正文作为角色指令。重新加载后，可以提出：“使用 reviewer Agent 检查本次变更。”也可以通过 `qwen --agent reviewer` 以指定 Agent 启动会话。

常用 frontmatter 字段：

| 字段 | 含义 |
| --- | --- |
| `tools` | 纳入的工具名称或受支持的匹配模式 |
| `disallowedTools` | 从可用集合中移除的工具名称 |
| `model` | 模型选择；`inherit` 在启动时继承父任务模型 |
| `effort` | 推理偏好，支持情况取决于所选模型 |
| `maxTurns` | 正整数，最大轮数 |
| `timeoutMins` | 正整数，运行超时分钟数 |
| `skills` | 预加载的 Skill |
| `memory` | 持久记忆范围：`user`、`project` 或 `local` |
| `isolation` | `worktree` 请求独立 Git worktree |
| `background` | 请求后台执行 |
| `permissionMode` | Agent 权限模式，受到运行时校验和策略约束 |

完整定义还支持 Agent 专属 MCP 服务和 Hooks，配置时请结合对应指南。插件提供的定义在注册前还会经过额外的安全字段清理。

## 工具与权限边界

省略 `tools` 会继承调用方当前可用工具。**空数组 `tools: []` 同样表示继承，不表示零工具。** 需要限制工具时，应提供明确白名单。纳入规则支持准确名称、`*`、`mcp__*`、`mcp__server__*` 和 `Agent(name1, name2)`。

对普通工具，`disallowedTools` 按准确名称移除，不解释通配符或 Shell 命令权限表达式。`Agent(name)` 是限制指定 Agent 类型的特殊表达式。实际执行时的权限规则是另一层检查。

最终工具集合还取决于调用方可见范围、前台/后台执行、嵌套层数、记忆支持和权限。子 Agent 不能仅靠声明名称启用调用方不可用的工具。实际行为与定义不符时，请检查最终可用工具和加载错误。

## Agent 持久记忆

`memory: user` 使用 `~/.qwen/agent-memory/<agent-name>/`；`project` 使用 `.qwen/agent-memory/<agent-name>/`；`local` 使用 `.qwen/agent-memory-local/<agent-name>/`。目录包含 `MEMORY.md` 入口及可选主题文件。不希望共享的项目记忆可选 `local`，并将私有本地数据排除在版本控制之外。

记忆支持可能在应用拒绝规则前补充维护记忆所需的文件工具。请检查最终权限，不要默认记忆只读。

若需要继承当前完整对话的后台工作者，而非普通专门角色，请参阅 [`/subtask` 与任务管理](/zh/users/tasks-workflows/)。
