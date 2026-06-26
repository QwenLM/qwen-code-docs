# 声明式 Agent 定义 —— 从 Claude Code 2.1.168 移植

关于将 Claude Code 的声明式 agent（markdown + YAML frontmatter）模式移植到 qwen-code 的内部设计文档，处理 issue [#4821][i4821] 并与 issue [#4721][i4721] / PR [#4732][p4732] 中的工作流移植协调。

[i4821]: https://github.com/QwenLM/qwen-code/issues/4821
[i4721]: https://github.com/QwenLM/qwen-code/issues/4721
[p4732]: https://github.com/QwenLM/qwen-code/pull/4732

## 实现状态（垂直切片）

PR [#4842][p4842] 当时通过端到端运行时路径发布了这些字段。PR [#4870][p4870] 随后替换了 YAML 解析器以支持块标量。这个后续 PR 在此基础上构建：它替换了 YAML **stringifier**（PR #4870 留下了手工编写的 —— 参见 `docs/yaml-parser-replacement.md`），在 `SubagentConfig` 上暴露了 `mcpServers` + `hooks`，并将它们连接到运行时，以便每个 agent 的 MCP 服务器和钩子在子 agent 运行时实际触发。

| 字段              | 状态                   | 说明                                                                                                                                                               |
| ----------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionMode`  | **已发布 (#4842)**     | 解析时桥接到现有的 qwen `approvalMode`                                                                                                               |
| `maxTurns`        | **已发布 (#4842)**     | 接入现有的 `runConfig.max_turns` 运行时路径                                                                                                              |
| `color` allowlist | **已发布 (#4842)**     | 将现有字段收紧为 CC 的 `_Y` 集合 + `auto` 遗留 sentinel 处理                                                                                          |
| `mcpServers`      | **已发布 (后续)** | 通过 eemeli/`yaml` stringify 实现嵌套 YAML 往返安全；运行时覆盖通过子 agent Config 包装器 + 强制工具注册表重建合并会话和 agent 服务器 |
| `hooks`           | **已发布 (后续)** | 在子 agent 生成时注册临时的 HookRegistry 条目，通过 `onStop` 移除；v1 全局触发（无 agent 作用域过滤器）                                        |
| `effort`          | 延期                | qwen 提供者中尚不存在模型层的 `effort` 参数                                                                                                      |
| `memory`          | 延期                | qwen 的自动内存尚未区分 `user`/`project`/`local` 作用域                                                                                            |
| `isolation`       | 延期                | 工作流 PR #4732 拥有运行时；per-agent 默认值将在该 PR 落地时一同落地                                                                                        |
| `initialPrompt`   | 延期                | 需要 `--agent` CLI 标志（qwen 中无主会话 agent 基础设施）                                                                                                   |
| `skills`          | 延期                | 需要 SkillManager 消费 `config.skills`                                                                                                                |

以下完整的逆向工程记录作为延期字段的设计参考保留 —— 模式常量、DL7/Ig5 语义、错误消息以及与工作流的协调矩阵仍对该工作具有支撑作用。

[p4842]: https://github.com/QwenLM/qwen-code/pull/4842
[p4870]: https://github.com/QwenLM/qwen-code/pull/4870

---

## 阶段 0 — 边界

| 项目               | 值                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 最新上游验证       | Claude Code **2.1.168**（issue #4821 引用 ≥ 2.1.167，我们高出一个版本）                                                       |
| 原生二进制         | `/private/tmp/cc-2.1.168/package/claude` (220 MB)                                                                                       |
| 字符串提取         | `/private/tmp/cc-2.1.168/claude.strings` (~342k 行)                                                                                 |
| 工作树             | `.claude/worktrees/gifted-hamilton-684741`                                                                                              |
| 分支               | `lazzy/gifted-hamilton-684741` 基于 `main @ 45efb1d3a`                                                                                   |
| 范围外             | PR #4732 工作流代码（单独的工作树 `lazzy/lucid-pare-974192`）—— 仅通过接口协调                                    |
| 创作规则           | 作者是 **LaZzyMan**；**不** 在 commit、PR、issue 或评论中包含 `Co-Authored-By` 或 AI 工具跟踪信息（根据 `~/.claude/CLAUDE.md`） |

---

## 阶段 1 — 逆向工程发现

此处所有声明均已独立针对 `claude.strings` 进行 grep 搜索，并经受住了对抗性反驳。置信度级别：**C** = 已确认（直接二进制证据），**I** = 推断（从多个确认事实综合得出），**O** = 开放（仍不确定）。

### 模式 — 15 个字段，经反驳和再次确认

agent frontmatter 影子模式是 `Ig5`，在 `ug5.agent` 内部用于 `tengu_frontmatter_shadow_unknown_key` / `_mismatch` 遥测。**生产加载器是 DL7** (`parseAgentFromMarkdown`)，它执行手工逐字段验证，带有自定义错误消息。一个独立的 **JSON 形式模式 JL7**（由 `fL7` / `parseAgentFromJson` 使用）更严格，但这是一个不同的代码路径（由 `--agents <json>` 和 `settings.agents` 使用）。

| #   | 字段              | 类型 (Ig5 / DL7)                        | 必需 | 默认值        | 枚举 / 约束                                                                                                                       | 确认                                        |
| --- | ----------------- | --------------------------------------- | ---- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | `name`            | 字符串，非空                                   | **是**  | —              | 无 — DL7: `if(!T\|\|typeof T!=="string")return null`                                                                                  | **C** strings:308120, 309074                |
| 2   | `description`     | 字符串，非空                                   | **是**  | —              | JL7: `.min(1, "Description cannot be empty")`                                                                                           | **C** strings:308120, 309074, 309076        |
| 3   | `model`           | 字符串                                  | 否       | undefined      | `inherit`（不区分大小写）正规化为字面量 `"inherit"`；否则直接传递并去除首尾空格                                          | **C** strings:308120, 309075, 309076        |
| 4   | `tools`           | 字符串\|数组 (MDH 联合)               | 否       | undefined      | 单个 token `*` → `undefined` (表示"继承所有")；通过 `AXH`/`FbK` 去重                                                             | **C** strings:308120 (MDH/AXH), 309075      |
| 5   | `disallowedTools` | 字符串\|数组 (MDH)                     | 否       | undefined      | "如果设置了 `tools` 则忽略"（根据描述文本）；由调用者强制执行                                                                    | **C** strings:308120, 309075                |
| 6   | `effort`          | 字符串\|整数                         | 否       | undefined      | 枚举 `GN=["low","medium","high","xhigh","max"]` 或 `int`；别名 `P37={med:"medium"}`                                                    | **C** strings:308120, 309075, GN/P37 内联 |
| 7   | `permissionMode`  | 字符串                                  | 否       | undefined      | 枚举 `$E = Gmq = [...kc]` 其中 `kc=["acceptEdits","auto","bypassPermissions","default","dontAsk","plan"]` (6 个值)                   | **C** strings:307649 (kc), 308120, 309075   |
| 8   | `mcpServers`      | `z.unknown()` (Ig5); `array(jL7)` (JL7) | 否       | undefined      | 每项: 字符串 或 `record(string, MCPServerSpec)`；在 DL7 中逐项 `safeParse`                                                       | **C** strings:308120, 309075, 309076        |
| 9   | `hooks`           | `z.unknown()` (Ig5); `_u()` (JL7)       | 否       | undefined      | 在运行时通过 `TKO` → `_u().safeParse` (settings.json hooks 形状) 延迟验证                                                                   | **C** strings:308120, 309073 (TKO), 309076  |
| 10  | `maxTurns`        | `union(number, string, null)`           | 否       | undefined      | 正整数（由 `W46` 解析 —— 接受数字或数字字符串）                                                                  | **C** strings:308120, 309075 (W46), 309076  |
| 11  | `skills`          | 字符串\|数组 (MDH)                     | 否       | `[]` (已发出) | 通过 `ml(q.skills) = FbK(H) ?? []` 规范化；没有 `*` 通配符（与 `tools` 不同）                                                          | **C** strings:308120, 309075                |
| 12  | `initialPrompt`   | 字符串                                  | 否       | undefined      | 仅空白 → undefined；仅在 agent 是**主会话**时自动提交（通过 `--agent` / settings），作为子 agent 时忽略     | **C** strings:308120, 309075                |
| 13  | `memory`          | 字符串                                  | 否       | undefined      | 枚举 `["user","project","local"]`                                                                                                       | **C** strings:308120, 309075, 309076        |
| 14  | `background`      | 字符串\|布尔 (eiH=EL8)                  | 否       | undefined      | 接受 `true` / `false` / `"true"` / `"false"`；仅真值规范化为 `true`，否则 `undefined`                                     | **C** strings:308120, 309075                |
| 15  | `isolation`       | 字符串                                  | 否       | undefined      | 枚举**仅** `["worktree"]`（不是 `["none","worktree"]` —— 那是背景会话设置的不同模式，位于 strings:313284） | **C** strings:308120, 309075, 309076        |

一个经受住反驳的细微观察：即使 `skills` 是"可选的"，DL7 的 emit 子句是 `...I !== void 0 && {skills: I}` 且 `ml(undefined)` 返回 `[]`（非 undefined），因此当 frontmatter 省略该字段时，**最终发出的记录将携带 `skills: []`**。这会影响下游的相等性检查 —— 为 qwen-code 移植标记。

### 可能的额外字段（超出 15 个）

| #   | 字段       | 类型   | 默认值   | 枚举 / 约束                                                                                                                                                                                                                                                            | 确认                                     |
| --- | ----------- | ------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 16  | **`color`** | 字符串 | undefined | 枚举 `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]`；描述为 `"@internal — display color in the agents UI"`；`_Y` 之外的值在解析时静默丢弃（DL7 发出 `...z && typeof z === "string" && _Y.includes(z) && {color: z}`） | **C** strings:308120, 309075, \_Y 内联 |

这是 #4821 列表之外 **唯一** 新的 agent frontmatter 字段。在 `Ig5` / `JL7` 上搜索但 **未** 找到的字段：`version`、`tags`、`labels`、`category`、`icon`、`alias` / `aliases`、`experimental`、`deprecated`、`owner`、`author`、`homepage`、`displayName`、`shortDescription`（这些全部只出现在 skill 模式 `bg5` 或无关标识符中）。

### 加载器 — 文件和函数映射

| 关注点                                                       | 函数                                                                                                                                                     | 位置               | 确认  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ----- |
| 顶级注册表汇编器                                               | `QL`（导出名 `getAgentDefinitionsWithOverrides`)                                                                                                        | strings:309076         | **C** |
| 文件系统遍历器（与 skills/commands/output-styles 共享）       | `Gm`（通过 `h6` 记忆化）                                                                                                                                     | strings:312887         | **C** |
| 每个 `.md` 发现                                               | `d_q` (= `loadMarkdownFiles`, ripgrep 带有 `--files --hidden --follow --no-ignore --glob *.md`, 3 秒 `AbortSignal.timeout`, 当 `__("true")` 时回退 `wY3`) | strings:312887         | **C** |
| 每个文件解析器 (markdown)                                    | `DL7` (= `parseAgentFromMarkdown`)                                                                                                                           | strings:309074         | **C** |
| 每个文件解析器 (JSON)                                        | `fL7` (= `parseAgentFromJson`), 使用 `JL7` 模式                                                                                                            | strings:309073         | **C** |
| 插件 agent 加载器                                           | `b0_` → 每个目录 `oR7` → 每个文件 `sR7`                                                                                                                       | strings:308780, 308779 | **C** |
| 内置                                                     | `naH()` — 发出 `[JqH=general-purpose, KL7=statusline-setup, …]` 加上隐式的 `YI=fork`                                                                     | strings:309073, 308663 | **C** |
| 覆盖解析器                                             | `DS()` (= `getActiveAgentsFromList`) — 见解析顺序                                                                                                  | strings:309073         | **C** |
| 缓存失效                                            | `u0_()` (= `clearAgentDefinitionsCache`) — 清除 `QL.cache` + `Gm.cache`                                                                                    | strings:309073         | **C** |
| FS 监听器 (chokidar)                                         | `s_T()` → `Q4_=s_T()` 在模块初始化时 (`WB6`)                                                                                                                 | strings:316417         | **C** |

`Gm("agents", _)` 读取三个 baseDirs（`policySettings`、`userSettings`、`projectSettings`），每个都标记在记录上，然后通过 **inode** 去重（丢弃来自符号链接/硬链接的相同 inode 重复项，记录日志 `Skipping duplicate file '<path>' from <source> (same inode already loaded from <firstSource>)`）。遥测：`tengu_dir_search` 包含 `managedFilesFound`、`userFilesFound`、`projectFilesFound`、`projectDirsSearched`、`subdir`。

### 解析顺序 — 明确的优先级

函数 `DS()` 通过 `source` 过滤其输入，然后按固定顺序将数组迭代到一个以 `agentType` 为键的 `Map` 中。由于 `Map.set` 会覆盖，**最后一个被触及的桶获胜**：

```text
[built-in, plugin, userSettings, projectSettings, flagSettings, policySettings]
                                                                       ^
                                                                  highest precedence
```

| 源               | 来源                                                                                                                                                                            | 覆盖优先级 | 确认                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------- |
| `built-in`        | `naH()`（二进制内置）                                                                                                                                                     | 1 (最低)        | **C** strings:309073              |
| `plugin`          | `b0_` → 每个插件 `agentsPath`/`agentsPaths`                                                                                                                                     | 2                 | **C** strings:308780              |
| `userSettings`    | `~/.claude/agents/` (`CLAUDE_CONFIG_DIR` 或 `~/.claude`)                                                                                                                          | 3                 | **C** strings:312887, 307489      |
| `projectSettings` | `<cwd>/.claude/agents/` 加上 `iV_()` 向上遍历到 home 目录 / git 根目录                                                                                                                | 4                 | **C** strings:312887, iV\_ 内联 |
| `flagSettings`    | `--agents <json>` CLI 标志（模式 `qKO = h.record(h.string(), JL7())`)                                                                                                           | 5                 | **C** strings:330190, 309076      |
| `policySettings`  | 系统管理的目录：macOS `/Library/Application Support/ClaudeCode/.claude/agents`，Linux `/etc/claude-code/.claude/agents`，Windows `C:\Program Files\ClaudeCode\.claude\agents` | 6 (最高)       | **C** strings:307649 (H2), 312887 |

冲突 **静默** 解决 —— 仅触发 `tengu_plugin_name_collision` 遥测事件（`winner_source: T.at(-1)`）；不会向用户显示 "X overrides built-in" 警告。（strings:308742 `hMH`。）

细微行为：`iV_()` 从 `cwd` 开始 **从内向外** 遍历，但 Map.set 最后获胜，所以在 projectSettings 中 **外层树的 `.claude/agents/` 优先于内层树**。这令人惊讶 —— 在开放问题中标记。

### Frontmatter 解析器

| 问题                                                   | 答案                                                                                                                                                                                                                                         | 确认                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 使用的库？                                               | **无** —— 手工编写的分割器 `lz` 调用 `Bun.YAML.parse`（通过包装器 `l5H`）。二进制中没有 `gray-matter`、`js-yaml` 或 `front-matter`。                                                                                               | **C** strings:307902 (l5H), 307905 (lz), 110303 (Bun.YAML errors) |
| 正则表达式                                                      | `n5H = /^---\s*\n([\s\S]*?)---\s*\n?/`                                                                                                                                                                                                         | **C** strings:307905                                              |
| 失败处理                                           | YAML 解析失败 → 使用制表符转 2 空格规范化重试；如果仍然失败，以 warn 级别记录 `Failed to parse YAML frontmatter in <file>: <err>` 并返回 `{frontmatter: {}, content: body}`（**永不** 抛出异常）                                     | **C** strings:307905, 151839                                      |
| 正文提取                                            | 关闭 `---` 后的纯字符串切片 `H.slice(K[0].length)`；随后由 `v$H` 规范化（可能去除前导换行）                                                                                                                        | **C** strings:307905                                              |
| 在 agents / skills / commands / output-styles 之间共享？ | **是** —— 相同的 `lz` 被 `Iq_` (skill 加载器)、`f13`（已弃用的命令加载器）以及通过 `Gm` → `d_q` 的 agent 加载器重用                                                                                                                  | **C** strings:312690                                              |
| 模式验证器                                           | **Zod v4**（捆绑）。存在 v4 唯一标记 `looseObject`、`treeifyError`、`prettifyError`、`toJSONSchema`                                                                                                                                   | **C** strings:141270-141395, 141586                               |
| 验证模式                                            | **影子** — `ahH("agent", frontmatter)` 运行 `ug5.agent().strict().safeParse()` **仅用于** 遥测；DL7 忽略结果并继续其自己的逐字段验证。宽松的 frontmatter 对象是运行时的真相来源。 | **C** strings:308120 (ahH/ug5), 309074 (DL7 calls but ignores)    |
| 遥测事件                                           | `tengu_frontmatter_shadow_unknown_key`、`tengu_frontmatter_shadow_mismatch`（通过进程内 `Set A37` 去重）                                                                                                                                 | **C** strings:154634, 154636                                      |
### 接线 — Agent 工具 + CLI 标志

| 层                            | 功能                                                                                                                        | 配置                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 任务/Agent 工具模式 (`$_3`)   | 声明 `subagent_type: string.optional()`；未指定时，回退到 `general-purpose`（如果 `AI()` 返回 true，则回退到 `fork`）         | **C** 字符串:~309220          |
| Subagent 查找                 | `activeAgents.find(a => a.agentType === requestedType)` 对 `toolUseContext.options.agentDefinitions.activeAgents` 进行查找  | **C** 字符串:~309220          |
| 模糊回退                      | `MWK(s) = s.normalize("NFKC").toLowerCase().replace(/[\p{White_Space}\p{Pd}_]+/gu, "")`；模糊匹配 → `AgentTypeError`；清晰重匹配 → `tengu_subagent_type_normalized` | **C** 字符串:~309220          |
| 权限检查                      | `lV_(toolPermissionContext, "Task", agentType)` — 拒绝时 → `Agent type '<x>' has been denied by permission rule 'Task(<x>)' from <source>.` | **C** 字符串:~309220          |
| 系统提示来源                  | Markdown 内容变为 `getSystemPrompt: () => body + ('\n\n' + UVH(agentType, memoryScope) when memory enabled)` — 在解析时捕获闭包 | **C** 字符串:309074-6 (DL7) |
| 主线程渲染                    | `Pp({mainThreadAgentDefinition, …})` — 如果 agent 有 `appendSystemPrompt: true`（捕获全部的内置 `claude`），内容追加到默认提示后；否则 **替换** 默认提示 | **C** 字符串:311015         |
| `--agent <name> ` CLI         | 通过 Commander 声明；动作处理器 `if(I) process.env.CLAUDE_CODE_AGENT = I;` — 存入环境变量，其他地方读取到 `appState.agent`。同时记录在 pid 文件中。 | **C** 字符串:330190, 142138 |
| `--agents <json> ` CLI        | 单独的标志；JSON 记录 `{name: {description, prompt, …}}` 通过 `qKO = h.record(h.string(), JL7())` 验证；加入同一个 `activeAgents` 注册表，`source: flagSettings` | **C** 字符串:330190, 309076 |

### 生命周期 — 冷加载 + 热重载

| 方面                            | 行为                                                                                                                              | 配置                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 冷加载                          | 惰性 — `QL` 通过 `h6`（缓存包装器）记忆化；首次访问读取文件系统 + 插件，后续访问返回缓存结果                                       | **C** 字符串:309076            |
| 热重载机制                      | **chokidar 监听器** `s_T()` 在模块初始化时注册（`WB6`）；监听 `.claude/agents`（用户 + 项目）以及 skills 和 commands 目录         | **C** 字符串:316417            |
| 监听器标志                      | `persistent:true, ignoreInitial:true, depth:2, awaitWriteFinish:{stabilityThreshold,pollInterval}, ignored:(p,s) => s?.isFile() ? !p.endsWith(".md") : false, usePolling:kZ4`（macOS true），事件 `add`/`change`/`unlink` | **C** 字符串:316417            |
| 防抖                            | 300 ms（`l_T = 300`）；处理器调用 `RIH(), Vv(), u0_(), …` — `u0_()` 使 agent 缓存失效                                              | **C** 字符串:316417, 309073   |
| 自适应轮询                      | 活跃时 = `n_T = 2000 ms` 间隔；空闲（无交互 `r_T = 60000 ms`）→ `i_T = 30000 ms`；切换时重新创建 chokidar 实例                    | **C** 字符串:316417            |
| `/agents` 斜杠命令              | 用于管理 agent 的 `local-jsx` UI（库/创建/编辑/删除/运行）— **不是**重新扫描命令                                                   | **C** 字符串:314593            |
| `/reload-plugins` 斜杠命令      | 重新运行 `QL(W8())`，重新统计 agent 数量；覆盖插件来源的 agent（chokidar **不**监听这些）                                          | **C** 字符串:314595, 190948   |
| 其他失效路径                    | `clearSessionCaches`（由 `/clear` 使用）也会调用 `u0_()`                                                                           | **C** 字符串:313246            |

### 未解决问题（阶段 1）

| #  | 问题                                                                                                                                                                                                  | 配置  | 解决路径                                                              |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------- |
| Q1 | `color` 从 #4821 中省略是故意的（它是 `@internal`）还是疏忽？                                                                                                                                         | **O** | 视为 **故意** — 移植该字段但标记为 internal/仅 UI                     |
| Q2 | 宽松的 DL7 行为（background 接受字符串，maxTurns 接受字符串）是文档化的用户功能还是向后兼容的 hack？                                                                                                  | **O** | 为保持一致性而镜像，但在移植文档中发出警告                              |
| Q3 | 为什么 `isolation` 枚举在 agent 中只允许 `["worktree"]`，而后台会话设置模式允许 `["none","worktree"]`？                                                                                                | **O** | 可能 "无隔离" = 省略字段；显式文档化                                  |
| Q4 | `--agents <json> `（flagSettings）是否故意处于优先级 5（高于 project，低于 policy）？                                                                                                                  | **O** | qwen-code 可以在 v1 中跳过该标志，推迟决策                              |
| Q5 | `iV_` 的内层优先推入 + Map.set 最后胜出 → **外层树胜出** 在 projectSettings 冲突中。陷阱还是故意？                                                                                                    | **O** | qwen-code 应选择 **内层胜出** 语义以避免陷阱                            |

---

## 阶段 2 — qwen-code 的实现计划

### 当前状态 — 一段式映射

qwen-code 已经包含了相当完善的子 Agent 基础设施：
`SubagentManager`（`packages/core/src/subagents/subagent-manager.ts`）实现了
在 `.qwen/agents/`（项目）和 `~/.qwen/agents/`（用户）目录下的 Markdown + YAML 前置元数据文件的 CRUD 操作，
由自定义的 YAML 解析器（`packages/core/src/utils/yaml-parser.ts` — 没有 `gray-matter` / `yaml` 依赖，
已通过 `package.json` 确认）支持。`SubagentConfig`
（`packages/core/src/subagents/types.ts:41-122`）已经拥有 `name`、
`description`、`tools`、`disallowedTools`、`approvalMode`、`systemPrompt`、
`model`、`runConfig`、`color`、`background` 字段。`SubagentLevel` 已经支持
五个作用域（session、project、user、extension、builtin），优先级顺序为
`session > project > user > extension > builtin`
（`subagent-manager.ts:189-220`）。Agent 工具
（`packages/core/src/tools/agent/agent.ts`）声明了 `subagent_type` 字段，
并通过 `subagentManager.changeListener` 动态刷新其模式枚举。
在 `packages/core/src/extension/claude-converter.ts:162-220` 中已经存在一个
`convertClaudeAgentConfig()` 桥接函数，包含工具名称映射和
`permissionMode → approvalMode` 映射。**差距**在于：(a) 模式缺少 #4821 中的
8 个字段（`effort`、`permissionMode` 作为一等字段、`mcpServers`、`hooks`、
`maxTurns` 作为顶层字段、`skills`、`initialPrompt`、`memory`、`isolation`）；
(b) 没有 `--agent <name>` CLI 标志；(c) 没有 chokidar 风格的热重载
（扩展风格的失效存在，但不适用于文件系统的 agent）；(d) `maxTurns` 当前嵌套在
`runConfig.max_turns` 下 — 需要根据 #2409 提升到顶层。

### 架构决策

#### D1. 为前置元数据复用现有的 yaml-parser

**决策：** 复用 `packages/core/src/utils/yaml-parser.ts`（已被
`SubagentManager.parseSubagentContent` 和 skill 加载器使用）。
**理由：** Claude Code 的 `lz` 是相同的共享解析器，用于 skills +
commands + agents；qwen-code 已经镜像了该模式。添加 `gray-matter`
或 `js-yaml` 是不必要的改动。现有的解析器处理 `--- … ---`
拆分，并且在输入格式错误时保持静默（匹配 `lz` 的
`warn-and-return-empty` 风格）。

#### D2. 解析/优先级顺序

**决策：** 使用 `session > project (.qwen/agents/) > user (~/.qwen/agents/) >
extension > builtin` — 即 **保持现有的 qwen-code SubagentLevel 顺序，
不要在 v1 中镜像 Claude Code 的 `flagSettings` / `policySettings` 桶**。
**理由：** Claude Code 的 policySettings（托管目录）是 qwen-code 没有的企业部署故事。
标志注入的 agent（`--agents <json> `）是高级用户功能，可以在 P4 中落地。
现有的五级 qwen-code 优先级已经涵盖了 #4821 关心的情况：项目覆盖用户，
用户覆盖内置。`extension` 级别干净地插在用户和内置之间。

#### D3. 验证 — 保留现有的 SubagentValidator

**决策：** 扩展 `SubagentValidator`
（`packages/core/src/subagents/`）以验证八个新字段。**不要**
引入 zod，除非 skillManager 的管道已经使用了它；如果现有的验证器是手动实现的，
则保持手动实现。
**理由：** Claude Code 的 `Ig5` 是只读阴影 — 运行时验证是手动实现的 `DL7`。
匹配该模式保持错误消息的可读性（例如 `Agent file <path> has invalid permissionMode '<x>'. Valid options: …`）
而无需引入另一个依赖。如果 skillManager 已经使用了 zod，则为了保持一致性而跟随该选择 —
在 P1 准备阶段通过阅读 skill 代码决定。

#### D4. 热重载 — 推迟；依赖冷加载 + 显式重载

**决策：** v1 **不** 提供 chokidar 监听器。缓存失效
钩子已经存在（`subagentManager` 有 `changeListener` 和显式的
CRUD 驱动的刷新）。项目级别的重载在会话启动时发生；会话内通过 `/agents` UI 进行的编辑
会使缓存失效。一个 `/reload-agents`（或复用 `/reload-plugins`）斜杠命令
如果用户有需求，可以在 P4 中落地。
**理由：** 通过文件系统监听器进行热重载代价高昂（chokidar 添加了一个轮询
循环，带自适应调度 — 仅 Claude Code 的实现就有约 150 行的簿记代码）。
启动时冷加载对 v1 来说已经足够，并且与当前 `SubagentManager` 的连线方式匹配。
为 P4 打开大门。

#### D5. 连接 `--agent <name>` CLI 标志 — v1 范围内

**决策：** 在 `packages/cli/src/config/config.ts` 的 CliArgs 中添加 `--agent <name>`。
行为：根据已解析的注册表查找，将 agent 设置为主线程 agent，如果名称解析失败则抛出清晰的错误。
匹配 Claude Code 语义（除非 agent 有 `appendSystemPrompt: true`，否则替换默认系统提示）。
不要使用 `CLAUDE_CODE_AGENT` 环境变量间接方式 — qwen-code 的 `Config` 对象可以直接携带它。
**理由：** 这是 #4821 的用户面向句柄 — 没有它，声明式 agent 只能通过 Agent 工具的
`subagent_type` 参数访问，这对于 "设置我的默认 agent" 用例来说过于间接。
`--agents <json> `（复数）可以推迟到 P4。

#### D6. Workflow.agentType 协调 — 接口契约

**决策：** 公开一个稳定的解析器接口，供 PR #4732 的 `createProductionDispatch` 落地时调用。
具体而言：

| 契约                                                                                                                                                                                                                                                                                                      | 负责人                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 前置元数据 `name` 就是 workflow 的 `agentType` 字符串（键相等，区分大小写）                                                                                                                                                                                                                              | 本 PR                |
| Workflow 的硬编码 `disallowedTools` 地板（`[SEND_MESSAGE, EXIT_PLAN_MODE]`，从上游 `Tg8` 镜像；在 PR #4732 中验证为 `ToolNames.SEND_MESSAGE`、`ToolNames.EXIT_PLAN_MODE`）**与 agent 级别的 `disallowedTools` 取并集** — 地板始终应用，即使 agent 定义设置了 `tools`                                        | workflow PR 消费      |
| 每次调用的 `opts.isolation` 覆盖 agent 级别的默认值 `isolation: 'worktree'`                                                                                                                                                                                                                             | workflow PR 消费      |
| agent 定义中的 `model`、`effort`、`permissionMode`、`maxTurns` 在设置时覆盖 workflow 默认值                                                                                                                                                                                                              | workflow PR 消费      |
| Agent 内容成为子 agent 的 `systemPrompt`；当 `agentType` 解析失败时，workflow 的 `WORKFLOW_SUBAGENT_SYSTEM_PROMPT` 作为回退                                                                                                                                                                                | workflow PR 消费      |
| 当 `agentType` 未设置或解析失败时，workflow 回退到内置 workflow 子 agent（优雅，不抛出异常）                                                                                                                                                                                                              | workflow PR 消费      |

**#4721 / #4821 矛盾的解决**（`tools` 与 `disallowedTools` 优先级）：此移植实现 agent 注册表，使得 `disallowedTools` **始终与 `tools` 分开携带**。#4821 表格中 "如果设置了 tools 则忽略" 的规则由 **Agent 工具的调用者强制执行**（即在构建子 agent 的 `ToolConfig` 时），而不是在解析时。这允许 workflow 始终将其地板与 `disallowedTools` 取并集，而与 agent 是否设置 `tools` 无关。Agent 注册表是 **一个纯数据载体**；优先级规则位于调度点。这解决了 #4821 的 "忽略" 规则和 #4721 的 "并集" 规则之间的明显冲突。

**工具名称规范化：** 使用 `ToolNames.SEND_MESSAGE` 和 `ToolNames.EXIT_PLAN_MODE`（已根据 PR #4732 差异验证），从 `packages/core/src/agents/runtime/workflow-orchestrator.ts`（一旦落地）作为命名常量导出。声明式 agent 移植本身不需要导入这些 — 它们是 workflow 的地板，在 workflow 调度点应用。

### 模块布局

| 路径                                                               | 新建 / 修改 | 目的                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/subagents/types.ts`                             | **修改**     | 向 `SubagentConfig` 添加 8 个新字段：`effort`、`permissionMode`（已通过 `approvalMode` 映射 — 两者都保留？参见下面的 D7）、`mcpServers`、`hooks`、`maxTurns`（提升到顶层，弃用 `runConfig.max_turns`）、`skills`、`initialPrompt`、`memory`、`isolation`                                                                                                  |
| `packages/core/src/subagents/subagent-manager.ts`                  | **修改**     | 扩展 `parseSubagentContent` / `serializeSubagent` 以往返新字段；扩展 `SubagentValidator` 调用                                                                                                                                                                                                                                                           |
| `packages/core/src/subagents/subagent-validator.ts`（假定路径）     | **修改**     | 添加逐字段验证，匹配 DL7 的错误消息：`Agent file <path> has invalid permissionMode '<x>'. Valid options: …` 等。                                                                                                                                                                                                                                       |
| `packages/core/src/subagents/agent-frontmatter-schema.ts`          | **新建**     | 枚举常量的单一真实来源：`EFFORT_VALUES`、`PERMISSION_MODE_VALUES`、`MEMORY_VALUES`、`ISOLATION_VALUES`、`COLOR_VALUES`。逐字照搬 Claude Code 2.1.168。                                                                                                                                                                                                  |
| `packages/core/src/subagents/builtin-agents.ts`                    | **修改**     | 新字段默认为 undefined；无行为变更                                                                                                                                                                                                                                                                                                                      |
| `packages/core/src/tools/agent/agent.ts`                           | **修改**     | 在构建子 agent 选项（`model`、`maxTurns`、`permissionMode`、`effort`）时，从已解析的 `SubagentConfig` 读取新字段；为 #4721 填充每个调用的 `isolation` 覆盖语义                                                                                                                                                                                           |
| `packages/cli/src/config/config.ts`                                | **修改**     | 添加 `--agent <name>` 标志；启动时根据 `SubagentManager` 解析；如果名称解析失败则报错                                                                                                                                                                                                                                                                  |
| `packages/cli/src/config/config.test.ts`                           | **修改**     | `--agent` 标志解析 + 错误路径的测试                                                                                                                                                                                                                                                                                                                     |
| `packages/core/src/extension/claude-converter.ts`                  | **修改**     | 在导入 Claude `.md` 文件时添加新字段的映射（`mcpServers`、`hooks`、`maxTurns` 顶层、`memory`、`isolation` 等）                                                                                                                                                                                                                                          |
| `packages/core/src/subagents/agent-frontmatter-schema.test.ts`     | **新建**     | 枚举列表的快照测试；往返解析/序列化测试                                                                                                                                                                                                                                                                                                                 |
| `packages/core/src/subagents/subagent-manager.test.ts`             | **修改**     | 新字段验证、优先级、错误消息的测试                                                                                                                                                                                                                                                                                                                        |
| `packages/core/src/tools/agent/agent.test.ts`                      | **修改**     | 新字段注入子 agent 运行时的测试                                                                                                                                                                                                                                                                                                                          |
| `docs/cli/agents.md`（如果存在）或 `docs/declarative-agents.md`   | **新建**     | 用户面向参考：16 字段模式 + 示例                                                                                                                                                                                                                                                                                                                          |
### D7. `permissionMode` vs `approvalMode` — 桥接，而非替换

**决定：** 在前置元数据中同时接受 `permissionMode`（Claude 兼容）和现有 `approvalMode`（Qwen 兼容）字段。解析时，如果设置了 `permissionMode`，则按照 `claude-converter.ts:195-208` 中的映射表将其映射为 `approvalMode`（`default → default`，`plan → plan`，`acceptEdits → auto-edit`，`dontAsk → default`，`bypassPermissions → yolo`）。如果两者同时存在，`approvalMode` 优先级更高（更符合 qwen-code 的语义），并触发一个 `tengu_frontmatter_shadow_*` 风格的遥测事件，记录两者均被设置。
**理由：** 保持与使用 `approvalMode` 的现有 `.qwen/agents/*.md` 文件的向后兼容性，同时直接接受 Claude Code 的 `permissionMode` 字段，以便用户可以原封不动地使用 Claude Code 的 agent 文件。

### Schema 映射表

| Claude Code 2.1.168 字段 | qwen-code 字段                                    | 适配方式                                                                                                   | 说明                                                                                                    |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `name`                   | `name`                                             | 无                                                                                                           | 相同，必填                                                                                              |
| `description`            | `description`                                      | 无                                                                                                           | 相同，必填                                                                                              |
| `model`                  | `model`                                            | 接受 `inherit`、`fast`、`haiku`、`sonnet`、`opus` 或 `authType:model-id` 格式                                | qwen-code 已支持更广泛的词汇；`inherit` 为新增                                                                      |
| `tools`                  | `tools`                                            | 接受 string 或 array；`*` → undefined（继承所有）                                                          | 已支持 array；新增 string 及 `*` 处理                                                                    |
| `disallowedTools`        | `disallowedTools`                                  | 接受 string 或 array；**始终与 `tools` 分开存储**                                                             | 优先级规则（#4821 "若设置了 tools 则忽略此字段"）由**调用方**而非解析器强制执行                    |
| `effort`                 | `effort`（新增）                                   | 枚举值 `low/medium/high/xhigh/max` 以及整数；别名 `med → medium`                                             | 运行时效果取决于 qwen 实现（若存在现有 thinking-effort 旋钮则映射，否则仅存储并忽略） |
| `permissionMode`         | `permissionMode`（新增）+ 桥接至 `approvalMode` | 枚举值 `acceptEdits/auto/bypassPermissions/default/dontAsk/plan`；映射表见 D7 决议                           | 直接接受 Claude 格式                                                                                    |
| `mcpServers`             | `mcpServers`（新增）                              | 数组，元素为 string 或 `{name: spec}`；逐项验证，剔除无效项并发出警告                                        | 在 P4 阶段接入 MCP 运行时                                                                               |
| `hooks`                  | `hooks`（新增）                                   | 对象，匹配 settings.json 中的 hooks 结构                                                                     | 在 P4 阶段接入 hooks 运行时                                                                             |
| `maxTurns`               | `maxTurns`（新增顶层字段）                         | 正整数；接受数字字符串以保持一致性                                                                           | **从 `runConfig.max_turns` 提升**；保留嵌套形式作为已弃用的别名                                          |
| `skills`                 | `skills`（新增）                                  | 技能名称数组；也接受逗号分隔的字符串                                                                         | 运行时：当 agent 启动时通过 skillManager 预加载                                                          |
| `initialPrompt`          | `initialPrompt`（新增）                           | 字符串；仅空白字符 → undefined；仅当 agent 作为主会话时才生效                                                | 通过 `--agent` 标志路径接入                                                                              |
| `memory`                 | `memory`（新增）                                  | 枚举值 `user/project/local`；从 `.qwen/agent-memory/<name>/` 等位置加载                                      | 在 P4 阶段运行                                                                                           |
| `background`             | `background`                                       | 接受布尔值或字符串 `"true" / "false"`；仅真值 → true                                                        | 已支持；放宽解析规则                                                                                    |
| `isolation`              | `isolation`（新增）                                | 枚举**仅** `["worktree"]`                                                                                    | 运行时由 workflow PR（#4732 P3+）负责；注册表仅承载该字段                                |
| `color`（未公开特性 #16） | `color`                                            | 枚举值 `["red","blue","green","yellow","purple","orange","pink","cyan"]`；超出列表的值被静默丢弃 | 已在 qwen `SubagentConfig` 中；收紧验证以匹配 Claude Code 白名单                 |

### TDD 测试计划

| 测试块                        | 测试文件                                | 断言内容                                                                                                                                                                                        |
| ---------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| schema 枚举常量             | `agent-frontmatter-schema.test.ts`（新增） | `EFFORT_VALUES`、`PERMISSION_MODE_VALUES`、`MEMORY_VALUES`、`ISOLATION_VALUES`、`COLOR_VALUES` 与 Claude Code 2.1.168 逐字节一致（快照）                                                     |
| 解析器 — 快乐路径          | `subagent-manager.test.ts`               | 使用所有 16 个字段对 `.qwen/agents/test.md` 进行往返解析 → 生成的记录具有期望的形状                                                                                                             |
| 解析器 — 必填字段验证     | `subagent-manager.test.ts`               | 缺少 `name` 返回 null 并记录警告日志；缺少 `description` 返回 null 并记录警告日志                                                                                                              |
| 解析器 — 枚举值验证        | `subagent-manager.test.ts`               | 错误的 `permissionMode` / `memory` / `isolation` / `effort` / `color` 分别发出特定警告（匹配 DL7 措辞），并将该字段丢弃                                                                        |
| 解析器 — 宽松字段类型     | `subagent-manager.test.ts`               | `background: "true"` → `true`；`maxTurns: "5"` → `5`；`effort: "med"` → `"medium"`；`tools: "Read,Edit"` → `["Read","Edit"]`；`tools: "*"` → undefined                                        |
| 解析器 — color 白名单     | `subagent-manager.test.ts`               | `color: "magenta"` 被静默丢弃（不报错），`color: "blue"` 被保留                                                                                                                               |
| Skills 字段的特殊处理    | `subagent-manager.test.ts`               | 省略 `skills` 导致 `skills: []`（匹配 Claude Code DL7 的 emit 行为）                                                                                                                          |
| 解析优先级（resolution）        | `subagent-manager.test.ts`               | 项目和用户中存在同名 agent → 项目优先；用户和内置中存在同名 → 用户优先；扩展和内置中存在同名 → 扩展优先                                                                                        |
| Inode 去重                  | `subagent-manager.test.ts`               | 两个路径指向同一个 inode（符号链接）→ 仅保留一条记录，发出日志                                                                                                                                 |
| permissionMode 桥接        | `subagent-manager.test.ts`               | `permissionMode: bypassPermissions` → 解析后得到 `approvalMode: yolo`；两者均设置 → `approvalMode` 胜出 + 遥测事件                                                                              |
| `--agent` CLI 标志          | `packages/cli/src/config/config.test.ts` | 标志设置主线程 agent；未解析的名称抛出错误 `Agent type '<x>' not found. Available agents: …`                                                                                                    |
| Agent 工具模糊回退       | `agent.test.ts`                          | `subagent_type: "Test_Engineer"` 通过 NFKC 小写规范化解析到已注册的 `test-engineer`                                                                                                              |
| Agent 工具未找到的错误      | `agent.test.ts`                          | 未解析的 `subagent_type` → 错误消息匹配 `Agent type '<x>' not found. Available agents: <list>`                                                                                                  |
| Workflow 契约              | `agent-frontmatter-schema.test.ts`       | 导出的 `getAgentByName(name)` 接口返回完整的 `SubagentConfig`，包括 `isolation`、`disallowedTools`、`model`、`effort`、`permissionMode`、`maxTurns`（可被 workflow PR #4732 使用） |

### 分阶段 PR 计划

| 阶段  | 标题                                                                                                                          | 范围                                                                                                                                              | 阻塞项                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **P1** | `feat(core): declarative agent schema fields (effort, permissionMode, maxTurns top-level, memory, isolation, color allowlist)` | 向 `SubagentConfig` 添加字段；扩展解析器 + 验证器 + 序列化器；弃用 `runConfig.max_turns`；添加枚举常量模块；测试          | 无                              |
| **P2** | `feat(core): wire new agent fields into Agent tool runtime`                                                                    | 将 `model`、`effort`、`maxTurns`、`permissionMode`/`approvalMode` 桥接接入 `AgentTool.execute()` → `AgentHeadless.create()` 调用点；测试 | P1                              |
| **P3** | `feat(cli): --agent flag for main-thread agent selection`                                                                       | 向 `CliArgs` 添加 `--agent <name>`；启动时解析；错误路径；测试                                                                           | P1                              |
| **P4** | （可选，范围蔓延）`feat(core): mcpServers + hooks + skills + initialPrompt + memory runtime`                             | 将四个 "v1 中仅为元数据" 的字段接入实际运行时效果                                                                                                     | P1，以及 skill/MCP/hook 子系统 |

每个 PR 的目标行数增量 ≤ 800（测试代码除外）；P1 最大，约 600 行验证器 + 测试。

---

## 阶段 3 — 与 workflow 移植（#4721 / PR #4732）的协调矩阵

| 声明式 agent 特性                                               | Workflow 交互                                                                                                                                                                      | 责任人                                                              | 阻塞项                                        |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------- |
| `name` 字段作为注册表键                                       | Workflow 的 `opts.agentType` 查找字符串（[#4721][i4721] 显式说明）                                                                                                                    | **本 PR** 定义注册表契约；**workflow PR** 消费 | 无 — 注册表形状可以先稳定                     |
| agent 上的 `disallowedTools` 字段                                    | Workflow 与硬编码底层 `[SEND_MESSAGE, EXIT_PLAN_MODE]` 取并集（依据 [#4721][i4721] §2 — 已与 PR #4732 diff 核对：`ToolNames.SEND_MESSAGE`、`ToolNames.EXIT_PLAN_MODE`）   | **本 PR** 携带字段；**workflow PR** 在分发时取并集       | workflow PR #4732 P3 发布                     |
| agent 上的 `tools` 字段                                                 | Workflow 原样传递给子 agent 的 `ToolConfig.tools`                                                                                                                                 | **本 PR** 携带字段；**workflow PR** 接入                   | workflow PR #4732 P3                           |
| agent 上的 `model` 字段                                                 | Workflow 的 `opts.model` 按调用覆盖；agent 的 `model` 为默认值                                                                                                                         | **本 PR** 携带字段；**workflow PR** 解决优先级      | workflow PR #4732 P3                           |
| agent 上的 `effort` 字段                                                | Workflow 调用点覆盖优先；agent 默认值作为回退                                                                                                                             | **本 PR** 携带字段；**workflow PR** 解决                 | workflow PR #4732 P3                           |
| agent 上的 `permissionMode` 字段                                        | 在分发时映射为子 agent 的 approvalMode；workflow 调用点覆盖优先                                                                                                                | **本 PR** 通过 D7 桥接携带字段；**workflow PR** 接入     | workflow PR #4732 P3                           |
| agent 上的 `maxTurns` 字段                                              | 当 agent 设置此字段时，替换 workflow 硬编码的 `WORKFLOW_SUBAGENT_MAX_TURNS = 50`                                                                                             | **本 PR** 携带字段；**workflow PR** 解决优先级      | workflow PR #4732 P3                           |
| agent 上的 `isolation: 'worktree'` 字段                                 | 默认值；每次调用的 `opts.isolation` 覆盖（[#4721][i4721] §3）                                                                                                                       | **本 PR** 携带字段；**workflow PR** 拥有运行时             | workflow PR #4732 P3+（当前在 P1 中抛出） |
| agent 上的 `initialPrompt` 字段                                         | Workflow **不**使用此字段（仅当 agent 通过 `--agent` 作为主会话时才触发）                                                                                                     | **本 PR** + **CLI**                                               | 无（独立）                              |
| `memory`、`mcpServers`、`hooks`、`skills`                              | Workflow 无特殊处理，仅传递至子 agent 运行时                                                                                                            | **本 PR** 携带字段；运行时接入在 P4 / 未来           | 未来 PR                                    |
| `EXCLUDED_TOOLS_FOR_SUBAGENTS` 更新                                 | Workflow PR #4732 将 `WORKFLOW` 加入集合（根据 issue/PR 上下文发现 — 但对抗性反驳指出这在 `main` 分支的 `agent-core.ts` 中尚不存在，仅在工作树中存在） | **workflow PR** 负责；本 PR 不受影响                             | 无                                           |
| 用于 workflow 底层工具名的规范形式（`ToolNames.SEND_MESSAGE`） | 本 PR 不导入底层常量；仅按原样携带 `disallowedTools` 字符串。规范转换由 workflow PR 负责。                                              | **workflow PR**                                                     | workflow PR #4732                              |
| 发布顺序                                                         | 本 PR（P1+P2+P3）独立于 workflow 发布。Workflow PR #4732 P3 依赖本 PR 的可导入的 `getAgentByName()` 类解析器。                                      | 并行直到 workflow 的 P3 阶段                                      | workflow P3 从本 PR 的导出中读取       |

**无循环阻塞：** 本 PR 和 workflow PR 可以在各自的 P1/P2 阶段并行发布。它们在 workflow-P3 阶段同步，后者需要本 PR 的注册表解析器。如果本 PR 先发布，workflow-P3 从它读取。如果 workflow PR 先发布，它将使用现有的 `subagent_type` 查找（未找到时返回 workflow 默认值），并在本 PR 发布后切换到更丰富的解析器。

---

## 阶段 4 — 风险和未决问题

### 风险

| #   | 风险                                                                                                                                                                                                | 缓解措施                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Claude Code 小版本（2.1.168 → 2.1.x）之间的 schema 漂移                                                                                                                                                    | 将枚举常量模块固定为 "已验证与 2.1.168 一致" 并添加文档注释；作为 `feature-reverse` 技能的一部分，在新版本发布时重新运行字符串 grep 检查 |
| R2  | `runConfig.max_turns` → 顶层 `maxTurns` 是对现有 `.qwen/agents/*.md` 文件的破坏性 schema 变更                                                                                     | 保留嵌套形式作为已弃用的别名，提供单周期弃用；解析时发出警告，在 CHANGELOG 中记录                                                     |
| R3  | `permissionMode` ↔ `approvalMode` 往返转换有损（Claude 有 6 种模式，qwen 约有 4 种）                                                                                                            | 按照 D7 显式双向映射；在双重设置时发出遥测；**不**在保存时静默重写                                                             |
| R4  | 新字段（`hooks`、`mcpServers`、`skills`、`memory`）在注册表中携带但 v1 无运行时效果 → 用户可能设置它们却静默地得不到任何效果                                                     | 明确记录 v1 范围；当 agent 的 "已携带但未运行时" 字段非空时，每个 agent 仅发出一次信息日志                                          |
| R5  | 对抗性验证指出 `EXCLUDED_TOOLS_FOR_SUBAGENTS` 在 `main` 分支上**不**包含 `WORKFLOW` — 这可能意味着 workflow 移植尚未合并，或缺少递归扇出保护                                                     | 与 workflow PR 作者（LaZzyMan = 自己）确认保护随 PR #4732 发布，而非此移植                                                           |
| R6  | Q5 中提到的 "外树胜内树" 的 projectSettings 行为如果被镜像将是一个陷阱                                                                                    | qwen-code 显式选择**内层优先**；通过 R5 fixture 测试                                                                                              |
| R7  | 字段 `color` 在二进制文件的描述文本中标记为 `@internal` — 我们可能移植了 Anthropic 显式不支持的特性                                                        | 移植它，但在 qwen-code 文档中也标记为 `@internal`；仅视为 UI 特性；不在面向用户的参考文档中展示                                                 |
### 未决问题 — 建议解决方案

| #   | 问题                                                                                                                                                         | 决议                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | #4821 中 `color` 的遗漏是有意的吗？                                                                                                                          | **视为有意为之**。移植该字段；不要在面向用户的文档中提及，除非注明“内部可用”。                                                                                                                                                                                                                                                                                |
| Q2  | 宽松的 DL7 行为：记录还是 hack？                                                                                                                             | **镜像它**。接受 `background: "true"`、`maxTurns: "5"`、`effort: "med"` 以保持一致性，即使未文档化。添加测试。                                                                                                                                                                                                                                                  |
| Q3  | 为什么隔离枚举在 agent schema 和 background-session schema 之间不同？                                                                                         | **在代码注释中记录差异**；“无隔离”= 字段省略，而不是枚举值。                                                                                                                                                                                                                                                                                                |
| Q4  | `--agents <json>`（复数，flagSettings）是否应纳入 v1？                                                                                                             | **推迟到 P4**。CLI 面向高级用户；v1 仅提供 `--agent <name>`（单数），这正是 #4821 所关心的。                                                                                                                                                                                                                                                                 |
| Q5  | 嵌套的 `.qwen/agents/` 中内部树与外部树的优先级？                                                                                                                 | **最内层优先**。覆盖 Claude Code 意外的外部优先行为。在 P1 中添加测试夹具。                                                                                                                                                                                                                                                                                        |
| Q6  | `tools` 与 `disallowedTools` 的优先级：#4821 说“如果设置了 tools 则忽略”；#4721 说“与工作流底线取并集”                                                                  | **注册表是哑数据**。解析器独立保留两个字段。优先级规则存在于分发点（Agent 工具/工作流）。解决了矛盾。                                                                                                                                                                                                                                                             |
| Q7  | 工作流 disallowedTools 底线的工具名称规范形式 — 根据 PR #4732 验证为 `ToolNames.SEND_MESSAGE`、`ToolNames.EXIT_PLAN_MODE`                                           | **不是本 PR 的关注点** — 由工作流 PR 负责。仅在协调矩阵中记录。                                                                                                                                                                                                                                                                                                  |
| Q8  | #2409 的关闭决议是否影响任何内容？                                                                                                                             | **继承 #2409 的“将 model 和 maxTurns 提升到顶层”指导**。已融入本计划。                                                                                                                                                                                                                                                                                          |
| Q9  | 在 qwen-code 现有的 `SubagentLevel` 优先级中，`extension` 级别的 agent 应该保持在 `builtin` 之上（当前）还是之下（Claude Code 没有对应概念）？                           | **保持 `extension > builtin`**。扩展是用户安装的；内置是供应商默认的。用户安装的优先。                                                                                                                                                                                                                                                                         |
| Q10 | 问题 #4821、#4721、#4732 是否完全指定了本文档提议的契约？                                                                                                          | **在 #4821 上发布协调评论**，链接本文档，总结逐字段的决策，并要求维护者确认：(a) 与 Claude Code 2.1.168 的 16 个字段的 schema 一致性，(b) D7 `permissionMode`/`approvalMode` 桥接，(c) D2 优先级顺序，(d) 注册表作为哑数据解决 `tools`/`disallowedTools` 矛盾的方案。                                                                                           |

### 协调行动项

| #   | 行动                                                                               | 位置                                                        |
| --- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| A1  | 将逐字段总结 + 5 项决策发布到 #4821 以获取维护者确认                                     | 在 #4821 上评论                                               |
| A2  | 从 #4721 交叉链接本文档，注明阶段 3 矩阵                                                | 在 #4721 上评论                                               |
| A3  | 一旦此移植的 P1 完成，提醒 #4732 切换到更丰富的解析器                                        | 在 PR #4732 上评论（准备好时）                                    |
| A4  | 针对下一个 Claude Code 小版本重新运行字符串 grep 以检测 schema 漂移                           | `feature-reverse` skill cron 作业（在此之前手动执行）               |