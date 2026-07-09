# 声明式 Agent 定义 — 移植自 Claude Code 2.1.168

内部设计文档，用于将 Claude Code 的声明式 agent（markdown + YAML frontmatter）schema 移植到 qwen-code，解决 issue [#4821][i4821]，并与 issue [#4721][i4721] / PR [#4732][p4732] 中的 workflow 移植工作进行协调。

[i4821]: https://github.com/QwenLM/qwen-code/issues/4821
[i4721]: https://github.com/QwenLM/qwen-code/issues/4721
[p4732]: https://github.com/QwenLM/qwen-code/pull/4732

## 实现状态（垂直切片）

PR [#4842][p4842] 当时发布了这些字段，并提供了端到端的运行时路径。随后，PR [#4870][p4870] 替换了 YAML 解析器以支持块标量（block scalars）。本后续 PR 建立在这两者的基础之上：它替换了 YAML **stringifier**（PR #4870 保留了手工实现的版本——参见 `docs/design/yaml-parser-replacement.md`），在 `SubagentConfig` 上暴露了 `mcpServers` + `hooks`，并将它们连接到运行时，以便在 subagent 运行时实际触发每个 agent 的 MCP servers 和 hooks。

| 字段 | 状态 | 备注 |
| --- | --- | --- |
| `permissionMode` | **shipped (#4842)** | 在解析时桥接到现有的 qwen `approvalMode` |
| `maxTurns` | **shipped (#4842)** | 接入现有的 `runConfig.max_turns` 运行时路径 |
| `color` allowlist | **shipped (#4842)** | 将现有字段收紧为 CC 的 `_Y` 集合 + `auto` 遗留哨兵值处理 |
| `mcpServers` | **shipped (follow-up)** | 通过 eemeli/`yaml` stringify 实现嵌套 YAML 往返安全；运行时覆盖通过 subagent Config 包装器合并 session + agent servers，并强制重建 tool-registry |
| `hooks` | **shipped (follow-up)** | 在 subagent 生成时注册临时 HookRegistry 条目，通过 `onStop` 移除；v1 全局触发（无 agent 作用域过滤） |
| `effort` | deferred | qwen providers 中尚不存在模型层的 `effort` 参数 |
| `memory` | deferred | qwen 的 auto-memory 尚无 `user`/`project`/`local` 作用域区分 |
| `isolation` | deferred | workflow PR #4732 负责运行时；每个 agent 的默认值将在该 PR 落地时一并落地 |
| `initialPrompt` | deferred | 需要 `--agent` CLI flag（qwen 中尚无 main-session-agent 基础设施） |
| `skills` | deferred | 需要 SkillManager 消费 `config.skills` |

下面的完整逆向工程记录被保留作为延迟字段的参考设计——schema 常量、DL7/Ig5 语义、错误信息以及与 workflow 的协调矩阵对于该项工作仍然至关重要。

[p4842]: https://github.com/QwenLM/qwen-code/pull/4842
[p4870]: https://github.com/QwenLM/qwen-code/pull/4870

---

## 阶段 0 — 边界

| 项目 | 值 |
| --- | --- |
| 已验证的最新上游版本 | Claude Code **2.1.168**（issue #4821 引用 ≥ 2.1.167，我们高一个版本） |
| 原生二进制文件 | `/private/tmp/cc-2.1.168/package/claude` (220 MB) |
| 提取的字符串 | `/private/tmp/cc-2.1.168/claude.strings`（约 342k 行） |
| Worktree | `.claude/worktrees/gifted-hamilton-684741` |
| 分支 | 基于 `main @ 45efb1d3a` 的 `lazzy/gifted-hamilton-684741` |
| 超出范围 | PR #4732 workflow 代码（独立的 worktree `lazzy/lucid-pare-974192`）—— 仅通过接口进行协调 |
| 编写规则 | 作者为 **LaZzyMan**；根据 `~/.claude/CLAUDE.md` 的规定，在 commits、PRs、issues 或 comments 中 **禁止** 使用 `Co-Authored-By` 或 AI 工具相关的 trailers |

---

## 阶段 1 — 逆向工程发现

此处的所有声明均已针对 `claude.strings` 进行了独立的 grep 验证，并经受住了对抗性反驳。置信度级别：**C** = 已确认（直接的二进制证据），**I** = 已推断（从多个已确认的事实中综合得出），**O** = 待定（仍不确定）。

### Schema — 15 个字段，经过反驳与重新确认

agent frontmatter 的 shadow schema 是 `Ig5`，在 `ug5.agent` 内部用于 `tengu_frontmatter_shadow_unknown_key` / `_mismatch` 遥测。**生产环境的 loader 是 `DL7`**（`parseAgentFromMarkdown`），它执行手工实现的逐字段验证并带有自定义错误信息。另一个独立的 **JSON 格式 schema `JL7`**（由 `fL7` / `parseAgentFromJson` 使用）更为严格，但属于不同的代码路径（用于 `--agents <json>` 和 `settings.agents`）。

| # | 字段 | 类型 (Ig5 / DL7) | 是否必填 | 默认值 | 枚举 / 约束 | 置信度 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `name` | 字符串，非空 | **是** | — | 无 — DL7: `if(!T\|\|typeof T!=="string")return null` | **C** strings:308120, 309074 |
| 2 | `description` | 字符串，非空 | **是** | — | JL7: `.min(1, "Description cannot be empty")` | **C** strings:308120, 309074, 309076 |
| 3 | `model` | 字符串 | 否 | undefined | `inherit`（不区分大小写）规范化为字面量 `"inherit"`；否则直接传递并去除首尾空格 | **C** strings:308120, 309075, 309076 |
| 4 | `tools` | string\|array (MDH union) | 否 | undefined | 单个 token `*` → `undefined`（表示“继承所有”）；通过 `AXH`/`FbK` 复制 | **C** strings:308120 (MDH/AXH), 309075 |
| 5 | `disallowedTools` | string\|array (MDH) | 否 | undefined | “如果设置了 `tools` 则忽略”（根据 describe 文本）；由调用方强制执行 | **C** strings:308120, 309075 |
| 6 | `effort` | string\|integer | 否 | undefined | 枚举 `GN=["low","medium","high","xhigh","max"]` 或 `int`；别名 `P37={med:"medium"}` | **C** strings:308120, 309075, GN/P37 inline |
| 7 | `permissionMode` | 字符串 | 否 | undefined | 枚举 `$E = Gmq = [...kc]`，其中 `kc=["acceptEdits","auto","bypassPermissions","default","dontAsk","plan"]`（6 个值） | **C** strings:307649 (kc), 308120, 309075 |
| 8 | `mcpServers` | `z.unknown()` (Ig5); `array(jL7)` (JL7) | 否 | undefined | 每个元素：string 或 `record(string, MCPServerSpec)`；在 DL7 中逐元素进行 `safeParse` | **C** strings:308120, 309075, 309076 |
| 9 | `hooks` | `z.unknown()` (Ig5); `_u()` (JL7) | 否 | undefined | 在运行时通过 `TKO` → `_u().safeParse` 进行延迟验证（settings.json hooks 结构） | **C** strings:308120, 309073 (TKO), 309076 |
| 10 | `maxTurns` | `union(number, string, null)` | 否 | undefined | 正整数（由 `W46` 解析 — 接受数字或数字字符串） | **C** strings:308120, 309075 (W46), 309076 |
| 11 | `skills` | string\|array (MDH) | 否 | `[]` (输出) | 通过 `ml(q.skills) = FbK(H) ?? []` 规范化；无 `*` 通配符（与 `tools` 不同） | **C** strings:308120, 309075 |
| 12 | `initialPrompt` | 字符串 | 否 | undefined | 仅包含空白 → undefined；仅当 agent 是 **main session** 时自动提交（通过 `--agent` / settings），作为 subagent 时忽略 | **C** strings:308120, 309075 |
| 13 | `memory` | 字符串 | 否 | undefined | 枚举 `["user","project","local"]` | **C** strings:308120, 309075, 309076 |
| 14 | `background` | string\|bool (eiH=EL8) | 否 | undefined | 接受 `true` / `false` / `"true"` / `"false"`；仅 truthy 值规范化为 `true`，否则为 `undefined` | **C** strings:308120, 309075 |
| 15 | `isolation` | 字符串 | 否 | undefined | 枚举 **仅限** `["worktree"]`（**不是** `["none","worktree"]` — 那是 strings:313284 处用于 background-session 设置的另一个 schema） | **C** strings:308120, 309075, 309076 |

经受住反驳的细微观察：尽管 `skills` 是“可选的”，但 DL7 的输出子句是 `...I !== void 0 && {skills: I}`，且 `ml(undefined)` 返回 `[]`（非 undefined），因此**即使 frontmatter 中省略了该字段，最终输出的记录也会包含 `skills: []`**。这会影响下游的相等性检查——在 qwen-code 移植中需要注意标记此问题。

### 15 个字段之外可能的额外字段

| # | 字段 | 类型 | 默认值 | 枚举 / 约束 | 置信度 |
| --- | --- | --- | --- | --- | --- |
| 16 | **`color`** | 字符串 | undefined | 枚举 `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]`；描述为 `"@internal — display color in the agents UI"`；在解析时，`_Y` 之外的值会被静默丢弃（DL7 输出 `...z && typeof z === "string" && _Y.includes(z) && {color: z}`） | **C** strings:308120, 309075, \_Y inline |
这是 #4821 列表之外**唯一**新增的 agent frontmatter 字段。在 `Ig5` / `JL7` 上搜索但**未**找到的字段包括：`version`、`tags`、`labels`、`category`、`icon`、`alias` / `aliases`、`experimental`、`deprecated`、`owner`、`author`、`homepage`、`displayName`、`shortDescription`（这些字段仅出现在 skill schema `bg5` 或不相关的标识符中）。

### Loader — 文件与函数映射

| 职责 | 函数 | 位置 | 置信度 |
| --- | --- | --- | --- |
| 顶层注册表组装器 | `QL`（导出名称 `getAgentDefinitionsWithOverrides`） | strings:309076 | **C** |
| 文件系统遍历器（与 skills/commands/output-styles 共享） | `Gm`（通过 `h6` 进行记忆化） | strings:312887 | **C** |
| 每个 `.md` 文件的发现 | `d_q`（即 `loadMarkdownFiles`，使用 ripgrep 并带有 `--files --hidden --follow --no-ignore --glob *.md` 参数，3 秒 `AbortSignal.timeout`，当 `__("true")` 时回退到 `wY3`） | strings:312887 | **C** |
| 单文件解析器（Markdown） | `DL7`（即 `parseAgentFromMarkdown`） | strings:309074 | **C** |
| 单文件解析器（JSON） | `fL7`（即 `parseAgentFromJson`），使用 `JL7` schema | strings:309073 | **C** |
| 插件 agent 加载器 | `b0_` → 每目录 `oR7` → 每文件 `sR7` | strings:308780, 308779 | **C** |
| 内置项 | `naH()` — 发出 `[JqH=general-purpose, KL7=statusline-setup, …]` 以及隐式的 `YI=fork` | strings:309073, 308663 | **C** |
| 覆盖解析器 | `DS()`（即 `getActiveAgentsFromList`）— 参见解析顺序 | strings:309073 | **C** |
| 缓存失效 | `u0_()`（即 `clearAgentDefinitionsCache`）— 清除 `QL.cache` + `Gm.cache` | strings:309073 | **C** |
| 文件系统监听器（chokidar） | `s_T()` → 模块初始化时 `Q4_=s_T()`（`WB6`） | strings:316417 | **C** |

`Gm("agents", _)` 读取三个 baseDirs（`policySettings`、`userSettings`、`projectSettings`），每个都标记在记录上，然后按 **inode** 去重（丢弃来自符号链接/硬链接的相同 inode 重复项，并记录日志 `Skipping duplicate file '<path>' from <source> (same inode already loaded from <firstSource>)`）。遥测：`tengu_dir_search` 包含 `managedFilesFound`、`userFilesFound`、`projectFilesFound`、`projectDirsSearched`、`subdir`。

### 解析顺序 — 最终优先级

函数 `DS()` 根据 `source` 过滤输入，然后将一个固定顺序的数组迭代到一个以 `agentType` 为键的 `Map` 中。由于 `Map.set` 会覆盖，**最后被处理的桶获胜**：

```text
[built-in, plugin, userSettings, projectSettings, flagSettings, policySettings]
                                                                       ^
                                                                  最高优先级
```

| 来源 | 出处 | 覆盖优先级 | 置信度 |
| --- | --- | --- | --- |
| `built-in` | `naH()`（硬编码在二进制文件中） | 1（最低） | **C** strings:309073 |
| `plugin` | `b0_` → 每个插件的 `agentsPath`/`agentsPaths` | 2 | **C** strings:308780 |
| `userSettings` | `~/.claude/agents/`（`CLAUDE_CONFIG_DIR` 或 `~/.claude`） | 3 | **C** strings:312887, 307489 |
| `projectSettings` | `<cwd>/.claude/agents/` 加上 `iV_()` 向上遍历至主目录 / git 根目录 | 4 | **C** strings:312887, iV\_ inline |
| `flagSettings` | `--agents <json>` CLI 标志（schema `qKO = h.record(h.string(), JL7())`） | 5 | **C** strings:330190, 309076 |
| `policySettings` | 系统管理的目录：macOS `/Library/Application Support/ClaudeCode/.claude/agents`，Linux `/etc/claude-code/.claude/agents`，Windows `C:\Program Files\ClaudeCode\.claude\agents` | 6（最高） | **C** strings:307649 (H2), 312887 |

冲突会被**静默**解决 — 仅触发 `tengu_plugin_name_collision` 遥测事件（`winner_source: T.at(-1)`）；不会向用户显示“X 覆盖了内置项”的警告。（strings:308742 `hMH`。）

细微行为：`iV_()` 从 `cwd` 向上遍历时采用**最内层优先**，但由于 Map.set 是最后写入者胜出，因此在 projectSettings 中，**外层树的 `.claude/agents/` 会覆盖内层树**。这有些出人意料 — 在开放问题中标记。

### Frontmatter 解析器

| 问题 | 答案 | 置信度 |
| --- | --- | --- |
| 使用了什么库？ | **无** — 手工编写的分割器 `lz` 调用 `Bun.YAML.parse`（通过包装器 `l5H`）。二进制文件中没有 `gray-matter`、`js-yaml` 或 `front-matter`。 | **C** strings:307902 (l5H), 307905 (lz), 110303 (Bun.YAML errors) |
| 正则表达式 | `n5H = /^---\s*\n([\s\S]*?)---\s*\n?/` | **C** strings:307905 |
| 失败处理 | YAML 解析失败 → 使用 tab 转 2 空格规范化进行重试；如果仍然失败，在 warn 级别记录日志 `Failed to parse YAML frontmatter in <file>: <err>` 并返回 `{frontmatter: {}, content: body}`（**绝不**抛出异常） | **C** strings:307905, 151839 |
| 正文提取 | 在闭合的 `---` 之后进行纯字符串切片 `H.slice(K[0].length)`；随后由 `v$H` 规范化（可能是去除前导换行符） | **C** strings:307905 |
| 在 agents / skills / commands / output-styles 之间共享？ | **是** — 相同的 `lz` 被 `Iq_`（skill 加载器）、`f13`（已弃用的 commands 加载器）以及通过 `Gm` → `d_q` 的 agent 加载器复用 | **C** strings:312690 |
| Schema 验证器 | **Zod v4**（已打包）。存在 v4 专属标记 `looseObject`、`treeifyError`、`prettifyError`、`toJSONSchema` | **C** strings:141270-141395, 141586 |
| 验证模式 | **影子模式** — `ahH("agent", frontmatter)` **仅**为遥测运行 `ug5.agent().strict().safeParse()`；DL7 忽略该结果并继续执行其自身的逐字段验证。宽松的 frontmatter 对象是运行时的真实数据源。 | **C** strings:308120 (ahH/ug5), 309074 (DL7 calls but ignores) |
| 遥测事件 | `tengu_frontmatter_shadow_unknown_key`、`tengu_frontmatter_shadow_mismatch`（通过进程内 `Set A37` 去重） | **C** strings:154634, 154636 |

### 连接 — Agent 工具 + CLI 标志

| 层级 | 功能 | 置信度 |
| --- | --- | --- |
| Task/Agent 工具 schema (`$_3`) | 声明 `subagent_type: string.optional()`；省略时回退到 `general-purpose`（如果 `AI()` 返回 true 则回退到 `fork`） | **C** strings:~309220 |
| 子 agent 查找 | 针对 `toolUseContext.options.agentDefinitions.activeAgents` 执行 `activeAgents.find(a => a.agentType === requestedType)` | **C** strings:~309220 |
| 模糊回退 | `MWK(s) = s.normalize("NFKC").toLowerCase().replace(/[\p{White_Space}\p{Pd}_]+/gu, "")`；模糊匹配 → `AgentTypeError`；清晰重新匹配 → `tengu_subagent_type_normalized` | **C** strings:~309220 |
| 权限门控 | `lV_(toolPermissionContext, "Task", agentType)` — 拒绝时 → `Agent type '<x>' has been denied by permission rule 'Task(<x>)' from <source>.` | **C** strings:~309220 |
| System-prompt 来源 | Markdown 正文变为 `getSystemPrompt: () => body + ('\n\n' + UVH(agentType, memoryScope) when memory enabled)` — 在解析时捕获闭包 | **C** strings:309074-6 (DL7) |
| 主线程渲染 | `Pp({mainThreadAgentDefinition, …})` — 如果 agent 具有 `appendSystemPrompt: true`（兜底的 `claude` 内置项），正文将追加到默认值；否则**替换**默认值 | **C** strings:311015 |
| `--agent <name>` CLI | 通过 Commander 声明；action 处理器 `if(I) process.env.CLAUDE_CODE_AGENT = I;` — 塞入环境变量，在其他地方读取到 `appState.agent` 中。同时记录在 pid 文件中。 | **C** strings:330190, 142138 |
| `--agents <json>` CLI | 独立的标志；JSON 记录 `{name: {description, prompt, …}}` 由 `qKO = h.record(h.string(), JL7())` 验证；以 `source: flagSettings` 加入相同的 `activeAgents` 注册表 | **C** strings:330190, 309076 |
### 生命周期 — 冷加载 + 热重载

| 方面                          | 行为                                                                                                                                                                                                                  | 配置                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 冷加载                       | 懒加载 — `QL` 通过 `h6`（缓存包装器）进行记忆化；首次访问读取文件系统 + 插件，后续访问返回缓存                                                                                               | **C** 字符串:309076         |
| 热重载机制            | **chokidar watcher** `s_T()` 在模块初始化时注册（`WB6`）；监听 `.claude/agents`（用户 + 项目）以及 skills + commands 目录                                                                                      | **C** 字符串:316417         |
| Watcher 配置项                   | `persistent:true, ignoreInitial:true, depth:2, awaitWriteFinish:{stabilityThreshold,pollInterval}, ignored:(p,s) => s?.isFile() ? !p.endsWith(".md") : false, usePolling:kZ4` (macOS true), events `add`/`change`/`unlink` | **C** 字符串:316417         |
| 防抖                        | 300 ms (`l_T = 300`)；处理函数调用 `RIH(), Vv(), u0_(), …` — `u0_()` 使 agent 缓存失效                                                                                                                              | **C** 字符串:316417, 309073 |
| 自适应轮询                | 活跃状态 = `n_T = 2000 ms` 间隔；空闲状态（`r_T = 60000 ms` 内无交互）→ `i_T = 30000 ms`；切换时重新创建 chokidar 实例                                                                                   | **C** 字符串:316417         |
| `/agents` 斜杠命令         | 用于管理 agents 的 `local-jsx` UI（Library/create/edit/delete/run）— **不是**重新扫描命令                                                                                                                             | **C** 字符串:314593         |
| `/reload-plugins` 斜杠命令 | 重新运行 `QL(W8())`，重新计算 agents 数量；覆盖来自插件的 agents（chokidar **不**监听这些）                                                                                                                         | **C** 字符串:314595, 190948 |
| 其他失效路径        | `clearSessionCaches`（由 `/clear` 使用）也会调用 `u0_()`                                                                                                                                                                 | **C** 字符串:313246         |

### 待确认问题（Phase 1）

| #   | 问题                                                                                                                                  | 配置  | 解决路径                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------- |
| Q1  | #4821 中遗漏 `color` 是有意为之（因为它是 `@internal`）还是疏忽？                                                            | **O** | 视为**有意为之** — 移植该字段但标记为 internal/UI-only  |
| Q2  | 宽松的 DL7 行为（background 接受字符串，maxTurns 接受字符串）是文档中记录的用户可见特性，还是向后兼容的 hack？ | **O** | 保持一致进行镜像处理，但在移植文档中发出警告                             |
| Q3  | 为什么 `isolation` 枚举 `["worktree"]` 仅用于 agents，而 background-session 设置 schema 却接受 `["none","worktree"]`？        | **O** | 可能是“无隔离” = 省略字段；需明确记录              |
| Q4  | `--agents <json>`（flagSettings）有意设置在优先级 5（高于 project，低于 policy）吗？                                    | **O** | qwen-code 可以在 v1 中跳过该 flag，推迟决定                   |
| Q5  | `iV_` 的最内层优先 push + Map.set 后发制人 → 对于 projectSettings 冲突，**外层树获胜**。是坑还是有意为之？           | **O** | qwen-code 应选择**最内层获胜**语义以避免该坑 |

---

## Phase 2 — qwen-code 实现计划

### 当前状态 — 一段式概览

qwen-code 已经提供了大量的 subagent 基础设施：
`SubagentManager`（`packages/core/src/subagents/subagent-manager.ts`）实现了对 `.qwen/agents/`（项目级）和 `~/.qwen/agents/`（用户级）中 markdown+YAML frontmatter 文件的 CRUD 操作，底层由自定义 YAML 解析器（`packages/core/src/utils/yaml-parser.ts` — 无 `gray-matter` / `yaml` 依赖，已由 `package.json` 确认）支持。`SubagentConfig`（`packages/core/src/subagents/types.ts:41-122`）已包含 `name`、`description`、`tools`、`disallowedTools`、`approvalMode`、`systemPrompt`、`model`、`runConfig`、`color`、`background`。`SubagentLevel` 已支持五个作用域（session、project、user、extension、builtin），优先级为 `session > project > user > extension > builtin`（`subagent-manager.ts:189-220`）。Agent tool（`packages/core/src/tools/agent/agent.ts`）声明了 `subagent_type`，并通过 `subagentManager.changeListener` 动态刷新其 schema 枚举。`packages/core/src/extension/claude-converter.ts:162-220` 中已存在一个 `convertClaudeAgentConfig()` 桥接函数，包含 tool-name 映射和 `permissionMode → approvalMode` 映射。**差距**在于：(a) schema 缺少 #4821 中的 8 个字段（`effort`、作为一等公民的 `permissionMode`、`mcpServers`、`hooks`、作为顶层的 `maxTurns`、`skills`、`initialPrompt`、`memory`、`isolation`）；(b) 没有 `--agent <name>` CLI flag；(c) 没有 chokidar 风格的热重载（存在 extension 风格的失效机制，但不适用于文件系统 agents）；(d) `maxTurns` 目前嵌套在 `runConfig.max_turns` 下 — 需要根据 #2409 将其提升为顶层。

### 架构决策

#### D1. 复用现有的 yaml-parser 处理 frontmatter

**决策：** 复用 `packages/core/src/utils/yaml-parser.ts`（已被 `SubagentManager.parseSubagentContent` 和 skill loader 使用）。
**理由：** Claude Code 的 `lz` 是用于 skills + commands + agents 的同一个共享解析器；qwen-code 已经镜像了该模式。引入 `gray-matter` 或 `js-yaml` 是不必要的改动。现有解析器处理 `--- … ---` 分割，并对格式错误的输入保持静默（符合 `lz` 的 `warn-and-return-empty` 策略）。

#### D2. 解析 / 优先级顺序

**决策：** 使用 `session > project (.qwen/agents/) > user (~/.qwen/agents/)
> extension > builtin` — 即**保留现有的 qwen-code SubagentLevel 顺序，在 v1 中不要镜像 Claude Code 的 `flagSettings`/`policySettings` 桶**。
**理由：** Claude Code 的 policySettings（托管目录）是企业级部署场景，qwen-code 目前没有。通过 flag 注入的 agents（`--agents <json>`）是高级用户特性，可以放到 P4。现有的五级 qwen-code 优先级已经涵盖了 #4821 关注的场景：project 覆盖 user 覆盖 built-in。`extension` 级别可以干净地插入到 user 和 > builtin 之间。

#### D3. 校验 — 保留现有的 SubagentValidator

**决策：** 扩展 `SubagentValidator`（`packages/core/src/subagents/`）以校验这 8 个新字段。**不要**引入 zod，除非 skillManager 的 pipeline 已经在使用它；如果现有的校验器是手写的，就保持手写。
**理由：** Claude Code 的 `Ig5` 仅在 shadow 模式下使用 — 运行时校验是手写的 `DL7`。匹配该模式可以保持错误信息易读（例如 `Agent file <path> has invalid permissionMode '<x>'. Valid options: …`），而无需引入另一个依赖。如果 skillManager 已经使用了 zod，则为了保持一致性遵循该选择 — 待 P1 准备阶段阅读 skill 代码后确定（TBD）。

#### D4. 热重载 — 推迟；依赖冷加载 + 显式重载

**决策：** v1 **不**提供 chokidar watcher。缓存失效钩子已存在（`subagentManager` 具有 `changeListener` 和显式的 CRUD 驱动刷新）。项目级重载在 session 启动时发生；session 内通过 `/agents` UI 的编辑会触发失效。如果存在用户需求，`/reload-agents`（或搭载在 `/reload-plugins` 上）斜杠命令可以放到 P4。
**理由：** 通过 FS watcher 实现热重载成本很高（chokidar 增加了一个带有自适应调度的轮询循环 — 仅 Claude Code 的实现就有约 150 行状态管理代码）。启动时冷加载对 v1 来说完全足够，并且符合当前 `SubagentManager` 的接线方式。为 P4 敞开大门。

#### D5. 接入 `--agent <name>` CLI flag — v1 范围内

**决策：** 将 `--agent <name>` 添加到 `packages/cli/src/config/config.ts` 的 CliArgs 中。行为：根据已解析的 registry 进行查找，将该 agent 设置为主线程 agent，如果名称无法解析则抛出明确的错误。匹配 Claude Code 语义（替换默认 system prompt，除非 agent 具有 `appendSystemPrompt: true`）。不要使用 `CLAUDE_CODE_AGENT` 环境变量间接传递 — qwen-code 的 `Config` 对象可以直接携带它。
**理由：** 这是 #4821 面向用户的入口 — 没有它，声明式 agents 只能通过 Agent tool 的 `subagent_type` 参数访问，这对于“设置我的默认 agent”用例来说太间接了。`--agents <json>`（复数）可以推迟到 P4。

#### D6. Workflow.agentType 协调 — 接口契约

**决策：** 暴露一个稳定的 resolver 接口，以便 PR #4732 的 `createProductionDispatch` 在合入时可以调用。具体而言：

| 契约                                                                                                                                                                                                                                                                                                     | 负责方                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Frontmatter 的 `name` **就是** workflow 的 `agentType` 字符串（键相等，区分大小写）                                                                                                                                                                                                                         | 本 PR              |
| Workflow 硬编码的 `disallowedTools` 底线（`[SEND_MESSAGE, EXIT_PLAN_MODE]`，镜像自上游 `Tg8`；在 PR #4732 中验证为 `ToolNames.SEND_MESSAGE`、`ToolNames.EXIT_PLAN_MODE`）与 agent 级别的 `disallowedTools` 取**并集** — 底线始终应用，即使 agent 定义中设置了 `tools` | workflow PR 消费 |
| 每次调用的 `opts.isolation` 覆盖每个 agent 的 `isolation: 'worktree'` 默认值                                                                                                                                                                                                                                | workflow PR 消费 |
| 设置时，agent 定义中的 `model`、`effort`、`permissionMode`、`maxTurns` 覆盖 workflow 默认值                                                                                                                                                                                                    | workflow PR 消费 |
| Agent body 成为 subagent 的 `systemPrompt`；当 `agentType` 无法解析时，workflow 的 `WORKFLOW_SUBAGENT_SYSTEM_PROMPT` 作为回退                                                                                                                                                             | workflow PR 消费 |
| 当 `agentType` 未设置或解析失败时，workflow 回退到内置的 workflow subagent（优雅降级，不抛出异常）                                                                                                                                                                                        | workflow PR 消费 |
**#4721 / #4821 冲突的解决**（`tools` 与 `disallowedTools` 的优先级）：此次移植对 agent registry 进行了改写，使得 `disallowedTools` **始终与 `tools` 分开携带**。#4821 表格中“如果设置了 tools 则忽略”的规则由 **Agent-tool 的调用方**（即在构建 subagent 的 `ToolConfig` 时）来**强制执行**，而不是在解析时执行。这使得 workflow 始终能将其基础集合（floor）与 `disallowedTools` 取并集，而无需考虑 agent 是否设置了 `tools`。agent registry 只是一个**纯粹的数据载体**；优先级规则存在于调度点（dispatch site）。这解决了 #4821 的“忽略”规则与 #4721 的“并集”规则之间表面上的冲突。

**Tool 名称规范化：** 使用 `ToolNames.SEND_MESSAGE` 和 `ToolNames.EXIT_PLAN_MODE`（已对照 PR #4732 的 diff 验证），一旦合入，它们将作为命名常量从 `packages/core/src/agents/runtime/workflow-orchestrator.ts` 导出。declarative-agents 的移植本身不需要导入这些——它们是 workflow 的基础集合，在 workflow 调度点应用。

### 模块布局

| 路径                                                               | 新增 / 修改 | 用途                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/subagents/types.ts`                             | **修改**   | 在 `SubagentConfig` 中添加 8 个新字段：`effort`、`permissionMode`（已通过 `approvalMode` 映射——是否保留两者？见下文 D7）、`mcpServers`、`hooks`、`maxTurns`（提升为顶层字段，废弃 `runConfig.max_turns`）、`skills`、`initialPrompt`、`memory`、`isolation` |
| `packages/core/src/subagents/subagent-manager.ts`                  | **修改**   | 扩展 `parseSubagentContent` / `serializeSubagent` 以支持新字段的双向转换（round-trip）；扩展 `SubagentValidator` 调用                                                                                                                                                            |
| `packages/core/src/subagents/subagent-validator.ts`（假设路径） | **修改**   | 添加与 DL7 错误信息匹配的逐字段验证：`Agent file <path> has invalid permissionMode '<x>'. Valid options: …` 等。                                                                                                                                       |
| `packages/core/src/subagents/agent-frontmatter-schema.ts`          | **新增**       | 枚举常量的唯一真实来源（Single source of truth）：`EFFORT_VALUES`、`PERMISSION_MODE_VALUES`、`MEMORY_VALUES`、`ISOLATION_VALUES`、`COLOR_VALUES`。完全镜像 Claude Code 2.1.168。                                                                                           |
| `packages/core/src/subagents/builtin-agents.ts`                    | **修改**   | 新字段默认为 undefined；无行为变更                                                                                                                                                                                                                      |
| `packages/core/src/tools/agent/agent.ts`                           | **修改**   | 在构建 subagent 选项时从解析后的 `SubagentConfig` 中读取新字段（`model`、`maxTurns`、`permissionMode`、`effort`）；为 #4721 引入 `isolation` 的每次调用覆盖语义                                                                              |
| `packages/cli/src/config/config.ts`                                | **修改**   | 添加 `--agent <name>` 标志；在启动时通过 `SubagentManager` 进行解析；如果名称无法解析则报错                                                                                                                                                                    |
| `packages/cli/src/config/config.test.ts`                           | **修改**   | `--agent` 标志解析 + 错误路径的测试                                                                                                                                                                                                                          |
| `packages/core/src/extension/claude-converter.ts`                  | **修改**   | 在导入 Claude `.md` 文件时添加新字段的映射（`mcpServers`、`hooks`、`maxTurns` 提升为顶层、`memory`、`isolation` 等）                                                                                                                                   |
| `packages/core/src/subagents/agent-frontmatter-schema.test.ts`     | **新增**       | 枚举列表的快照测试；解析/序列化的双向转换测试                                                                                                                                                                                                           |
| `packages/core/src/subagents/subagent-manager.test.ts`             | **修改**   | 新字段验证、优先级、错误信息的测试                                                                                                                                                                                                                |
| `packages/core/src/tools/agent/agent.test.ts`                      | **修改**   | 新字段接入 subagent 运行时的测试                                                                                                                                                                                                                        |
| `docs/cli/agents.md`（如果存在）或 `docs/declarative-agents.md`   | **新增**       | 面向用户的参考文档：16 个字段的 schema + 示例                                                                                                                                                                                                                         |

### D7. permissionMode 与 approvalMode —— 桥接而非替换

**决策：** 在 frontmatter 中同时接受 `permissionMode`（兼容 Claude）和现有的 `approvalMode`（兼容 qwen）。在解析时，如果设置了 `permissionMode`，则使用 `claude-converter.ts:195-208` 中的现有表格将其映射为 `approvalMode`（`default → default`、`plan → plan`、`acceptEdits → auto-edit`、`dontAsk → default`、`bypassPermissions → yolo`）。如果两者同时存在，则 `approvalMode` 优先（对 qwen-code 更具体），并发出一个 `tengu_frontmatter_shadow_*` 风格的遥测事件，注明两者均已设置。**理由：** 保持与现有使用 `approvalMode` 的 `.qwen/agents/*.md` 的向后兼容性，同时原样接受 Claude Code 的 `permissionMode`，以便用户可以直接放入 Claude Code 的 agent 文件而无需修改。

### Schema 映射表

| Claude Code 2.1.168 字段  | qwen-code 字段                                    | 适配                                                                                                   | 备注                                                                                                    |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `name`                     | `name`                                             | 无                                                                                                         | 相同，必填                                                                                      |
| `description`              | `description`                                      | 无                                                                                                         | 相同，必填                                                                                      |
| `model`                    | `model`                                            | 接受 `inherit`、`fast`、`haiku`、`sonnet`、`opus` 或 `authType:model-id`                                  | qwen-code 已支持更广泛的词汇；`inherit` 为新增                                      |
| `tools`                    | `tools`                                            | 接受 string\|array；`*` → undefined (继承全部)                                                          | 已作为 array 支持；新增 string + `*` 处理                                                    |
| `disallowedTools`          | `disallowedTools`                                  | 接受 string\|array；**始终与 `tools` 分开携带**                                             | 优先级规则（#4821 “如果设置了 tools 则忽略”）由**调用方**强制执行，而非解析器                    |
| `effort`                   | `effort`（新增）                                     | 枚举 `low/medium/high/xhigh/max` + 整数；别名 `med → medium`                                             | 运行时效果是 qwen 特有的（如果存在则映射到现有的 thinking-effort 旋钮，否则存储并忽略） |
| `permissionMode`           | `permissionMode`（新增）+ 桥接至 `approvalMode` | 枚举 `acceptEdits/auto/bypassPermissions/default/dontAsk/plan`；映射表见 D7                         | 原样接受 Claude 格式                                                                            |
| `mcpServers`               | `mcpServers`（新增）                                 | (string \| `{name: spec}`) 的数组；逐项验证，丢弃无效条目并警告                           | 在 P4 中接入 MCP 运行时                                                                            |
| `hooks`                    | `hooks`（新增）                                      | 匹配 settings.json hooks 结构的对象                                                                    | 在 P4 中接入 hook 运行时                                                                           |
| `maxTurns`                 | `maxTurns`（新增顶层字段）                         | 正整数；接受数字字符串以保持对等                                                           | **从 `runConfig.max_turns` 提升**；保留嵌套形式作为废弃别名                             |
| `skills`                   | `skills`（新增）                                     | skill 名称的数组；也接受逗号分隔的字符串                                                   | 运行时：在 agent 启动时通过 skillManager 预加载                                                      |
| `initialPrompt`            | `initialPrompt`（新增）                              | 字符串；仅包含空白 → undefined；仅在 agent 为主会话时触发                                   | 通过 `--agent` 标志路径接入                                                                            |
| `memory`                   | `memory`（新增）                                     | 枚举 `user/project/local`；从 `.qwen/agent-memory/<name>/` 等路径加载                                      | 运行时在 P4 中实现                                                                                            |
| `background`               | `background`                                       | 接受 bool 或字符串 `"true"/"false"`；仅 truthy → true                                                   | 已支持；放宽解析规则                                                                    |
| `isolation`                | `isolation`（新增）                                  | 枚举**仅限** `["worktree"]`                                                                                 | 运行时由 workflow PR (#4732 P3+) 负责；registry 仅携带该字段                                |
| `color`（未文档化 #16） | `color`                                            | 枚举 `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]`；超出范围的值被静默丢弃 | 已在 qwen `SubagentConfig` 中；收紧验证以匹配 Claude Code 允许列表                      |
### TDD 测试计划

| 模块                         | 测试文件                                 | 断言内容                                                                                                                                                                                                  |
| ---------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema 枚举常量              | `agent-frontmatter-schema.test.ts` (new) | `EFFORT_VALUES`、`PERMISSION_MODE_VALUES`、`MEMORY_VALUES`、`ISOLATION_VALUES`、`COLOR_VALUES` 与 Claude Code 2.1.168 逐字节匹配（快照）                                                                  |
| 解析器 — 正常路径            | `subagent-manager.test.ts`               | 往返解析包含所有 16 个字段的 `.qwen/agents/test.md` → 输出的记录具有预期的结构                                                                                                                            |
| 解析器 — 必填字段            | `subagent-manager.test.ts`               | 缺少 `name` 返回 null 并记录 warn 日志；缺少 `description` 返回 null 并记录 warn 日志                                                                                                                     |
| 解析器 — 枚举校验            | `subagent-manager.test.ts`               | 错误的 `permissionMode` / `memory` / `isolation` / `effort` / `color` 会分别触发特定的 warn 日志（符合 DL7 措辞），并丢弃该字段                                                                           |
| 解析器 — 宽松字段类型        | `subagent-manager.test.ts`               | `background: "true"` → `true`；`maxTurns: "5"` → `5`；`effort: "med"` → `"medium"`；`tools: "Read,Edit"` → `["Read","Edit"]`；`tools: "*"` → undefined                                                    |
| 解析器 — 颜色白名单          | `subagent-manager.test.ts`               | `color: "magenta"` 会被静默丢弃（无报错），`color: "blue"` 会被保留                                                                                                                                       |
| Skills 字段特殊行为          | `subagent-manager.test.ts`               | 省略 `skills` 会导致 `skills: []`（符合 Claude Code DL7 的输出行为）                                                                                                                                      |
| 解析优先级                   | `subagent-manager.test.ts`               | 项目与用户中存在相同 `name` → 项目优先；用户与内置中存在相同 `name` → 用户优先；扩展与内置中存在相同 `name` → 扩展优先                                                                                    |
| Inode 去重                   | `subagent-manager.test.ts`               | 两个路径指向同一个 inode（符号链接）→ 仅保留一条记录，并输出日志                                                                                                                                          |
| permissionMode 桥接          | `subagent-manager.test.ts`               | `permissionMode: bypassPermissions` → 解析为 `approvalMode: yolo`；两者均设置 → `approvalMode` 优先 + 记录遥测数据                                                                                        |
| `--agent` CLI flag           | `packages/cli/src/config/config.test.ts` | 该 flag 设置主线程 agent；未解析的名称会抛出 `Agent type '<x>' not found. Available agents: …` 异常                                                                                                       |
| Agent 工具模糊回退           | `agent.test.ts`                          | `subagent_type: "Test_Engineer"` 通过 NFKC 小写规范化解析为已注册的 `test-engineer`                                                                                                                       |
| Agent 工具未找到错误         | `agent.test.ts`                          | 未解析的 `subagent_type` → 错误信息匹配 `Agent type '<x>' not found. Available agents: <list>`                                                                                                            |
| Workflow 契约                | `agent-frontmatter-schema.test.ts`       | 导出的 `getAgentByName(name)` 接口返回完整的 SubagentConfig，包括 `isolation`、`disallowedTools`、`model`、`effort`、`permissionMode`、`maxTurns`（可供 workflow PR #4732 使用）                            |

### 分阶段 PR 计划

| 阶段   | 标题                                                                                                                         | 范围                                                                                                                                                 | 阻塞项                           |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **P1** | `feat(core): declarative agent schema fields (effort, permissionMode, maxTurns top-level, memory, isolation, color allowlist)` | 向 `SubagentConfig` 添加字段；扩展解析器 + 校验器 + 序列化器；废弃 `runConfig.max_turns`；添加枚举常量模块；测试                                     | 无                               |
| **P2** | `feat(core): wire new agent fields into Agent tool runtime`                                                                  | 将 `model`、`effort`、`maxTurns`、`permissionMode`/`approvalMode` 桥接传入 `AgentTool.execute()` → `AgentHeadless.create()` 调用点；测试              | P1                               |
| **P3** | `feat(cli): --agent flag for main-thread agent selection`                                                                    | 向 `CliArgs` 添加 `--agent <name>`；在启动时解析；错误路径；测试                                                                                     | P1                               |
| **P4** | (optional, scope-creep) `feat(core): mcpServers + hooks + skills + initialPrompt + memory runtime`                           | 将四个“在 v1 中仅作元数据”的字段接入实际的运行时效果                                                                                                 | P1，以及 skill/MCP/hook 子系统   |

每个 PR 目标 ≤ 800 行代码变更（不含测试）；P1 最大，包含约 600 行校验器代码 + 测试。

---

## 阶段 3 — 与 workflow 移植的协调矩阵 (#4721 / PR #4732)

| 声明式 agents 特性                                                 | Workflow 交互                                                                                                                                                                      | 负责方                                                              | 阻塞于                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| `name` 字段作为注册表键                                            | Workflow 的 `opts.agentType` 查找字符串（[#4721][i4721] 明确指定）                                                                                                                 | **本 PR** 定义注册表契约；**workflow PR** 消费                      | 无 — 注册表结构可先稳定下来                    |
| agent 上的 `disallowedTools` 字段                                  | Workflow 与硬编码底线 `[SEND_MESSAGE, EXIT_PLAN_MODE]` 取并集（根据 [#4721][i4721] §2 — 已对照 PR #4732 diff 验证：`ToolNames.SEND_MESSAGE`、`ToolNames.EXIT_PLAN_MODE`）           | **本 PR** 携带该字段；**workflow PR** 在分发时取并集                | workflow PR #4732 P3 合入                      |
| agent 上的 `tools` 字段                                            | Workflow 原样传递给 subagent 的 `ToolConfig.tools`                                                                                                                                 | **本 PR** 携带该字段；**workflow PR** 接入                          | workflow PR #4732 P3                           |
| agent 上的 `model` 字段                                            | Workflow 的 `opts.model` 在每次调用时覆盖；agent 的 `model` 作为默认值                                                                                                             | **本 PR** 携带该字段；**workflow PR** 解析优先级                    | workflow PR #4732 P3                           |
| agent 上的 `effort` 字段                                           | Workflow 调用点覆盖优先；回退到 agent 默认值                                                                                                                                       | **本 PR** 携带该字段；**workflow PR** 解析                          | workflow PR #4732 P3                           |
| agent 上的 `permissionMode` 字段                                   | 在分发时映射为 subagent 的 approvalMode；Workflow 调用点覆盖优先                                                                                                                 | **本 PR** 通过 D7 桥接携带该字段；**workflow PR** 接入              | workflow PR #4732 P3                           |
| agent 上的 `maxTurns` 字段                                         | 当 agent 设置该字段时，替换 workflow 硬编码的 `WORKFLOW_SUBAGENT_MAX_TURNS = 50`                                                                                                   | **本 PR** 携带该字段；**workflow PR** 解析优先级                    | workflow PR #4732 P3                           |
| agent 上的 `isolation: 'worktree'` 字段                            | 默认值；每次调用的 `opts.isolation` 可覆盖（[#4721][i4721] §3）                                                                                                                  | **本 PR** 携带该字段；**workflow PR** 负责运行时                    | workflow PR #4732 P3+（目前在 P1 中会抛出异常）|
| agent 上的 `initialPrompt` 字段                                    | Workflow 不使用它（仅当 agent 通过 `--agent` 作为主会话时触发）                                                                                                                  | **本 PR** + **CLI**                                                 | 无（独立）                                     |
| `memory`、`mcpServers`、`hooks`、`skills`                          | 除了传递给 subagent 运行时外，Workflow 无特殊处理                                                                                                                                | **本 PR** 携带这些字段；运行时接入在 P4 / 未来                      | 未来 PR                                        |
| `EXCLUDED_TOOLS_FOR_SUBAGENTS` 更新                                | Workflow PR #4732 将 `WORKFLOW` 添加到该集合中（根据 issue/PR 上下文发现 — 尽管对抗性反驳指出这尚未在 `main` 分支的 `agent-core.ts` 中，仅在 worktree 中）                         | **workflow PR** 负责；本 PR 未修改                                  | 无                                             |
| workflow 底线的工具名称规范形式 (`ToolNames.SEND_MESSAGE`)         | 本 PR 不导入底线常量；它仅按原样携带 `disallowedTools` 字符串。规范化由 workflow PR 负责。                                                                                         | **workflow PR**                                                     | workflow PR #4732                              |
| 发布顺序                                                           | 本 PR (P1+P2+P3) 独立于 workflow 发布。Workflow PR #4732 P3 取决于本 PR 的类似 `getAgentByName()` 的解析器可被导入。                                                               | 在 workflow 的 P3 之前并行                                          | workflow P3 读取本 PR 的导出                   |
**无循环阻塞：** 本 PR 和 workflow PR 可以在其 P1/P2 阶段并行合入。它们在 workflow-P3 阶段同步，该阶段需要本 PR 提供的 registry resolver。如果本 PR 先合入，workflow-P3 将直接读取它。如果 workflow PR 先合入，它将使用现有的 `subagent_type` 查找（未命中时返回 workflow 默认值）发布，并在本 PR 合入后切换到更丰富的 resolver。

---

## 阶段 4 — 风险与未决问题

### 风险

| #   | 风险                                                                                                                                                                                                | 缓解措施                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Claude Code 小版本发布之间的 Schema 漂移 (2.1.168 → 2.1.x)                                                                                                                                   | 通过文档注释将 enum 常量模块固定为“已针对 2.1.168 验证”；作为 `feature-reverse` skill 的一部分，针对新版本重新运行 strings-grep |
| R2  | `runConfig.max_turns` → 顶层 `maxTurns` 是对现有 `.qwen/agents/*.md` 文件的破坏性 schema 变更                                                                                     | 保留嵌套形式作为废弃别名，进行一个周期的废弃处理；在解析时发出 warn，并在 CHANGELOG 中记录                                                     |
| R3  | `permissionMode` ↔ `approvalMode` 往返转换有损（Claude 有 6 种模式，qwen 有 4 种左右）                                                                                                            | 根据 D7 显式映射双向转换；在双重设置时发出 telemetry；在保存时不要静默重写                                                             |
| R4  | 新字段（`hooks`、`mcpServers`、`skills`、`memory`）在 registry 中携带但在 v1 中无运行时支持 → 用户可能会设置它们但静默无效                                                     | 明确记录 v1 范围；当“已携带但尚无运行时支持”的字段非空时，为每个 agent 发出一次性的 info 日志                                          |
| R5  | 对抗性验证指出 `EXCLUDED_TOOLS_FOR_SUBAGENTS` 在 `main` 分支上未包含 `WORKFLOW` —— 这可能意味着 workflow 移植尚未合入，或者缺少 recursive-fanout 守卫 | 与 workflow PR 作者（LaZzyMan = 本人）确认该守卫随 PR #4732 合入，而不是在本次移植中                                                     |
| R6  | 如果照搬 outer-tree-beats-inner-tree 的 projectSettings 行为（Q5），将是一个容易引发误操作的隐患                                                                                                             | qwen-code 明确选择 **innermost-wins**；通过 R5 fixture 进行测试                                                                                         |
| R7  | 字段 `color` 在二进制的 describe 文本中被记录为 `@internal` —— 我们可能正在移植 Anthropic 明确不支持的功能                                                        | 移植它，但在 qwen-code 文档中也标记为 `@internal`；视为仅限 UI 使用；不要在面向用户的参考文档中暴露                                             |

### 未决问题 — 建议的解决方案

| #   | 问题                                                                                                                                                       | 解决方案                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | #4821 中遗漏 `color` 是故意的吗？                                                                                                                  | **视为故意遗漏**。移植该字段；在面向用户的文档中不要提及，除非作为“可用，内部使用”。                                                                                                                                                                                                                                            |
| Q2  | 宽松的 DL7 行为：记录还是 hack？                                                                                                                       | **镜像该行为**。为了保持一致性，接受 `background: "true"`、`maxTurns: "5"`、`effort: "med"`，即使未记录在案。添加测试。                                                                                                                                                                                                                                |
| Q3  | 为什么 agent schema 和 background-session schema 之间的 isolation enum 不同？                                                                                 | **在代码注释中记录这种差异**；“无隔离” = 字段被省略，而不是一个 enum 值。                                                                                                                                                                                                                                                          |
| Q4  | `--agents <json>`（复数，flagSettings）应该在 v1 中合入吗？                                                                                                    | **推迟到 P4**。这是面向高级用户的 CLI 接口；v1 仅发布 `--agent <name>`（单数），这也是 #4821 所关注的。                                                                                                                                                                                                                                 |
| Q5  | 嵌套的 `.qwen/agents/` 中 inner-tree 与 outer-tree 的优先级？                                                                                                | **Innermost-wins**。覆盖 Claude Code 意外的 outer-wins 行为。在 P1 中添加测试 fixture。                                                                                                                                                                                                                                                          |
| Q6  | `tools` 与 `disallowedTools` 的优先级：#4821 称“如果设置了 tools 则忽略”；#4721 称“与 workflow 底线取并集”                                          | **Registry 是纯数据**。解析器独立保留这两个字段。优先级规则存在于调度点（Agent tool / workflow）。解决这一矛盾。                                                                                                                                                                                   |
| Q7  | workflow disallowedTools 底线的工具名称规范形式 —— 已针对 PR #4732 验证为 `ToolNames.SEND_MESSAGE`、`ToolNames.EXIT_PLAN_MODE`            | **不属于本 PR 的范围** —— 由 workflow PR 负责。仅在协调矩阵中记录。                                                                                                                                                                                                                                                              |
| Q8  | #2409 的 close-resolution 会影响什么吗？                                                                                                                   | **继承 #2409 的“将 model + maxTurns 提升到顶层”的指导**。已融入本计划中。                                                                                                                                                                                                                                                      |
| Q9  | qwen-code 现有的 `SubagentLevel` 优先级中，`extension` 级别的 agent 应该保持在 `builtin` 之上（当前状态）还是之下（Claude Code 没有等效项）？ | **保持 `extension > builtin`**。Extensions 是用户安装的；built-ins 是供应商默认的。用户安装的优先。                                                                                                                                                                                                                                        |
| Q10 | issues #4821、#4721、#4732 是否已针对本文档提出的契约进行了完整规范？                                                                             | **在 #4821 上发布协调评论**，链接本文档，总结逐字段的决策，并要求维护者确认：(a) 与 Claude Code 2.1.168 的 16 个字段保持 schema 一致，(b) D7 `permissionMode`/`approvalMode` 桥接，(c) D2 优先级顺序，(d) 将 registry 作为纯数据以解决 `tools`/`disallowedTools` 矛盾。 |

### 协调行动项

| #   | 行动                                                                       | 位置                                                |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| A1  | 在 #4821 上发布逐字段总结 + 5 项决策以供维护者确认        | 在 #4821 上发表评论                                     |
| A2  | 从 #4721 交叉链接本文档，并注明阶段 3 矩阵                         | 在 #4721 上发表评论                                     |
| A3  | 一旦本次移植的 P1 合入，通知 #4732 切换到更丰富的 resolver          | 在 PR #4732 上发表评论（准备就绪时）                     |
| A4  | 针对下一个 Claude Code 小版本重新运行 strings-grep 以检测 schema 漂移 | `feature-reverse` skill 定时任务（在此之前手动执行） |