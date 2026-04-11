# 代码审查

> 使用 `/review` 审查代码变更的正确性、安全性、性能和代码质量。

## 快速开始

```bash
# Review local uncommitted changes
/review

# Review a pull request (by number or URL)
/review 123
/review https://github.com/org/repo/pull/123

# Review and post inline comments on the PR
/review 123 --comment

# Review a specific file
/review src/utils/auth.ts
```

如果没有未提交的变更，`/review` 会提示你并停止运行——不会启动任何 agent。

## 工作原理

`/review` 命令会运行一个多阶段流水线：

```
Step 1:  确定范围（本地 diff / PR worktree / 文件）
Step 2:  加载项目审查规则
Step 3:  运行确定性分析（linter、typecheck）    [零 LLM 成本]
Step 4:  5 个并行审查 agent                          [5 次 LLM 调用]
           |-- Agent 1: 正确性与安全性
           |-- Agent 2: 代码质量
           |-- Agent 3: 性能与效率
           |-- Agent 4: 无定向审计
           '-- Agent 5: 构建与测试（运行 shell 命令）
Step 5:  去重 --> 批量验证 --> 聚合         [1 次 LLM 调用]
Step 6:  反向审计（发现覆盖盲区）                 [1 次 LLM 调用]
Step 7:  展示发现结果 + 审查结论
Step 8:  自动修复（需用户确认，可选）
Step 9:  发布 PR 行内评论（如请求）
Step 10: 保存报告 + 增量缓存
Step 11: 清理（移除 worktree + 临时文件）
```

### 审查 Agent

| Agent                             | 关注点                                                              |
| --------------------------------- | ------------------------------------------------------------------ |
| Agent 1: 正确性与安全性   | 逻辑错误、空值处理、竞态条件、注入、XSS、SSRF |
| Agent 2: 代码质量             | 风格一致性、命名规范、重复代码、死代码                  |
| Agent 3: 性能与效率 | N+1 查询、内存泄漏、不必要的重新渲染、打包体积     |
| Agent 4: 无定向审计         | 业务逻辑、边界交互、隐式耦合             |
| Agent 5: 构建与测试             | 运行构建和测试命令，报告失败情况                     |

所有 agent 并行运行。Agent 1-4 的发现结果会在**单次批量验证**中进行验证（一个 agent 一次性审查所有发现，保持 LLM 调用次数固定）。验证完成后，**反向审计 agent** 会结合所有已确认的发现结果重新阅读整个 diff，以捕捉其他 agent 遗漏的问题。反向审计的发现结果会跳过验证步骤（该 agent 已具备完整上下文），并直接作为高置信度结果纳入报告。

## 确定性分析

在 LLM agent 运行之前，`/review` 会自动运行项目现有的 linter 和 type checker：

| 语言              | 检测到的工具                                                   |
| --------------------- | ---------------------------------------------------------------- |
| TypeScript/JavaScript | `tsc --noEmit`, `npm run lint`, `eslint`                         |
| Python                | `ruff`, `mypy`, `flake8`                                         |
| Rust                  | `cargo clippy`                                                   |
| Go                    | `go vet`, `golangci-lint`                                        |
| Java                  | `mvn compile`, `checkstyle`, `spotbugs`, `pmd`                   |
| C/C++                 | `clang-tidy` (if `compile_commands.json` available)              |
| 其他                 | 从 CI 配置自动发现（`.github/workflows/*.yml` 等） |

对于不符合标准模式的项目（例如 OpenJDK），`/review` 会读取 CI 配置文件以发现项目使用的 lint/check 命令。无需用户额外配置。

确定性分析发现的问题会标记为 `[linter]` 或 `[typecheck]`，并跳过 LLM 验证——它们被视为基准事实。

- **Errors** → Critical 级别
- **Warnings** → Nice to have（仅终端显示，不作为 PR 评论发布）

如果某个工具未安装或超时，将被跳过并附带提示信息。

## 严重级别

| 严重级别         | 含义                                                             | 是否作为 PR 评论发布？      |
| ---------------- | ------------------------------------------------------------------- | -------------------------- |
| **Critical**     | 合并前必须修复（Bug、安全问题、数据丢失、构建失败） | 是（仅高置信度） |
| **Suggestion**   | 建议改进                                             | 是（仅高置信度） |
| **Nice to have** | 可选优化                                               | 否（仅终端显示）         |

低置信度的发现结果会显示在终端独立的 "Needs Human Review" 区域中，且绝不会作为 PR 评论发布。

## 自动修复

展示发现结果后，`/review` 会询问是否自动应用针对具有明确解决方案的 Critical 和 Suggestion 级别问题的修复：

```
Found 3 issues with auto-fixable suggestions. Apply auto-fixes? (y/n)
```

- 修复通过 `edit` 工具应用（精准替换，而非重写整个文件）
- 修复后会针对每个文件运行 linter 检查，确保不会引入新问题
- 对于 PR 审查，修复会自动从 worktree 提交并推送——你的工作区保持干净
- Nice to have 和低置信度的发现结果绝不会自动修复
- PR 审查提交始终使用**修复前的结论**（例如 "Request changes"），因为远程 PR 在自动修复推送完成前尚未更新

## Worktree 隔离

审查 PR 时，`/review` 会创建一个临时的 git worktree（`.qwen/tmp/review-pr-<number>`），而不是切换你当前的分支。这意味着：

- 你的工作区、暂存变更和当前分支**绝不会受到影响**
- 依赖会安装在 worktree 中（`npm ci` 等），以确保 lint 和构建/测试正常运行
- 构建和测试命令在隔离环境中运行，不会污染本地构建缓存
- 如果出现问题，你的环境不受影响——只需删除 worktree 即可
- 审查完成后，worktree 会自动清理
- 如果审查被中断（Ctrl+C 或崩溃），下次对同一 PR 执行 `/review` 时，会在重新开始之前自动清理残留的 worktree
- 审查报告和缓存会保存到主项目目录（而非 worktree）

## 跨仓库 PR 审查

你可以通过传入完整 URL 来审查其他仓库的 PR：

```bash
/review https://github.com/other-org/other-repo/pull/456
```

此模式以**轻量模式**运行——无 worktree、无 linter、无构建/测试、无自动修复。审查仅基于 diff 文本（通过 GitHub API 获取）。如果你拥有写入权限，仍可发布 PR 评论。

| 功能                                       | 同仓库 | 跨仓库                    |
| ------------------------------------------------ | --------- | ----------------------------- |
| LLM 审查（Agent 1-4 + 验证 + 反向审计） | ✅        | ✅                            |
| Agent 5: 构建与测试                            | ✅        | ❌（无本地代码库）        |
| 确定性分析（linter/typecheck）        | ✅        | ❌                            |
| 跨文件影响分析                       | ✅        | ❌                            |
| 自动修复                                          | ✅        | ❌                            |
| PR 行内评论                               | ✅        | ✅（需具备写入权限） |
| 增量审查缓存                         | ✅        | ❌                            |

## PR 行内评论

使用 `--comment` 将发现结果直接发布到 PR 上：

```bash
/review 123 --comment
```

或者，在运行 `/review 123` 后，输入 `post comments` 即可发布发现结果，无需重新运行审查。

**发布的内容：**

- 高置信度的 Critical 和 Suggestion 发现结果，作为特定代码行的行内评论
- 对于 Approve/Request changes 结论：附带结论的审查摘要
- 对于 Comment 结论且所有行内评论已发布：无单独摘要（行内评论已足够）
- 每条评论底部的模型归属标识（例如 _— qwen3-coder via Qwen Code /review_）

**仅终端显示的内容：**

- Nice to have 发现结果（包括 linter 警告）
- 低置信度发现结果

## 后续操作

审查完成后，上下文感知的提示会以 ghost text 形式出现。按 Tab 键接受：

| 审查后状态                 | 提示                | 执行操作                            |
| ---------------------------------- | ------------------ | --------------------------------------- |
| 本地审查存在未修复问题 | `fix these issues` | LLM 交互式修复每个问题    |
| PR 审查存在发现结果            | `post comments`    | 发布 PR 行内评论（不重新审查） |
| PR 审查，零发现结果           | `post comments`    | 在 GitHub 上批准 PR（LGTM）        |
| 本地审查，全部通过            | `commit`           | 提交你的变更                    |

注意：`fix these issues` 仅适用于本地审查。对于 PR 审查，请使用自动修复（Step 8）——审查完成后 worktree 会被清理，因此审查后无法进行交互式修复。

## 项目审查规则

你可以按项目自定义审查标准。`/review` 会按以下顺序读取规则文件：

1. `.qwen/review-rules.md`（Qwen Code 原生）
2. `.github/copilot-instructions.md`（优先）或 `copilot-instructions.md`（备选——仅加载其中一个，不会同时加载）
3. `AGENTS.md` — `## Code Review` 部分
4. `QWEN.md` — `## Code Review` 部分

规则会作为附加标准注入到 LLM 审查 agent（1-4）中。对于 PR 审查，规则从**基础分支（base branch）**读取，以防止恶意 PR 注入绕过规则。

`.qwen/review-rules.md` 示例：

```markdown
# 审查规则

- 所有 API 端点必须验证身份认证
- 数据库查询必须使用参数化语句
- React 组件不得使用内联样式
- 错误信息不得暴露内部路径
```

## 增量审查

审查之前已审查过的 PR 时，`/review` 仅检查自上次审查以来的变更：

```bash
# First review — full review, cache created
/review 123

# PR updated with new commits — only new changes reviewed
/review 123
```

### 跨模型审查

如果你切换了模型（通过 `/model`）并重新审查同一 PR，`/review` 会检测到模型变更并执行完整审查，而不是跳过：

```bash
# Review with model A
/review 123

# Switch model
/model

# Review again — full review with model B (not skipped)
/review 123
# → "Previous review used qwen3-coder. Running full review with gpt-4o for a second opinion."
```

缓存存储在 `.qwen/review-cache/` 中，并跟踪 commit SHA 和模型 ID。请确保该目录已加入 `.gitignore`（使用 `.qwen/*` 等更宽泛的规则也可以）。如果缓存的 commit 已被 rebase 移除，则会回退到完整审查。

## 审查报告

对于同仓库审查，结果会保存为 Markdown 文件至项目的 `.qwen/reviews/` 目录（跨仓库轻量审查不保存报告）：

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

报告包含：时间戳、diff 统计信息、确定性分析结果、所有发现结果及其验证状态，以及审查结论。

## 跨文件影响分析

当代码变更修改了导出的函数、类或接口时，审查 agent 会自动搜索所有调用方并检查兼容性：

- 参数数量/类型变更
- 返回值类型变更
- 移除或重命名的公共方法
- 破坏性 API 变更

对于大型 diff（>10 个修改的符号），分析会优先处理签名发生变更的函数。

## Token 效率

无论产生多少发现结果，审查流水线使用的 LLM 调用次数都是固定的：

| 阶段                           | LLM 调用次数  | 说明                                               |
| ------------------------------- | ---------- | --------------------------------------------------- |
| 确定性分析（Step 3） | 0          | 仅执行 Shell 命令                                 |
| 审查 agent（Step 4）          | 5（或 4）   | 并行运行；跨仓库模式下跳过 Agent 5 |
| 批量验证（Step 5）     | 1          | 单个 agent 一次性验证所有发现结果          |
| 反向审计（Step 6）          | 1          | 发现覆盖盲区；发现结果跳过验证     |
| **总计**                       | **7 或 6** | 同仓库：7；跨仓库：6（无 Agent 5）            |

## 不会标记的内容

审查会刻意排除以下内容：

- 未变更代码中已存在的问题（仅关注 diff）
- 符合你代码库规范的风格/格式/命名
- linter 或 type checker 能捕获的问题（由确定性分析处理）
- 没有实际问题的主观“建议考虑做 X”
- 不修复 Bug 或风险的微小重构
- 缺失的文档（除非逻辑确实令人困惑）
- 现有 PR 评论中已讨论过的问题（避免重复人工反馈）

## 设计理念

> **沉默优于噪音。** 每条评论都应值得读者花时间阅读。

- 如果不确定是否为问题 → 不要报告
- Linter/typecheck 问题由工具处理，而非 LLM 猜测
- N 个文件中出现的相同模式 → 聚合为一条发现结果
- PR 评论仅包含高置信度内容
- 符合代码库规范的风格/格式问题会被排除