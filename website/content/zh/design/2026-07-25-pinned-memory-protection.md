# 固定（pinned）托管内存保护

## 问题

托管自动内存会在项目和用户内存根目录之下递归发现有效的 markdown 主题，受
现有索引限制约束。自动提取和 Dream 整合代理可以在其允许的内存根目录内写
入或编辑路径，因此手工整理的文件可能像自动生成的内存一样被覆盖或整合。

递归扫描器已经能发现 `pinned/` 之下的有效文件；缺失的行为是在自动化内存
维护期间的确定性变更保护。

## 选定设计

把托管内存根目录内的顶层 `pinned/` 目录视为受保护：不被自动提取变更，并
排除在 Dream 整合之外：

- 保持有效的 pinned 文档可被正常内存回忆读取，并可被现有索引器在其正常
  限制下发现。
- 当请求路径在词法上位于 `pinned/` 之下时，拒绝自动提取和 fork 出的 Dream
  的 `write_file` 与 `edit` 操作。
- 对保留的顶层目录名进行大小写不敏感匹配，使拒绝列表在大小写不敏感的文件
  系统上不会失败放行。
- 同时拒绝通过 symlink 解析到 `pinned/` 内部的别名。
- 保留现有的只读 shell 闸门，它已经拒绝 `rm` 和所有其他变更性 shell 命令。
- 教会自动提取和 Dream 提示词保持 pinned 文档不变，并避免故意移除其现有
  索引条目，受正常索引限制约束。

路径检查对字面路径和解析后路径都进行大小写不敏感比较。字面包含保护了
`pinned/` 目录本身是 symlink 的情况。解析后包含防止内存中其他位置看似可写
的路径通过 symlink 指回 `pinned/` 内部。

保护是现有内存作用域代理配置上的一个显式选项，由自动提取和 fork 出的
Dream 规划器启用。这覆盖了会话后提取、定时 Dream 以及工作空间内存 Dream
端点的调用方。显式的 remember 操作保留其当前行为。

## 范围边界

- 不改变扫描器或索引器的生产行为：递归发现已经以现有 frontmatter schema
  处理项目和用户的 `pinned/` 文档。
- 不新增 frontmatter 字段，也不自动创建该目录。
- 没有 `/memory` UI 指示器。
- 显式的 `/forget` 请求保留其当前行为。
- 这个基于路径的边界不检测到 pinned 文件的既有硬链接别名。自动内存 worker
  无法用 `write_file` 或 `edit` 创建它们，其只读 shell 策略也阻止 `ln`；
  更强的威胁模型需要单独的基于 inode 的策略。
- 可见的 `/dream` 斜杠命令轮次会收到共享的跳过提示词规则，但本变更不为它
  增加确定性的工具闸门。斜杠命令在主 Agent 上执行，而主 Agent 没有现有的
  每轮次权限覆盖；添加那将是一个单独的跨面权限设计。
- Fork 出的 Dream 仍然仅限项目内存，因为其现有的作用域配置排除了全局用户
  内存根目录。
- 自动提取继续覆盖项目和全局用户内存两个根目录，因此两个顶层 `pinned/`
  目录获得相同保护。

## 受影响文件

- `packages/core/src/memory/paths.ts`
- `packages/core/src/memory/memory-scoped-agent-config.ts`
- `packages/core/src/memory/dreamAgentPlanner.ts`
- `packages/core/src/memory/extractionAgentPlanner.ts`
- 同目录的内存权限、提示词和索引测试
- `docs/users/features/memory.md`

## 开放问题

可见的 `/dream` 斜杠命令是否必须获得同样的确定性闸门，仍是一个维护者范围
决策。如果需要，应当实现为通用的每轮次权限覆盖，而不是围绕一个异步工具
循环去改动整个会话的权限管理器。
