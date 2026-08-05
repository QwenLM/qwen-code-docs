# Revert 模式分诊闸门

日期：2026-07-27
状态：提案中
领域：CI 分诊 — `.github/workflows/qwen-triage.yml`、`.qwen/skills/triage/`

## 问题

小型行为中立的维护性 PR 目前与行为变更消耗同样的多阶段分诊和模型评审容量。
最初的提案（PR #7414）试图过滤掉它们，但维护者对线上积压的测量显示命中率
只有约 2%——该功能瞄准的是一个几乎不存在的问题。

与此同时，仓库历史中共有 **111 个 revert commit**（仅 2026 年 7 月就有 19
个），且 **61.5% 的 revert 发生在合并后 24 小时内**——意味着问题被快速发现，
但此时已经在 `main` 上了。真正的成本不是评审无害的 PR，而是合并了必须回滚
的 PR。

本设计提出一个有数据支撑的分诊闸门，瞄准真正导致 revert 的 PR，而不是那些
已经无害的 PR。

## 数据

### 方法

对仓库完整 revert 历史的三阶段分析：

1. **收集**：`git log --all --grep="^Revert "` 找到 111 个 revert commit。
   解析每个 revert 正文中的 `This reverts commit <hash>`，然后通过 `gh api`
   把原始 commit 追溯到其 PR。结果：46 个唯一的被 revert PR（59 个 revert 可
   追溯到 PR 编号；52 个 revert 只有原始 commit 标题而没有 PR 链接）。

2. **丰富**：对每个被 revert 的 PR，提取分诊时可观察的信号：触碰范围
   （core/auth/providers/tools/services）、diff 大小、评审轮次数、bot Critical
   发现、CHANGES_REQUESTED 循环、合并→revert 时间间隔、自我 revert、E2E
   验证是否存在。46 个 PR 中有 31 个成功丰富；15 个已删除且无法访问
   （HTTP 404）。

3. **对照组比较**：抽样 60 个最近合并且未被 revert 的 PR，提取相同的信号。
   计算每个信号的精确率（TP / (TP + FP)）和召回率。

脚本和原始数据（本地分析产物，未提交）：
`.qwen/scripts/revert-analysis-*.mjs`、`.qwen/scripts/revert-data-*.json`、
`.qwen/scripts/revert-analysis-report-v2.json`。

### 信号精确率与召回率

| 信号                         | 精确率    | 召回率 | 被 revert (n=31) | 对照 (n=60) |
| ---------------------------- | --------- | ------ | ---------------- | ----------- |
| `touches_high_risk`          | **66.7%** | 32.3%  | 10               | 5           |
| `non_maintainer + high_risk` | **58.3%** | 22.6%  | 7                | 5           |
| `core + contested`           | **50.0%** | 19.4%  | 6                | 6           |
| `non_maintainer + core`      | 46.2%     | 38.7%  | 12               | 14          |
| `touches_core`               | 44.7%     | 54.8%  | 17               | 21          |
| `has_contested_pattern`      | 40.9%     | 29.0%  | 9                | 13          |
| `had_changes_requested`      | 40.7%     | 35.5%  | 11               | 16          |
| `non_maintainer`             | 39.6%     | 67.7%  | 21               | 32          |
| `large_diff_gt_200`          | 37.0%     | 54.8%  | 17               | 29          |
| `critical_count > 0`         | 28.6%     | 12.9%  | 4                | 10          |
| `fast_revert_24h`            | 100.0%    | 25.8%  | 8                | 0           |
| `self_reverted`              | 100.0%    | 9.7%   | 3                | 0           |

**抽样警告：** 精确率是在 1:1.9 的病例-对照比例（31 个被 revert 对 60 个
对照）上计算的，而仓库实际的基础率约为 1.37%（46/3358）。精确率（PPV）是
对这种过采样最敏感的指标——在仓库基础率下真正的阳性预测值要低得多（例如
`touches_high_risk` 约 5%）。灵敏度（召回率）和特异度对抽样比例不变，是
比较信号的合适指标。按精确率对信号的_排序_仍然有效（在固定 n 下它对似然比
单调），但绝对值不应作为后验概率引用给贡献者。

`fast_revert_24h` 和 `self_reverted` 有 100% 精确率，但是**合并后信号**——
它们只能在 PR 已经合并并被 revert 之后才能观察到，因此不能用作分诊闸门。
它们确认问题存在，但无助于预防。

`critical_count > 0` 最初被认为是强信号（在 PR #6866 等案例研究中 bot 标记了
确切的根因），但在修正正则表达式只匹配 `**[Critical]**` 标签（而不是正文中
像 "no critical blockers" 这样的裸词 "critical"）之后，精确率降到 28.6%。bot
对 Critical 发现过于敏感——16.7% 的对照组 PR 也有 Critical 标签。

### 高风险路径定义

`touches_high_risk` 信号检查是否有变更文件匹配这些子系统模式：

- `openaiContentGenerator` — 流式响应解析
- `streamingToolCallParser` — 工具调用流解析
- `geminiChat` — Gemini 对话管道
- `acpConnection` — ACP 进程 spawn
- `shell.ts` / `shellExecutionService` — shell 工具执行
- `mcp-client` / `mcp-pool` — MCP server 管理
- `LspServer` — LSP server 管理
- `acp-integration` — ACP 会话集成
- `relaunch.ts` — 桌面应用重启生命周期
- `sandbox.ts` — 沙箱进程管理
- `electron-run-as-node` — Electron node 模式入口点（路径匹配）

这些是错误变更最可能导致需要 revert 的可观察回归的路径。

### 合并→revert 时间间隔

在 13 个有有效（非负、合并后）间隔数据的 PR 中：

- 中位数：4 小时
- 24 小时内：61.5%
- 72 小时内：84.6%
- 最大：97 小时

这确认导致 revert 的缺陷在合并后很快浮现，但损害已经在 `main` 上了。

### 反复横跳的 PR

8 个 PR 被多次 revert（revert → 重新 revert 循环），表明存在未解决的争议：

- PR #6754（3 次 revert）、PR #6751（3 次 revert）、PR #3433（3 次 revert）
- PR #6869（2 次 revert）、PR #5668（2 次 revert）、PR #3567（2 次 revert）、
  PR #3478（2 次 revert）、PR #5060（2 次 revert）

这些反复横跳的 PR 是成本最高的结果——它们消耗多轮评审、多次合并/revert
循环，并且通常需要补丁发布。

## 设计

### 高风险路径升级

当一个非维护者 PR 触碰任何高风险路径（见上面的定义）时，Stage 1 分诊把该
PR 升级到最深层的评审层级，而不是正常路径。这**不会**阻塞或关闭 PR——它
确保完整的 `/review` 管道以最大代理覆盖运行。

这是最强的分诊时信号：31 个被 revert 的 PR 中有 10 个（灵敏度 32.3%）触碰
了这些路径，而 60 个对照 PR 中只有 5 个（特异度 91.7%；Fisher p = 0.006）。

实现：Stage 1e 的 skill 文本指示分诊模型对高风险路径模式运行
`gh pr view --json files | grep -E '...'`。不需要修改 workflow YAML——检测
在 skill 内部运行，而不是作为单独的 workflow 步骤。

### 本设计不做的事

- **不自动关闭或自动拒绝 PR。** 该闸门升级评审深度并建议维护者关注；它绝不
  阻塞合并或关闭 PR。
- **不使用 bot Critical 发现作为信号。** 数据显示 28.6% 的精确率——bot 也在
  16.7% 的安全 PR 上标记 Critical。Critical 噪音太大，不能作闸门。
- **不单独按 PR 大小过滤。** `large_diff_gt_200` 精确率只有 37.0%——没有
  上下文的大小不具备预测力。
- **不要求所有 PR 都有 E2E 验证。** `no_e2e` 没有区分度——100% 的对照组也
  缺少 E2E 评论，因此该信号无法区分易 revert 的 PR 和安全的 PR。

## 与 PR #7414 的比较

|                     | PR #7414（行为中立）                | 本设计（revert 模式）                        |
| ------------------- | ----------------------------------- | -------------------------------------------- |
| 信号                | "diff 完全行为中立"                 | "触碰高风险路径"                             |
| Revert 召回率       | 未测量（无 revert 可比较）          | 32.3% (10/31)                                |
| 特异度              | 不适用                              | 91.7% (55/60)                                |
| 目标                | 无害 PR（成本：低）                 | 危险 PR（成本：高）                          |
| 假阳性成本          | 跳过了对一个有用 PR 的评审          | 升级评审深度（额外评审时间）                 |

## 变更文件

- `.qwen/skills/triage/references/pr-workflow.md` — 添加 Stage 1e 高风险路径
  检查清单。检测在分诊 skill 内部运行（模型自己运行
  `gh api --paginate … | grep …`），因此不需要修改 workflow YAML。
- `scripts/tests/qwen-triage-workflow.test.js` — 断言高风险路径路由字符串存在
  于分诊 skill 的 markdown 中。
- `.github/scripts/qwen-triage-workflow.test.mjs` — 在 node:test runner 中的
  相同断言。

## 非目标 / 后续工作

- **Bot Critical 精化。** 当前的 bot Critical 检测噪音太大（28.6% 精确率）。
  如果 bot 能区分"未解决的 Critical"和"已解决的 Critical"（通过检查发现
  线程是否被标记为已解决），该信号可能变得有用。这是一个单独的 bot 改进，
  不是分诊闸门变更。
- **时间对齐的对照组。** 当前对照组从最近 200 个合并的 PR 中抽样，但被
  revert 的 PR 横跨 2025–2026。时间对齐的对照组会给出更精确的假阳性率。
  `gh pr list` API 不支持深度分页，因此这需要基于 GraphQL 游标的抓取。
- **恢复 15 个已删除的 PR。** 46 个被 revert 的 PR 中有 15 个已删除，无法
  通过 GitHub API 访问。它们的模式可能与我们能丰富的 31 个不同。没有恢复
  路径——GitHub 在某些状态下永久删除已关闭的 PR。
- **反复横跳检测作为实时闸门。** 当前分析是回顾性地检测反复横跳（在多次
  revert 之后）。实时版本会监控 `main` 上的 revert→重新 revert 模式并提醒
  维护者。这需要一个单独的监控 workflow，不是分诊闸门。
- **扩展高风险路径列表。** 当前列表是从被 revert PR 的文件路径人工整理的。
  随着代码库演进，新的高风险路径可能出现。定期重新运行分析脚本可以让列表
  保持最新。
