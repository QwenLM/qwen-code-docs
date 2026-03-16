# 如何贡献

我们非常欢迎你为本项目提交补丁和贡献代码。

## 贡献流程

### 代码审查

所有提交（包括项目成员的提交）均需经过审查。我们使用 [GitHub 拉取请求（Pull Request）](https://docs.github.com/articles/about-pull-requests) 来完成此项工作。

### 拉取请求指南

为帮助我们快速审查并合并你的 PR，请遵循以下指南。不符合这些标准的 PR 可能会被关闭。

#### 1. 关联已有 Issue

所有 PR 都应关联我们追踪系统中已有的 Issue。这确保了每项变更在编写代码前均已经过讨论，并与项目目标保持一致。

- **修复 Bug 时：** PR 应关联对应的 Bug 报告 Issue。
- **新增功能时：** PR 应关联已由维护者批准的功能请求或提案 Issue。

如果你的变更尚无对应 Issue，请**先创建一个 Issue**，并在开始编码前等待反馈。

#### 2. 保持 PR 规模小且目标明确

我们倾向于提交规模小、原子性强的 PR，每个 PR 仅解决一个问题或添加一个独立、自包含的功能。

- **推荐做法：** 创建一个仅修复某个特定 Bug 或仅添加某个特定功能的 PR。
- **不推荐做法：** 将多个不相关的变更（例如：一个 Bug 修复、一个新功能、一次重构）打包到单个 PR 中。

大型变更应拆分为一系列更小、逻辑清晰的 PR，以便独立评审和合并。

#### 3. 使用草稿 PR 进行进行中的工作

如果你希望尽早获得对你工作的反馈，请使用 GitHub 的**草稿 Pull Request（PR）**功能。这向维护者表明该 PR 尚未准备好接受正式审查，但欢迎讨论并提供初步反馈。

#### 4. 确保所有检查通过

在提交 PR 前，请运行 `npm run preflight`，确保所有自动化检查均通过。该命令会运行全部测试、代码检查（linting）及其他风格检查。

#### 5. 更新文档

如果你的 PR 引入了面向用户的功能变更（例如新增命令、修改命令行参数，或行为变更），你必须同时更新 `/docs` 目录中相关的文档。

#### 6. 编写清晰的提交信息和优质的 PR 描述

你的 PR 应具有清晰、明确的标题，以及对所做更改的详细说明。请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范编写提交信息。

- **优质 PR 标题示例：** `feat(cli): 为 'config get' 命令添加 --json 标志`
- **低质 PR 标题示例：** `做了一些修改`

在 PR 描述中，请说明你进行这些更改的**原因**，并关联相关 issue（例如：`Fixes #123`）。

## 开发环境搭建与工作流

本节将指导贡献者如何构建、修改并理解本项目的开发环境配置。

### 搭建开发环境

**前提条件：**

1.  **Node.js**：
    - **开发环境**：请使用 Node.js `~20.19.0`。由于上游开发依赖存在兼容性问题，必须使用该特定版本。你可以使用 [nvm](https://github.com/nvm-sh/nvm) 等工具管理 Node.js 版本。
    - **生产环境**：在生产环境中运行 CLI 时，支持任意 `>=20` 版本的 Node.js。
2.  **Git**

### 构建流程

克隆仓库：

```bash
git clone https://github.com/QwenLM/qwen-code.git # 或你 fork 的仓库地址
cd qwen-code
```

安装 `package.json` 中定义的依赖项以及根目录下的依赖项：

```bash
npm install
```

构建整个项目（所有包）：

```bash
npm run build
```

该命令通常会将 TypeScript 编译为 JavaScript、打包资源，并为各包的执行做好准备。有关构建过程的具体细节，请参阅 `scripts/build.js` 和 `package.json` 中定义的脚本。

### 启用沙箱环境

强烈建议启用[沙箱环境](#sandboxing)，至少需要在 `~/.env` 文件中设置 `QWEN_SANDBOX=true`，并确保已安装沙箱提供程序（例如 `macOS Seatbelt`、`docker` 或 `podman`）。详情请参阅 [沙箱环境](#sandboxing)。

若要同时构建 `qwen-code` CLI 工具和沙箱容器，请在项目根目录下运行 `build:all`：

```bash
npm run build:all
```

如需跳过沙箱容器的构建，可改用 `npm run build`。

### 运行

完成构建后，若要从源码启动 Qwen Code 应用程序，请在项目根目录下执行以下命令：

```bash
npm start
```

若希望在 `qwen-code` 目录之外运行源码构建版本，可使用 `npm link path/to/qwen-code/packages/cli`（参见：[文档](https://docs.npmjs.com/cli/v9/commands/npm-link)）建立链接，之后即可直接通过 `qwen-code` 命令运行。

### 运行测试

本项目包含两类测试：单元测试和集成测试。

#### 单元测试

要运行项目的单元测试套件，请执行：

```bash
npm run test
```

该命令将运行 `packages/core` 和 `packages/cli` 目录下的测试。在提交任何更改前，请确保所有测试均通过。如需更全面的检查，建议运行 `npm run preflight`。

#### 集成测试

集成测试用于验证 Qwen Code 的端到端功能，**不会**在默认的 `npm run test` 命令中执行。

要运行集成测试，请使用以下命令：

```bash
npm run test:e2e
```

有关集成测试框架的更多详细信息，请参阅[集成测试文档](./docs/integration-tests.md)。

### 代码检查与预检

为确保代码质量和格式一致性，请运行预检命令：

```bash
npm run preflight
```

该命令将执行 ESLint、Prettier、全部测试以及其他在项目 `package.json` 中定义的检查。

_ProTip_

克隆仓库后，可创建一个 Git 预提交钩子（pre-commit hook）脚本，以确保每次提交的代码都符合规范：

```bash
echo "

# 运行 npm build 并检查错误
if ! npm run preflight; then
  echo "npm build 失败，提交已中止。"
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### 格式化

如需单独对本项目代码进行格式化，请在项目根目录下运行以下命令：

```bash
npm run format
```

该命令使用 Prettier，依据项目的代码风格指南对代码进行格式化。

#### 代码检查（Linting）

如需单独对本项目代码执行代码检查，请在项目根目录下运行以下命令：

```bash
npm run lint
```

### 编码规范

- 请遵循现有代码库中一贯采用的编码风格、模式和规范。
- **导入（Imports）**：请特别注意导入路径。本项目使用 ESLint 来限制包之间的相对导入。

### 项目结构

- `packages/`：包含项目的各个子包。
  - `cli/`：命令行界面（CLI）。
  - `core/`：Qwen Code 的核心后端逻辑。
- `docs/`：包含所有项目文档。
- `scripts/`：用于构建、测试及开发任务的工具脚本。

如需更详细的架构说明，请参阅 `docs/architecture.md`。

## 文档开发

本节介绍如何在本地开发并预览文档。

### 前置条件

1. 确保已安装 Node.js（版本 18+）
2. 已安装 npm 或 yarn

### 本地搭建文档网站

如需编辑文档并在本地预览修改效果，请按以下步骤操作：

1. 进入 `docs-site` 目录：

   ```bash
   cd docs-site
   ```

2. 安装依赖：

   ```bash
   npm install
   ```

3. 将主 `docs` 目录中的文档内容链接到当前项目：

   ```bash
   npm run link
   ```

   此命令会在 `docs-site` 项目中创建一个从 `../docs` 到 `content` 的符号链接，使 Next.js 网站能够直接提供该文档内容。

4. 启动开发服务器：

   ```bash
   npm run dev
   ```

5. 在浏览器中打开 [http://localhost:3000](http://localhost:3000)，即可查看文档网站；编辑文档时，页面将实时更新。

对主 `docs` 目录中任意文档文件的修改，都会立即反映在本地文档网站上。

## 调试

### VS Code：

0.  运行 CLI，通过按 `F5` 在 VS Code 中进行交互式调试  
1.  从项目根目录启动 CLI 的调试模式：  
    ```bash
    npm run debug
    ```  
    该命令会在 `packages/cli` 目录下执行 `node --inspect-brk dist/index.js`，暂停执行直到调试器连接。随后，你可在 Chrome 浏览器中打开 `chrome://inspect` 页面来连接调试器。  
2.  在 VS Code 中，使用 “Attach” 启动配置（位于 `.vscode/launch.json` 文件中）。  

你也可以选择在 VS Code 中使用 “Launch Program” 配置，直接运行当前打开的文件；但通常更推荐使用 `F5`。  

若要在沙箱容器内触发断点，请运行：  

```bash
DEBUG=1 qwen-code
```  

> [!note]  
> 若项目根目录下的 `.env` 文件中设置了 `DEBUG=true`，由于自动排除机制，该设置不会影响 `qwen-code`。如需为 `qwen-code` 设置特定的调试选项，请使用 `.qwen-code/.env` 文件。

### React DevTools

要调试 CLI 基于 React 的 UI，可使用 React DevTools。CLI 界面所用的 Ink 库与 React DevTools 4.x 版本兼容。

1.  **以开发模式启动 Qwen Code 应用：**

    ```bash
    DEV=true npm start
    ```

2.  **安装并运行 React DevTools 4.28.5 版（或最新兼容的 4.x 版本）：**

    可选择全局安装：

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    或直接通过 npx 运行：

    ```bash
    npx react-devtools@4.28.5
    ```

    此时，正在运行的 CLI 应用将自动连接至 React DevTools。

## 沙箱环境（Sandboxing）

> 待定（TBD）

## 手动发布

我们会为每次提交向内部仓库发布一个构建产物。但若需手动构建并发布本地版本，请运行以下命令：

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```