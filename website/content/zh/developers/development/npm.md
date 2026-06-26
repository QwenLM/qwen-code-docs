# 包概览

此单仓库包含两个主要包：`@qwen-code/qwen-code` 和 `@qwen-code/qwen-code-core`。

## `@qwen-code/qwen-code`

这是 Qwen Code 的主包。它负责用户界面、命令解析以及所有其他用户面向的功能。

发布此包时，它会被打包成一个单独的可执行文件。此 bundle 包含了包的所有依赖项，包括 `@qwen-code/qwen-code-core`。这意味着无论用户是用 `npm install -g @qwen-code/qwen-code` 安装包，还是直接用 `npx @qwen-code/qwen-code` 运行，他们使用的都是这个独立的可执行文件。

## `@qwen-code/qwen-code-core`

此包包含 CLI 的核心逻辑。它负责向已配置的提供商发起 API 请求、处理认证以及管理本地缓存。

此包不会被打包。发布时，它作为一个标准的 Node.js 包发布，带有自己的依赖项。这使得它可以在其他项目中作为独立包使用（如果需要）。`dist` 文件夹中所有转译后的 js 代码都包含在包中。

# 发布流程

本项目遵循结构化的发布流程，以确保所有包都能正确地进行版本控制和发布。该流程尽可能实现自动化。

## 如何发布

发布通过 [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) GitHub Actions 工作流进行管理。要手动发布补丁或热修复：

1.  导航到仓库的 **Actions** 标签页。
2.  从列表中选择 **Release** 工作流。
3.  点击 **Run workflow** 下拉按钮。
4.  填写所需的输入：
    - **Version**：要发布的确切版本（例如 `v0.2.1`）。
    - **Ref**：要发布的分支或 commit SHA（默认为 `main`）。
    - **Dry Run**：保留为 `true` 以测试工作流而不发布，或设置为 `false` 以执行真实发布。
5.  点击 **Run workflow**。

## 发布类型

项目支持多种发布类型：

### 稳定版（Stable Releases）

用于生产环境的常规稳定版本。

### 预览版（Preview Releases）

每周二 UTC 时间 23:59 发布预览版，以便提前体验即将推出的功能。

### 每日构建版（Nightly Releases）

每天 UTC 时间午夜发布每日构建版，用于前沿开发测试。

## 自动发布计划

- **每日构建**：每天 UTC 时间午夜
- **预览版**：每周二 UTC 时间 23:59
- **稳定版**：由维护者手动触发

### 如何使用不同发布类型

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

每次计划内或手动发布都遵循以下步骤：

1.  检出指定代码（来自 `main` 分支的最新代码或特定 commit）。
2.  安装所有依赖项。
3.  运行全套 `preflight` 检查和集成测试。
4.  如果所有测试通过，则根据发布类型计算适当的版本号。
5.  构建并向 npm 发布带相应 dist-tag 的包。
6.  为该版本创建 GitHub Release。

### 失败处理

如果发布工作流中的任何步骤失败，它会自动在仓库中创建一个新 issue，带有 `bug` 标签和特定于类型的失败标签（例如 `nightly-failure`、`preview-failure`）。该 issue 会包含指向失败工作流运行的链接，便于调试。

## 发布验证

推送新版本后，应执行冒烟测试以确保包能按预期工作。可以通过在本地安装包并运行一组测试来验证其功能是否正常。

- `npx -y @qwen-code/qwen-code@latest --version` 验证推送是否按预期工作（如果你没有使用 rc 或 dev 标签）
- `npx -y @qwen-code/qwen-code@<release tag> --version` 验证标签是否正确推送
- _这会破坏本地环境_ `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force && npm install @qwen-code/qwen-code@<version>`
- 建议进行冒烟测试，简单运行几个 llm 命令和工具，以确保包能按预期工作。未来我们将更规范地执行此操作。

## 何时合并版本更改，或不合并？

上述从当前或较旧 commit 创建补丁或热修复版本的模式会使仓库处于以下状态：

1.  **Tag (`vX.Y.Z-patch.1`)**：此标签正确地指向 main 上包含你要发布的稳定代码的原始 commit。这一点至关重要。任何人检出此标签都会得到与发布 exact 相同的代码。
2.  **Branch (`release-vX.Y.Z-patch.1`)**：此分支在 tagged commit 之上包含一个新的 commit。该新 commit 仅包含 `package.json`（以及其他相关文件，如 `package-lock.json`）中的版本号更改。

这种分离是好的。它使你的 main 分支历史保持干净，避免发布特定的版本提升，直到你决定合并它们。

这是一个关键的决策，完全取决于发布的性质。

### 将稳定补丁和热修复合并回主分支

对于任何稳定补丁或热修复版本，你几乎总是希望将 `release-<tag>` 分支合并回 `main`。

- 为什么？主要原因是更新 main 分支的 `package.json` 中的版本。如果你从较旧的 commit 发布了 v1.2.1，但从未将版本提升合并回来，那么 main 分支的 `package.json` 仍会写着 `"version": "1.2.0"`。下一个开始开发下一个功能版本（v1.3.0）的开发者将从一个版本号不正确、更老的代码库创建分支。这会导致混乱，并且需要在以后手动提升版本。
- 流程：创建 `release-v1.2.1` 分支并成功发布包后，你应该打开一个 PR 将 `release-v1.2.1` 合并到 `main`。这个 PR 将只包含一个 commit：`"chore: bump version to v1.2.1"`。这是一个干净、简单的集成，使你的 main 分支与最新发布的版本保持同步。

### 不要将预发布版本（RC、Beta、Dev）合并回主分支

对于预发布版本，你通常不会将发布分支合并回 `main`。

- 为什么？预发布版本（例如 v1.3.0-rc.1、v1.3.0-rc.2）本质上是不稳定的、临时性的。你不想用一系列针对 release candidate 的版本提升来污染 main 分支的历史。main 中的 `package.json` 应该反映最新的稳定发布版本，而不是 RC。
- 流程：创建 `release-v1.3.0-rc.1` 分支，执行 `npm publish --tag rc`，然后……这个分支已经完成了它的使命。你可以直接删除它。RC 的代码已经在 `main`（或一个功能分支）上，所以不会丢失任何功能代码。发布分支只是用于版本号的临时载体。

## 本地测试和验证：对打包和发布流程的更改

如果你需要在不发布到 NPM 或创建公共 GitHub Release 的情况下测试发布流程，你可以从 GitHub UI 手动触发工作流。

1.  转到仓库的 [Actions 标签页](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml)。
2.  点击 "Run workflow" 下拉菜单。
3.  保持 `dry_run` 选项选中（`true`）。
4.  点击 "Run workflow" 按钮。

这将运行整个发布流程，但会跳过 `npm publish` 和 `gh release create` 步骤。你可以检查工作流日志以确保一切按预期运行。

在提交之前，必须对打包和发布流程的任何更改进行本地测试。这确保了包能正确发布，并且在用户安装后能按预期工作。

要验证你的更改，你可以执行发布过程的 dry run。这将模拟发布过程，但不会将包实际发布到 npm registry。

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

此命令将执行以下操作：

1.  构建所有包。
2.  运行所有 prepublish 脚本。
3.  创建将要发布到 npm 的包 tarball。
4.  打印将要发布的包的摘要。

然后你可以检查生成的 tarball，确保它们包含正确的文件，并且 `package.json` 文件已正确更新。Tarball 将创建在每个包目录的根目录下（例如 `packages/cli/qwen-code-0.1.6.tgz`）。

通过执行 dry run，你可以确信你对打包流程的更改是正确的，并且这些包将成功发布。

## 深度解析发布流程

发布过程的主要目标是获取 `packages/` 目录中的源代码，构建它们，然后在项目根目录下的临时 `dist` 目录中组装成一个干净、独立的包。这个 `dist` 目录才是实际发布到 NPM 的内容。

以下是关键阶段：

### 阶段 1：发布前的健康检查和版本控制

- 发生什么：在移动任何文件之前，流程确保项目处于良好状态。这涉及运行测试、linting 和类型检查（`npm run preflight`）。根目录 `package.json` 和 `packages/cli/package.json` 中的版本号将更新为新版本号。
- 原因：这保证了只有高质量、可工作的代码才会被发布。版本控制是标志新版本的第一步。

### 阶段 2：构建源代码

- 发生什么：`packages/core/src` 和 `packages/cli/src` 中的 TypeScript 源代码被编译成 JavaScript。
- 文件移动：
  - `packages/core/src/**/*.ts` -> 编译到 -> `packages/core/dist/`
  - `packages/cli/src/**/*.ts` -> 编译到 -> `packages/cli/dist/`
- 原因：开发过程中编写的 TypeScript 代码需要转换成可由 Node.js 运行的纯 JavaScript。核心包先构建，因为 CLI 包依赖于它。

### 阶段 3：打包和组装最终的可发布包

这是最关键阶段，文件被移动并转换为用于发布的最终状态。该过程使用现代打包技术创建最终包。

1.  **Bundle 创建**：
    - 发生什么：`prepare-package.js` 脚本在 `dist` 目录中创建一个干净的发布包。
    - 关键转换：
      - 将 `README.md` 和 `LICENSE` 复制到 `dist/`
      - 复制 `locales` 文件夹用于国际化
      - 为发布创建一个干净的 `package.json`，只包含必要的依赖项
      - 保持发布依赖项最小化（不包含捆绑的运行时依赖）
      - 为 `node-pty` 保留可选依赖项

2.  **JavaScript Bundle 创建**：
    - 发生什么：来自 `packages/core/dist` 和 `packages/cli/dist` 的构建后的 JavaScript 使用 esbuild 被捆绑成一个单独的可执行 JavaScript 文件。
    - 文件位置：`dist/cli.js`
    - 原因：这将创建一个包含所有必要应用程序代码的单个优化文件。它简化了包，消除了在安装时进行复杂依赖解析的需要。

3.  **静态和支持文件复制**：
    - 发生什么：不属于源代码但包正常运行或良好描述所需的关键文件被复制到 `dist` 目录。
    - 文件移动：
      - `README.md` -> `dist/README.md`
      - `LICENSE` -> `dist/LICENSE`
      - `locales/` -> `dist/locales/`
      - 供应商文件 -> `dist/vendor/`
    - 原因：
      - `README.md` 和 `LICENSE` 是任何 NPM 包都应包含的标准文件。
      - 国际化需要 locales 支持
      - 供应商文件包含必要的运行时依赖

### 阶段 4：发布到 NPM

- 发生什么：在根 `dist` 目录内运行 `npm publish` 命令。
- 原因：通过在 `dist` 目录内运行 `npm publish`，只有我们在阶段 3 中精心组装的文件才会被上传到 NPM 注册表。这防止了任何源代码、测试文件或开发配置被意外发布，从而为用户提供一个干净、最小的包。

此过程确保最终发布的工件是项目的一个定制构建、干净、高效的表示，而不是开发工作区的直接副本。

## NPM Workspaces

本项目使用 [NPM Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces) 来管理此单仓库中的包。这简化了开发，允许我们从项目根目录管理多个包的依赖和运行脚本。

### 工作原理

根目录下的 `package.json` 文件定义了项目的工作区：

```json
{
  "workspaces": ["packages/*"]
}
```

这告诉 NPM，`packages` 目录中的任何文件夹都是一个单独的包，应作为工作区的一部分进行管理。

### Workspaces 的好处

- **简化依赖管理**：从项目根目录运行 `npm install` 将为工作区中的所有包安装所有依赖项，并将它们链接在一起。这意味着你不需要在每个包的目录中运行 `npm install`。
- **自动链接**：工作区中的包可以相互依赖。当你运行 `npm install` 时，NPM 会自动在包之间创建符号链接。这意味着当你对一个包进行更改时，更改会立即可用于依赖于它的其他包。
- **简化脚本执行**：你可以使用 `--workspace` 标志从项目根目录运行任何包中的脚本。例如，要运行 `cli` 包中的 `build` 脚本，你可以运行 `npm run build --workspace @qwen-code/qwen-code`。