# Worktrees

> 在临时的 [git worktree](https://git-scm.com/docs/git-worktree) 中隔离实验性工作，无需离开当前会话。适用于模型即将进行大范围编辑而你希望与主工作区保持隔离的场景，或者希望子代理在独立沙箱中工作的场景。

## 快速开始

### 在 worktree 中启动会话（`--worktree` 标志）

如果你事先知道整个会话应在 worktree 中运行，可在启动时传入 `--worktree`：

```bash
# 自动生成 slug（如 tender-jemison-037f0a）
qwen --worktree

# 指定名称
qwen --worktree my-feature

# `=` 形式（同时传入位置参数 prompt 时推荐使用——见下方提示）
qwen --worktree=my-feature

# PR 引用——从 `origin` 拉取 refs/pull/<N>/head
qwen --worktree=#4174
qwen --worktree https://github.com/QwenLM/qwen-code/pull/4174

# 继续之前的 --worktree 会话——重新附加到已有目录
qwen --resume <session-id> --worktree=my-feature
```

> **提示——裸 `--worktree` 后跟位置参数 prompt 存在歧义。** 由于 `--worktree` 接受可选值，`qwen --worktree "say hi"` 会让 yargs 将 `"say hi"` 当作 slug 消费（并因含空格而拒绝）。请使用以下任一方式：
>
> - `qwen --worktree=my-feature "say hi"`（始终有效——通过 `=` 显式指定 slug）
> - `qwen "say hi" --worktree`（位置参数在前，标志在后 → 自动生成 slug）
> - `qwen --worktree --approval-mode yolo "say hi"`（任意标志插入其间即可锚定裸形式）

> **提示——`qwen --resume --worktree foo`（无 session ID）首次使用时显示空选择器。** 选择器的作用域限定于所选 worktree 的会话存储；在该 worktree 外启动的会话不会列出。若要恢复在 `foo` 内启动的会话，请直接使用 `qwen --resume <id> --worktree foo`——CLI 会重新附加到已有的 `foo/` 目录，而非重新创建。

`process.cwd()` 及模型工作区会在第一轮运行前切换到 worktree。按两次 `Ctrl+C` 退出后，[退出对话框](#退出对话框-ctrlc--ctrld) 会提示保留或删除 worktree。

`--worktree` 标志不能与 `--acp`/`--experimental-acp` 组合使用——对于 ACP 宿主（如 Zed），请将 worktree 路径作为 `loadSession`/`newSession` 请求的 `cwd` 传入。

### 或在会话中途请求

也可以在现有会话中用自然语言让 Qwen Code 创建 worktree：

```text
> start a worktree called experiment-a
Worktree experiment-a created on branch worktree-experiment-a
.qwen/worktrees/experiment-a
```

从此刻起，模型会将所有文件编辑和 shell 命令路由到 `.qwen/worktrees/experiment-a/`，你的原始工作目录保持不变。

完成后：

```text
> exit the worktree and remove it
Removed worktree experiment-a (branch worktree-experiment-a)
```

如果以后还想回来，可以请求退出时保留 worktree：

```text
> exit the worktree but keep it
Kept worktree experiment-a at .qwen/worktrees/experiment-a
```

## Worktree 的触发时机

Worktree 通过四条独立路径激活：

| 触发方式                          | 行为                                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 使用 `--worktree` 启动            | CLI 在任何模型轮次运行前创建 worktree，并将会话 chdir 到其中。PR 形式（`#N`、完整 URL）会先执行 fetch。           |
| 会话中途显式请求 worktree         | 模型调用 `enter_worktree`；后续文件编辑在其中进行。                                                               |
| 显式请求离开                      | 模型调用 `exit_worktree`，参数为 `keep` 或 `remove`。                                                             |
| 模型在启用隔离的情况下创建子代理  | 自动创建临时 worktree（`agent-<hex>`），若代理无差异则自动清理。                                                   |

中途使用的两个工具（`enter_worktree` / `exit_worktree`）刻意要求显式措辞——说"修复这个 bug"或"创建一个分支"**不会**触发它们。必须说类似"使用 worktree"、"启动 worktree"或"在 worktree 中"之类的表述。`--worktree` CLI 标志没有此限制，只要存在就会创建。

## 创建内容

每个 Qwen 管理的 worktree 都存放在项目的 `.qwen` 目录下：

```
<repoRoot>/.qwen/worktrees/<slug>/         # 工作目录
                          ↳ branch worktree-<slug>   # 基于当前分支创建
```

- **Slug** — 字母、数字、点、下划线、连字符；最长 64 个字符。不指定名称时，自动生成 `<形容词>-<名词>-<6hex>` 格式的 slug（如 `tender-jemison-037f0a`）。PR 引用生成 `pr-<N>`。
- **分支** — 始终为 `worktree-<slug>`，基于你请求 worktree 时所在的分支创建（不一定是主工作树的 `HEAD`）。PR worktree 的分支为 `worktree-pr-<N>`，基于 `FETCH_HEAD`（GitHub 端 PR 的最新提交），而非本地分支。
- **Hooks** — worktree 的 `core.hooksPath` 自动指向主仓库的 `.husky/`（优先）或 `.git/hooks/`，确保 worktree 内的提交仍会触发现有的 pre-commit / commit-msg hooks。
- **可选符号链接** — `worktree.symlinkDirectories` 中列出的目录（见[设置](#设置)）会从主仓库符号链接到新 worktree，方便像 `node_modules` 这样的大目录无需重新安装即可复用。

通用 worktree 路径**不可配置**——必须位于 `<repoRoot>/.qwen/worktrees/` 下，以便 CLI 在重启和过期清理时能够找到它。（无关的 `agents.arena.worktreeBaseDir` 设置仅控制 [Agent Arena](./arena.md) 的 worktree，使用 `~/.qwen/arena/` 下的独立路径树。）

## 底栏与状态行

worktree 激活时，底栏会在独立行显示一个低亮指示器：

```
⎇ worktree-experiment-a (experiment-a)
```

如果你使用了[自定义状态行脚本](./status-line.md)，通过 stdin 传入的 JSON payload 中也会包含 `worktree` 对象：

```json
{
  "worktree": {
    "name": "experiment-a",
    "path": "/path/to/repo/.qwen/worktrees/experiment-a",
    "branch": "worktree-experiment-a",
    "original_cwd": "/path/to/repo",
    "original_branch": "main"
  }
}
```

该字段**仅在** worktree 激活时出现，因此 `null` 检查（`input.worktree?.name`）即可。

如果你的自定义状态行已渲染 worktree 信息，可隐藏内置底栏行以避免重复——见下方[设置](#设置)。

## 退出对话框（Ctrl+C / Ctrl+D）

worktree 激活时，按两次退出快捷键会打开 **Worktree 退出对话框**，而非直接关闭 CLI：

```
⎇ Active worktree: "experiment-a" (worktree-experiment-a)

  • 2 new commit(s) on worktree-experiment-a
  • 3 uncommitted file(s)
  Removing the worktree will discard everything above.

What would you like to do?
  ○ Keep worktree (exit without deleting)
  ○ Remove worktree and branch (discards 2 commit(s), 3 file(s))
  ○ Cancel (stay in session)
```

对话框打开时会检查 worktree 状态（`git status --porcelain` + `git rev-list <baseHEAD>..HEAD`），展示两项计数，让你清楚了解将要丢弃的内容。按 `ESC` 取消。

如果 `git status` 本身失败（如索引损坏、worktree 目录被 CLI 之外删除），对话框会显示 `⚠ Could not measure worktree state` 警告，且计数可能不可靠——请在诊断底层仓库问题前选择**保留**或**取消**。

## `--resume` 恢复

活跃的 worktree 绑定会持久化到会话记录旁的 sidecar 文件：

```
<chatsDir>/<sessionId>.worktree.json
```

使用 `--resume <sessionId>` 启动 CLI（或从 `/resume` 选择会话）时，在**交互式 TUI**、**无头 `-p`** 和 **ACP/Zed** 模式下会一致执行以下三步：

1. 加载 sidecar 文件，验证 worktree 目录仍存在于磁盘。
2. 若存在，模型在下一个 prompt 收到一次性提醒：
   ```
   [Resumed] Active worktree: "<slug>" at <path> (branch: <branch>). Continue using this path for all file operations.
   ```
3. 若 worktree 目录在两次会话之间被删除，过期的 sidecar 会自动清理——不报错，resume 直接在无 worktree 上下文的情况下继续。

各模式采用各自的注入机制，但用户可见行为完全相同：

| 模式              | 机制                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| 交互式（TUI）     | `INFO` 历史条目 + 下一个用户 prompt 的 system-reminder 前缀。                                     |
| 无头（`-p`）      | prompt 的 `<system-reminder>` 前缀 + 输出流中的 `worktree_restored` JSON 系统事件。               |
| ACP（如 Zed）     | 附加到下一个 `prompt()` 调用的待处理通知。                                                        |

模型**不会**自动 `chdir` 到 worktree——提醒是引导其通过 worktree 路径路由编辑的机制。

## 子代理隔离

`agent` 工具接受可选的 `isolation: "worktree"` 参数。设置后，Qwen Code 会在子代理启动前于 `<repoRoot>/.qwen/worktrees/agent-<7hex>/` 创建一个临时 worktree，并且：

- **无变更** → 代理结束时自动删除 worktree。
- **有变更** → 保留 worktree；其路径和分支会追加到代理结果中，例如：
  ```
  …agent output…
  [worktree preserved: /path/to/.qwen/worktrees/agent-3f2a1b9 (branch worktree-agent-3f2a1b9)]
  ```
  请手动检查差异后合并或删除。

两条约束：

- `isolation: "worktree"` 需要指定 `subagent_type`——分叉子代理（无 `subagent_type`）复用父代理的完整对话上下文，隔离会导致意图与工作树分离。
- 后台代理（`run_in_background: true`）与隔离模式兼容；清理在代理报告完成时执行。

### 自动清理过期条目

在崩溃或 `--no-cleanup` 关闭后遗留下来的临时代理 worktree，会在每次 CLI 启动时清理，遵循保守的失败关闭规则：

| 守卫条件                              | 行为                                       |
| ------------------------------------- | ------------------------------------------ |
| Slug 必须匹配 `agent-<7hex>` 模式     | 你创建的命名 worktree 永远不会被触碰。     |
| 目录 `mtime` > 30 天                  | 较新的条目跳过。                           |
| 存在任何未提交的已跟踪变更            | 跳过该条目（不删除）。                     |
| 存在任何远端不可达的提交              | 跳过该条目（不删除）。                     |
| 读取 git 状态时发生任何错误           | 跳过该条目（不删除）。                     |

用户命名的 worktree（`enter_worktree` slug）**永远不会**被自动清理——保留至你主动请求删除。

## `exit_worktree action="remove"` 的安全守卫

目录和分支被删除前有三道独立守卫：

1. **会话所有权** — 每个 worktree 带有创建它的会话 ID sidecar 标记。其他会话尝试删除时会被拒绝，并给出明确错误，提示使用 `git worktree remove` 作为手动解决方式。
2. **脏工作树** — 未提交的已跟踪或未跟踪变更会阻止删除。传入 `discard_changes: true` 可覆盖。（绕过需要用户明确确认——在 AUTO_EDIT 模式下，`action: "remove"` 永远不会被自动批准。）
3. **未合并提交** — `worktree-<slug>` 上无其他本地分支或远端引用指向的提交会无条件阻止删除；没有"丢弃提交"标志，因为丢失已提交的工作很少是用户的本意。请先合并、推送或在其他位置重命名分支。

`WorktreeExitDialog → Remove` 按钮同样适用以上三道守卫。

## 设置

两个设置项影响通用 worktree 体验：

| 键                                | 类型       | 默认值      | 作用                                                                                                                                                                                                                                                                     |
| --------------------------------- | ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ui.hideBuiltinWorktreeIndicator` | boolean    | `false`     | 隐藏内置的 `⎇ worktree-… (…)` 底栏行。`worktree` 字段仍会传递给自定义状态行脚本。仅在你的状态行已渲染 worktree 信息时设为 `true`，否则会失去所有 UI 提示。                                                                                                              |
| `worktree.symlinkDirectories`     | `string[]` | `undefined` | 主仓库下需符号链接到每个通用 worktree 的目录（创建时生效）。路径相对于仓库根目录；绝对路径及包含 `..` 的条目会被拒绝。缺失的源目录和已有的目标路径会静默跳过（不覆盖）。 |

示例：

```jsonc
// ~/.qwen/settings.json 或 <repo>/.qwen/settings.json
{
  "worktree": {
    "symlinkDirectories": ["node_modules", ".turbo", "dist"],
  },
}
```

适用于所有 worktree 创建路径：`--worktree` 标志、`enter_worktree` 工具和 `agent isolation: "worktree"`。

与通用 worktree 无关但值得了解的设置：

- `agents.arena.worktreeBaseDir` — 控制 **Agent Arena** worktree 的存放位置（默认 `~/.qwen/arena`）。不影响通用 worktree，后者始终位于 `<repoRoot>/.qwen/worktrees/`。

`worktree.sparsePaths` 尚无 schema——这是路线图中的待办项（见[局限性](#局限性)）。

## 工具参考

### `enter_worktree`

```json
{ "name": "experiment-a" }
```

| 字段   | 类型   | 是否必填 | 说明                                                                                    |
| ------ | ------ | -------- | --------------------------------------------------------------------------------------- |
| `name` | string | 否       | Slug。字母、数字、点、下划线、连字符；最长 64 个字符。省略时自动生成。 |

以下情况拒绝运行：

- CLI 不在 git 仓库中。
- 当前工作目录已在 `.qwen/worktrees/` 内（不支持嵌套 worktree）。

### `exit_worktree`

```json
{ "name": "experiment-a", "action": "remove", "discard_changes": false }
```

| 字段              | 类型                   | 是否必填                                     | 说明                                                              |
| ----------------- | ---------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| `name`            | string                 | 是                                           | 必须与 `enter_worktree` 中使用的 slug 一致。                      |
| `action`          | `"keep"` \| `"remove"` | 是                                           | `keep` 保留目录和分支；`remove` 删除两者。                        |
| `discard_changes` | boolean                | 仅在 `action="remove"` 且工作树脏时必填      | 覆盖脏工作树守卫。对 `action="keep"` 无效。                      |

`action: "remove"` 始终需要确认，包括在 `AUTO_EDIT` 批准模式下——它被视为破坏性 shell 操作，而非只读工具。

### `agent` — `isolation` 参数

```json
{
  "subagent_type": "my-agent",
  "description": "…",
  "prompt": "…",
  "isolation": "worktree"
}
```

| 字段        | 类型         | 是否必填 | 说明                                                                                             |
| ----------- | ------------ | -------- | ------------------------------------------------------------------------------------------------ |
| `isolation` | `"worktree"` | 否       | 在全新的 `agent-<7hex>` worktree 中运行代理。需要设置 `subagent_type`（不支持分叉）。 |

其余 agent 工具参考见 [Sub-Agents](./sub-agents.md)。

## CLI 参考

### `--worktree [name | #N | url]`

```bash
qwen --worktree                                               # 自动生成 slug
qwen --worktree my-feature                                    # 显式 slug
qwen --worktree=my-feature                                    # = 形式
qwen --worktree=#123                                          # PR 引用
qwen --worktree https://github.com/owner/repo/pull/123        # PR URL
```

| 输入                          | 结果                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 裸标志（无值）                | 自动 slug `<形容词>-<名词>-<6hex>`，分支 `worktree-<slug>`，基于当前分支。                                            |
| 普通 slug                     | 分支 `worktree-<slug>`，基于当前分支。Slug 校验：字母/数字/点/下划线/连字符，最长 64 字符。                           |
| `#N` 或 `<github-url>/pull/N` | Slug `pr-<N>`，分支 `worktree-pr-<N>`，基于 `git fetch origin pull/<N>/head`（30s 超时）后的 `FETCH_HEAD`。           |

`--worktree` 不能与 `--acp` / `--experimental-acp` 组合使用。

`--worktree` 与 `--resume <session-id>` 组合时，worktree 优先：恢复会话中已保存的 worktree（若有）会被覆盖，stderr 行和首个 prompt 提醒会报告此覆盖。

交互式（TUI）和无头（`-p`）模式下，worktree 会在第一轮前自动创建，会话 chdir 到其中。

PR fetch 失败情况（退出码 != 0，不创建 worktree）：

| 原因                          | 消息摘录                                                           |
| ----------------------------- | ------------------------------------------------------------------ |
| 缺少 `origin` 远端            | `requires an "origin" remote that points at GitHub`                |
| PR 在 origin 上不存在         | `Failed to fetch PR #<N>: the PR does not exist on origin`         |
| 30s 网络超时                  | `Failed to fetch PR #<N>: timed out after 30s`                     |
| PR 编号超出范围或为零         | `Invalid PR number`                                                |

## 局限性

当前阶段有意未实现以下功能：

- **不支持稀疏检出。** 大型 monorepo 会检出完整目录树。（`worktree.sparsePaths` 是路线图中的待办项。）
- **不支持 tmux 集成。** CLI 不会在新的 tmux 窗口中创建 worktree 会话。
- **Worktree 是会话存储的独立"项目"。** 使用 `--worktree foo` 启动的会话保存在该 worktree 的 chats 目录下；之后恢复时必须再次传入 `--worktree foo`。未使用 `--worktree` 启动的会话保存在主检出目录下，不会出现在 worktree 的 resume 选择器中。
- **不支持跨 slug 的会话覆盖。** `qwen --resume <sid> --worktree second`（`<sid>` 使用 `--worktree first` 创建）无法找到该会话——会话与 worktree 通过 `projectHash(cwd)` 紧密绑定。要在已有会话中切换 worktree，必须退出后以新的 `--worktree` 和新 prompt 重新启动。未来若将存储锚定到仓库根目录而非 `cwd`，此限制将解除。
- **中途 `enter_worktree` 不会切换 `process.cwd()` 或 `Config.targetDir`。** 该工具采用仅模型上下文约定（见 [Sub-Agents](./sub-agents.md)）。只有启动时的 `--worktree` 标志才会真正切换进程工作目录。
- **其他参数字段中的相对路径在 worktree chdir 之前解析。** 接受路径的标志（`--mcp-config`、`--openai-logging-dir`、`--json-file`、`--input-file`、`--telemetry-outfile`、`--include-directories`）在设置了 `--worktree` 时，会相对于启动 cwd 规范化为绝对路径。此列表之外的其他路径形式 argv 字段仍相对于 worktree cwd 解析——建议使用绝对路径以确保安全。

在 `docs/design/worktree.md` 中跟踪路线图。

## 故障排查

**底栏不显示 worktree 指示器，即使我刚创建了一个。**
检查 `ui.hideBuiltinWorktreeIndicator` 是否被设为 `true`。同时确认工具成功消息中的 slug 非空。

**`--resume` 未恢复我的 worktree。**
检查 `<chatsDir>/<sessionId>.worktree.json` 是否存在。CLI 在 worktree 目录消失时会自动删除 sidecar，因此 sidecar 缺失且目录不存在是正常的"无 worktree 可恢复"状态——而非 bug。使用 `--debug` 运行并搜索 `restoreWorktreeContext` 以查看原因。

**`exit_worktree` 提示"由其他会话创建"。**
这是会话所有权守卫。请恢复原始会话并从那里退出，或者手动执行提示的 `git worktree remove …` 命令。

**过期的 `agent-<hex>` worktree 不断积累。**
30 天截止时间较为保守；可使用 `git worktree list && git worktree remove <path>` 手动清理，或等待——超过 30 天后，只要这些 worktree 已清理且已推送，下次 CLI 启动时会自动回收。
