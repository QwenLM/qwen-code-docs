# 自动化与分类流程

本文档详细介绍了我们用于管理和分类 Issue 与 Pull Request 的自动化流程。我们的目标是提供及时的反馈，并确保贡献能够被高效地审查和合并。了解这些自动化机制将帮助你作为贡献者明确预期，并更好地与仓库机器人进行交互。

## 核心原则：Issue 与 Pull Request

首先，几乎每个 Pull Request (PR) 都应关联到一个对应的 Issue。Issue 用于描述“做什么”和“为什么做”（缺陷或新特性），而 PR 则说明“怎么做”（具体实现）。这种分离有助于我们跟踪工作进度、确定特性优先级，并维护清晰的历史上下文。我们的自动化流程正是围绕这一原则构建的。

---

## 详细自动化工作流

以下是我们仓库中运行的具体自动化工作流详解。

### 1. 当你创建 Issue 时：`Automated Issue Triage`

这是你创建 Issue 时交互的第一个机器人。它的职责是进行初步分析并应用正确的标签。

- **工作流文件**：`.github/workflows/qwen-automated-issue-triage.yml`
- **触发时机**：在 Issue 创建或重新打开后立即运行。
- **执行操作**：
  - 使用 Qwen 模型，根据详细的指南分析 Issue 的标题和正文。
  - **应用一个 `area/*` 标签**：将 Issue 归类到项目的功能区域（例如 `area/ux`、`area/models`、`area/platform`）。
  - **应用一个 `kind/*` 标签**：识别 Issue 的类型（例如 `kind/bug`、`kind/enhancement`、`kind/question`）。
  - **应用一个 `priority/*` 标签**：根据描述的影响程度分配优先级，范围从 P0（严重）到 P3（低）。
  - **可能应用 `status/need-information`**：如果 Issue 缺少关键细节（如日志或复现步骤），将被标记为需要补充信息。
  - **可能应用 `status/need-retesting`**：如果 Issue 引用的 CLI 版本落后超过六个版本，将被标记为需要在当前版本上重新测试。
- **你需要做的**：
  - 尽可能完整地填写 Issue 模板。你提供的细节越多，分类结果就越准确。
  - 如果添加了 `status/need-information` 标签，请在评论中补充所需的信息。

### 2. 当你创建 Pull Request 时：`Continuous Integration (CI)`

此工作流确保所有更改在合并前均符合我们的质量标准。

- **工作流文件**：`.github/workflows/ci.yml`
- **触发时机**：每次向 Pull Request 推送代码时运行。
- **执行操作**：
  - **Lint**：检查你的代码是否符合项目的格式和风格规范。
  - **Test**：在 macOS、Windows 和 Linux 以及多个 Node.js 版本上运行完整的自动化测试套件。这是 CI 流程中最耗时的部分。
  - **Post Coverage Comment**：所有测试通过后，机器人会在你的 PR 下发表评论。该评论会总结你的更改的测试覆盖率情况。
- **你需要做的**：
  - 确保所有 CI 检查通过。一切顺利时，你的提交旁边会出现绿色对勾 ✅。
  - 如果有检查失败（显示红色 "X" ❌），请点击失败检查旁边的 "Details" 链接查看日志，定位问题并推送修复。

### 3. Pull Request 持续分类：`PR Auditing and Label Sync`

此工作流定期运行，以确保所有打开的 PR 都正确关联到 Issue，且标签保持一致。

- **工作流文件**：`.github/workflows/qwen-scheduled-pr-triage.yml`
- **触发时机**：每 15 分钟对所有打开的 Pull Request 运行一次。
- **执行操作**：
  - **检查关联的 Issue**：机器人会扫描你的 PR 描述，查找用于关联 Issue 的关键字（例如 `Fixes #123`、`Closes #456`）。
  - **添加 `status/need-issue`**：如果未找到关联的 Issue，机器人会为你的 PR 添加 `status/need-issue` 标签。这明确表示你需要创建并关联一个 Issue。
  - **同步标签**：如果已关联 Issue，机器人会确保 PR 的标签与 Issue 的标签完全匹配。它会补充缺失的标签，移除不匹配的标签，并在存在时移除 `status/need-issue` 标签。
- **你需要做的**：
  - **始终将 PR 关联到 Issue。** 这是最重要的一步。请在 PR 描述中添加类似 `Resolves #<issue-number>` 的行。
  - 这将确保你的 PR 被正确分类，并顺利通过审查流程。

### 4. Issue 持续分类：`Scheduled Issue Triage`

这是一个兜底工作流，用于确保分类流程不会遗漏任何 Issue。

- **工作流文件**：`.github/workflows/qwen-scheduled-issue-triage.yml`
- **触发时机**：每小时对所有打开的 Issue 运行一次。
- **执行操作**：
  - 主动查找完全没有标签或仍带有 `status/need-triage` 标签的 Issue。
  - 随后触发与初始分类机器人相同的、基于 Qwen Code 的强大分析流程，以应用正确的标签。
- **你需要做的**：
  - 通常你无需执行任何操作。此工作流是一道安全网，确保即使初始分类失败，每个 Issue 最终也能被正确分类。

### 5. 发布自动化

此工作流负责处理 Qwen Code 新版本的打包与发布流程。

- **工作流文件**：`.github/workflows/release.yml`
- **触发时机**：按每日计划运行以生成 "nightly"（每日构建）版本，官方 patch/minor 版本则手动触发。
- **执行操作**：
  - 自动构建项目、递增版本号，并将包发布到 npm。
  - 在 GitHub 上创建对应的 Release，并自动生成 Release Notes。
- **你需要做的**：
  - 作为贡献者，你无需参与此流程。你可以放心，一旦你的 PR 合并到 `main` 分支，你的更改将包含在下一个 nightly 版本中。

希望这份详细的概述对你有所帮助。如果你对我们的自动化流程有任何疑问，请随时提出！