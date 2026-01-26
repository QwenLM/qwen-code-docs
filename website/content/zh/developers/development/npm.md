# 包概述

这个单一仓库包含两个主要包：`@qwen-code/qwen-code` 和 `@qwen-code/qwen-code-core`。

## `@qwen-code/qwen-code`

这是 Qwen Code 的主包。它负责用户界面、命令解析以及所有其他面向用户的功功能。

当发布此包时，它会被打包成一个单独的可执行文件。该捆绑包包含了包的所有依赖项，包括 `@qwen-code/qwen-code-core`。这意味着无论用户是通过 `npm install -g @qwen-code/qwen-code` 安装包，还是直接通过 `npx @qwen-code/qwen-code` 运行，他们使用的都是这个独立的、自包含的可执行文件。

## `@qwen-code/qwen-code-core`

此包包含 CLI 的核心逻辑。它负责向已配置的提供商发起 API 请求、处理身份验证以及管理本地缓存。

此包不会被捆绑。发布时，它会作为一个具有自己依赖项的标准 Node.js 包进行发布。如有需要，这允许它在其他项目中作为独立包使用。`dist` 文件夹中的所有转译后的 js 代码都包含在此包中。

# 发布流程

此项目遵循结构化的发布流程，以确保所有包都能正确地进行版本控制和发布。该流程设计为尽可能自动化。

## 如何发布

发布通过 [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) GitHub Actions 工作流进行管理。要执行补丁或热修复的手动发布：

1.  导航到仓库的 **Actions** 标签页。
2.  从列表中选择 **Release** 工作流。
3.  点击 **Run workflow** 下拉按钮。
4.  填写所需的输入：
    - **Version**: 要发布的确切版本（例如，`v0.2.1`）。
    - **Ref**: 要从中发布的分支或提交 SHA（默认为 `main`）。
    - **Dry Run**: 保留为 `true` 以测试工作流而不发布，或设置为 `false` 以执行实时发布。
5.  点击 **Run workflow**。

## 发布类型

该项目支持多种类型的发布：

### 稳定版发布

用于生产环境的常规稳定发布。

### 预览版发布

每周二 UTC 时间 23:59 进行的周预览发布，可提前体验即将推出的功能。

### 每日夜构建版本

每日在世界标准时间午夜进行最新的开发测试版本发布。

## 自动化发布计划

- **每夜构建**: 每天世界标准时间午夜
- **预览版**: 每周二世界标准时间 23:59
- **稳定版**: 由维护者手动触发的发布

### 如何使用不同类型的发布版本

要安装每种类型的最新版本：

```bash
# 稳定版（默认）
npm install -g @qwen-code/qwen-code

# 预览版
npm install -g @qwen-code/qwen-code@preview

# 每日夜构建版
npm install -g @qwen-code/qwen-code@nightly
```

### 发布流程详情

每次计划或手动发布都遵循以下步骤：

1.  检出指定的代码（来自 `main` 分支的最新代码或特定提交）。
2.  安装所有依赖项。
3.  运行完整的 `preflight` 检查和集成测试套件。
4.  如果所有测试通过，将根据发布类型计算适当的版本号。
5.  使用适当的 dist-tag 将包构建并发布到 npm。
6.  为该版本创建 GitHub Release。

### 失败处理

如果发布工作流中的任何步骤失败，它将自动在仓库中创建一个新问题，并附上 `bug` 标签和特定类型的失败标签（例如 `nightly-failure`、`preview-failure`）。该问题将包含指向失败工作流运行的链接，以便轻松调试。

## 发布验证

推送新版本后，应执行冒烟测试以确保包按预期工作。这可以通过本地安装包并运行一组测试来确保它们正常运行。

- `npx -y @qwen-code/qwen-code@latest --version` 验证推送是否按预期工作（如果你没有进行 rc 或 dev 标签）
- `npx -y @qwen-code/qwen-code@<release tag> --version` 验证标签是否正确推送
- _这会在本地造成破坏_ `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force && npm install @qwen-code/qwen-code@<version>`
- 建议对几个 LLM 命令和工具进行基本运行的冒烟测试，以确保包按预期工作。我们将在未来对此进行更明确的规范。

## 何时合并版本变更，或不合并？

上述从当前或较早提交创建补丁或热修复版本的模式会使仓库处于以下状态：

1.  标签（`vX.Y.Z-patch.1`）：此标签正确指向主分支上包含你打算发布的稳定代码的原始提交。这一点至关重要。任何人检出此标签都会得到与发布版本完全相同的代码。
2.  分支（`release-vX.Y.Z-patch.1`）：此分支在标记的提交基础上包含一个新提交。该新提交仅在 package.json 中包含版本号更改（以及其他相关文件如 package-lock.json）。

这种分离是好的。它保持了主分支历史的整洁，不会混入特定于发布的版本提升，直到你决定合并它们。

这是关键决策，完全取决于发布的性质。

### 合并回稳定补丁和热修复

对于任何稳定补丁或热修复发布，你几乎总是希望将 `release-<tag>` 分支合并回 `main`。

- 为什么？主要原因是为了更新 main 分支中 package.json 的版本号。如果你从较早的提交发布 v1.2.1，但从不将版本升级合并回来，那么 main 分支的 package.json 仍会显示 "version": "1.2.0"。下一个为下个功能发布（v1.3.0）开始工作的开发人员将从一个具有错误、较旧版本号的代码库分支。这会导致混淆，并需要稍后手动升级版本。
- 流程：在创建 release-v1.2.1 分支并且包成功发布后，你应该打开一个拉取请求，将 release-v1.2.1 合并到 main。这个 PR 将只包含一个提交："chore: bump version to v1.2.1"。这是一个干净、简单的集成，使你的 main 分支与最新发布的版本保持同步。

### 预发布版本（RC、Beta、Dev）请勿合并回主分支

通常情况下，你不会将预发布的版本分支合并回 `main`。

- 原因？预发布版本（例如 v1.3.0-rc.1、v1.3.0-rc.2）按定义来说是不稳定的，并且是临时的。你不希望用一系列候选版本的更新来污染主分支的历史记录。main 分支中的 package.json 应该反映最新的稳定版本，而不是 RC 版本。
- 流程：创建 release-v1.3.0-rc.1 分支，执行 npm publish --tag rc，然后……这个分支就已经完成了它的使命。你可以直接删除它。RC 的代码已经在 main（或某个功能分支）上，因此不会丢失任何功能代码。发布分支只是版本号的一个临时载体。

## 本地测试和验证：打包和发布流程的变更

如果你需要测试发布流程，但不实际发布到 NPM 或创建公开的 GitHub 版本，你可以从 GitHub UI 手动触发工作流。

1.  前往仓库的[操作标签页](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml)。
2.  点击"Run workflow"下拉菜单。
3.  保持`dry_run`选项选中（`true`）。
4.  点击"Run workflow"按钮。

这将运行整个发布流程，但会跳过`npm publish`和`gh release create`步骤。你可以检查工作流日志以确保一切按预期工作。

在提交之前，本地测试打包和发布流程的任何变更至关重要。这能确保包被正确发布，并且用户安装时能按预期工作。

要验证你的变更，你可以执行发布过程的试运行。这将模拟发布过程而不实际将包发布到 npm 注册表。

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

此命令将执行以下操作：

1.  构建所有包。
2.  运行所有预发布脚本。
3.  创建将发布到 npm 的包压缩文件。
4.  打印将发布的包摘要。

然后你可以检查生成的压缩文件，确保它们包含正确的文件并且`package.json`文件已正确更新。压缩文件将在每个包目录的根目录下创建（例如，`packages/cli/qwen-code-0.1.6.tgz`）。

通过执行试运行，你可以确信你对打包过程的变更是正确的，并且包将成功发布。

## 发布深度解析

发布过程的主要目标是获取 packages/ 目录中的源代码，构建它，并在项目根目录的临时 `dist` 目录中组装一个干净、独立的包。这个 `dist` 目录才是实际发布到 NPM 的内容。

以下是关键阶段：

阶段 1：发布前完整性检查和版本控制

- 发生什么：在移动任何文件之前，该过程确保项目处于良好状态。这包括运行测试、代码检查和类型检查（npm run preflight）。根目录 package.json 和 packages/cli/package.json 中的版本号会更新为新的发布版本。
- 原因：这保证了只有高质量、可工作的代码才会被发布。版本控制是表示新发布的第一步。

阶段 2：构建源代码

- 发生什么：packages/core/src 和 packages/cli/src 中的 TypeScript 源代码被编译成 JavaScript。
- 文件移动：
  - packages/core/src/\*\*/\*.ts -> 编译到 -> packages/core/dist/
  - packages/cli/src/\*\*/\*.ts -> 编译到 -> packages/cli/dist/
- 原因：开发期间编写的 TypeScript 代码需要转换为 Node.js 可以运行的纯 JavaScript。core 包首先构建，因为 cli 包依赖于它。

阶段 3：打包和组装最终可发布的包

这是最关键的阶段，在这里文件被移动和转换为最终的发布状态。该过程使用现代打包技术来创建最终包。

1.  打包创建：
    - 发生什么：prepare-package.js 脚本在 `dist` 目录中创建一个干净的分发包。
    - 关键转换：
      - 复制 README.md 和 LICENSE 到 dist/
      - 复制 locales 文件夹用于国际化
      - 创建一个干净的 package.json 用于分发，只包含必要的依赖项
      - 保持分发依赖项最小化（无捆绑的运行时依赖项）
      - 维持 node-pty 的可选依赖项

2.  JavaScript 包被创建：
    - 发生什么：来自 packages/core/dist 和 packages/cli/dist 的已构建 JavaScript 使用 esbuild 打包成单个可执行 JavaScript 文件。
    - 文件位置：dist/cli.js
    - 原因：这创建了一个包含所有必要应用程序代码的单一优化文件。通过消除安装时复杂的依赖解析需求来简化包。

3.  静态和支持文件被复制：
    - 发生什么：不属于源代码但对包正确工作或良好描述必需的文件被复制到 `dist` 目录。
    - 文件移动：
      - README.md -> dist/README.md
      - LICENSE -> dist/LICENSE
      - locales/ -> dist/locales/
      - Vendor 文件 -> dist/vendor/
    - 原因：
      - README.md 和 LICENSE 是任何 NPM 包都应该包含的标准文件。
      - Locales 支持国际化功能
      - Vendor 文件包含必要的运行时依赖项

阶段 4：发布到 NPM

- 发生什么：从根 `dist` 目录内部运行 npm publish 命令。
- 原因：通过在 `dist` 目录内运行 npm publish，只有我们在阶段 3 中精心组装的文件会被上传到 NPM 注册表。这防止了源代码、测试文件或开发配置被意外发布，为用户提供了干净且最小化的包。

此过程确保最终发布的工件是专门为发布而构建的、干净且高效的项目表示，而不是开发工作区的直接副本。

## NPM Workspaces

该项目使用 [NPM Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces) 来管理此单体仓库中的包。这通过允许我们在项目根目录中跨多个包管理依赖项和运行脚本来简化开发。

### 工作原理

根目录的 `package.json` 文件定义了此项目的工作区：

```json
{
  "workspaces": ["packages/*"]
}
```

这告诉 NPM，`packages` 目录中的任何文件夹都是一个独立的包，应该作为工作区的一部分进行管理。

### 工作区的优势

- **简化的依赖管理**：从项目的根目录运行 `npm install` 将安装工作区内所有包的依赖项并将它们链接在一起。这意味着你不需要在每个包的目录中分别运行 `npm install`。
- **自动链接**：工作区内的包可以相互依赖。当你运行 `npm install` 时，NPM 会自动在包之间创建符号链接。这意味着当你修改一个包时，其他依赖于该包的包能立即看到这些更改。
- **简化的脚本执行**：你可以使用 `--workspace` 标志从项目根目录运行任何包中的脚本。例如，要在 `cli` 包中运行 `build` 脚本，可以运行 `npm run build --workspace @qwen-code/qwen-code`。