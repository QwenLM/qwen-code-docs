# 如何贡献

我们非常欢迎你向本项目提交补丁和贡献。

## 贡献流程

### 代码审查

所有提交，包括项目成员的提交，都需要经过审查。我们使用 [GitHub pull requests](https://docs.github.com/articles/about-pull-requests) 来完成这一过程。

### Pull Request 规范

为了帮助我们快速审查和合并你的 PR，请遵循以下规范。不符合这些标准的 PR 可能会被关闭。

#### 1. 关联已有 Issue

所有 PR 都应关联到我们 tracker 中的已有 issue。这确保每个变更在编写代码之前都经过讨论，并与项目目标保持一致。

- **Bug 修复：** PR 应关联到对应的 bug 报告 issue。
- **新功能：** PR 应关联到已获 maintainer 批准的功能请求或提案 issue。

如果你的变更没有对应的 issue，请**先创建一个**，等待反馈后再开始编码。

#### 2. 保持小而聚焦

我们倾向于小型、原子化的 PR，每个 PR 只解决单一问题或添加单一的自包含功能。

- **推荐：** 创建一个修复某个特定 bug 或添加某个特定功能的 PR。
- **不推荐：** 将多个不相关的变更（例如 bug 修复、新功能和重构）合并到单个 PR 中。

一般来说，当 PR 超过约 1,200 行变更时就应该考虑拆分。超过约 2,000 行变更的 PR 要么拆分成一系列可以独立审查和合并的较小逻辑 PR，要么在 PR 描述中说明为什么这些变更需要一起落地。

#### 3. 使用 Draft PR 标记进行中的工作

如果你想提前获取反馈，请使用 GitHub 的 **Draft Pull Request** 功能。这会向 maintainer 表明该 PR 尚未准备好进行正式审查，但欢迎讨论和初步反馈。

#### 4. 确保所有检查通过

提交 PR 前，请运行 `npm run preflight` 确保所有自动化检查均通过。该命令会运行所有测试、linting 和其他风格检查。

#### 5. 更新文档

如果你的 PR 引入了面向用户的变更（例如新命令、修改的 flag 或行为变化），还必须更新 `/docs` 目录中的相关文档。

#### 6. 编写清晰的提交信息和 PR 描述

你的 PR 应有清晰、描述性的标题和详细的变更说明。提交信息请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

- **好的 PR 标题：** `feat(cli): Add --json flag to 'config get' command`
- **不好的 PR 标题：** `Made some changes`

在 PR 描述中，解释变更背后的”原因”，并关联相关 issue（例如 `Fixes #123`）。

## 开发环境配置与工作流

本节指导贡献者如何构建、修改和了解本项目的开发配置。

### 配置开发环境

**前置条件：**

1.  **Node.js**：
    - **开发：** 请使用 Node.js `>=22`。TUI 使用的 Ink 7 需要 Node 22，`react@^19.2.0` 是匹配的 peer 依赖。你可以使用 [nvm](https://github.com/nvm-sh/nvm) 等工具来管理 Node.js 版本。
    - **生产：** 在生产环境中运行 CLI 时，任何 `>=22` 版本的 Node.js 均可接受。
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

构建整个项目（所有包）：

```bash
npm run build
```

该命令通常会将 TypeScript 编译为 JavaScript、打包资源并准备好包以供执行。有关构建过程的更多详情，请参考 `scripts/build.js` 和 `package.json` 中的脚本。

### 启用沙箱

强烈推荐使用[沙箱](#sandboxing)，至少需要在 `~/.env` 中设置 `QWEN_SANDBOX=true`，并确保沙箱提供程序（例如 `macOS Seatbelt`、`docker` 或 `podman`）可用。详情见[沙箱](#sandboxing)。

要同时构建 `qwen-code` CLI 工具和沙箱容器，请从根目录运行 `build:all`：

```bash
npm run build:all
```

如需跳过构建沙箱容器，可使用 `npm run build`。

### 运行

从源代码启动 Qwen Code 应用（构建后），在根目录运行以下命令：

```bash
npm start
```

如果你想在 qwen-code 文件夹外运行源代码构建，可以使用 `npm link path/to/qwen-code/packages/cli`（参考：[文档](https://docs.npmjs.com/cli/v9/commands/npm-link)），然后通过 `qwen-code` 运行。

### 运行测试

本项目包含两类测试：单元测试和集成测试。

#### 单元测试

执行项目的单元测试套件：

```bash
npm run test
```

这会运行 `packages/core` 和 `packages/cli` 目录中的测试。提交任何变更前请确保测试通过。建议运行 `npm run preflight` 进行更全面的检查。

#### 集成测试

集成测试用于验证 Qwen Code 的端到端功能。它们不包含在默认的 `npm run test` 命令中。

运行集成测试，请使用以下命令：

```bash
npm run test:e2e
```

有关集成测试框架的更多详细信息，请参阅[集成测试文档](./development/integration-tests.md)。

### Linting 和预检查

为确保代码质量和格式一致性，运行预检查：

```bash
npm run preflight
```

该命令将运行 ESLint、Prettier、所有测试以及 `package.json` 中定义的其他检查。

_ProTip_

克隆后创建 git precommit hook 文件，确保每次提交都保持整洁。

```bash
echo “
# Run npm build and check for errors
if ! npm run preflight; then
  echo “npm build failed. Commit aborted.”
  exit 1
fi
“ > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### 格式化

单独格式化本项目代码，从根目录运行以下命令：

```bash
npm run format
```

该命令使用 Prettier 按照项目风格规范格式化代码。

#### Linting

单独对本项目代码进行 lint 检查，从根目录运行以下命令：

```bash
npm run lint
```

### 编码规范

- 请遵循现有代码库中使用的编码风格、模式和约定。
- **Imports：** 特别注意 import 路径。项目使用 ESLint 来强制限制包之间的相对导入。

### 项目结构

- `packages/`：包含项目的各个子包。
  - `cli/`：命令行界面。
  - `core/`：Qwen Code 的核心后端逻辑。
- `docs/`：包含所有项目文档。
- `scripts/`：用于构建、测试和开发任务的实用脚本。

更详细的架构说明，请参阅 `docs/architecture.md`。

## 文档开发

本节介绍如何在本地开发和预览文档。

### 前置条件

1. 确保已安装 Node.js（版本 22+）
2. 确保 npm 或 yarn 可用

### 在本地配置文档站点

在本地开发文档并预览变更：

1. 进入 `docs-site` 目录：

   ```bash
   cd docs-site
   ```

2. 安装依赖：

   ```bash
   npm install
   ```

3. 从主 `docs` 目录链接文档内容：

   ```bash
   npm run link
   ```

   这会从 `../docs` 创建一个符号链接到 docs-site 项目的 `content` 目录，使 Next.js 站点可以提供文档内容。

4. 启动开发服务器：

   ```bash
   npm run dev
   ```

5. 在浏览器中打开 [http://localhost:3000](http://localhost:3000)，即可查看文档站点并实时预览变更。

对主 `docs` 目录中文档文件的任何修改都会立即反映在文档站点中。

## 调试

### VS Code：

0.  使用 `F5` 在 VS Code 中以交互方式调试 CLI
1.  从根目录以调试模式启动 CLI：
    ```bash
    npm run debug
    ```
    该命令在 `packages/cli` 目录中运行 `node --inspect-brk dist/index.js`，暂停执行直到调试器连接。然后可以在 Chrome 浏览器中打开 `chrome://inspect` 连接到调试器。
2.  在 VS Code 中，使用”Attach”启动配置（位于 `.vscode/launch.json`）。

另外，如果你偏好直接启动当前打开的文件，也可以使用 VS Code 中的”Launch Program”配置，但通常推荐使用 `F5`。

要在沙箱容器内触发断点，请运行：

```bash
DEBUG=1 qwen-code
```

**注意：** 如果你在项目的 `.env` 文件中设置了 `DEBUG=true`，由于自动排除机制，它不会影响 qwen-code。请使用 `.qwen-code/.env` 文件来配置 qwen-code 的调试设置。

### React DevTools

要调试 CLI 基于 React 的 UI，可以使用 React DevTools。CLI 界面使用的 Ink 库与 React DevTools 4.x 版本兼容。

1.  **以开发模式启动 Qwen Code 应用：**

    ```bash
    DEV=true npm start
    ```

2.  **安装并运行 React DevTools 4.28.5（或最新兼容的 4.x 版本）：**

    可以全局安装：

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    或直接使用 npx 运行：

    ```bash
    npx react-devtools@4.28.5
    ```

    运行中的 CLI 应用随后应会连接到 React DevTools。

## 沙箱

> TBD

## 手动发布

我们为每次提交向内部 registry 发布构建产物。但如果需要手动构建本地版本，请运行以下命令：

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```