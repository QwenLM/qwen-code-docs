# Qwen Code 执行与部署

本文档描述了如何运行 Qwen Code，并解释了 Qwen Code 使用的部署架构。

## 运行 Qwen Code

有几种方式可以运行 Qwen Code。你选择的方式取决于你的使用目的。

---

### 1. 标准安装（推荐普通用户使用）

这是推荐终端用户安装 Qwen Code 的方式。需要从 NPM 注册表下载 Qwen Code 包。

- **全局安装：**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  然后，可在任意位置运行 CLI：

  ```bash
  qwen
  ```

- **使用 NPX 执行：**

  ```bash
  # 无需全局安装，直接从 NPM 执行最新版本
  npx @qwen-code/qwen-code
  ```

---

### 2. 在沙箱中运行（Docker/Podman）

为了安全和隔离，Qwen Code 可以在容器内运行。这也是 CLI 执行可能产生副作用的工具时的默认方式。

- **直接从注册表运行：**
  你可以直接运行已发布的沙箱镜像。这在你只有 Docker 并希望运行 CLI 的环境中非常有用。
  ```bash
  # 运行已发布的沙箱镜像
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **使用 `--sandbox` 标志：**
  如果你已在本地安装了 Qwen Code（使用上述标准安装方式），你可以指示它在沙箱容器内运行。
  ```bash
  qwen --sandbox -y -p "your prompt here"
  ```

---

### 3. 从源码运行（推荐 Qwen Code 贡献者使用）

项目贡献者会希望直接从源代码运行 CLI。

- **开发模式：**
  此方法提供热重载功能，适用于积极开发阶段。
  ```bash
  # 从仓库根目录运行
  npm run start
  ```
- **生产环境模拟模式（链接包）：**
  此方法通过链接本地包来模拟全局安装。适用于在生产工作流中测试本地构建。

  ```bash
  # 将本地 cli 包链接到全局 node_modules
  npm link packages/cli

  # 现在你可以使用 `qwen` 命令运行本地版本
  qwen
  ```

---

### 4. 运行 GitHub 上最新的 Qwen Code 提交版本

你可以直接从 GitHub 仓库运行最新提交的 Qwen Code 版本。这对于测试仍在开发中的功能非常有用。

```bash

# 直接从 GitHub 的主分支执行 CLI
npx https://github.com/QwenLM/qwen-code
```

## 部署架构

上述执行方式通过以下架构组件和流程实现：

**NPM 包**

Qwen Code 项目是一个 monorepo，会将核心包发布到 NPM 注册表中：

- `@qwen-code/qwen-code-core`：后端部分，负责处理逻辑和工具执行。
- `@qwen-code/qwen-code`：面向用户的前端部分。

在进行标准安装或从源码运行 Qwen Code 时都会使用这些包。

**构建与打包流程**

根据分发渠道的不同，有两种不同的构建流程：

- **NPM 发布：** 在发布到 NPM 注册表时，`@qwen-code/qwen-code-core` 和 `@qwen-code/qwen-code` 中的 TypeScript 源代码会通过 TypeScript 编译器（`tsc`）转译为标准 JavaScript。最终生成的 `dist/` 目录会被发布为 NPM 包内容。这是 TypeScript 库的标准做法。

- **GitHub `npx` 执行：** 当直接从 GitHub 运行最新版本的 Qwen Code 时，`package.json` 中的 `prepare` 脚本会触发另一种构建流程。该脚本使用 `esbuild` 将整个应用及其依赖项打包成一个独立的 JavaScript 文件。此打包文件是在用户机器上即时生成的，并不会被提交到代码仓库中。

**Docker 沙盒镜像**

基于 Docker 的执行方式由 `qwen-code-sandbox` 容器镜像提供支持。该镜像会被发布到容器注册表中，并包含一个预装好的全局版 Qwen Code。

## 发布流程

发布流程通过 GitHub Actions 自动化执行。发布工作流执行以下操作：

1.  使用 `tsc` 构建 NPM 包。
2.  将 NPM 包发布到工件注册表。
3.  创建包含捆绑资产的 GitHub 发布。