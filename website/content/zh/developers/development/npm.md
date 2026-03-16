# 包概述

该单体仓库（monorepo）包含两个主要包：`@qwen-code/qwen-code` 和 `@qwen-code/qwen-code-core`。

## `@qwen-code/qwen-code`

这是 Qwen Code 的主包，负责用户界面、命令解析以及所有面向用户的其他功能。

当该包发布时，会被打包为一个独立的可执行文件。此打包产物包含该包的所有依赖项（包括 `@qwen-code/qwen-code-core`）。这意味着，无论用户是通过 `npm install -g @qwen-code/qwen-code` 全局安装该包，还是直接通过 `npx @qwen-code/qwen-code` 运行，实际使用的都是这个单一、自包含的可执行文件。

## `@qwen-code/qwen-code-core`

该包包含 CLI 的核心逻辑，负责向已配置的提供商发起 API 请求、处理身份验证以及管理本地缓存。

该包未进行打包。发布时，它以标准 Node.js 包的形式发布，并带有自身的依赖项。如有需要，此包可在其他项目中作为独立包使用。`dist` 目录下的所有转译后 JavaScript 代码均包含在该包中。

# 发布流程

本项目遵循结构化的发布流程，以确保所有包均能正确地进行版本管理和发布。该流程尽可能实现自动化。

## 如何发布

发布流程通过 [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) GitHub Actions 工作流进行管理。如需手动发布补丁版本或热修复版本，请执行以下步骤：

1.  进入仓库的 **Actions**（操作）标签页。
2.  在工作流列表中选择 **Release**（发布）工作流。
3.  点击 **Run workflow**（运行工作流）下拉按钮。
4.  填写必需的输入项：
    - **Version**（版本）：要发布的精确版本号（例如 `v0.2.1`）。
    - **Ref**（引用）：要从中发布的分支或提交 SHA（默认为 `main`）。
    - **Dry Run**（试运行）：设为 `true` 可在不实际发布的情况下测试工作流；设为 `false` 则执行正式发布。
5.  点击 **Run workflow**（运行工作流）。

## 发布类型

本项目支持多种类型的发布：

### 稳定版发布

面向生产环境使用的常规稳定版本。

### 预览版发布

每周二 UTC 时间 23:59 发布预览版，供用户提前体验即将推出的新功能。

### 每日构建版本（Nightly Releases）

每日 UTC 时间凌晨 0:00 发布，用于前沿开发测试。

## 自动化发布计划

- **每日构建（Nightly）**：每天 UTC 时间凌晨 0:00  
- **预览版（Preview）**：每周二 UTC 时间 23:59  
- **稳定版（Stable）**：由维护者手动触发发布  

### 如何使用不同类型的发布版本

安装各类型最新版本的方法如下：

```bash

# 稳定版（默认）
npm install -g @qwen-code/qwen-code

# 预览版
npm install -g @qwen-code/qwen-code@preview

# 每日构建版
npm install -g @qwen-code/qwen-code@nightly
```

### 发布流程详情

每次按计划或手动触发的发布均遵循以下步骤：

1.  检出指定代码（`main` 分支的最新提交，或指定的某次提交）。
2.  安装所有依赖项。
3.  运行完整的 `preflight` 检查及集成测试套件。
4.  若所有测试通过，则根据发布类型计算合适的版本号。
5.  构建并发布包至 npm，并打上对应的 dist-tag。
6.  为该版本创建 GitHub Release。

### 失败处理

若发布工作流中任一步骤失败，系统将自动在仓库中创建一个新 issue，并添加 `bug` 标签以及一个与失败类型对应的标签（例如 `nightly-failure`、`preview-failure`）。该 issue 将包含指向失败工作流运行的链接，便于快速调试。

## 版本发布验证

推送新版本后，应执行冒烟测试（smoke testing），以确保相关软件包按预期正常工作。具体操作是：在本地安装这些软件包，并运行一组测试，验证其功能是否正确。

- 若未发布 `rc` 或 `dev` 类型的标签，可运行 `npx -y @qwen-code/qwen-code@latest --version`，验证推送是否成功；
- 运行 `npx -y @qwen-code/qwen-code@<release tag> --version`，验证指定标签是否已正确推送；
- _该操作将在本地产生破坏性影响_：`npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force && npm install @qwen-code/qwen-code@<version>`；
- 建议进行冒烟测试，即基本运行一遍若干 LLM 命令和工具，以确保软件包功能符合预期。我们将在未来进一步将该流程规范化。

## 何时合并版本号变更，何时不合并？

上述从当前或较早的提交创建补丁（patch）或热修复（hotfix）发布的模式，会使仓库处于以下状态：

1.  **标签（`vX.Y.Z-patch.1`）**：该标签正确指向 `main` 分支上包含你计划发布稳定代码的原始提交。这一点至关重要——任何检出该标签的用户，都将获得与实际发布完全一致的代码。
2.  **分支（`release-vX.Y.Z-patch.1`）**：该分支在已打标签的提交之上新增了一个提交，该提交仅包含 `package.json`（以及 `package-lock.json` 等相关文件）中版本号的更新。

这种分离方式是合理的，它能确保 `main` 分支的历史记录保持干净，避免混入与发布相关的版本号变更，直到你明确决定将其合并。

这是关键决策点，其具体选择完全取决于本次发布的性质。

### 合并回主分支以发布稳定补丁和热修复

对于任何稳定补丁或热修复发布，你几乎总是需要将 `release-<tag>` 分支合并回 `main` 分支。

- **为什么？** 主要原因是更新 `main` 分支中 `package.json` 的版本号。如果你从一个较旧的提交发布了 v1.2.1，但从未将该版本号更新合并回去，那么 `main` 分支的 `package.json` 中仍会显示 `"version": "1.2.0"`。下一位开始开发下一个功能版本（v1.3.0）的开发者，将基于一个版本号错误且过时的代码库进行分支操作。这会导致混淆，并在后续被迫手动更新版本号。
- **流程：** 在创建 `release-v1.2.1` 分支并成功发布包后，你应该发起一个拉取请求（PR），将 `release-v1.2.1` 合并至 `main`。该 PR 仅包含一个提交：“chore: bump version to v1.2.1”。这是一个干净、简单的集成操作，可确保 `main` 分支始终与最新发布的版本保持同步。

### 不要将预发布版本（RC、Beta、Dev）的分支合并回 `main`

通常，你不应将预发布版本的发布分支合并回 `main`。

- 为什么？预发布版本（例如 `v1.3.0-rc.1`、`v1.3.0-rc.2`）本质上是不稳定的临时版本。你不希望用一系列候选发布（RC）的版本号更新污染 `main` 分支的历史记录。`main` 分支中的 `package.json` 应反映最新的稳定版本号，而非 RC 版本。
- 流程：创建 `release-v1.3.0-rc.1` 分支，执行 `npm publish --tag rc`，之后……该分支即已完成其使命，可直接删除。RC 对应的代码已存在于 `main`（或某个功能分支）中，因此不会丢失任何功能代码。该发布分支仅是用于承载版本号的临时载体。

## 本地测试与验证：打包与发布流程的变更

如果需要测试发布流程，但又不想真正发布到 NPM 或创建公开的 GitHub 版本，你可以通过 GitHub 界面手动触发工作流。

1.  进入仓库的 [Actions 标签页](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml)。
2.  点击 “Run workflow” 下拉菜单。
3.  保持 `dry_run` 选项勾选（值为 `true`）。
4.  点击 “Run workflow” 按钮。

该操作将完整运行整个发布流程，但会跳过 `npm publish` 和 `gh release create` 步骤。你可以检查工作流日志，确认所有步骤均按预期执行。

在提交任何对打包与发布流程的修改前，**务必先在本地进行测试**。这能确保生成的包可被正确发布，并在用户安装后按预期正常工作。

为验证你的修改，可执行一次发布的“空跑”（dry run）。该操作将模拟整个发布过程，但不会将包实际发布到 npm 仓库。

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

该命令将执行以下操作：

1.  构建所有包。
2.  运行所有预发布脚本（prepublish scripts）。
3.  生成待发布至 npm 的包 tarball 文件。
4.  打印一份将被发布的包清单摘要。

随后，你可以检查生成的 tarball 文件，确认其包含正确的文件，且 `package.json` 文件已按预期更新。这些 tarball 将生成于各包目录的根路径下（例如：`packages/cli/qwen-code-0.1.6.tgz`）。

通过执行空跑，你可以确信自己对打包流程的修改是正确的，且最终包能够成功发布。

## 版本发布深度解析

发布流程的主要目标是：从 `packages/` 目录中提取源代码，完成构建，并在项目根目录下的临时 `dist` 目录中组装出一个干净、自包含的软件包。这个 `dist` 目录中的内容即为最终发布到 NPM 的产物。

以下是关键阶段：

**阶段 1：发布前健康检查与版本号更新**

- **执行内容**：在任何文件移动之前，流程首先确保项目处于良好状态——运行测试、代码检查（linting）和类型检查（`npm run preflight`）。同时，更新根目录 `package.json` 及 `packages/cli/package.json` 中的版本号为新发布的版本。
- **目的**：确保仅发布高质量、功能正常的代码；版本号更新是标识一次新发布的首要步骤。

**阶段 2：源代码构建**

- **执行内容**：将 `packages/core/src` 和 `packages/cli/src` 中的 TypeScript 源代码编译为 JavaScript。
- **文件路径变化**：
  - `packages/core/src/**/*.ts` → 编译至 → `packages/core/dist/`
  - `packages/cli/src/**/*.ts` → 编译至 → `packages/cli/dist/`
- **目的**：开发过程中编写的 TypeScript 代码需转换为 Node.js 可直接运行的纯 JavaScript。由于 `cli` 包依赖 `core` 包，因此先构建 `core` 包。

**阶段 3：最终可发布软件包的打包与组装**

这是最关键的阶段，所有文件在此阶段被移动并转换为最终发布形态。该过程采用现代打包技术生成最终软件包。

1. **打包创建**：
    - **执行内容**：`prepare-package.js` 脚本在 `dist` 目录中创建一个干净的分发软件包。
    - **关键转换操作**：
      - 将 `README.md` 和 `LICENSE` 复制到 `dist/`
      - 复制 `locales` 目录以支持国际化
      - 为分发生成精简版 `package.json`，仅保留必要依赖
      - 最小化分发依赖（不打包运行时依赖）
      - 保留 `node-pty` 的可选依赖（optional dependencies）

2. **JavaScript 主程序包生成**：
    - **执行内容**：使用 `esbuild` 将 `packages/core/dist` 和 `packages/cli/dist` 中已构建的 JavaScript 合并为单个可执行 JavaScript 文件。
    - **输出位置**：`dist/cli.js`
    - **目的**：生成一个单一、高度优化的文件，内含全部应用逻辑，从而简化安装时的依赖解析流程。

3. **静态文件与辅助文件复制**：
    - **执行内容**：将非源码但对软件包正常运行或良好描述所必需的关键文件复制进 `dist` 目录。
    - **文件路径变化**：
      - `README.md` → `dist/README.md`
      - `LICENSE` → `dist/LICENSE`
      - `locales/` → `dist/locales/`
      - 第三方依赖（vendor files）→ `dist/vendor/`
    - **目的**：
      - `README.md` 和 `LICENSE` 是任何 NPM 软件包的标准必备文件；
      - `locales` 支持国际化功能；
      - `vendor` 目录包含必要的运行时依赖。

**阶段 4：发布到 NPM**

- **执行内容**：在根目录下的 `dist` 文件夹中执行 `npm publish` 命令。
- **目的**：通过在 `dist` 目录内执行 `npm publish`，仅上传我们在第 3 阶段精心组装的文件至 NPM 仓库，从而避免意外发布源码、测试文件或开发配置，最终交付给用户一个干净、精简的软件包。

该流程确保最终发布的制品是一个专为发布而构建、干净且高效的项目表达，而非开发工作区的直接拷贝。

## NPM 工作区

本项目使用 [NPM 工作区（Workspaces）](https://docs.npmjs.com/cli/v10/using-npm/workspaces) 来管理该单体仓库（monorepo）内的各个包。这简化了开发流程，使我们能够从项目根目录统一管理依赖项，并跨多个包运行脚本。

### 工作原理

根目录下的 `package.json` 文件定义了本项目的工作区：

```json
{
  "workspaces": ["packages/*"]
}
```

该配置告知 NPM：`packages` 目录下的所有文件夹均为独立的包，应作为工作区的一部分进行统一管理。

### 工作区的优势

- **简化的依赖管理**：从项目根目录运行 `npm install`，将为工作区中的所有包安装全部依赖并自动建立链接。这意味着你无需在每个包的目录中单独运行 `npm install`。
- **自动链接**：工作区内的包可以相互依赖。当你运行 `npm install` 时，NPM 会自动在这些包之间创建符号链接。因此，当你修改某个包时，其他依赖该包的包会立即获取到这些变更。
- **简化的脚本执行**：你可以从项目根目录使用 `--workspace` 标志，在任意包中运行脚本。例如，要在 `cli` 包中运行 `build` 脚本，可执行 `npm run build --workspace @qwen-code/qwen-code`。