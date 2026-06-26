# Qwen Code 执行与部署

本文档介绍如何运行 Qwen Code，并说明 Qwen Code 使用的部署架构。

## 运行 Qwen Code

有几种方式可以运行 Qwen Code。你选择的方式取决于你打算如何使用它。

---

### 1. 标准安装（推荐给典型用户）

这是最终用户安装 Qwen Code 的推荐方式。它涉及从 NPM 注册表下载 Qwen Code 包。

- **全局安装：**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  然后，从任何位置运行 CLI：

  ```bash
  qwen
  ```

- **NPX 执行：**

  ```bash
  # 从 NPM 执行最新版本，无需全局安装
  npx @qwen-code/qwen-code
  ```

---

### 2. 在沙箱中运行（Docker/Podman）

为了安全性和隔离性，Qwen Code 可以在容器内运行。这是 CLI 执行可能产生副作用的工具的默认方式。

- **直接从注册表运行：**
  你可以直接运行已发布的沙箱镜像。这适用于只有 Docker 且想运行 CLI 的环境。
  ```bash
  # 运行已发布的沙箱镜像
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **使用 `--sandbox` 标志：**
  如果你已在本地安装了 Qwen Code（使用上述标准安装方式），可以指示它在沙箱容器内运行。
  ```bash
  qwen --sandbox -y -p "your prompt here"
  ```

---

### 3. 从源码运行（推荐给 Qwen Code 贡献者）

项目的贡献者可能希望直接从源代码运行 CLI。

- **开发模式：**
  此方法提供热重载，适合活跃开发。
  ```bash
  # 在仓库根目录下
  npm run start
  ```
- **生产模式（链接包）：**
  此方法通过链接本地包来模拟全局安装。适用于在生产工作流中测试本地构建。

  ```bash
  # 将本地 cli 包链接到全局 node_modules
  npm link packages/cli

  # 现在你可以使用 `qwen` 命令运行本地版本
  qwen
  ```

---

### 4. 从 GitHub 运行最新的 Qwen Code 提交

你可以直接从 GitHub 仓库运行最新提交的 Qwen Code 版本。这对于测试仍在开发中的功能很有用。

```bash
# 直接从 GitHub 的 main 分支执行 CLI
npx https://github.com/QwenLM/qwen-code
```

## 部署架构

上述执行方法得益于以下架构组件和流程：

**NPM 包**

Qwen Code 项目是一个 monorepo，它将核心包发布到 NPM 注册表：

- `@qwen-code/qwen-code-core`：后端，处理逻辑和工具执行。
- `@qwen-code/qwen-code`：面向用户的前端。

这些包在执行标准安装以及从源码运行 Qwen Code 时使用。

**构建和打包流程**

根据分发渠道，使用了两种不同的构建流程：

- **NPM 发布：** 为了发布到 NPM 注册表，`@qwen-code/qwen-code-core` 和 `@qwen-code/qwen-code` 中的 TypeScript 源代码会使用 TypeScript 编译器 (`tsc`) 转译为标准 JavaScript。生成的 `dist/` 目录会被发布到 NPM 包中。这是 TypeScript 库的标准做法。

- **GitHub `npx` 执行：** 当直接从 GitHub 运行最新版本的 Qwen Code 时，`package.json` 中的 `prepare` 脚本会触发不同的流程。该脚本使用 `esbuild` 将整个应用及其依赖打包到一个独立的 JavaScript 文件中。这个包会在用户机器上实时创建，不会检入到仓库中。

**Docker 沙箱镜像**

基于 Docker 的执行方法由 `qwen-code-sandbox` 容器镜像支持。该镜像发布到容器注册表，并包含预安装的全局版本 Qwen Code。

## 发布流程

发布流程通过 GitHub Actions 自动化。发布工作流程执行以下操作：

1.  使用 `tsc` 构建 NPM 包。
2.  将 NPM 包发布到制品注册表。
3.  创建包含打包资源的 GitHub 发布版本。