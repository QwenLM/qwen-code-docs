# 如何贡献

我们非常欢迎您为本项目贡献补丁和代码。

## 贡献流程

### 代码审查

所有提交，包括项目成员的提交，都需要经过审查。为此，我们使用 [GitHub pull request](https://docs.github.com/articles/about-pull-requests)。

### Pull Request 指南

为了帮助我们快速审查和合并你的 PR，请遵循以下准则。不满足这些标准的 PR 可能会被关闭。

#### 1. 关联已有的 Issue

所有 PR 都应关联到我们追踪系统中的已有 Issue。这确保每次变更在编写代码之前都经过讨论，并与项目目标保持一致。

- **对于 Bug 修复：** PR 应关联到对应的 Bug 报告 Issue。
- **对于功能：** PR 应关联到已得到维护者批准的功能请求或提案 Issue。

如果您的变更没有对应的 Issue，请**先创建一个**，并等待反馈后再开始编码。

#### 2. 保持小巧且专注

我们倾向于小型的、原子化的 PR，只解决单个问题，或添加单个独立的功能。

- **应该：** 创建一个修复某个特定 Bug 或添加某个特定功能的 PR。
- **不应该：** 将多个不相关的变更（例如，一个 Bug 修复、一个新功能、一次重构）捆绑在同一个 PR 中。

作为经验法则，当 PR 的变更行数超过大约 1200 行时，就应该开始考虑拆分。超过大约 2000 行变更的 PR 要么拆分成一系列可以独立审查和合并的、更小更合理的 PR，要么在 PR 描述中解释为什么这些变更必须一起合并。

#### 3. 使用 Draft PR 进行开发中的工作

如果您想尽早获得关于工作的反馈，请使用 GitHub 的 **Draft Pull Request** 功能。这向维护者表明该 PR 尚未准备好进行正式审查，但欢迎讨论和初步反馈。

#### 4. 确保所有检查通过

在提交 PR 之前，请运行 `npm run preflight` 确保所有自动化检查都通过。该命令将运行所有测试、代码检查和其他风格检查。

#### 5. 更新文档

如果您的 PR 引入了面向用户的变更（例如，新命令、修改的标志或行为变化），您还必须更新 `/docs` 目录中的相关文档。

#### 6. 编写清晰的提交信息和良好的 PR 描述

您的 PR 应具有清晰、描述性的标题，以及关于变更的详细描述。请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 标准编写提交信息。

- **好的 PR 标题：** `feat(cli): Add --json flag to 'config get' command`
- **不好的 PR 标题：** `Made some changes`

在 PR 描述中，解释变更背后的“原因”，并关联相关 Issue（例如，`Fixes #123`）。

## 开发环境搭建与工作流

本节指导贡献者如何构建、修改和理解本项目的开发环境。

### 搭建开发环境

**前提条件：**

1.  **Node.js**：
    - **开发：** 请使用 Node.js `>=22`。Ink 7（TUI 使用）需要 Node 22，而 `react@^19.2.0` 是其匹配的 peer 依赖。您可以使用 [nvm](https://github.com/nvm-sh/nvm) 等工具管理 Node.js 版本。
    - **生产：** 在生产环境中运行 CLI，任何 `>=22` 的 Node.js 版本均可接受。
2.  **Git**

### 构建过程

克隆仓库：

```bash
git clone https://github.com/QwenLM/qwen-code.git # 或您的 Fork 地址
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

该命令通常会编译 TypeScript 为 JavaScript、打包资源并准备好执行包。更多关于构建过程的详细信息，请参阅 `scripts/build.js` 和 `package.json` 中的脚本。

### 启用沙箱

强烈建议启用[沙箱](#沙箱)，至少需要在 `~/.env` 中设置 `QWEN_SANDBOX=true`，并确保有可用的沙箱提供者（例如 `macOS Seatbelt`、`docker` 或 `podman`）。详情请参阅[沙箱](#沙箱)。

要从根目录构建 `qwen` CLI 工具和沙箱容器，请运行 `build:all`：

```bash
npm run build:all
```

若要跳过构建沙箱容器，可以使用 `npm run build`。

### 运行

从源代码启动 Qwen Code 应用程序（构建后），请从根目录运行以下命令：

```bash
npm start
```

如果要在 qwen-code 文件夹之外运行源代码构建，可以使用 `npm link path/to/qwen-code/packages/cli`（参见 [文档](https://docs.npmjs.com/cli/v9/commands/npm-link)）然后通过 `qwen` 运行。

### 运行测试

本项目包含两种类型的测试：单元测试和集成测试。

#### 单元测试

执行项目的单元测试套件：

```bash
npm run test
```

这将运行 `packages/core` 和 `packages/cli` 目录中的测试。请确保在提交任何变更之前测试通过。为了进行更全面的检查，建议运行 `npm run preflight`。

#### 集成测试

集成测试旨在验证 Qwen Code 的端到端功能。它们不会作为默认的 `npm run test` 命令的一部分运行。

运行集成测试，请使用以下命令：

```bash
npm run test:e2e
```

关于集成测试框架的更多信息，请参阅[集成测试文档](./development/integration-tests.md)。

### 代码检查与预检（Preflight）检查

为确保代码质量和格式一致性，请运行预检检查：

```bash
npm run preflight
```

该命令将运行 ESLint、Prettier、所有测试以及项目 `package.json` 中定义的其他检查。

_小贴士_

克隆后，可以创建一个 Git pre-commit 钩子文件，确保您的提交始终保持干净。

```bash
echo "
# 运行 npm build 并检查错误
if ! npm run preflight; then
  echo "npm build 失败。提交已中止。"
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### 格式化

要单独格式化项目中的代码，请从根目录运行以下命令：

```bash
npm run format
```

该命令使用 Prettier 根据项目风格指南格式化代码。

#### 代码检查

要单独检查项目代码，请从根目录运行以下命令：

```bash
npm run lint
```

### 编码规范

- 请遵循现有代码库中使用的编码风格、模式和约定。
- **导入：** 特别注意导入路径。项目使用 ESLint 来限制包之间的相对导入。

### 项目结构

- `packages/`：包含项目的各个子包。
  - `cli/`：命令行界面。
  - `core/`：Qwen Code 的核心后端逻辑。
- `docs/`：包含所有项目文档。
- `scripts/`：构建、测试和开发任务的实用脚本。

更多详细架构，请参阅 `docs/architecture.md`。

## 文档开发

本节介绍如何在本地开发和预览文档。

### 前提条件

1. 确保您已安装 Node.js（版本 22+）
2. 有可用的 npm 或 yarn

### 在本地搭建文档站点

要编写文档并在本地预览变更：

1. 进入 `docs-site` 目录：

   ```bash
   cd docs-site
   ```

2. 安装依赖：

   ```bash
   npm install
   ```

3. 将主 `docs` 目录中的文档内容链接过来：

   ```bash
   npm run link
   ```

   这将在 docs-site 项目中创建一个从 `../docs` 到 `content` 的符号链接，使文档内容可以通过 Next.js 站点提供。

4. 启动开发服务器：

   ```bash
   npm run dev
   ```

5. 在浏览器中打开 [http://localhost:3000](http://localhost:3000)，即可查看文档站点，并实时反映您的更改。

对主 `docs` 目录中的文档文件所做的任何更改将立即在文档站点中显示。

## 调试

### VS Code：

0.  使用 `F5` 在 VS Code 中以交互方式运行 CLI 进行调试。
1.  从根目录以调试模式启动 CLI：
    ```bash
    npm run debug
    ```
    该命令在 `packages/cli` 目录下运行 `node --inspect-brk dist/index.js`，暂停执行直到调试器连接。然后您可以打开 Chrome 浏览器中的 `chrome://inspect` 来连接调试器。
2.  在 VS Code 中，使用“Attach”启动配置（位于 `.vscode/launch.json`）。

另外，如果您更倾向于直接启动当前打开的文件，也可以使用 VS Code 中的“Launch Program”配置，但通常建议使用 `F5`。

要在沙箱容器内命中断点，请运行：

```bash
DEBUG=1 qwen
```

**注意：** 如果项目的 `.env` 文件中设置了 `DEBUG=true`，由于自动排除机制，它不会影响 `qwen`。请使用 `.qwen/.env` 文件设置 `qwen` 特定的调试选项。

### React DevTools

要调试 CLI 的 React UI，您可以使用 React DevTools。CLI 界面使用的 Ink 库与 React DevTools 4.x 版本兼容。

1.  **以开发模式启动 Qwen Code 应用程序：**

    ```bash
    DEV=true npm start
    ```

2.  **安装并运行 React DevTools 4.28.5 版本（或最新的兼容 4.x 版本）：**

    您可以全局安装：

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    或者直接使用 npx 运行：

    ```bash
    npx react-devtools@4.28.5
    ```

    您正在运行的 CLI 应用程序应会自动连接到 React DevTools。

## 沙箱

> 待定

## 手动发布

每次提交我们都会向内部仓库发布一个构件。但如果您需要手动构建本地版本，请运行以下命令：

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```