# 自动化与分类处理流程

本文档详细介绍了我们用于管理和分类处理 issues 和 pull requests 的自动化流程。我们的目标是提供及时的反馈，并确保贡献能够被高效地审查和集成。了解这些自动化流程将帮助你作为贡献者知道可以期待什么，以及如何最好地与我们的 repository bots 交互。

## 指导原则：Issues 和 Pull Requests

首先，几乎每个 Pull Request (PR) 都应该关联到一个对应的 Issue。issue 描述"做什么"和"为什么做"（bug 或功能），而 PR 是"怎么做"（实现方式）。这种分离帮助我们跟踪工作、优先处理功能，并保持清晰的历史上下文。我们的自动化系统就是围绕这一原则构建的。

---

## 详细的自动化工作流程

以下是我们 repository 中运行的具体自动化工作流程的分解说明。

### 1. 当你创建一个 Issue 时：`Automated Issue Triage`

这是你在创建 issue 时会遇到的第一个 bot。它的作用是对 issue 进行初步分析并打上正确的标签。

- **Workflow 文件**: `.github/workflows/gemini-automated-issue-triage.yml`
- **运行时机**: 在 issue 被创建或重新打开后立即运行。
- **功能说明**:
  - 使用 Gemini 模型根据详细的指导原则分析 issue 的标题和正文内容。
  - **打上一个 `area/*` 标签**：将 issue 归类到项目的某个功能领域（例如 `area/ux`、`area/models`、`area/platform`）。
  - **打上一个 `kind/*` 标签**：识别 issue 的类型（例如 `kind/bug`、`kind/enhancement`、`kind/question`）。
  - **打上一个 `priority/*` 标签**：根据描述的影响程度分配优先级，从 P0（严重）到 P3（低）。
  - **可能打上 `status/need-information` 标签**：如果 issue 缺少关键信息（如日志或复现步骤），它会被标记为需要更多信息。
  - **可能打上 `status/need-retesting` 标签**：如果 issue 中提到的 CLI 版本已经落后超过六个版本，则会被标记为需要在当前版本中重新测试。
- **你应该做什么**:
  - 尽可能完整地填写 issue 模板。你提供的细节越多，分类就越准确。
  - 如果被打上了 `status/need-information` 标签，请在评论中补充所需的信息。

### 2. 当你打开一个 Pull Request 时：`Continuous Integration (CI)`

这个 workflow 确保所有变更在合并之前都符合我们的质量标准。

- **Workflow 文件**：`.github/workflows/ci.yml`
- **运行时机**：每次向 pull request 推送代码时触发。
- **执行内容**：
  - **Lint**：检查你的代码是否符合项目的格式和风格规范。
  - **Test**：在 macOS、Windows 和 Linux 系统上，以及多个 Node.js 版本环境中运行完整的自动化测试套件。这是 CI 流程中最耗时的部分。
  - **Post Coverage Comment**：当所有测试成功通过后，机器人会在你的 PR 下发布一条评论，总结你的变更被测试覆盖的情况。
- **你应该做什么**：
  - 确保所有 CI 检查都通过。当一切成功时，提交记录旁边会出现绿色勾号 ✅。
  - 如果某项检查失败（红色 "X" ❌），请点击失败检查旁边的 "Details" 链接查看日志，找出问题并推送修复。

### 3. 持续的 Pull Request 分类管理：`PR 审查与标签同步`

此 workflow 会定期运行，以确保所有 open 的 PR 都正确关联了 issue，并且标签保持一致。

- **Workflow 文件**：`.github/workflows/gemini-scheduled-pr-triage.yml`
- **运行时机**：每 15 分钟运行一次，检查所有 open 的 pull request。
- **功能说明**：
  - **检查是否关联了 issue**：bot 会扫描你的 PR 描述，查找用于关联 issue 的关键词（例如 `Fixes #123`、`Closes #456`）。
  - **添加 `status/need-issue` 标签**：如果没有找到关联的 issue，bot 会自动为你的 PR 添加 `status/need-issue` 标签。这是一个明确信号，表示你需要创建并关联一个 issue。
  - **同步标签**：如果 PR 已经关联了 issue，bot 会确保 PR 的标签与 issue 的标签完全一致。它会添加缺失的标签、移除不相关的标签，并在必要时移除 `status/need-issue` 标签。
- **你应该怎么做**：
  - **始终将你的 PR 关联到一个 issue**。这是最重要的一步。请在 PR 描述中添加类似 `Resolves #<issue-number>` 的内容。
  - 这样可以确保你的 PR 被正确分类，并顺利进入 review 流程。

### 4. 持续问题分类：`Scheduled Issue Triage`

这是一个备用工作流，确保没有问题会被分类流程遗漏。

- **Workflow File**: `.github/workflows/gemini-scheduled-issue-triage.yml`
- **运行时机**：每小时运行一次，针对所有未关闭的 issues。
- **工作内容**：
  - 主动查找没有任何标签或仍带有 `status/need-triage` 标签的 issues。
  - 然后触发与初始 triage bot 相同的基于 Gemini 的强大分析功能，为这些问题打上正确的标签。
- **你需要做什么**：
  - 通常你不需要做任何事情。这个工作流是一个安全网，确保即使初始分类失败，每个 issue 最终也会被正确分类。

### 5. 发布自动化

这个 workflow 负责打包和发布 Qwen Code 的新版本。

- **Workflow 文件**: `.github/workflows/release.yml`
- **运行时机**: 每日定时执行用于 "nightly" 发布，也可手动触发用于正式的 patch/minor 版本发布。
- **执行内容**:
  - 自动构建项目、更新版本号，并将包发布到 npm。
  - 在 GitHub 上创建对应的 release，并自动生成 release notes。
- **你需要做什么**:
  - 作为贡献者，你无需为此流程做任何操作。你可以放心，一旦你的 PR 被合并到 `main` 分支，你的更改就会包含在下一个 nightly 发布版本中。

我们希望这份详细的概述对你有帮助。如果你对我们的自动化流程有任何疑问，请随时提问！