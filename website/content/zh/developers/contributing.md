# 如何贡献

我们非常欢迎你为此项目提交补丁和贡献。

## 贡献流程

### 代码审查

所有提交，包括项目成员的提交，都需要经过审查。我们使用 [GitHub pull requests](https://docs.github.com/articles/about-pull-requests) 来完成这一过程。

### Pull Request 指南

为了帮助我们快速审查和合并你的 PR，请遵循以下指南。不符合这些标准的 PR 可能会被关闭。

#### 1. 链接到现有 Issue

所有 PR 都应链接到我们追踪器中的一个现有 issue。这确保在编写任何代码之前，每项变更都经过讨论并与项目目标保持一致。

- **对于 bug 修复：** PR 应链接到对应的 bug 报告 issue。
- **对于功能开发：** PR 应链接到已被维护者批准的功能请求或提案 issue。

如果你的变更尚无对应 issue，请**先创建一个**，并在开始编码前等待反馈。

#### 2. 保持小而专注

我们更倾向于小而原子化的 PR，专注于解决单个问题或添加单一、独立的功能。

- **应该做：** 创建一个仅修复特定 bug 或添加特定功能的 PR。
- **不应该做：** 将多个不相关的变更（例如，一个 bug 修复、一个新功能和一次重构）打包进同一个 PR。

大型变更应拆分为一系列较小且逻辑清晰的 PR，以便可以独立审查和合并。

#### 3. 使用草稿 PR 进行进行中的工作

如果你希望尽早获得关于你工作的反馈，请使用 GitHub 的 **Draft Pull Request** 功能。这向维护者表明该 PR 尚未准备好进行正式审查，但已开放讨论和初步反馈。

#### 4. 确保所有检查通过

在提交你的 PR 之前，请确保通过运行 `npm run preflight` 命令使所有自动化检查都通过。此命令会运行所有测试、代码规范检查和其他样式检查。

#### 5. 更新文档

如果你的 PR 引入了面向用户的更改（例如，新命令、修改的标志或行为变更），你还必须更新 `/docs` 目录中相关的文档。

#### 6. 编写清晰的提交信息和良好的 PR 描述

你的 PR 应该有一个清晰、描述性的标题，以及对更改内容的详细说明。请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 标准来编写你的提交信息。

- **好的 PR 标题：** `feat(cli): Add --json flag to 'config get' command`
- **不好的 PR 标题：** `Made some changes`

在 PR 描述中，请解释你进行这些更改的原因，并链接到相关的 issue（例如，`Fixes #123`）。

## 开发环境设置与工作流程

本节将指导贡献者如何构建、修改并理解该项目的开发环境设置。

### 设置开发环境

**先决条件：**

1.  **Node.js**：
    - **开发环境：** 请使用 Node.js `~20.19.0`。由于上游开发依赖问题，必须使用此特定版本。你可以使用类似 [nvm](https://github.com/nvm-sh/nvm) 的工具来管理 Node.js 版本。
    - **生产环境：** 在生产环境中运行 CLI 时，任何版本的 Node.js `>=20` 均可接受。
2.  **Git**

### 构建流程

克隆仓库：

```bash
git clone https://github.com/QwenLM/qwen-code.git # 或你 fork 的 URL
cd qwen-code
```

安装 `package.json` 中定义的依赖以及根依赖：

```bash
npm install
```

构建整个项目（所有包）：

```bash
npm run build
```

该命令通常会将 TypeScript 编译为 JavaScript、打包资源，并准备包以供执行。有关构建过程中具体操作的更多详情，请参阅 `scripts/build.js` 和 `package.json` 中的脚本部分。

### 启用沙箱

强烈推荐启用[沙箱](#sandboxing)，至少需要在你的 `~/.env` 文件中设置 `QWEN_SANDBOX=true`，并确保有可用的沙箱提供程序（例如 `macOS Seatbelt`、`docker` 或 `podman`）。详情请参见[沙箱](#sandboxing)部分。

要构建 `qwen-code` CLI 工具和沙箱容器，从根目录运行以下命令：

```bash
npm run build:all
```

如果要跳过构建沙箱容器，可以改用 `npm run build`。

### 运行

要从源代码启动 Qwen Code 应用（构建完成后），请从根目录运行以下命令：

```bash
npm start
```

如果你想在 qwen-code 文件夹之外运行源码构建，可以使用 `npm link path/to/qwen-code/packages/cli`（参见：[文档](https://docs.npmjs.com/cli/v9/commands/npm-link)）来通过 `qwen-code` 运行。

### 运行测试

本项目包含两种类型的测试：单元测试和集成测试。

#### 单元测试

要执行项目的单元测试套件：

```bash
npm run test
```

这将运行位于 `packages/core` 和 `packages/cli` 目录中的测试。在提交任何更改之前，请确保所有测试都能通过。为了更全面的检查，建议运行 `npm run preflight`。

#### 集成测试

集成测试旨在验证 Qwen Code 的端到端功能。它们不会作为默认 `npm run test` 命令的一部分运行。

要运行集成测试，请使用以下命令：

```bash
npm run test:e2e
```

有关集成测试框架的更多详细信息，请参阅[集成测试文档](./docs/integration-tests.md)。

### 代码检查和预检

为确保代码质量和格式一致性，请运行预检命令：

```bash
npm run preflight
```

该命令将运行 ESLint、Prettier、所有测试以及其他在项目 `package.json` 中定义的检查。

_专业提示_

克隆仓库后，创建一个 Git pre-commit 钩子文件，以确保你的每次提交都是干净的。

```bash
echo "

# 运行 npm 构建并检查错误
if ! npm run preflight; then
  echo "npm 构建失败。提交已中止。"
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### 格式化

要单独格式化本项目的代码，请从根目录运行以下命令：

```bash
npm run format
```

此命令使用 Prettier 根据项目的样式指南来格式化代码。

#### 代码检查

要单独对本项目的代码进行检查，请从根目录运行以下命令：

```bash
npm run lint
```

### 编码规范

- 请遵循现有代码库中使用的编码风格、模式和约定。
- **导入：** 特别注意导入路径。项目使用 ESLint 来强制限制包之间的相对导入。

### 项目结构

- `packages/`：包含项目的各个子包。
  - `cli/`：CLI。
  - `core/`：Qwen Code 的核心后端逻辑。
- `docs/`：包含所有项目文档。
- `scripts/`：用于构建、测试和开发任务的实用脚本。

有关更详细的架构信息，请参阅 `docs/architecture.md`。

## 文档开发

本节介绍如何在本地开发和预览文档。

### 先决条件

1. 确保已安装 Node.js（版本 18+）
2. 确保可以使用 npm 或 yarn

### 本地设置文档站点

要在本地处理文档并预览更改：

1. 导航到 `docs-site` 目录：

   ```bash
   cd docs-site
   ```

2. 安装依赖项：

   ```bash
   npm install
   ```

3. 从主 `docs` 目录链接文档内容：

   ```bash
   npm run link
   ```

   这会在 docs-site 项目中创建一个从 `../docs` 到 `content` 的符号链接，使文档内容能够被 Next.js 站点提供服务。

4. 启动开发服务器：

   ```bash
   npm run dev
   ```

5. 在浏览器中打开 [http://localhost:3000](http://localhost:3000)，查看文档站点，并在你进行更改时实时更新。

对主 `docs` 目录中的文档文件所做的任何更改都会立即反映在文档站点中。

## 调试

### VS Code:

0.  运行 CLI 并使用 `F5` 在 VS Code 中进行交互式调试
1.  从根目录启动 CLI 的调试模式：
    ```bash
    npm run debug
    ```
    此命令在 `packages/cli` 目录中运行 `node --inspect-brk dist/index.js`，并在调试器附加之前暂停执行。然后你可以在 Chrome 浏览器中打开 `chrome://inspect` 来连接到调试器。
2.  在 VS Code 中，使用 "Attach" 启动配置（位于 `.vscode/launch.json`）。

或者，如果你更喜欢直接启动当前打开的文件，也可以在 VS Code 中使用 "Launch Program" 配置，但通常推荐使用 'F5'。

要在沙箱容器内命中断点，请运行：

```bash
DEBUG=1 qwen-code
```

**注意：** 如果项目中的 `.env` 文件包含 `DEBUG=true`，它不会影响 qwen-code，因为会自动排除。请使用 `.qwen-code/.env` 文件来设置 qwen-code 特定的调试选项。

### React DevTools

要调试基于 React 的 CLI UI，你可以使用 React DevTools。CLI 界面所使用的库 Ink 兼容 React DevTools 4.x 版本。

1.  **以开发模式启动 Qwen Code 应用：**

    ```bash
    DEV=true npm start
    ```

2.  **安装并运行 React DevTools 4.28.5 版本（或最新的兼容 4.x 版本）：**

    你可以选择全局安装：

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    或者直接使用 npx 运行：

    ```bash
    npx react-devtools@4.28.5
    ```

    正在运行的 CLI 应用程序应该会连接到 React DevTools。

## 沙箱

> 待定

## 手动发布

我们会为每次提交发布一个构件到内部注册表中。但如果你需要手动构建本地版本，请运行以下命令：

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```