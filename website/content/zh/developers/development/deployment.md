# Qwen Code 运行与部署

本文档介绍如何运行 Qwen Code，并说明其使用的部署架构。

## 运行 Qwen Code

运行 Qwen Code 有多种方式。你可以根据实际使用场景选择合适的方式。

---

### 1. 标准安装（推荐普通用户使用）

这是面向终端用户安装 Qwen Code 的推荐方式。该方式会从 NPM 仓库下载 Qwen Code 包。

- **全局安装：**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  然后，即可在任意位置运行 CLI：

  ```bash
  qwen
  ```

- **NPX 运行：**

  ```bash
  # Execute the latest version from NPM without a global install
  npx @qwen-code/qwen-code
  ```

---

### 2. 在沙箱中运行（Docker/Podman）

出于安全和隔离考虑，Qwen Code 可以在容器内运行。这是 CLI 执行可能产生副作用的工具时的默认方式。

- **直接从 Registry 运行：**
  你可以直接运行已发布的沙箱镜像。这适用于仅安装了 Docker 且希望运行 CLI 的环境。
  ```bash
  # Run the published sandbox image
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **使用 `--sandbox` 参数：**
  如果你已在本地安装了 Qwen Code（使用上述标准安装方式），可以指示其在沙箱容器内运行。
  ```bash
  qwen --sandbox -y -p "your prompt here"
  ```

---

### 3. 从源码运行（推荐 Qwen Code 贡献者使用）

项目贡献者通常希望直接从源码运行 CLI。

- **开发模式：**
  此方法支持热重载，适用于日常开发。
  ```bash
  # From the root of the repository
  npm run start
  ```
- **类生产模式（链接包）：**
  此方法通过链接本地包来模拟全局安装。适用于在生产工作流中测试本地构建版本。

  ```bash
  # Link the local cli package to your global node_modules
  npm link packages/cli

  # Now you can run your local version using the `qwen` command
  qwen
  ```

---

### 4. 运行 GitHub 上的最新 Qwen Code 提交

你可以直接从 GitHub 仓库运行最新提交的 Qwen Code 版本。这适用于测试仍在开发中的功能。

```bash
# Execute the CLI directly from the main branch on GitHub
npx https://github.com/QwenLM/qwen-code
```

## 部署架构

上述运行方式依赖于以下架构组件和流程：

**NPM 包**

Qwen Code 项目采用 monorepo 结构，会将核心包发布到 NPM 仓库：

- `@qwen-code/qwen-code-core`：后端，负责处理逻辑和工具执行。
- `@qwen-code/qwen-code`：面向用户的前端。

在执行标准安装以及从源码运行 Qwen Code 时，都会使用这些包。

**构建与打包流程**

根据分发渠道的不同，项目使用两种不同的构建流程：

- **NPM 发布：** 发布到 NPM 仓库时，`@qwen-code/qwen-code-core` 和 `@qwen-code/qwen-code` 中的 TypeScript 源码会通过 TypeScript 编译器（`tsc`）转译为标准 JavaScript。生成的 `dist/` 目录即为最终发布到 NPM 包的内容。这是 TypeScript 库的标准做法。

- **GitHub `npx` 运行：** 直接从 GitHub 运行最新版 Qwen Code 时，会触发 `package.json` 中的 `prepare` 脚本执行不同的流程。该脚本使用 `esbuild` 将整个应用及其依赖打包成一个独立的 JavaScript 文件。此打包文件会在用户机器上动态生成，不会提交到仓库中。

**Docker 沙箱镜像**

基于 Docker 的运行方式由 `qwen-code-sandbox` 容器镜像提供支持。该镜像已发布至容器仓库，并预装了全局版本的 Qwen Code。

## 发布流程

发布流程通过 GitHub Actions 实现自动化。发布工作流会执行以下操作：

1.  使用 `tsc` 构建 NPM 包。
2.  将 NPM 包发布到制品仓库。
3.  创建包含打包资源的 GitHub Release。