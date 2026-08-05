# Auto-Skill 管理员（Curator）

## 问题

Qwen Code 可以从工具密集的对话中提取可复用的项目 skill，但被接受的 auto-skill
只会累积。现有的审查代理可以创建或更新 `source: auto-skill` 的 skill，并被
明确禁止删除它们。路径门控和 `skills.disabled` 减少了 prompt 噪音，但不维护
磁盘上的 skill 库。

## 范围

为项目 auto-skill 添加一个小型、确定性的生命周期管理器：

- 跟踪目录以 `auto-skill-` 开头且 frontmatter 包含 `source: auto-skill` 的
  项目 skill 的成功调用。
- 一个受管 skill 在 30 天无活动后标记为 stale。
- 在 90 天无活动后，把其整个目录移出 `.qwen/skills/` 到
  `.qwen/archived-skills/` 进行归档。
- 允许单个受管 skill 被固定（pin），免于自动转换。
- 当 Auto Skill 启用且工作空间受信任时，在配置初始化期间至多每 7 天运行
  一次确定性巡检。
- 在交互式、非交互式和 ACP 命令面上暴露 `/curator`、`/curator status`、
  `/curator run [--dry-run]` 和 `/curator pin|unpin|restore <directory>`。

第一个版本不使用 LLM，不合并重叠的 skill，不管理个人/内置/扩展/学习/手工
编写的 skill，不永久删除任何东西，也不引入可配置的阈值。

## 所有权与持久化

curator 只从 `Config.getProjectRoot()` 解析。其状态位于
`<project>/.qwen/skill-curator.json`，归档包位于
`<project>/.qwen/archived-skills/`。没有回退到进程的主工作空间、主目录或
其他活跃会话。这让 daemon 和多工作空间会话保持隔离。

状态以 auto-skill 目录名为键，因为那是被移入移出归档的单位。每条记录存储
frontmatter 中的 skill 名、首次发现时间、最近成功使用、使用次数、生命周期
状态、pin 状态和可选的归档时间。写入通过跨进程锁串行化并原子提交。

损坏的状态是硬性的、非变更性的失败。当持久化的证据无法读取时，curator 不得
推断缺失的用量意味着不活跃。

## 资格与安全

一个目录只有在所有条件都成立时才由 curator 管理：

1. 它是项目 skill 根目录下的直接、非 symlink 目录。
2. 其名称以 `auto-skill-` 开头。
3. 它包含一个常规的、非 symlink 的 `SKILL.md`。
4. 开头的 YAML frontmatter 恰好包含 `source: auto-skill`。

这个双重标记防止 curator 移动手工编写、学习、扩展、内置、个人、格式错误或
符号链接的内容。归档和恢复绝不覆盖现有 skill。目标冲突时只跳过该包，使不
相关的维护可以继续。被归档的目录名在审查 prompt 中显示为保留项，并被其写
权限守卫拒绝，而确认暂存仍然只对活跃 skill 做快照。如果在移动后状态持久化
失败，巡检会尝试在暴露错误之前把每个包移回。

只读 status 和 dry-run 预览在安全模式和不受信任的工作空间中仍然可用。应用
维护巡检、pin、unpin 和恢复需要安全模式之外的受信任工作空间。

## 活动与转换

成功的 Skill 工具或直接 skill 斜杠命令调用会尽力而为地更新符合条件的
auto-skill 记录，即使在自动 skill 生成被禁用时也是如此。这让观察到的活动
独立于控制生成和定时维护的开关。失败、skill 被禁用或被 hook 阻止的调用不
计入。

对于活跃 skill，活动是以下各项的最新值：

- 持久化的最近成功调用；
- 持久化的首次发现时间；
- 持久化的恢复时间；以及
- skill manifest 的修改时间。

包含修改时间可防止最近改进过的 skill 仅仅因为还没有被再次调用就被归档。

每个符合条件 skill 的首次观察会以 `firstSeenAt = now` 播种，而不是从旧的
文件系统时间戳推断不活跃。首次自动观察也会播种 `lastRunAt`，然后等待完整
的 7 天间隔。显式 `/curator run` 绕过该间隔，但保留每个 skill 的首次发现
宽限期；`--dry-run` 报告相同的播种和转换候选，但不移动目录或更改状态。被
pin 的记录在显式 unpin 之前绕过 stale 和 archive 转换。

## 集成点

- `Config.initialize`：在 `SkillManager` 扫描文件系统之前执行到期的确定性
  巡检。
- `SkillTool`：记录受管 skill 的成功调用。
- `SkillCommandLoader` 和交互式/非交互式命令处理器：记录直接的斜杠命令
  成功调用；ACP 复用非交互式处理器。
- `SkillManager`：在手动归档或恢复后使用其现有刷新路径，使模型和斜杠
  命令行立即与磁盘一致。
- `BuiltinCommandLoader`：发布新的 `/curator` 命令。

其他任何消费方都不应写入 curator 状态或移动受管 skill 包。

## 验证

单元测试覆盖资格判定、首次运行播种、stale/archive 阈值、dry-run 非变更、
最近使用保护、最近修改保护、损坏状态的 fail-closed 行为、冲突处理、恢复
和命令面。现有的 Skill 工具测试验证只有成功加载才记录用量。构建和类型检查
覆盖跨包导出和命令注册。
