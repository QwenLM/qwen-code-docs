# Fork Profile

## 摘要

在 #8066 引入的 fork 执行允许名单之上，添加一个项目级的命名 profile
层。调用方可以传递 `fork_profile: "<name>"` 而不是重复 `fork_tools`；
运行时在启动时一次性解析 `.qwen/fork-profiles/<name>.md`，并把得到的
工具列表送入既有的执行闸门。

本阶段不添加新的授权机制。解析出的 profile 必须与等价的内联
`fork_tools` 调用行为完全一致。

## 文件格式

Profile 位于活跃项目根目录下：

```text
.qwen/fork-profiles/<name>.md
```

每个文件包含 YAML frontmatter：

```markdown
---
name: ro-research
tools:
  - read_file
  - grep_search
  - glob
  - mcp__search__*
promptHint: |
  Work read-only. Prefer targeted searches and report evidence.
---
```

`name` 和 `tools` 是必需的。`promptHint` 可选，限制为 200 字符。请求的
名称、文件名和 frontmatter 名称必须一致。名称为 2–50 个字符，只包含字
母、数字、连字符或下划线，且不以分隔符开头或结尾。Profile 文件只含
frontmatter；非空 Markdown 正文会被拒绝，以免指引被静默丢弃。Profile
必须解析为项目 profile 目录内的常规文件，且不能超过 64 KiB。

`tools` 字段使用与 `fork_tools` 完全相同的契约。空列表仍是全部拒绝，裸
`*` 无效，MCP 通配语法不变。

本阶段项目作用域是唯一的查找作用域。用户级 profile、作用域优先级、内
建 profile、profile 列表和管理 UI 都被推迟。Safe mode 和 bare mode 拒
绝项目 profile，因为它们是本地定制。AUTO 模式把
`.qwen/fork-profiles/` 下的写入视为自我修改，因此它们不能使用正常的工
作空间内编辑快路径。

## 启动解析

`fork_profile` 仅与 `subagent_type: "fork"` 一起有效，不能与
`fork_tools` 或命名 teammate 组合。Agent 调用在构建 fork 运行时之前解
析 profile：

1. 在构建文件系统路径之前校验请求的逻辑名称。
2. 读取匹配的项目 profile 并严格解析其 YAML frontmatter。
3. 校验文件名/frontmatter 身份和工具允许名单。
4. 把解析出的 profile 绑定到一个启动快照，并向 AUTO 模式分类暴露其生
   效工具和 prompt 提示。
5. 传递克隆的工具列表作为 `ToolConfig.executionAllowedTools`。
6. 当存在 `promptHint` 时，把它追加到 fork 任务指令中父级派生的可缓存
   前缀之后。项目控制的文本被转义，并作为指令之后的指引框定，而权威的
   执行限制仍保持在最后。

缺失或无效的 profile 会在创建 agent 运行时、hooks、后台注册表条目或
transcript sidecar 之前使启动失败。

## 运行时与复活

既有的执行闸门仍是权威的。Profile 解析既不改变模型可见的声明，也不为
允许的工具绕过正常权限。

解析出的工具列表（而不是 profile 名称或路径）是启动时策略。既有的
`AgentMeta.executionAllowedTools` sidecar 存储它，包括空的拒绝一切列
表。冷复活把该快照重新应用到当前活跃的工具表面，而不会重新读取启动后
可能已变化的 profile。

启动任务 prompt 已经是 fork transcript 的一部分，因此解析出的 prompt
提示跟随既有的 transcript/复活路径，无需第二次 profile 查找。

## 边界

本阶段不添加 shell 参数模式、overlay 文件系统、`/btw` 集成、自动反思/
swarm 编排、用户级 profile 或 profile CRUD UI。

Fork profile 是调用方便利和项目控制的 prompt 层，不是管理员强制的沙
箱。它们只能收窄从父级继承的可执行表面。
