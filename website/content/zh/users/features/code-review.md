# Code Review

> 使用 `/review` 对代码变更进行正确性、安全性、性能和代码质量审查。

## 快速开始

```bash
# 审查本地未提交的变更
/review

# 审查某个 pull request（按编号或 URL）
/review 123
/review https://github.com/org/repo/pull/123

# 审查并在 PR 上发布行内评论
/review 123 --comment

# 审查特定文件
/review src/utils/auth.ts
```

如果没有未提交的变更，`/review` 会提示并停止——不会启动任何 agent。

## 工作原理

`/review` 命令运行多阶段流水线：

```
Step 1:  确定范围（本地 diff / PR worktree / 文件）
Step 2:  加载项目审查规则
Step 3:  运行确定性分析（linter、typecheck）           [零 LLM 成本]
Step 4:  9 个并行审查 agent                            [9 次 LLM 调用]
           |-- Agent 1: 正确性
           |-- Agent 2: 安全性
           |-- Agent 3: 代码质量
           |-- Agent 4: 性能与效率
           |-- Agent 5: 测试覆盖率
           |-- Agent 6: 无方向性审计（3 个角色：6a/6b/6c）
           '-- Agent 7: 构建与测试（运行 shell 命令）
Step 5:  去重 --> 批量验证 --> 聚合                    [1 次 LLM 调用]
Step 6:  迭代逆向审计（1-3 轮，发现遗漏）              [1-3 次 LLM 调用]
Step 7:  展示发现结果 + 结论
Step 8:  自动修复（用户确认，可选）
Step 9:  发布 PR 行内评论（如已请求）
Step 10: 保存报告 + 增量缓存
Step 11: 清理（删除 worktree 及临时文件）
```

### 审查 Agent

| Agent                             | 关注点                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Agent 1: 正确性                   | 逻辑错误、边界情况、null 处理、竞态条件、类型安全                                            |
| Agent 2: 安全性                   | 注入攻击、XSS、SSRF、认证绕过、敏感数据暴露                                                   |
| Agent 3: 代码质量                 | 风格一致性、命名规范、重复代码、死代码                                                        |
| Agent 4: 性能与效率               | N+1 查询、内存泄漏、不必要的重渲染、bundle 体积                                              |
| Agent 5: 测试覆盖率               | diff 中未测试的代码路径、缺失的分支覆盖、断言过弱                                             |
| Agent 6: 无方向性审计             | 3 个并行角色（攻击者 / 凌晨三点值班 / 维护者）——捕获跨维度问题                              |
| Agent 7: 构建与测试               | 运行构建和测试命令，报告失败                                                                  |

所有 agent 并行运行（Agent 6 同时启动 3 个角色变体，同仓库审查共 9 个并行任务）。Agent 1-6 的发现结果通过**单次批量验证**处理（一个 agent 同时验证所有发现，验证成本固定，不随发现数量增加）。验证完成后，**迭代逆向审计**运行 1-3 轮，每轮接收前几轮的累计发现列表，从而聚焦于尚未发现的问题。当某轮返回"No issues found"或达到 3 轮上限时，循环停止。逆向审计的发现跳过验证（agent 已具备完整上下文），作为高置信度结果纳入。

## 确定性分析

在 LLM agent 运行之前，`/review` 自动运行项目已有的 linter 和类型检查工具：

| 语言                  | 检测工具                                                         |
| --------------------- | ---------------------------------------------------------------- |
| TypeScript/JavaScript | `tsc --noEmit`、`npm run lint`、`eslint`                         |
| Python                | `ruff`、`mypy`、`flake8`                                         |
| Rust                  | `cargo clippy`                                                   |
| Go                    | `go vet`、`golangci-lint`                                        |
| Java                  | `mvn compile`、`checkstyle`、`spotbugs`、`pmd`                   |
| C/C++                 | `clang-tidy`（需要 `compile_commands.json`）                     |
| 其他                  | 从 CI 配置自动发现（`.github/workflows/*.yml` 等）               |

对于不匹配标准模式的项目（如 OpenJDK），`/review` 读取 CI 配置文件以发现项目使用的 lint/check 命令，无需用户手动配置。

确定性发现结果带有 `[linter]` 或 `[typecheck]` 标签，跳过 LLM 验证——它们是基础事实。

- **Errors** → Critical 严重级别
- **Warnings** → Nice to have（仅显示在终端，不作为 PR 评论发布）

如果某工具未安装或超时，会跳过并显示提示信息。

## 严重级别

| 严重级别         | 含义                                                                | 是否发布为 PR 评论？       |
| ---------------- | ------------------------------------------------------------------- | -------------------------- |
| **Critical**     | 合并前必须修复（bug、安全问题、数据丢失、构建失败）                 | 是（仅高置信度）           |
| **Suggestion**   | 建议改进                                                            | 是（仅高置信度）           |
| **Nice to have** | 可选优化                                                            | 否（仅终端显示）           |

低置信度发现结果显示在终端的独立"Needs Human Review"区域，不会发布为 PR 评论。

## 自动修复

展示发现结果后，`/review` 会为有明确解决方案的 Critical 和 Suggestion 发现提供自动修复：

```
Found 3 issues with auto-fixable suggestions. Apply auto-fixes? (y/n)
```

- 修复使用 `edit` 工具应用（针对性替换，而非重写整个文件）
- 修复后对每个文件运行 linter 检查，确保不引入新问题
- 对于 PR 审查，修复会从 worktree 自动提交并推送——你的工作树保持干净
- Nice to have 和低置信度发现结果永远不会自动修复
- PR 审查提交始终使用**修复前的结论**（如"Request changes"），因为自动修复推送完成前远端 PR 尚未更新

## Worktree 隔离

审查 PR 时，`/review` 创建临时 git worktree（`.qwen/tmp/review-pr-<number>`），而不是切换当前分支。这意味着：

- 你的工作树、暂存区和当前分支**永远不会被修改**
- 依赖项在 worktree 中安装（`npm ci` 等），linting 和构建/测试正常工作
- 构建和测试命令在隔离环境中运行，不污染本地构建缓存
- 如果出现任何问题，你的环境不受影响——直接删除 worktree 即可
- 审查完成后自动清理 worktree
- 如果审查被中断（Ctrl+C、崩溃），下次对同一 PR 运行 `/review` 时会自动清理残留 worktree 后重新开始
- 审查报告和缓存保存到主项目目录（而非 worktree）

## 跨仓库 PR 审查

可通过传入完整 URL 审查其他仓库的 PR：

```bash
/review https://github.com/other-org/other-repo/pull/456
```

这以**轻量模式**运行——无 worktree、无 linter、无构建/测试、无自动修复。审查仅基于 diff 文本（通过 GitHub API 获取）。如果你有写入权限，仍可发布 PR 评论。

| 功能                                                        | 同仓库    | 跨仓库                        |
| ---------------------------------------------------------- | --------- | ----------------------------- |
| LLM 审查（Agent 1-6 + 验证 + 迭代逆向审计）                | ✅        | ✅                            |
| Agent 7：构建与测试                                         | ✅        | ❌（无本地代码库）            |
| 确定性分析（linter/typecheck）                              | ✅        | ❌                            |
| 跨文件影响分析                                              | ✅        | ❌                            |
| 自动修复                                                    | ✅        | ❌                            |
| PR 行内评论                                                 | ✅        | ✅（需要写入权限）            |
| 增量审查缓存                                                | ✅        | ❌                            |

## PR 行内评论

使用 `--comment` 将发现结果直接发布到 PR：

```bash
/review 123 --comment
```

或者，在运行 `/review 123` 之后，输入 `post comments` 发布发现结果，无需重新审查。

**发布内容：**

- 高置信度的 Critical 和 Suggestion 发现作为特定行的行内评论
- Approve/Request changes 结论：包含结论的审查摘要
- Comment 结论且所有行内评论已发布：不单独生成摘要（行内评论已足够）
- 每条评论附有模型署名（如 _— qwen3-coder via Qwen Code /review_）

**仅在终端显示的内容：**

- Nice to have 发现（包括 linter 警告）
- 低置信度发现

**自己提交的 PR：** GitHub 不允许对自己的 pull request 提交 `APPROVE` 或 `REQUEST_CHANGES` 审查——两者均会返回 HTTP 422。当 `/review` 检测到 PR 作者与当前认证用户一致时，会自动将 API event 降级为 `COMMENT`，确保提交成功。终端仍显示真实结论（"Approve" / "Request changes" / "Comment"）——仅 GitHub 侧的审查 event 被中和。实际发现结果仍作为特定行的行内评论显示，实质性反馈不受影响。

**重新审查已有 Qwen Code 评论的 PR：** 当 `/review` 在已有 Qwen Code 审查评论的 PR 上运行时，会在发布新评论前对旧评论进行分类。只有**同行重叠**（同一 `(path, line)` 上已存在评论且新发现与之重合）才需要确认——这是同一代码行出现视觉重复的情形。来自旧提交的评论、已被回复的评论（视为已解决）以及与新发现不重叠的评论会被静默过滤，并在终端输出日志，告知过滤情况。

**APPROVE 前的 CI/构建状态检查：** 如果结论为"Approve"，`/review` 会在提交前查询 PR 的 check-runs 和 commit statuses。如果任何检查失败（或所有检查仍在等待），API event 会自动从 `APPROVE` 降级为 `COMMENT`，并在审查说明中解释原因。原因：LLM 审查以静态方式读取代码，无法感知运行时测试失败；在 CI 红灯状态下批准会产生误导。行内发现结果仍照常发布。如需强制批准（如已知的不稳定 CI 失败），在验证后手动在 GitHub 提交即可。

## 后续操作

审查完成后，上下文感知提示以 ghost text 形式显示，按 Tab 接受：

| 审查后状态                         | 提示               | 触发效果                                    |
| ---------------------------------- | ------------------ | --------------------------------------- |
| 本地审查存在未修复发现             | `fix these issues` | LLM 交互式修复每个发现                  |
| PR 审查存在发现                    | `post comments`    | 发布 PR 行内评论（不重新审查）          |
| PR 审查，零发现                    | `post comments`    | 在 GitHub 上批准 PR（LGTM）             |
| 本地审查，一切正常                 | `commit`           | 提交你的变更                            |

注意：`fix these issues` 仅适用于本地审查。对于 PR 审查，请使用自动修复（Step 8）——审查完成后 worktree 会被清理，因此无法在审查后进行交互式修复。

## 项目审查规则

可以按项目自定义审查标准。`/review` 按以下顺序读取规则文件：

1. `.qwen/review-rules.md`（Qwen Code 原生）
2. `.github/copilot-instructions.md`（优先）或 `copilot-instructions.md`（回退——两者只加载其一）
3. `AGENTS.md` — `## Code Review` 章节
4. `QWEN.md` — `## Code Review` 章节

规则作为附加标准注入 LLM 审查 agent（1-6）。对于 PR 审查，规则从**目标分支**读取，以防恶意 PR 注入绕过规则。

示例 `.qwen/review-rules.md`：

```markdown
# Review Rules

- All API endpoints must validate authentication
- Database queries must use parameterized statements
- React components must not use inline styles
- Error messages must not expose internal paths
```

## 增量审查

审查之前已审查过的 PR 时，`/review` 只检查上次审查以来的新变更：

```bash
# 首次审查——完整审查，创建缓存
/review 123

# PR 新增提交——仅审查新变更
/review 123
```

### 跨模型审查

如果通过 `/model` 切换模型后重新审查同一 PR，`/review` 会检测到模型变更并运行完整审查而非跳过：

```bash
# 使用模型 A 审查
/review 123

# 切换模型
/model

# 再次审查——使用模型 B 完整审查（不跳过）
/review 123
# → "Previous review used qwen3-coder. Running full review with gpt-4o for a second opinion."
```

缓存存储在 `.qwen/review-cache/` 中，同时追踪 commit SHA 和模型 ID。请确保将该目录加入 `.gitignore`（更宽泛的规则如 `.qwen/*` 同样有效）。如果缓存的 commit 因 rebase 不再存在，会回退到完整审查。

## 审查报告

对于同仓库审查，结果保存为项目 `.qwen/reviews/` 目录下的 Markdown 文件（跨仓库轻量审查跳过报告持久化）：

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

报告包含：时间戳、diff 统计、确定性分析结果、所有发现及其验证状态，以及最终结论。

## 跨文件影响分析

当代码变更修改了导出的函数、类或接口时，审查 agent 会自动搜索所有调用方并检查兼容性：

- 参数数量/类型变更
- 返回类型变更
- 公共方法被移除或重命名
- 破坏性 API 变更

对于大型 diff（超过 10 个修改符号），分析优先处理有签名变更的函数。

## Token 效率

审查流水线使用固定数量的 LLM 调用，不随发现数量增加：

| 阶段                             | LLM 调用次数      | 备注                                                |
| -------------------------------- | ----------------- | --------------------------------------------------- |
| 确定性分析（Step 3）             | 0                 | 仅运行 shell 命令                                   |
| 审查 agent（Step 4）             | 9（或 8）         | 并行运行；跨仓库模式跳过 Agent 7                    |
| 批量验证（Step 5）               | 1                 | 单个 agent 同时验证所有发现                         |
| 迭代逆向审计（Step 6）           | 1-3               | 循环直到"No issues found"或达到 3 轮上限            |
| **总计**                         | **11-13（10-12）**| 同仓库：11-13；跨仓库：10-12（无 Agent 7）          |

大多数 PR 收敛到区间下限（1 轮逆向审计）；上限防止极端情况下成本失控。

## 不会标记的内容

审查有意排除以下内容：

- 未变更代码中的已有问题（仅关注 diff）
- 符合代码库规范的风格/格式/命名
- linter 或类型检查器会捕获的问题（由确定性分析处理）
- 没有实际问题的主观"考虑做 X"建议
- 不修复 bug 或风险的小型重构
- 除非逻辑确实令人困惑，否则不标记缺少文档
- 已在现有 PR 评论中讨论过的问题（避免重复人工反馈）

## 设计理念

> **沉默胜于噪音。每条评论都应值得读者花时间阅读。**

- 如果不确定某件事是否是问题 → 不上报
- Linter/typecheck 问题由工具处理，不依赖 LLM 猜测
- 同一模式出现在 N 个文件中 → 聚合为一条发现
- PR 评论仅包含高置信度发现
- 符合代码库规范的风格/格式问题不纳入
