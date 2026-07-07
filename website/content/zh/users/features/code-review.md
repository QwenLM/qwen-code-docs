# 代码审查

> 使用 `/review` 审查代码变更的正确性、安全性、性能和代码质量。

## 快速开始

```bash
# 审查本地未提交的更改
/review

# 审查 pull request（通过编号或 URL）
/review 123
/review https://github.com/org/repo/pull/123

# 审查并在 PR 上发布行内评论
/review 123 --comment

# 审查特定文件
/review src/utils/auth.ts
```

如果没有未提交的更改，`/review` 会提示你并停止——不会启动任何 agent。

## 工作原理

`/review` 命令运行一个多阶段流水线：

```
步骤 1：确定范围（本地 diff / PR worktree / 文件）
步骤 2：加载项目审查规则
步骤 3：10 个并行审查 agent                         [10 次 LLM 调用]
           |-- Agent 0：问题保真度与根因归属
           |-- Agent 1：正确性
           |-- Agent 2：安全性
           |-- Agent 3：代码质量
           |-- Agent 4：性能与效率
           |-- Agent 5：测试覆盖率
           |-- Agent 6：无定向审计（3 个角色：6a/6b/6c）
           '-- Agent 7：构建与测试（运行 shell 命令）
步骤 4：去重 --> 批量验证 --> 聚合                   [1 次 LLM 调用]
步骤 5：迭代反向审计（1-3 轮，寻找遗漏）             [1-3 次 LLM 调用]
步骤 6：展示发现 + 结论
步骤 7：提交 PR 审查（如请求，则添加行内评论）
步骤 8：保存报告 + 增量缓存
步骤 9：清理（移除 worktree + 临时文件）
```

### 审查 Agent

| Agent                             | 关注点                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Agent 0：问题保真度           | 关联 issue 的证据、根因归属，以及 PR 是否解决了报告的问题 |
| Agent 1：正确性              | 逻辑错误、边界情况、null 处理、竞态条件、类型安全                       |
| Agent 2：安全性                 | 注入、XSS、SSRF、身份验证绕过、敏感数据泄露                                  |
| Agent 3：代码质量             | 风格一致性、命名、重复代码、死代码                                           |
| Agent 4：性能与效率 | N+1 查询、内存泄漏、不必要的重新渲染、包体积                              |
| Agent 5：测试覆盖率            | diff 中未测试的代码路径、缺失的分支覆盖率、薄弱的断言                   |
| Agent 6：无定向审计         | 3 个并行角色（攻击者 / 凌晨 3 点 oncall / 维护者）——捕获跨维度问题 |
| Agent 7：构建与测试             | 运行构建和测试命令，报告失败                                              |

所有 agent 并行运行（Agent 6 并发启动 3 个角色变体，同仓库 PR 审查总计 10 个并行任务；本地 diff 和文件路径审查跳过 Agent 0，运行 9 个任务）。Agent 0-6 的发现会在**单次批量验证**中进行验证（一个 agent 一次性审查所有发现，使验证成本固定，不随发现数量增加）。验证后，**迭代反向审计**运行 1-3 轮寻找遗漏——每一轮接收前几轮的累积发现列表，因此后续轮次专注于尚未发现的问题。一旦某轮返回“未发现问题”，或达到 3 轮（硬性上限），循环即停止。反向审计的发现跳过验证（agent 已具备完整上下文），并作为高置信度结果包含在内。

## 严重级别

| 严重级别         | 含义                                                             | 是否作为 PR 评论发布？      |
| ---------------- | ------------------------------------------------------------------- | -------------------------- |
| **Critical**     | 合并前必须修复（bug、安全问题、数据丢失、构建失败） | 是（仅限高置信度） |
| **Suggestion**   | 推荐的改进                                             | 是（仅限高置信度） |
| **Nice to have** | 可选的优化                                               | 否（仅在终端显示）         |

低置信度的发现会显示在终端单独的“需要人工审查 (Needs Human Review)”部分，且永远不会作为 PR 评论发布。

## Worktree 隔离

审查 PR 时，`/review` 会创建一个临时的 git worktree（`.qwen/tmp/review-pr-<number>`），而不是切换你当前的分支。这意味着：

- 你的工作树、暂存的更改和当前分支**不会被修改**
- 依赖项安装在 worktree 中（`npm ci` 等），以便构建/测试正常工作
- 构建和测试命令在隔离环境中运行，不会污染你的本地构建缓存
- 如果出现任何问题，你的环境不受影响——只需删除 worktree
- 审查完成后，worktree 会自动清理
- 如果审查被中断（Ctrl+C、崩溃），下次对同一 PR 运行 `/review` 时，会在重新开始之前自动清理过期的 worktree
- 审查报告和缓存保存在主项目目录中（而不是 worktree 中）

## 跨仓库 PR 审查

你可以通过传递完整的 URL 来审查其他仓库的 PR：

```bash
/review https://github.com/other-org/other-repo/pull/456
```

这将在**轻量级模式**下运行——没有 worktree，没有构建/测试。审查仅基于 diff 文本（通过 GitHub API 获取）。如果你具有写权限，仍然可以发布 PR 评论。

| 能力                                                 | 同仓库 | 跨仓库                    |
| ---------------------------------------------------------- | --------- | ----------------------------- |
| LLM 审查（Agent 0-6 + 验证 + 迭代反向审计） | ✅        | ✅                            |
| Agent 7：构建与测试                                      | ✅        | ❌（无本地代码库）        |
| 跨文件影响分析                                 | ✅        | ❌                            |
| PR 行内评论                                         | ✅        | ✅（如果你具有写权限） |
| 增量审查缓存                                   | ✅        | ❌                            |

## PR 行内评论

使用 `--comment` 将发现直接发布到 PR 上：

```bash
/review 123 --comment
```

或者，在运行 `/review 123` 后，输入 `post comments` 即可发布发现，无需重新运行审查。

**发布的内容：**

- 高置信度的 Critical 和 Suggestion 发现作为行内评论发布在特定行上
- 对于 Approve/Request changes 结论：包含结论的审查摘要
- 对于 Comment 结论且所有行内评论已发布：没有单独的摘要（行内评论已足够）
- 每条评论上的模型归属页脚（例如，_— qwen3-coder via Qwen Code /review_）

**仅在终端显示的内容：**

- Nice to have 发现
- 低置信度发现

**自己提交的 PR：** GitHub 不允许你在自己的 pull request 上提交 `APPROVE` 或 `REQUEST_CHANGES` 审查——两者都会因 HTTP 422 失败。当 `/review` 检测到 PR 作者与当前认证用户匹配时，它会自动将 API 事件降级为 `COMMENT`，无论结论如何，从而确保提交成功。终端仍会显示真实的结论（"Approve" / "Request changes" / "Comment"）——只有 GitHub 端的审查事件被中和。实际的发现仍会作为行内评论出现在特定行上，因此实质性反馈保持不变。

**重新审查带有先前 Qwen Code 评论的 PR：** 当 `/review` 在已有先前 Qwen Code 审查评论的 PR 上运行时，它会在发布新评论之前对它们进行分类。只有**同行重叠**（现有评论与新发现在相同的 `(path, line)` 上）才会提示你确认——这是你会在同一代码行上看到视觉重复的情况。来自较早提交的评论、已回复的评论（视为已解决）以及与新发现不重叠的评论会被静默跳过，并带有一行终端日志，让你知道过滤了什么。

**APPROVE 前的 CI / 构建状态检查：** 如果结论是 "Approve"，`/review` 会在提交前查询 PR 的 check-runs 和 commit statuses。如果有任何检查失败（或所有检查仍在 pending），API 事件会自动从 `APPROVE` 降级为 `COMMENT`，并在审查正文中说明原因。理由：LLM 审查静态读取代码，无法看到运行时测试失败；在 CI 标红时批准会产生误导。行内发现仍会原样发布。如果你无论如何都想批准（例如，已知的 flaky CI 失败），请在验证后手动提交 GitHub 批准。

## 后续操作

审查后，上下文感知的提示会以 ghost text 形式出现。按 Tab 键接受：

| 审查后的状态                 | 提示                | 发生的情况                            |
| ---------------------------------- | ------------------ | --------------------------------------- |
| 包含未修复发现的本地审查 | `fix these issues` | LLM 交互式修复每个发现    |
| 包含发现的 PR 审查            | `post comments`    | 发布 PR 行内评论（不重新审查） |
| PR 审查，零发现           | `post comments`    | 在 GitHub 上批准 PR (LGTM)        |
| 本地审查，一切正常            | `commit`           | 提交你的更改                    |

注意：`fix these issues` 仅适用于本地审查。对于 PR 审查，worktree 会在审查后清理，因此不支持审查后的交互式修复——请改用 `--comment` 或 `post comments` 来发布发现。

## 项目审查规则

你可以为每个项目自定义审查标准。`/review` 按以下顺序从这些文件读取规则：

1. `.qwen/review-rules.md`（Qwen Code 原生）
2. `.github/copilot-instructions.md`（首选）或 `copilot-instructions.md`（回退——仅加载其中一个，不会同时加载两者）
3. `AGENTS.md` — `## Code Review` 部分
4. `QWEN.md` — `## Code Review` 部分

规则作为附加标准注入到 LLM 审查 agent（0-6）中。对于 PR 审查，规则从**基础分支 (base branch)** 读取，以防止恶意 PR 注入绕过规则。

## 问题保真度

对于 bugfix PR，问题保真度 agent 直接获取 issue 证据，而不是依赖 PR 描述文本。它使用 `gh pr view <pr> --repo <owner/repo> --json closingIssuesReferences` 获取 GitHub 强关联的 closing-issue 元数据，然后使用 `gh issue view <number> --repo <issue_owner>/<issue_repo> --json title,body,comments` 获取原始报告和讨论——`--json` 形式包含 issue **正文**（报告者的原始复现步骤），而仅使用 `--comments` 会遗漏这些，并且 issue 自身的仓库是从每个引用中读取的（一个 PR 可以关闭不同仓库中的 issue）。此 agent 仅针对 PR 目标运行；本地 diff 和文件路径审查会跳过它。

`closingIssuesReferences` 是一个发现提示，而不是作者链接了正确 issue 的证明：如果它为空但 PR 引用了一个明显的目标 issue，agent 在判断相关性后仍会获取它。获取的 issue 文本被视为不受信任的数据（提取事实，忽略嵌入的指令）。对于相关的 issue，原始复现、观察到的 payload、预期行为和维护者评论被视为判断 PR 是否修复了正确问题的最高优先级证据。

如果 issue 证据显示上游服务或提供商返回了客户端契约之外的畸形数据，则客户端解析器或清理器的更改不被视为有效的根因修复，除非维护者明确要求防御性变通方法。重放畸形上游输出的测试仅证明变通方法处理了该形状；它不能证明该变通方法在架构上是合适的。

## 核心基础设施门禁

对于触及核心基础设施的外部 PR，`/review` 在正常审查之前（获取 PR 之后、安装依赖之前）应用仓库门禁。维护者身份由 PR 的 `authorAssociation` 决定（`OWNER`/`MEMBER`/`COLLABORATOR` 豁免）。大型核心更改（**核心基础设施路径内** 500+ 行新增和删除）将被报告为硬性阻断，除非是维护者提交的——对许多文件进行低风险扫描但每个文件只更改一两行的情况会被升级，而不是根据行数自动拒绝。较小的核心更改需要 100% 的置信度和下游消费者意识；否则 `/review` 会升级给维护者（作为 Comment 提交，永远不会是 Approve）。
示例 `.qwen/review-rules.md`：

```markdown
# Review Rules

- All API endpoints must validate authentication
- Database queries must use parameterized statements
- React components must not use inline styles
- Error messages must not expose internal paths
```

## 增量审查

审查之前已审查过的 PR 时，`/review` 仅检查自上次审查以来的更改：

```bash
# First review — full review, cache created
/review 123

# PR updated with new commits — only new changes reviewed
/review 123
```

### 跨模型审查

如果你切换模型（通过 `/model`）并重新审查同一个 PR，`/review` 会检测到模型更改并执行完整审查，而不是跳过：

```bash
# Review with model A
/review 123

# Switch model
/model

# Review again — full review with model B (not skipped)
/review 123
# → "Previous review used qwen3-coder. Running full review with gpt-4o for a second opinion."
```

缓存存储在 `.qwen/review-cache/` 中，并同时跟踪 commit SHA 和 model ID。请确保将此目录添加到 `.gitignore` 中（使用更宽泛的规则如 `.qwen/*` 也可以）。如果缓存的 commit 被 rebase 移除，则会回退到完整审查。

## 审查报告

对于同仓库审查，结果会作为 Markdown 文件保存在项目的 `.qwen/reviews/` 目录中（跨仓库轻量级审查会跳过报告持久化）：

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

报告包含：时间戳、diff 统计、构建/测试结果、所有发现及其验证状态，以及最终结论。

## 跨文件影响分析

当代码更改修改了导出的函数、类或接口时，审查 agent 会自动搜索所有调用方并检查兼容性：

- 参数数量/类型更改
- 返回类型更改
- 移除或重命名公共方法
- 破坏性 API 更改

对于大型 diff（>10 个修改的符号），分析会优先处理签名发生更改的函数。

## Token 效率

无论产生多少发现，审查流水线都会使用有上限的 LLM 调用次数：

| 阶段 | LLM 调用次数 | 说明 |
| --- | --- | --- |
| 审查 agent（第 3 步） | 10（或 9） | 并行运行；跨仓库模式下跳过 Agent 7 |
| 批量验证（第 4 步） | 1 | 单个 agent 一次性验证所有发现 |
| 迭代反向审计（第 5 步） | 1-3 | 循环直到“未发现问题”或达到 3 轮上限 |
| **总计** | **12-14 (11-13)** | 同仓库：12-14；跨仓库：11-13（无 Agent 7） |

大多数 PR 会收敛到范围的下限（1 轮反向审计）；设置上限可防止在极端情况下成本失控。

## 不会标记的问题

审查有意排除以下内容：

- 未修改代码中已存在的问题（仅关注 diff）
- 格式化工具会自动规范的样式或格式，或符合你代码库约定的命名——但不会排除 linter 或类型检查器会标记的实质性问题（未使用的变量、不可达的代码、类型错误），这些在审查范围内
- 没有实际问题的主观“考虑做 X”建议
- 不能修复 bug 或风险的微小重构
- 缺失的文档，除非逻辑确实令人困惑
- 现有 PR 评论中已讨论过的问题（避免重复人工反馈）

## 设计理念

> **沉默胜于噪音。** 每一条评论都应值得读者花时间阅读。

- 如果不确定某事是否是问题 → 不报告
- N 个文件中的相同模式 → 汇总为一个发现
- PR 评论仅包含高置信度内容
- 排除符合代码库约定的表面样式/格式问题