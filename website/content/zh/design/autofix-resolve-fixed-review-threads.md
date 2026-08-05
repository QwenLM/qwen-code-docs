# Autofix 评审线程解决的加固

## 问题

Qwen Autofix 已经让评审处理代理能够识别出已在代码中解决的行内评审评论。带凭据的宿主工作流会把这些 REST 评论 ID 映射为 GitHub 评审线程，并在推送修复之后调用 `resolveReviewThread`。

当前的顺序总体上是安全的，但它无法证明正在被解决的活跃 PR head 正是确定性验证所覆盖的那个 commit：

- 一次被拒绝的推送可能通过合并新移动的远端 head 来挽救。尽管验证发生在合并之前，合并后的 commit 仍会被推送。
- PR 作者可能在 Autofix 推送之后、解决变更操作之前再次推送。
- 同一轮运行中的修复尝试可能继承被拒绝的首次尝试留下的 `resolved-comments.txt` 或 `comment-replies.json`。

这些缺口可能在没有证据表明当前 PR head 仍包含已验证修复的情况下，就把一个会话标记为已解决。

## 现状

职责已经正确分离：

- `.qwen/skills/autofix/SKILL.md` 告诉代理如何分类发现，以及如何编写 `resolved-comments.txt` 或 `comment-replies.json`。
- `.github/scripts/run-autofix-review-verification.sh` 独立运行确定性的构建、类型检查、lint 和受影响包的测试。
- `.github/workflows/qwen-autofix.yml` 持有 GitHub PAT，负责推送分支、获取评审线程并执行变更操作。
- `scripts/tests/qwen-autofix-workflow.test.js` 用打桩的 GitHub 响应来提取并执行工作流中的 shell 代码块。

GitHub 变更操作必须留在受信任的工作流中。代理绝不能获得 GitHub 凭据。

## 提议的改动

### 验证门禁

在确定性检查之前要求一个干净的已跟踪 worktree 和索引，捕获 commit SHA，并要求该 SHA 与已跟踪状态在结构检查之后保持不变，且在构建、类型检查、lint 和测试之后再次保持不变。然后把捕获的 SHA 记录为名为 `verified_head` 的步骤输出。对于无操作或失败的结果不发出它。这会拒绝持久的已跟踪变更或由分支受控检查创建的 commit；它不声称文件系统不可变，也不检测临时改变状态又在一条命令内还原的脚本——这仍属于现有 CI 信任模型的一部分。

### 最终验证选择

把选定的验证 SHA 传播到最终验证步骤：

- 没有运行修复时，使用第一次验证的 SHA；
- 运行了修复时，只使用修复验证的 SHA；
- 对于成功的已修复结果，绝不回退到第一次的 SHA。

### 修复隔离

在调用修复代理之前，把 `resolved-comments.txt` 和 `comment-replies.json` 连同其他先前尝试的产物一并移除。修复尝试必须显式重新生成其最终处置。文件缺失因此 fail closed（失败即拒绝）：不解决、也不回复任何线程。

### 推送后的解决证明

在解决任何选定的线程之前，要求以下全部满足：

1. `verified_head` 非空。
2. 推送竞争的挽救没有创建未验证的合并 commit。
3. 成功推送之后本地 `HEAD` 等于 `verified_head`。
4. 一次实时的 `gh pr view` 查询成功。
5. 每次变更操作之前，实时的 PR `headRefOid` 等于 `verified_head`。
6. 每次变更操作之后，实时的 PR `headRefOid` 仍等于 `verified_head`。

每次变更操作之前，由一个 GraphQL 守卫同时读取实时的 `headRefOid` 和目标线程实时的 `isResolved` 状态。已被其他参与者解决的线程会被跳过。变更操作之后，同一守卫再次验证这两个值。即使变更命令返回错误，该后置检查仍会运行，因为丢失的响应不能证明 GitHub 没有应用该变更。

如果变更前的条件未知或为假，或变更后的条件含糊，则停止解决更多会话。一次失败的变更，如果其后置守卫证明已验证的 head 未变且线程仍保持打开，可以安全地告警并继续。工作流不调用 `unresolveReviewThread`：GitHub 不暴露比较并交换（compare-and-swap）前置条件或变更归属，因此即使 `resolveReviewThread` 响应成功，也无法证明在前置守卫与变更之间没有其他参与者解决了该线程。自动重新打开它可能因此撤销另一位评审者的操作。一次不成功的变更命令之后，若后置守卫确认了已验证的 head 和已解决状态，则计为观察到的已解决状态，但不把它归属于 Autofix；任何含糊的结果都会停止剩余的变更。

已验证的代码推送和正常的轮次报告仍会成功。对于有意保持打开的发现，其回复可以在成功推送之后继续，因为它们不断言线程已被修复。

## 设计决定

- **解决操作 fail closed：** 一个未解决的线程可以恢复；一个被错误解决的线程可能掩盖真实缺陷。
- **竞争合并后跳过解决：** 在持有 PAT 的发布步骤里重跑完整的确定性门禁会重复昂贵的逻辑，并在凭据范围内运行分支受控的脚本。后续评审轮次可以安全地解决该线程。
- **在变更操作之前立即查询实时 PR 状态：** 工作流并发无法阻止贡献者直接推送。
- **保持现有的模型处置契约：** 语义判断仍由代理负责，而精确的 commit 标识由宿主确定性地强制。
- **不添加通用的 CLI/core 代码：** 这是 Autofix 工作流编排，不是可复用的 Qwen Code 运行时功能。

## 受影响的文件

- `.github/scripts/run-autofix-review-verification.sh`
- `.github/workflows/qwen-autofix.yml`
- `scripts/tests/qwen-autofix-workflow.test.js`
- `.qwen/skills/autofix/SKILL.md` 用于契约澄清

## 范围边界

包含：

- 精确的已验证/实时 head 相等性；
- 推送竞争的 fail-closed 行为；
- 修复尝试的处置隔离；
- 聚焦的工作流契约和行为测试。

排除：

- 超出现有前 100 个线程的 GraphQL 分页；
- 解决任意非 Autofix 的 PR 会话；
- 驳回 `CHANGES_REQUESTED` 评审；
- 把 GitHub 凭据直接交给模型；
- 修改通用 `/review` 或 CLI 行为。

## 待决问题

无。保守行为在变更操作之前是确定性的：不确定性会阻止更多线程被解决。变更操作之后，工作流观察并报告状态，但在没有原子归属证据的情况下绝不自动取消解决。
