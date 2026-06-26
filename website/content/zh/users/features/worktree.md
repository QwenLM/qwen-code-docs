# Worktrees

> 在临时 [git worktree](https://git-scm.com/docs/git-worktree) 中隔离实验性工作，无需离开当前会话。当模型即将进行大范围编辑，而你希望将其与主检出目录保持分离，或者希望子代理在自己的沙箱中工作时，此功能非常有用。

## 快速开始

### 在 worktree 内启动会话（`--worktree` 标志）

如果你一开始就知道整个会话应该在 worktree 内运行，请在启动时传递 `--worktree`：

```bash
# 自动生成 slug（例如 tender-jemison-037f0a）
qwen --worktree

# 显式指定名称
qwen --worktree my-feature

# `=` 形式（同时传递位置 prompt 时推荐使用——参见下面的提示）
qwen --worktree=my-feature

# PR 引用——从 `origin` 获取 refs/pull/<N>/head
qwen --worktree=#4174
qwen --worktree https://github.com/QwenLM/qwen-code/pull/4174

# 继续之前的 --worktree 会话——重新附加到现有目录
qwen --resume <session-id> --worktree=my-feature
```

> **提示——裸 `--worktree` 后跟位置 prompt 会有歧义。** 由于 `--worktree` 接受一个可选值，`qwen --worktree "say hi"` 会使 yargs 将 `"say hi"` 当作 slug 消费（并因包含空格而拒绝）。请使用以下形式之一：
> - `qwen --worktree=my-feature "say hi"`（总是有效——通过 `=` 显式指定 slug）
> - `qwen "say hi" --worktree`（位置参数在前，标志在后 → 自动生成 slug）
> - `qwen --worktree --approval-mode yolo "say hi"`（两个标志之间的任何标志都能固定裸形式）

> **提示——`qwen --resume --worktree foo`（无会话 ID）在首次使用时显示一个空选择器。** 选择器的作用域限定在所选 worktree 的会话存储中；在 worktree 外启动的会话不会被列出。要恢复一个在 `foo` 内部启动的会话，请直接使用 `qwen --resume <id> --worktree foo`——CLI 会重新附加到现有的 `foo/` 目录，而不是重新创建。

`process.cwd()` 和模型的工作空间会在第一次轮次运行之前切换到 worktree。按两次 `Ctrl+C` 退出，[退出对话框](#退出对话框-ctrlc--ctrld) 会提示保留或删除 worktree。

`--worktree` 标志不能与 `--acp`/`--experimental-acp` 同时使用——对于 ACP 主机（如 Zed），请将 worktree 路径作为 `loadSession`/`newSession` 请求的 `cwd` 传递。

### 或在会话中途要求

或者，从现有会话内部用自然语言要求 Qwen Code 创建一个 worktree：

```text
> 创建一个名为 experiment-a 的 worktree
Worktree experiment-a created on branch worktree-experiment-a
.qwen/worktrees/experiment-a
```

从此刻起，模型会将所有文件编辑和 shell 命令路由到 `.qwen/worktrees/experiment-a/`。你的原始工作目录不受影响。

完成时：

```text
> 退出 worktree 并删除它
Removed worktree experiment-a (branch worktree-experiment-a)
```

如果你想稍后回来，要求退出并保留 worktree 在磁盘上：

```text
> 退出 worktree 但保留它
Kept worktree experiment-a at .qwen/worktrees/experiment-a
```

## 何时使用 Worktrees

Worktrees 通过四种独立的路径激活：

| 触发条件                                         | 行为                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 使用 `--worktree` 启动                           | CLI 在任何模型轮次运行之前创建 worktree，并将会话 chdir 到其中。PR 形式（`#N`、完整 URL）会先执行 fetch。 |
| 在会话中途明确要求创建一个 worktree               | 模型调用 `enter_worktree`；后续文件编辑将被定向到 worktree 内部。                                                              |
| 明确要求退出                                     | 模型调用 `exit_worktree`，参数为 `keep` 或 `remove`。                                                                           |
| 模型生成启用了隔离的子代理                        | 自动创建一个一次性 worktree（`agent-<hex>`），如果代理没有差异则自动清理。                        |

两个会话中途工具（`enter_worktree` / `exit_worktree`）被有意限制为必须使用明确措辞——说“修复这个 bug”或“创建一个分支”**不会**触发它们。你必须说类似“使用一个 worktree”、“启动一个 worktree”或“在一个 worktree 中”这样的话。`--worktree` CLI 标志没有这种限制；只要存在就会创建一个 worktree。

## 创建的内容

每个由 Qwen 管理的 worktree 都放在项目的 `.qwen` 目录下：

```
<repoRoot>/.qwen/worktrees/<slug>/         # 工作目录
                          ↳ branch worktree-<slug>   # 基于你当前分支创建
```

- **Slug** — 字母、数字、点、下划线、连字符；最多 64 个字符。如果你没有指定名称，会自动生成一个 `<adjective>-<noun>-<6hex>` 格式的 slug（例如 `tender-jemison-037f0a`）。PR 引用会生成 `pr-<N>`。
- **Branch** — 始终是 `worktree-<slug>`，基于你要求创建 worktree 时检出的分支（不一定是主工作树的 `HEAD`）。对于 PR worktrees，分支是 `worktree-pr-<N>`，并基于 `FETCH_HEAD`（GitHub 侧的 PR 顶端）而不是你的本地分支。
- **Hooks** — worktree 的 `core.hooksPath` 自动指向主仓库的 `.husky/`（首选）或 `.git/hooks/`，以便 worktree 内的提交仍然触发现有的 pre-commit / commit-msg hooks。
- **可选符号链接** — `worktree.symlinkDirectories` 中列出的目录（参见[设置](#设置)）会从主仓库符号链接到新的 worktree，以便重用 `node_modules` 等较大的目录而无需重新安装。

通用 worktree 路径**不可配置**——必须位于 `<repoRoot>/.qwen/worktrees/` 下，以便 CLI 在重启和清理过期项时能找到它。（不相关的 `agents.arena.worktreeBaseDir` 设置仅控制 [Agent Arena](./arena.md) 的 worktrees，这些 worktree 使用 `~/.qwen/arena/` 下单独的路径树。）

## 页脚和状态行

当 worktree 处于活动状态时，页脚会单独一行显示一个暗淡的指示器：

```
⎇ worktree-experiment-a (experiment-a)
```

如果你使用[自定义状态行脚本](./status-line.md)，该脚本还会在通过管道传入的 JSON 负载中收到一个 `worktree` 对象：

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

该负载字段**仅**在 worktree 处于活动状态时存在，因此 `null` 检查（`input.worktree?.name`）就足够了。

如果你的自定义状态行已经渲染了 worktree 信息，可以隐藏内置的页脚行以避免重复——参见下面的[设置](#设置)。

## 退出对话框（Ctrl+C / Ctrl+D）

在 worktree 活动状态下连续两次按下退出快捷键会打开 **Worktree 退出对话框**，而不是直接关闭 CLI：

```
⎇ 活动 worktree: "experiment-a" (worktree-experiment-a)

  • worktree-experiment-a 上有 2 个新提交
  • 有 3 个未提交的文件
  删除 worktree 将丢弃以上所有内容。

你想做什么？
  ○ 保留 worktree（退出但不删除）
  ○ 删除 worktree 和分支（丢弃 2 个提交、3 个文件）
  ○ 取消（留在会话中）
```

对话框在打开时会检查 worktree 的状态（`git status --porcelain` + `git rev-list <baseHEAD>..HEAD`）并显示两个计数，以便你确切知道将要丢弃什么。`ESC` 取消。

如果 `git status` 本身失败（例如索引损坏、worktree 目录被 CLI 外部删除），对话框会显示 `⚠ 无法测量 worktree 状态` 警告，计数可能不可靠——请选择 **保留** 或 **取消**，直到你诊断出底层仓库的问题。

## `--resume` 恢复

激活的 worktree 绑定会持久化到会话记录旁边的附属文件中：

```
<chatsDir>/<sessionId>.worktree.json
```

当你使用 `--resume <sessionId>` 启动 CLI（或从 `/resume` 中选择会话）时，在**交互式 TUI**、**无头 `-p`** 和 **ACP/Zed** 模式下会一致地发生三件事：

1. 加载附属文件，并验证 worktree 目录在磁盘上仍然存在。
2. 如果存在，模型会在其下一个 prompt 中收到一次性提醒：
   ```
   [恢复] 活动 worktree: "<slug>" at <path> (分支: <branch>)。继续使用此路径进行所有文件操作。
   ```
3. 如果 worktree 目录在会话之间被删除，过期的附属文件会自动清理——不会有错误，恢复只是继续而没有 worktree 上下文。

每种模式选择自己的注入机制，但用户可见的行为相同：

| 模式              | 机制                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| 交互式 (TUI) | `INFO` 历史项 + 下一个用户 prompt 上的系统提醒前缀。                                  |
| 无头 (`-p`)   | prompt 上的 `<system-reminder>` 前缀 + 输出流中的 `worktree_restored` JSON 系统事件。 |
| ACP (例如 Zed)    | 附加到下一次 `prompt()` 调用的待处理通知。                                                   |

模型**不会**自动 `chdir` 进入 worktree——提醒提示会使其将编辑路由到 worktree 路径。

## 子代理隔离

`agent` 工具接受一个可选的 `isolation: "worktree"` 参数。当设置时，Qwen Code 会在子代理启动前创建一个临时 worktree，位于 `<repoRoot>/.qwen/worktrees/agent-<7hex>/`，并且：

- **没有更改** → 代理完成时自动删除 worktree。
- **有更改** → worktree 被保留；其路径和分支会附加到代理的结果中，例如：
  ```
  …agent output…
  [worktree preserved: /path/to/.qwen/worktrees/agent-3f2a1b9 (branch worktree-agent-3f2a1b9)]
  ```
  请审查差异并手动合并或删除。

两个约束：

- `isolation: "worktree"` 需要指定 `subagent_type`——fork 的子代理（没有 `subagent_type`）会重用父级的完整对话上下文，隔离它们会割裂意图和工作树。
- 后台代理（`run_in_background: true`）可以很好地与隔离配合使用；清理工作在代理报告完成时运行。

### 自动清理过期项

因崩溃或 `--no-cleanup` 关闭而残存的临时代理 worktrees 会在每次 CLI 启动时被清理，并采用保守的失败关闭规则：

| 守卫条件                                  | 行为                                       |
| -------------------------------------- | ---------------------------------------------- |
| Slug 必须匹配 `agent-<7hex>` 模式             | 你创建的有名称的 worktrees 永远不会被触及。 |
| 目录 `mtime` > 30 天            | 较新的条目会被跳过。                     |
| 有任何未提交的跟踪更改         | 跳过该条目（不删除）。                 |
| 有任何提交无法从远端到达            | 跳过该条目（不删除）。                 |
| 读取 git 状态时出现任何错误            | 跳过该条目（不删除）。                 |

有名称的用户 worktrees（`enter_worktree` slugs）**永远不会**被自动清理——它们会一直保留，直到你要求删除。

## `exit_worktree action="remove"` 的安全守卫

在目录和分支被删除之前，会触发三个独立的守卫：

1. **会话所有权** — 每个 worktree 都有一个附属标记，记录创建它的会话 ID。另一个会话尝试删除它会被拒绝，并显示一个清晰的错误，指向 `git worktree remove` 作为手动逃生出口。
2. **脏工作树** — 未提交的跟踪或未跟踪的文件会阻止删除。传递 `discard_changes: true` 以覆盖。（绕过需要用户明确确认——`action: "remove"` 在 AUTO_EDIT 模式下永远不会自动批准。）
3. **未合并的提交** — 指向 `worktree-<slug>` 且未被其他本地分支或远程 ref 指向的提交会无条件阻止删除；没有“丢弃提交”标志，因为丢失已提交的工作很少是用户的意图。请先合并、推送或将分支重命名到其他地方。

相同的三个守卫也适用于 `WorktreeExitDialog → 删除` 按钮。

## 设置

两个设置影响通用 worktree 体验：

| 键                               | 类型       | 默认值     | 效果                                                                                                                                                                                                                                                                     |
| --------------------------------- | ---------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui.hideBuiltinWorktreeIndicator` | boolean    | `false`     | 隐藏内置的 `⎇ worktree-… (…)` 页脚行。`worktree` 字段仍然会传递给自定义状态行脚本。仅在你的状态行已经渲染了 worktree 时设置为 `true`——否则会失去所有 UI 提示。                                       |
| `worktree.symlinkDirectories`     | `string[]` | `undefined` | 主仓库下要在每个通用 worktree 创建时符号链接到其中的目录。路径相对于仓库根目录；绝对路径和任何包含 `..` 的条目会被拒绝。不存在的源和已存在的目标会被静默跳过（不覆盖）。 |

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

与通用 worktrees 无关但值得注意的设置：

- `agents.arena.worktreeBaseDir` — 控制 **Agent Arena** worktree 的放置位置（默认 `~/.qwen/arena`）。不影响通用 worktrees，它们始终位于 `<repoRoot>/.qwen/worktrees/` 下。

目前还没有 `worktree.sparsePaths` 的模式——这是路线图上的项目（参见[限制](#限制)）。

## 工具参考

### `enter_worktree`

```json
{ "name": "experiment-a" }
```

| 字段   | 类型   | 必需 | 备注                                                                                      |
| ------ | ------ | ---- | ------------------------------------------------------------------------------------------ |
| `name` | string | 否   | Slug。字母、数字、点、下划线、连字符；最多 64 个字符。省略时自动生成。 |

在以下情况下拒绝执行：

- CLI 不在 git 仓库中。
- 当前工作目录已经在 `.qwen/worktrees/` 内（不允许嵌套 worktrees）。

### `exit_worktree`

```json
{ "name": "experiment-a", "action": "remove", "discard_changes": false }
```

| 字段             | 类型                   | 必需                              | 备注                                                              |
| ----------------- | ---------------------- | --------------------------------- | ------------------------------------------------------------------ |
| `name`            | string                 | 是                                   | 必须与 `enter_worktree` 中使用的 slug 匹配。                      |
| `action`          | `"keep"` \| `"remove"` | 是                                   | `keep` 保留目录 + 分支；`remove` 删除两者。              |
| `discard_changes` | boolean                | 仅当 `action="remove"` 且目录为脏时 | 覆盖脏树守卫。对于 `action="keep"` 无效果。 |

`action: "remove"` 始终会提示确认，即使在 `AUTO_EDIT` 审批模式下也是如此——它被视为破坏性 shell 操作，而非仅信息工具。

### `agent` — `isolation` 参数

```json
{
  "subagent_type": "my-agent",
  "description": "…",
  "prompt": "…",
  "isolation": "worktree"
}
```

| 字段        | 类型         | 必需 | 备注                                                                                             |
| ----------- | ------------ | ---- | ------------------------------------------------------------------------------------------------- |
| `isolation` | `"worktree"` | 否   | 在一个新的 `agent-<7hex>` worktree 中运行代理。需要设置 `subagent_type`（不允许 fork）。 |

参见[子代理](./sub-agents.md)了解 agent 工具的其余参考信息。

## CLI 参考

### `--worktree [名称 | #N | URL]`

```bash
qwen --worktree                                               # 自动生成 slug
qwen --worktree my-feature                                    # 显式 slug
qwen --worktree=my-feature                                    # = 形式
qwen --worktree=#123                                          # PR 引用
qwen --worktree https://github.com/owner/repo/pull/123        # PR URL
```

| 输入                         | 结果                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 裸标志（无值）          | 自动 slug `<adjective>-<noun>-<6hex>`，分支 `worktree-<slug>`，基础 = 当前分支。                               |
| 普通 slug                    | 分支 `worktree-<slug>`，基础 = 当前分支。Slug 验证：字母/数字/点/下划线/连字符，最多 64 个字符。 |
| `#N` 或 `<github-url>/pull/N` | Slug `pr-<N>`，分支 `worktree-pr-<N>`，基础 = `git fetch origin pull/<N>/head` 后的 `FETCH_HEAD`（30 秒超时）。    |

`--worktree` 不能与 `--acp` / `--experimental-acp` 结合使用。

当 `--worktree` 与 `--resume <session-id>` 结合时，worktree 优先：恢复的会话中保存的 worktree（如果有）会被覆盖，并在 stderr 行和第一个 prompt 提醒中报告覆盖。

对于交互式 (TUI) 和无头 (`-p`) 模式，worktree 会自动创建，并且在第一次轮次之前会话会 chdir 到其中。

PR 获取失败模式（退出码 != 0，不创建 worktree）：

| 原因                         | 消息摘要                                            |
| ----------------------------- | ---------------------------------------------------------- |
| 缺少 `origin` 远程仓库       | `requires an "origin" remote that points at GitHub`        |
| PR 在 origin 上不存在    | `Failed to fetch PR #<N>: the PR does not exist on origin` |
| 30 秒网络超时           | `Failed to fetch PR #<N>: timed out after 30s`             |
| PR 编号超出范围 / 为零 | `Invalid PR number`                                        |

## 限制

以下项目在当前阶段有意未实现：

- **没有稀疏检出。** 大型 monorepo 会检出完整树。（`worktree.sparsePaths` 是路线图上的项目。）
- **没有 tmux 集成。** CLI 不会在新的 tmux 窗口中启动 worktree 会话。
- **Worktrees 作为独立的“项目”用于会话存储。** 使用 `--worktree foo` 启动的会话会保存在该 worktree 的聊天目录下；要稍后恢复它们，必须再次传递 `--worktree foo`。未使用 `--worktree` 启动的会话会保存在主检出目录下，不会出现在 worktree 的恢复选择器中。
- **没有跨 slug 的会话覆盖。** `qwen --resume <sid> --worktree second`，其中 `<sid>` 是用 `--worktree first` 创建的，会找不到会话——会话和 worktrees 通过 `projectHash(cwd)` 紧密绑定。要在现有会话上切换 worktrees，必须退出，然后使用新的 `--worktree` 和一个新的 prompt 重新启动。未来的架构变更（将存储锚定到仓库根目录而不是 `cwd`）将解除此限制。
- **会话中途的 `enter_worktree` 不会切换 `process.cwd()` 或 `Config.targetDir`。** 该工具使用仅模型上下文的约定（参见[子代理](./sub-agents.md)）。只有启动时的 `--worktree` 标志会实际切换进程工作目录。
- **其他参数字段中的相对路径在 worktree chdir 之前解析。** 接受路径的标志（`--mcp-config`、`--openai-logging-dir`、`--json-file`、`--input-file`、`--telemetry-outfile`、`--include-directories`）在设置 `--worktree` 时，会相对于启动 cwd 规范化为绝对路径。其他路径形式的 argv 字段如果不在该列表中，仍然会相对于 worktree cwd 解析——为了安全，请使用绝对路径。
在 `docs/design/worktree.md` 中查看路线图。

## 故障排除

**页脚没有显示工作树指示器，即使我刚创建了一个。**
检查 `ui.hideBuiltinWorktreeIndicator` 是否未设置为 `true`。另外，确认工具的成功消息中的 slug 非空。

**`--resume` 没有恢复我的工作树。**
检查 `<chatsDir>/<sessionId>.worktree.json` 是否存在。CLI 会在工作树目录消失时自动删除 sidecar，因此缺少 sidecar 加上缺少目录是正常的“无工作树可恢复”状态——这不是 bug。使用 `--debug` 运行并搜索 `restoreWorktreeContext` 来查看原因。

**`exit_worktree` 提示“由不同的会话创建”。**
这是会话所有权保护机制。请恢复原始会话并从那里退出，或者手动运行建议的 `git worktree remove …` 命令。

**过时的 `agent-<hex>` 工作树不断堆积。**
30 天截止是保守的；可以手动清理，使用 `git worktree list && git worktree remove <path>`，或者等待——超过 30 天后，只要这些工作树是干净的并且已推送，下一次 CLI 启动时会自动清理它们。