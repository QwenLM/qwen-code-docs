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

如果没有未提交的变更，`/review` 会提示你并停止——不会启动任何 Agent。

## 工作原理

`/review` 命令会运行一个多阶段流水线：

```
Step 1:  Determine scope (local diff / PR worktree / file)
Step 2:  Load project review rules
Step 3:  Run deterministic analysis (linter, typecheck)    [zero LLM cost]
Step 4:  9 parallel review agents                          [9 LLM calls]
           |-- Agent 1: Correctness
           |-- Agent 2: Security
           |-- Agent 3: Code Quality
           |-- Agent 4: Performance & Efficiency
           |-- Agent 5: Test Coverage
           |-- Agent 6: Undirected Audit (3 personas: 6a/6b/6c)
           '-- Agent 7: Build & Test (runs shell commands)
Step 5:  Deduplicate --> Batch verify --> Aggregate         [1 LLM call]
Step 6:  Iterative reverse audit (1-3 rounds, gap finding) [1-3 LLM calls]
Step 7:  Present findings + verdict
Step 8:  Autofix (user-confirmed, optional)
Step 9:  Post PR inline comments (if requested)
Step 10: Save report + incremental cache
Step 11: Clean up (remove worktree + temp files)
```

### 审查 Agent

| Agent                             | 关注点                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Agent 1: Correctness              | 逻辑错误、边界情况、空值处理、竞态条件、类型安全                       |
| Agent 2: Security                 | 注入攻击、XSS、SSRF、认证绕过、敏感数据泄露                                  |
| Agent 3: Code Quality             | 风格一致性、命名规范、代码重复、死代码                                           |
| Agent 4: Performance & Efficiency | N+1 查询、内存泄漏、不必要的重新渲染、打包体积                              |
| Agent 5: Test Coverage            | diff 中未覆盖的代码路径、缺失的分支覆盖、薄弱的断言                   |
| Agent 6: Undirected Audit         | 3 个并行 persona（攻击者 / 凌晨值班工程师 / 维护者）——捕获跨维度问题 |
| Agent 7: Build & Test             | 运行构建和测试命令，报告失败情况                                              |

所有 Agent 并行运行（Agent 6 会并发启动 3 个 persona 变体，同仓库审查总计 9 个并行任务）。Agent 1-6 的发现结果会在**单次批量验证**中进行验证（一个 Agent 一次性审查所有发现，确保验证成本不随发现数量增加）。验证完成后，**迭代反向审计**会执行 1-3 轮查漏补缺——每轮都会接收前几轮的累计发现列表，因此后续轮次会专注于尚未发现的问题。一旦某轮返回“未发现任何问题”，循环立即停止，或达到 3 轮上限后停止。反向审计的发现结果跳过验证（该 Agent 已具备完整上下文），并作为高置信度结果直接纳入。

## 确定性分析

在 LLM Agent 运行之前，`/review` 会自动运行项目现有的 linter 和类型检查器：

| 语言              | 检测到的工具                                                   |
| --------------------- | ---------------------------------------------------------------- |
| TypeScript/JavaScript | `tsc --noEmit`, `npm run lint`, `eslint`                         |
| Python                | `ruff`, `mypy`, `flake8`                                         |
| Rust                  | `cargo clippy`                                                   |
| Go                    | `go vet`, `golangci-lint`                                        |
| Java                  | `mvn compile`, `checkstyle`, `spotbugs`, `pmd`                   |
| C/C++                 | `clang-tidy` (若存在 `compile_commands.json`)              |
| 其他                 | 从 CI 配置自动发现 (`.github/workflows/*.yml` 等) |

对于不符合标准模式的项目（例如 OpenJDK），`/review` 会读取 CI 配置文件以发现项目使用的 lint/check 命令。无需用户手动配置。

确定性分析结果会标记为 `[linter]` 或 `[typecheck]`，并跳过 LLM 验证——它们被视为事实依据。

- **Errors** → Critical 级别
- **Warnings** → Nice to have（仅终端显示，不作为 PR 评论发布）

如果某个工具未安装或超时，将被跳过并附带提示信息。

## 严重级别

| 严重级别         | 含义                                                             | 是否作为 PR 评论发布？      |
| ---------------- | ------------------------------------------------------------------- | -------------------------- |
| **Critical**     | 合并前必须修复（bug、安全漏洞、数据丢失、构建失败） | 是（仅限高置信度） |
| **Suggestion**   | 建议改进                                             | 是（仅限高置信度） |
| **Nice to have** | 可选优化                                               | 否（仅终端显示）         |

低置信度的发现结果会显示在终端的独立“Needs Human Review”部分，且绝不会作为 PR 评论发布。

## 自动修复

展示发现结果后，`/review` 会提供自动应用修复的选项，针对具有明确解决方案的 Critical 和 Suggestion 级别问题：

```
Found 3 issues with auto-fixable suggestions. Apply auto-fixes? (y/n)
```

- 修复通过 `edit` 工具应用（精准替换，而非重写整个文件）
- 修复完成后会运行逐文件 linter 检查，确保不会引入新问题
- 对于 PR 审查，修复会自动从 worktree 提交并推送——你的本地工作区保持干净
- Nice to have 和低置信度的发现结果永远不会自动修复
- PR 审查提交始终使用**修复前的结论**（例如 "Request changes"），因为在自动修复推送完成前，远程 PR 尚未更新

## Worktree 隔离

审查 PR 时，`/review` 会创建一个临时 git worktree（`.qwen/tmp/review-pr-<number>`），而不是切换你当前的分支。这意味着：

- 你的工作区、暂存变更和当前分支**绝不会受到影响**
- 依赖会在 worktree 中安装（`npm ci` 等），以确保 lint 和构建/测试正常运行
- 构建和测试命令在隔离环境中运行，不会污染本地构建缓存
- 如果出现问题，你的本地环境不受影响——只需删除 worktree 即可
- 审查完成后，worktree 会自动清理
- 如果审查被中断（Ctrl+C 或崩溃），下次对同一 PR 执行 `/review` 时，会在开始前自动清理残留的 worktree
- 审查报告和缓存会保存到主项目目录（而非 worktree）

## 跨仓库 PR 审查

你可以通过传入完整 URL 来审查其他仓库的 PR：

```bash
/review https://github.com/other-org/other-repo/pull/456
```

此模式以**轻量级模式**运行——无 worktree、无 linter、无构建/测试、无自动修复。审查仅基于 diff 文本（通过 GitHub API 获取）。如果你拥有写入权限，仍可发布 PR 评论。

| 能力                                       | 同仓库 | 跨仓库                    |
| ------------------------------------------------ | --------- | ----------------------------- |
| LLM 审查（Agent 1-6 + 验证 + 迭代反向审计） | ✅        | ✅                            |
| Agent 7：构建与测试                                      | ✅        | ❌（无本地代码库）        |
| 确定性分析（linter/类型检查）        | ✅        | ❌                            |
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

- 高置信度的 Critical 和 Suggestion 级别发现结果，作为特定代码行的行内评论
- 对于 Approve/Request changes 结论：附带结论的审查摘要
- 对于 Comment 结论且所有行内评论已发布：无单独摘要（行内评论已足够）
- 每条评论底部附带模型归属信息（例如 _— qwen3-coder via Qwen Code /review_）

**仅终端显示的内容：**

- Nice to have 发现结果（包括 linter 警告）
- 低置信度的发现结果

**自己创建的 PR：** GitHub 不允许你在自己的 PR 上提交 `APPROVE` 或 `REQUEST_CHANGES` 审查——两者都会返回 HTTP 422 错误。当 `/review` 检测到 PR 作者与当前认证用户一致时，无论结论如何，都会自动将 API 事件降级为 `COMMENT`，以确保提交成功。终端仍会显示真实的结论（"Approve" / "Request changes" / "Comment"）——仅 GitHub 端的审查事件被中和。实际的发现结果仍会作为特定代码行的行内评论显示，因此实质性反馈保持不变。

**重新审查带有历史 Qwen Code 评论的 PR：** 当 `/review` 在已有 Qwen Code 审查评论的 PR 上运行时，会在发布新评论前对其进行分类。仅当出现**同行重叠**（现有评论与新发现位于相同的 `(path, line)`）时，才会提示你确认——这是你会在同一行代码上看到视觉重复的情况。来自旧 commit 的评论、已回复的评论（视为已解决）以及不与任何新发现重叠的评论会被静默跳过，并在终端输出日志行以便你了解过滤情况。

**APPROVE 前的 CI / 构建状态检查：** 如果结论为 "Approve"，`/review` 会在提交前查询 PR 的 check-runs 和 commit 状态。如果有任何检查失败（或所有检查仍在 pending），API 事件会自动从 `APPROVE` 降级为 `COMMENT`，并在审查正文中说明原因。理由：LLM 审查是静态读取代码，无法看到运行时测试失败；在 CI 标红时批准会产生误导。行内发现结果仍会照常发布。如果你仍想批准（例如已知的 CI 不稳定失败），请在验证后手动提交 GitHub 批准。

## 后续操作

审查结束后，上下文感知的提示会以 ghost text 形式出现。按 Tab 键接受：

| 审查后状态                 | 提示                | 执行操作                            |
| ---------------------------------- | ------------------ | --------------------------------------- |
| 本地审查且存在未修复问题 | `fix these issues` | LLM 交互式修复每个问题    |
| PR 审查且存在发现结果            | `post comments`    | 发布 PR 行内评论（无需重新审查） |
| PR 审查且零发现           | `post comments`    | 在 GitHub 上批准 PR（LGTM）        |
| 本地审查且全部通过            | `commit`           | 提交你的变更                    |

注意：`fix these issues` 仅适用于本地审查。对于 PR 审查，请使用 Autofix（第 8 步）——审查完成后 worktree 会被清理，因此审查后无法进行交互式修复。

## 项目审查规则

你可以按项目自定义审查标准。`/review` 会按以下顺序读取规则文件：

1. `.qwen/review-rules.md`（Qwen Code 原生）
2. `.github/copilot-instructions.md`（首选）或 `copilot-instructions.md`（备选——仅加载其中一个，不会同时加载）
3. `AGENTS.md` — `## Code Review` 部分
4. `QWEN.md` — `## Code Review` 部分

规则会作为附加标准注入到 LLM 审查 Agent（1-6）中。对于 PR 审查，规则从**基础分支（base branch）**读取，以防止恶意 PR 注入绕过规则。

示例 `.qwen/review-rules.md`：

```markdown
# Review Rules

- All API endpoints must validate authentication
- Database queries must use parameterized statements
- React components must not use inline styles
- Error messages must not expose internal paths
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

如果你切换模型（通过 `/model`）并重新审查同一 PR，`/review` 会检测到模型变更并运行完整审查，而不是跳过：

```bash
# Review with model A
/review 123

# Switch model
/model

# Review again — full review with model B (not skipped)
/review 123
# → "Previous review used qwen3-coder. Running full review with gpt-4o for a second opinion."
```

缓存存储在 `.qwen/review-cache/` 中，并跟踪 commit SHA 和模型 ID。请确保该目录已加入 `.gitignore`（使用更宽泛的规则如 `.qwen/*` 也可以）。如果缓存的 commit 被 rebase 移除，则会回退到完整审查。

## 审查报告

对于同仓库审查，结果会保存为 Markdown 文件，位于项目的 `.qwen/reviews/` 目录中（跨仓库轻量级审查不持久化报告）：

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

报告包含：时间戳、diff 统计、确定性分析结果、所有附带验证状态的发现结果，以及最终结论。

## 跨文件影响分析

当代码变更修改了导出的函数、类或接口时，审查 Agent 会自动搜索所有调用方并检查兼容性：

- 参数数量/类型变更
- 返回类型变更
- 移除或重命名的公共方法
- 破坏性 API 变更

对于大型 diff（>10 个修改的符号），分析会优先处理签名发生变化的函数。

## Token 效率

无论产生多少发现结果，审查流水线使用的 LLM 调用次数都是有限的：

| 阶段                            | LLM 调用次数         | 说明                                                |
| -------------------------------- | ----------------- | ---------------------------------------------------- |
| 确定性分析（第 3 步）  | 0                 | 仅执行 Shell 命令                                  |
| 审查 Agent（第 4 步）           | 9（或 8）          | 并行运行；跨仓库模式下跳过 Agent 7  |
| 批量验证（第 5 步）      | 1                 | 单个 Agent 一次性验证所有发现结果           |
| 迭代反向审计（第 6 步） | 1-3               | 循环直到“未发现任何问题”或达到 3 轮上限         |
| **总计**                        | **11-13（10-12）** | 同仓库：11-13；跨仓库：10-12（无 Agent 7）     |

大多数 PR 会收敛到范围的下限（1 轮反向审计）；上限可防止极端情况下的成本失控。

## 不会标记的内容

审查会刻意排除以下内容：

- 未变更代码中已存在的问题（仅关注 diff）
- 符合你代码库规范的样式/格式/命名
- linter 或类型检查器能捕获的问题（由确定性分析处理）
- 没有实际问题的主观“建议考虑做 X”
- 不修复 bug 或风险的小型重构
- 缺失的文档（除非逻辑确实令人困惑）
- 现有 PR 评论中已讨论过的问题（避免重复人工反馈）

## 设计理念

> **沉默优于噪音。** 每条评论都应值得读者花时间阅读。

- 如果不确定是否为问题 → 不要报告
- Linter/类型检查问题由工具处理，而非 LLM 猜测
- N 个文件中的相同模式 → 聚合为一条发现结果
- PR 评论仅包含高置信度结果
- 符合代码库规范的样式/格式问题会被排除