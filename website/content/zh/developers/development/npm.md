# 包概览

此 monorepo 包含两个主要包：`@qwen-code/qwen-code` 和 `@qwen-code/qwen-code-core`。

## `@qwen-code/qwen-code`

这是 Qwen Code 的主包。它负责用户界面、命令解析以及所有面向用户的功能。

发布此包时，它会被打包成一个单一的可执行文件。该 bundle 包含了包的所有依赖项，包括 `@qwen-code/qwen-code-core`。这意味着，无论用户是通过 `npm install -g @qwen-code/qwen-code` 安装，还是直接使用 `npx @qwen-code/qwen-code` 运行，他们使用的都是这个单一且自包含的可执行文件。

## `@qwen-code/qwen-code-core`

此包包含 CLI 的核心逻辑。它负责向配置的 provider 发起 API 请求、处理身份验证以及管理本地缓存。

此包不会进行打包。发布时，它会作为一个带有自身依赖的标准 Node.js 包发布。这使得它在需要时可以作为独立包在其他项目中使用。`dist` 文件夹中所有转译后的 JS 代码都会包含在包内。

# 发布流程

本项目遵循结构化的发布流程，以确保所有包都能正确版本化和发布。该流程的设计尽可能实现自动化。

## 如何发布

发布通过 [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) GitHub Actions 工作流进行管理。若要手动发布 patch 或 hotfix：

1. 导航到仓库的 **Actions** 选项卡。
2. 从列表中选择 **Release** 工作流。
3. 点击 **Run workflow** 下拉按钮。
4. 填写所需的输入参数：
    - **Version**：要发布的精确版本（例如 `v0.2.1`）。
    - **Ref**：要发布的分支或 commit SHA（默认为 `main`）。
    - **Dry Run**：保持为 `true` 可在不实际发布的情况下测试工作流，或设置为 `false` 执行正式发布。
5. 点击 **Run workflow**。

## 发布类型

本项目支持多种发布类型：

### 稳定版发布

用于生产环境的常规稳定版发布。

### 预览版发布

每周二 23:59 UTC 发布的预览版，用于提前体验即将推出的功能。

### Nightly 发布

每日午夜 UTC 发布的 Nightly 版本，用于前沿开发测试。

## 自动化发布计划

- **Nightly**：每天午夜 UTC
- **Preview**：每周二 23:59 UTC
- **Stable**：由维护者手动触发的发布

### 如何使用不同的发布类型

安装每种类型的最新版本：

```bash
# Stable (default)
npm install -g @qwen-code/qwen-code

# Preview
npm install -g @qwen-code/qwen-code@preview

# Nightly
npm install -g @qwen-code/qwen-code@nightly
```

### 发布流程详情

每次计划内或手动发布均遵循以下步骤：

1. 检出指定的代码（`main` 分支的最新代码或特定 commit）。
2. 安装所有依赖项。
3. 运行完整的 `preflight` 检查和集成测试。
4. 如果所有测试通过，则根据发布类型计算相应的版本号。
5. 构建包并使用相应的 dist-tag 发布到 npm。
6. 为该版本创建 GitHub Release。

### 失败处理

如果发布工作流中的任何步骤失败，系统将自动在仓库中创建一个新 issue，并打上 `bug` 标签以及特定类型的失败标签（例如 `nightly-failure`、`preview-failure`）。该 issue 将包含失败工作流运行的链接，以便于调试。

## 发布验证

推送新版本后，应执行冒烟测试以确保包按预期工作。可以通过在本地安装包并运行一组测试来验证其功能是否正常。

- `npx -y @qwen-code/qwen-code@latest --version` 用于验证推送是否符合预期（如果不是发布 rc 或 dev tag）
- `npx -y @qwen-code/qwen-code@<release tag> --version` 用于验证推送的 tag 是否正确
- _此操作在本地具有破坏性_ `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force &&  npm install @qwen-code/qwen-code@<version>`
- 建议执行基本的冒烟测试，运行一些 LLM 命令和工具，以确保包按预期工作。未来我们将对此进行更详细的规范。

## 何时合并版本变更？

上述基于当前或历史 commit 创建 patch 或 hotfix 发布的模式会使仓库处于以下状态：

1.  Tag (`vX.Y.Z-patch.1`)：该 tag 正确指向 main 分支上包含你打算发布的稳定代码的原始 commit。这至关重要。任何人检出该 tag 都能获取到已发布的精确代码。
2.  分支 (`release-vX.Y.Z-patch.1`)：该分支在已打 tag 的 commit 之上包含一个新的 commit。该新 commit 仅包含 `package.json`（以及 `package-lock.json` 等相关文件）中的版本号变更。

这种分离是合理的。它确保 main 分支的历史记录保持干净，不会混入特定于发布的版本升级，直到你决定合并它们。

这是一个关键决策，完全取决于发布的性质。

### 为 Stable Patch 和 Hotfix 合并回主分支

对于任何 stable patch 或 hotfix 发布，你几乎总是需要将 `release-<tag>` 分支合并回 `main`。

- 为什么？主要原因是为了更新 main 分支 `package.json` 中的版本。如果你从较旧的 commit 发布了 v1.2.1 但从未将版本升级合并回去，main 分支的 `package.json` 仍将显示 `"version": "1.2.0"`。下一位开始开发下一个功能版本 (v1.3.0) 的开发者将基于一个版本号错误且过旧的代码库创建分支。这会导致混乱，并需要在后期手动升级版本。
- 流程：在创建 `release-v1.2.1` 分支并成功发布包后，你应该创建一个 pull request 将 `release-v1.2.1` 合并到 main。该 PR 仅包含一个 commit：`"chore: bump version to v1.2.1"`。这是一种干净、简单的集成方式，可确保 main 分支与最新发布的版本保持同步。

### 不要为 Pre-Releases (RC, Beta, Dev) 合并回主分支

通常不需要将 pre-release 的发布分支合并回 `main`。

- 为什么？Pre-release 版本（例如 v1.3.0-rc.1、v1.3.0-rc.2）本质上是不稳定的临时版本。你不希望用一系列 RC 的版本升级记录污染 main 分支的历史。main 中的 `package.json` 应反映最新的稳定发布版本，而不是 RC。
- 流程：创建 `release-v1.3.0-rc.1` 分支，执行 `npm publish --tag rc`，然后……该分支的使命就完成了。你可以直接删除它。RC 的代码已经存在于 main（或功能分支）上，因此不会丢失任何功能代码。发布分支仅仅是版本号的临时载体。

## 本地测试与验证：打包和发布流程的变更

如果你需要在不实际发布到 NPM 或创建公开 GitHub Release 的情况下测试发布流程，可以从 GitHub UI 手动触发工作流。

1. 进入仓库的 [Actions 选项卡](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml)。
2. 点击 "Run workflow" 下拉菜单。
3. 保持 `dry_run` 选项为勾选状态 (`true`)。
4. 点击 "Run workflow" 按钮。

这将运行完整的发布流程，但会跳过 `npm publish` 和 `gh release create` 步骤。你可以检查工作流日志以确保一切按预期运行。

在提交任何打包和发布流程的变更之前，在本地进行测试至关重要。这能确保包能够正确发布，并在用户安装后按预期工作。

为了验证你的变更，你可以执行发布流程的 dry run。这将模拟发布过程，而不会实际将包发布到 npm registry。

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

该命令将执行以下操作：

1. 构建所有包。
2. 运行所有 prepublish 脚本。
3. 创建原本将发布到 npm 的包 tarball。
4. 打印即将发布的包摘要。

然后你可以检查生成的 tarball，确保它们包含正确的文件，且 `package.json` 已正确更新。Tarball 将创建在每个包目录的根目录下（例如 `packages/cli/qwen-code-0.1.6.tgz`）。

通过执行 dry run，你可以确信对打包流程的变更是正确的，并且包将成功发布。

## 发布流程深入解析

发布流程的主要目标是从 `packages/` 目录获取源代码，进行构建，并在项目根目录的临时 `dist` 目录中组装出一个干净、自包含的包。实际发布到 NPM 的正是这个 `dist` 目录。

以下是关键阶段：

阶段 1：发布前健全性检查与版本化

- 执行内容：在移动任何文件之前，流程会确保项目处于良好状态。这包括运行测试、lint 检查和类型检查 (`npm run preflight`)。根目录 `package.json` 和 `packages/cli/package.json` 中的版本号将更新为新发布版本。
- 原因：这保证了只有高质量、可运行的代码才会被发布。版本化是标志着新发布的第一步。

阶段 2：构建源代码

- 执行内容：将 `packages/core/src` 和 `packages/cli/src` 中的 TypeScript 源代码编译为 JavaScript。
- 文件移动：
  - `packages/core/src/**/*.ts` -> 编译为 -> `packages/core/dist/`
  - `packages/cli/src/**/*.ts` -> 编译为 -> `packages/cli/dist/`
- 原因：开发期间编写的 TypeScript 代码需要转换为可由 Node.js 运行的纯 JavaScript。由于 cli 包依赖于 core 包，因此会优先构建 core 包。

阶段 3：打包与组装最终可发布包

这是最关键的阶段，文件在此被移动并转换为发布前的最终状态。该流程使用现代打包技术来创建最终包。

1. 创建 Bundle：
    - 执行内容：`prepare-package.js` 脚本在 `dist` 目录中创建一个干净的发布包。
    - 关键转换：
      - 将 README.md 和 LICENSE 复制到 dist/
      - 复制 locales 文件夹以支持国际化
      - 创建仅包含必要依赖的干净 `package.json` 用于分发
      - 保持分发依赖最小化（不打包运行时依赖）
      - 保留 node-pty 的可选依赖

2. 创建 JavaScript Bundle：
    - 执行内容：使用 esbuild 将 `packages/core/dist` 和 `packages/cli/dist` 中构建好的 JavaScript 打包成单一的可执行 JavaScript 文件。
    - 文件位置：dist/cli.js
    - 原因：这会生成一个包含所有必要应用代码的单一优化文件。它消除了安装时复杂依赖解析的需求，从而简化了包结构。

3. 复制静态与支持文件：
    - 执行内容：将不属于源代码但对包正常运行或完整描述至关重要的文件复制到 `dist` 目录。
    - 文件移动：
      - README.md -> dist/README.md
      - LICENSE -> dist/LICENSE
      - locales/ -> dist/locales/
      - Vendor 文件 -> dist/vendor/
    - 原因：
      - README.md 和 LICENSE 是任何 NPM 包都应包含的标准文件。
      - Locales 支持国际化功能
      - Vendor 文件包含必要的运行时依赖

阶段 4：发布到 NPM

- 执行内容：在根目录的 `dist` 目录内运行 `npm publish` 命令。
- 原因：通过在 `dist` 目录内运行 `npm publish`，只有我们在阶段 3 中精心组装的文件才会上传到 NPM registry。这防止了源代码、测试文件或开发配置被意外发布，从而为用户提供一个干净、精简的包。

此流程确保最终发布的产物是专为发布构建的、干净且高效的项目表示，而非开发工作区的直接副本。

## NPM Workspaces

本项目使用 [NPM Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces) 来管理此 monorepo 中的包。这简化了开发流程，使我们能够从项目根目录统一管理依赖并跨多个包运行脚本。

### 工作原理

根目录的 `package.json` 文件定义了本项目的工作区：

```json
{
  "workspaces": ["packages/*"]
}
```

这告诉 NPM，`packages` 目录下的任何文件夹都是一个独立的包，应作为工作区的一部分进行管理。

### Workspaces 的优势

- **简化的依赖管理**：从项目根目录运行 `npm install` 将安装工作区中所有包的所有依赖并将它们链接在一起。这意味着你无需在每个包的目录中单独运行 `npm install`。
- **自动链接**：工作区内的包可以相互依赖。运行 `npm install` 时，NPM 会自动在包之间创建符号链接。这意味着当你对某个包进行更改时，依赖它的其他包可以立即获取这些更改。
- **简化的脚本执行**：你可以使用 `--workspace` 标志从项目根目录运行任何包中的脚本。例如，要运行 `cli` 包中的 `build` 脚本，可以执行 `npm run build --workspace @qwen-code/qwen-code`。