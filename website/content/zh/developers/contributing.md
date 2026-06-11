# 如何贡献

我们非常欢迎你对本项目提交补丁和贡献。

## 贡献流程

### 代码审查

所有提交（包括项目成员的提交）都需要经过审查。我们使用 [GitHub pull requests](https://docs.github.com/articles/about-pull-requests) 来完成此流程。

### Pull Request 指南

为了帮助我们快速审查和合并你的 PR，请遵循以下指南。不符合这些标准的 PR 可能会被关闭。

#### 1. 关联现有 Issue

所有 PR 都应关联到我们 Issue 跟踪器中的现有 Issue。这能确保在编写代码之前，每个变更都经过讨论并与项目目标保持一致。

- **Bug 修复：** PR 应关联到对应的 bug 报告 Issue。
- **新功能：** PR 应关联到已获得维护者批准的功能请求或提案 Issue。

如果你的变更没有对应的 Issue，请先 **创建一个 Issue** 并等待反馈，然后再开始编写代码。

#### 2. 保持精简与聚焦

我们倾向于提交小型、原子化的 PR，每个 PR 只解决一个问题或添加一个独立的功能。

- **推荐：** 创建一个仅修复特定 bug 或添加特定功能的 PR。
- **避免：** 将多个不相关的变更（例如 bug 修复、新功能和重构）打包到同一个 PR 中。

大型变更应拆分为一系列更小、逻辑清晰的 PR，以便独立审查和合并。

#### 3. 使用 Draft PR 进行开发中工作

如果你希望尽早获得反馈，请使用 GitHub 的 **Draft Pull Request** 功能。这会向维护者表明该 PR 尚未准备好进行正式审查，但欢迎讨论和初步反馈。

#### 4. 确保所有检查通过

在提交 PR 之前，请运行 `npm run preflight` 确保所有自动化检查均已通过。该命令会运行所有测试、lint 检查及其他代码风格检查。

#### 5. 更新文档

如果你的 PR 引入了面向用户的变更（例如新命令、修改的 flag 或行为变更），你还必须更新 `/docs` 目录中的相关文档。

#### 6. 编写清晰的 Commit Message 和 PR 描述

你的 PR 应具有清晰、描述性的标题以及详细的变更说明。Commit message 请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

- **好的 PR 标题：** `feat(cli): Add --json flag to 'config get' command`
- **差的 PR 标题：** `Made some changes`

在 PR 描述中，请解释变更背后的“原因”，并关联相关 Issue（例如 `Fixes #123`）。

## 开发环境配置与工作流

本节将指导贡献者如何构建、修改以及了解本项目的开发环境配置。

### 配置开发环境

**前置条件：**

1.  **Node.js**：
    - **开发环境：** 请使用 Node.js `~20.19.0`。由于上游开发依赖问题，必须使用此特定版本。你可以使用 [nvm](https://github.com/nvm-sh/nvm) 等工具来管理 Node.js 版本。
    - **生产环境：** 若在生产环境中运行 CLI，任何 `>=20` 的 Node.js 版本均可接受。
2.  **Git**

### 构建流程

克隆仓库：

```bash
git clone https://github.com/QwenLM/qwen-code.git # Or your fork's URL
cd qwen-code
```

安装 `package.json` 中定义的依赖以及根目录依赖：

```bash
npm install
```

构建整个项目（所有 package）：

```bash
npm run build
```

该命令通常会将 TypeScript 编译为 JavaScript、打包资源并准备执行所需的 package。有关构建过程的更多细节，请参阅 `scripts/build.js` 和 `package.json` 中的 scripts。

### 启用沙箱 (Sandboxing)

强烈建议启用 [Sandboxing](#sandboxing)，至少需要在 `~/.env` 中设置 `QWEN_SANDBOX=true`，并确保已安装可用的沙箱提供程序（例如 `macOS Seatbelt`、`docker` 或 `podman`）。详情请参阅 [Sandboxing](#sandboxing)。

要同时构建 `qwen-code` CLI 工具和沙箱容器，请在根目录运行 `build:all`：

```bash
npm run build:all
```

如果跳过构建沙箱容器，可以直接使用 `npm run build`。

### 运行

构建完成后，要从源代码启动 Qwen Code 应用，请在根目录运行以下命令：

```bash
npm start
```

如果你希望在 `qwen-code` 文件夹之外运行源码构建版本，可以使用 `npm link path/to/qwen-code/packages/cli`（参见：[文档](https://docs.npmjs.com/cli/v9/commands/npm-link)）来通过 `qwen-code` 命令运行。

### 运行测试

本项目包含两类测试：单元测试和集成测试。

#### 单元测试

执行项目的单元测试套件：

```bash
npm run test
```

这将运行 `packages/core` 和 `packages/cli` 目录中的测试。在提交任何变更前，请确保测试通过。为了进行更全面的检查，建议运行 `npm run preflight`。

#### 集成测试

集成测试旨在验证 Qwen Code 的端到端功能。它们不会作为默认的 `npm run test` 命令的一部分运行。

运行集成测试，请使用以下命令：

```bash
npm run test:e2e
```

有关集成测试框架的更多详细信息，请参阅 [集成测试文档](./docs/integration-tests.md)。

### Lint 与 Preflight 检查

为确保代码质量和格式一致性，请运行 preflight 检查：

```bash
npm run preflight
```

该命令将运行 ESLint、Prettier、所有测试以及 `package.json` 中定义的其他检查。

_小贴士_

克隆仓库后，建议创建一个 git precommit hook 文件，以确保你的提交始终保持整洁。

```bash
echo "
# Run npm build and check for errors
if ! npm run preflight; then
  echo "npm build failed. Commit aborted."
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### 代码格式化

要从根目录单独格式化本项目代码，请运行以下命令：

```bash
npm run format
```

该命令使用 Prettier 根据项目的代码规范格式化代码。

#### Lint 检查

要单独对本项目代码进行 lint 检查，请从根目录运行以下命令：

```bash
npm run lint
```

### 编码规范

- 请遵循现有代码库中使用的代码风格、模式和规范。
- **Imports：** 请特别注意 import 路径。项目使用 ESLint 来强制限制 package 之间的相对 import。

### 项目结构

- `packages/`：包含项目的各个子 package。
  - `cli/`：命令行界面。
  - `core/`：Qwen Code 的核心后端逻辑。
- `docs/`：包含所有项目文档。
- `scripts/`：用于构建、测试和开发任务的工具脚本。

有关更详细的架构说明，请参阅 `docs/architecture.md`。

## 文档开发

本节介绍如何在本地开发和预览文档。

### 前置条件

1. 确保已安装 Node.js（版本 18+）
2. 确保已安装 npm 或 yarn

### 本地配置文档站点

要在本地编辑文档并预览变更：

1. 进入 `docs-site` 目录：

   ```bash
   cd docs-site
   ```

2. 安装依赖：

   ```bash
   npm install
   ```

3. 将主 `docs` 目录中的文档内容进行链接：

   ```bash
   npm run link
   ```

   这会在 docs-site 项目中创建从 `../docs` 到 `content` 的符号链接，使 Next.js 站点能够直接提供文档内容。

4. 启动开发服务器：

   ```bash
   npm run dev
   ```

5. 在浏览器中打开 [http://localhost:3000](http://localhost:3000)，即可在修改时实时查看文档站点的更新。

对主 `docs` 目录中文档文件所做的任何更改都会立即反映在文档站点中。

## 调试

### VS Code：

0.  在 VS Code 中按 `F5` 运行 CLI 进行交互式调试
1.  从根目录以调试模式启动 CLI：
    ```bash
    npm run debug
    ```
    该命令会在 `packages/cli` 目录中运行 `node --inspect-brk dist/index.js`，暂停执行直到调试器连接。随后你可以在 Chrome 浏览器中打开 `chrome://inspect` 连接调试器。
2.  在 VS Code 中，使用 "Attach" 启动配置（位于 `.vscode/launch.json` 中）。

如果你更倾向于直接启动当前打开的文件，也可以使用 VS Code 中的 "Launch Program" 配置，但通常推荐使用 `F5`。

要在沙箱容器内触发断点，请运行：

```bash
DEBUG=1 qwen-code
```

**注意：** 如果项目的 `.env` 文件中包含 `DEBUG=true`，由于自动排除机制，它不会影响 qwen-code。请使用 `.qwen-code/.env` 文件配置 qwen-code 专属的调试设置。

### React DevTools

要调试 CLI 基于 React 的 UI，你可以使用 React DevTools。用于 CLI 界面的 Ink 库兼容 React DevTools 4.x 版本。

1.  **以开发模式启动 Qwen Code 应用：**

    ```bash
    DEV=true npm start
    ```

2.  **安装并运行 React DevTools 4.28.5 版本（或最新兼容的 4.x 版本）：**

    你可以全局安装：

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    或者使用 npx 直接运行：

    ```bash
    npx react-devtools@4.28.5
    ```

    运行中的 CLI 应用随后将连接到 React DevTools。

## Sandboxing

> TBD

## 手动发布

我们会将每次 commit 的构建产物发布到内部 registry。但如果你需要手动在本地构建发布版本，请运行以下命令：

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```