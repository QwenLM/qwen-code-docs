# 包概述

此 monorepo 包含两个主要包：`@qwen-code/qwen-code` 和 `@qwen-code/qwen-code-core`。

## `@qwen-code/qwen-code`

这是 Qwen Code 的主包。它负责用户界面、命令解析以及所有其他面向用户的功能。

当发布此包时，它会被打包成一个单独的可执行文件。该捆绑包包括包的所有依赖项，包括 `@qwen-code/qwen-code-core`。这意味着无论用户是通过 `npm install -g @qwen-code/qwen-code` 安装该包，还是直接使用 `npx @qwen-code/qwen-code` 运行它，他们使用的都是这个单一的、自包含的可执行文件。

## `@qwen-code/qwen-code-core`

该包包含 CLI 的核心逻辑。它负责向已配置的提供商发起 API 请求、处理身份验证以及管理本地缓存。

此包未被打包。发布时，它将以标准 Node.js 包的形式发布，并附带其自身的依赖项。这使得它可以在其他项目中作为独立包使用（如有需要）。`dist` 文件夹中的所有转译后的 js 代码都会包含在该包中。

# 发布流程

本项目遵循结构化的发布流程，以确保所有包都能正确地进行版本控制和发布。该流程的设计尽可能实现自动化。

## 如何发布

发布通过 [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) GitHub Actions 工作流进行管理。要手动发布补丁或热修复版本，请执行以下操作：

1.  导航到仓库的 **Actions** 标签页。
2.  从列表中选择 **Release** 工作流。
3.  点击 **Run workflow** 下拉按钮。
4.  填写所需的输入项：
    - **Version**：要发布的准确版本号（例如 `v0.2.1`）。
    - **Ref**：要从中发布的分支或提交 SHA（默认为 `main`）。
    - **Dry Run**：保留为 `true` 可在不实际发布的情况下测试工作流，设置为 `false` 则执行真实发布。
5.  点击 **Run workflow**。

## 发布类型

项目支持多种类型的发布：

### 稳定版发布

用于生产环境的常规稳定版本发布。

### 预览版发布

每周二 23:59 UTC 发布的预览版本，供用户提前体验即将推出的功能。

### 每日构建版本

每日凌晨 UTC 时间发布，用于前沿开发测试。

## 自动化发布计划

- **每日构建（Nightly）**：每天 UTC 时间午夜发布
- **预览版（Preview）**：每周二 UTC 时间 23:59 发布
- **稳定版（Stable）**：由维护者手动触发发布

### 如何使用不同类型的发布版本

安装每种类型的最新版本：

```bash

# 稳定版（默认）
npm install -g @qwen-code/qwen-code

# 预览版
npm install -g @qwen-code/qwen-code@preview

# 每日构建版
npm install -g @qwen-code/qwen-code@nightly
```

### 发布流程详情

每个定时或手动发布的流程都遵循以下步骤：

1. 检出指定代码（从 `main` 分支获取最新代码或特定提交）。
2. 安装所有依赖项。
3. 运行完整的 `preflight` 检查和集成测试套件。
4. 如果所有测试都成功，则根据发布类型计算适当的版本号。
5. 构建并将包以适当的 dist-tag 发布到 npm。
6. 为该版本创建一个 GitHub Release。

### 故障处理

如果发布工作流中的任何步骤失败，它将自动在仓库中创建一个新问题，并标记 `bug` 和特定类型的故障标签（例如，`nightly-failure`、`preview-failure`）。该问题将包含指向失败工作流运行的链接，以便于调试。

## 发布验证

推送新版本后，应进行冒烟测试以确保包按预期工作。可以通过本地安装包并运行一组测试来确保其正常运行。

- `npx -y @qwen-code/qwen-code@latest --version` 用于验证推送是否按预期工作（如果你不是在推送 rc 或 dev 标签）
- `npx -y @qwen-code/qwen-code@<release tag> --version` 用于验证标签是否正确推送
- _这会在本地造成破坏性影响_ `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force && npm install @qwen-code/qwen-code@<version>`
- 建议对一些 LLM 命令和工具进行基本的运行测试，以确保包按预期工作。我们将在未来进一步明确这一流程。

## 何时合并版本变更，或不合并？

从当前或较旧的提交创建补丁或热修复版本的上述模式会使仓库处于以下状态：

1. 标签（`vX.Y.Z-patch.1`）：此标签正确指向主分支上包含你打算发布的稳定代码的原始提交。这一点至关重要。任何检出此标签的人都会获得确切的已发布代码。
2. 分支（`release-vX.Y.Z-patch.1`）：此分支在标记提交的基础上包含一个新的提交。该新提交仅包含 package.json 中的版本号变更（以及其他相关文件如 package-lock.json）。

这种分离是好的。它使你的主分支历史记录保持干净，没有特定于发布的版本号提升，直到你决定合并它们。

这是关键决策，完全取决于发布的性质。

### 合并回主分支以更新稳定补丁和热修复

对于任何稳定补丁或热修复版本，你几乎总是需要将 `release-<tag>` 分支合并回 `main` 分支。

- 为什么？主要原因是更新主分支中 package.json 的版本号。如果你从一个较旧的提交发布 v1.2.1 版本但从未将版本号更新合并回去，那么你的主分支中的 package.json 仍会显示 `"version": "1.2.0"`。下一个为下一个功能版本（如 v1.3.0）开始工作的开发者将会基于一个包含错误、过时版本号的代码库进行开发。这会导致混淆，并且之后还需要手动升级版本号。
- 操作流程：在创建 release-v1.2.1 分支并且包成功发布后，你应该发起一个拉取请求，将 release-v1.2.1 合并到 main 分支。这个 PR 将只包含一次提交："chore: bump version to v1.2.1"。这是一个干净、简单的整合操作，可以让你的主分支与最新发布的版本保持同步。

### 不要将预发布版本（RC、Beta、Dev）合并回主分支

通常情况下，你不会将预发布版本的发布分支合并回 `main` 分支。

- 为什么？预发布版本（例如 v1.3.0-rc.1、v1.3.0-rc.2）本质上是不稳定的且临时的。你不希望用一系列候选版本的版本号更新来污染主分支的历史记录。main 分支中的 package.json 应该反映最新的稳定版本，而不是 RC 版本。
- 流程：创建 release-v1.3.0-rc.1 分支，执行 npm publish --tag rc，然后……这个分支就完成了它的使命。你可以直接删除它。RC 的代码已经在 main 分支（或功能分支）上了，所以不会丢失任何功能性代码。发布分支只是一个用于版本号的临时载体。

## 本地测试和验证：打包和发布流程的变更

如果你需要在不实际发布到 NPM 或创建公开 GitHub 发布的情况下测试发布流程，你可以从 GitHub UI 手动触发工作流。

1. 进入仓库的 [Actions 标签页](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml)。
2. 点击 "Run workflow" 下拉菜单。
3. 保持 `dry_run` 选项为勾选状态（即 `true`）。
4. 点击 "Run workflow" 按钮。

这将运行整个发布流程，但会跳过 `npm publish` 和 `gh release create` 步骤。你可以检查工作流日志以确保一切按预期工作。

在提交任何对打包和发布流程的更改之前，在本地进行测试至关重要。这可以确保包能被正确发布，并且用户安装时能够按预期工作。

要验证你的更改，可以执行一次发布流程的试运行。这将模拟发布过程，而不会真正将包发布到 npm 注册表。

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

该命令将执行以下操作：

1. 构建所有包。
2. 运行所有预发布脚本。
3. 创建将要发布到 npm 的包 tarball 文件。
4. 打印将要发布的包的摘要信息。

然后你可以检查生成的 tarball 文件，确保它们包含正确的文件，并且 `package.json` 文件已正确更新。tarball 文件将在每个包目录的根目录下创建（例如：`packages/cli/qwen-code-0.1.6.tgz`）。

通过执行试运行，你可以确信你对打包流程的修改是正确的，并且这些包将能成功发布。

## 发布深度解析

发布流程的主要目标是从 `packages/` 目录中获取源代码，进行构建，并在项目根目录下的临时 `dist` 目录中组装一个干净、自包含的包。这个 `dist` 目录才是实际被发布到 NPM 的内容。

以下是关键阶段：

阶段 1：发布前检查与版本控制

- 执行内容：在移动任何文件之前，流程会确保项目处于良好状态。这包括运行测试、代码规范检查和类型检查（`npm run preflight`）。同时将根目录下 `package.json` 和 `packages/cli/package.json` 中的版本号更新为新的发布版本。
- 原因：这保证了只有高质量且可工作的代码才会被发布。版本控制是标识新发布的第一个步骤。

阶段 2：构建源代码

- 执行内容：将 `packages/core/src` 和 `packages/cli/src` 中的 TypeScript 源代码编译成 JavaScript。
- 文件移动：
  - `packages/core/src/**/*.ts` → 编译后 → `packages/core/dist/`
  - `packages/cli/src/**/*.ts` → 编译后 → `packages/cli/dist/`
- 原因：开发过程中编写的 TypeScript 需要转换为 Node.js 可执行的纯 JavaScript。核心包优先构建，因为 CLI 包依赖于它。

阶段 3：打包并组装最终可发布的包

这是最关键的一个阶段，在此阶段文件会被移动并转化为用于发布的最终形态。该过程使用现代打包技术来创建最终的发布包。

1. 创建打包文件：
   - 执行内容：`prepare-package.js` 脚本会在 `dist` 目录中生成一个干净的分发包。
   - 关键转换操作：
     - 将 README.md 和 LICENSE 复制到 dist/
     - 复制支持国际化的 locales 文件夹
     - 生成仅包含必要依赖项的干净 package.json 用于分发
     - 包含如 tiktoken 等运行时依赖项
     - 维持对 node-pty 的可选依赖关系

2. 构建 JavaScript 打包文件：
   - 执行内容：利用 esbuild 将来自 `packages/core/dist` 和 `packages/cli/dist` 的已构建 JavaScript 合并为单个可执行的 JavaScript 文件。
   - 文件位置：`dist/cli.js`
   - 原因：这样可以生成一个包含所有必需应用代码的单一优化文件。通过移除安装时复杂的依赖解析需求简化了包结构。

3. 复制静态和支持性文件：
   - 执行内容：将不属于源码但对包正确工作或描述必要的文件复制进 `dist` 目录。
   - 文件移动：
     - `README.md` → `dist/README.md`
     - `LICENSE` → `dist/LICENSE`
     - `locales/` → `dist/locales/`
     - Vendor 文件 → `dist/vendor/`
   - 原因：
     - `README.md` 和 `LICENSE` 是应包含在任何 NPM 包中的标准文件。
     - Locales 支持国际化功能
     - Vendor 文件包含了必要的运行时依赖项

阶段 4：发布至 NPM

- 执行内容：从根目录下的 `dist` 目录内运行 `npm publish` 命令。
- 原因：通过在 `dist` 目录内部运行 `npm publish`，只有我们在第三阶段精心组装的文件才会上传到 NPM 注册表。这防止了意外地将源代码、测试文件或开发配置一同发布出去，从而为用户提供了一个干净而精简的包。

这一流程确保了最终发布的产物是一个专为此目的打造的、干净高效的项目表示形式，而不是直接复制开发环境的工作区。

## NPM Workspaces

本项目使用 [NPM Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces) 来管理此 monorepo 中的包。这通过允许我们从项目根目录管理依赖项和运行多个包的脚本来简化开发。

### 工作原理

根目录下的 `package.json` 文件定义了该项目的工作区：

```json
{
  "workspaces": ["packages/*"]
}
```

这告诉 NPM，`packages` 目录内的任何文件夹都是应作为工作区一部分进行管理的独立包。

### 工作区的优势

- **简化的依赖管理**：从项目根目录运行 `npm install` 将会为工作区中的所有包安装依赖并相互链接。这意味着你无需在每个包的目录中分别运行 `npm install`。
- **自动链接**：工作区内的包可以相互依赖。当你运行 `npm install` 时，NPM 会自动在包之间创建符号链接。这意味着当你修改某个包时，依赖它的其他包会立即获取到这些更改。
- **简化的脚本执行**：你可以使用 `--workspace` 标志从项目根目录运行任意包中的脚本。例如，要运行 `cli` 包中的 `build` 脚本，可以执行 `npm run build --workspace @qwen-code/qwen-code`。