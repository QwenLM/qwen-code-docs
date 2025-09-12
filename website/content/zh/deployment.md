# Qwen Code 执行与部署

本文档介绍了如何运行 Qwen Code，并解释了 Qwen Code 使用的部署架构。

## 运行 Qwen Code

有几种方式可以运行 Qwen Code。你选择哪种方式取决于你的使用场景。

---

### 1. 标准安装（推荐普通用户使用）

这是推荐终端用户安装 Qwen Code 的方式。需要从 NPM registry 下载 Qwen Code 包。

- **全局安装：**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  然后可以在任意位置运行 CLI：

  ```bash
  qwen
  ```

- **使用 NPX 执行：**

  ```bash
  # 无需全局安装，直接从 NPM 执行最新版本
  npx @qwen-code/qwen-code
  ```

---

### 2. 在沙箱中运行 (Docker/Podman)

为了安全性和隔离性，Qwen Code 可以在容器内运行。这也是 CLI 执行可能产生副作用的工具时的默认方式。

- **直接从 Registry 运行：**
  你可以直接运行已发布的沙箱镜像。这在你只有 Docker 并希望运行 CLI 的环境中非常有用。
  ```bash
  # 运行已发布的沙箱镜像
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.10
  ```
- **使用 `--sandbox` 参数：**
  如果你已经在本地安装了 Qwen Code（使用上述标准安装方式），你可以指示它在沙箱容器内运行。
  ```bash
  qwen --sandbox -y -p "your prompt here"
  ```

---

### 3. 从源码运行（推荐 Qwen Code 贡献者使用）

项目贡献者会希望直接从源码运行 CLI。

- **开发模式：**
  此方法提供热重载功能，适用于积极开发阶段。
  ```bash
  # 从仓库根目录运行
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

你可以直接从 GitHub 仓库运行最新提交的 Qwen Code 版本。这对于测试仍在开发中的功能非常有用。

```bash

# 直接从 GitHub 的 main 分支执行 CLI
npx https://github.com/QwenLM/qwen-code
```

## 部署架构

上述执行方式依赖于以下架构组件和流程：

**NPM 包**

Qwen Code 项目是一个 monorepo，会将核心包发布到 NPM registry：

- `@qwen-code/qwen-code-core`：后端部分，负责处理逻辑和工具执行。
- `@qwen-code/qwen-code`：面向用户的前端部分。

在进行标准安装或从源码运行 Qwen Code 时，都会使用到这些包。

**构建与打包流程**

根据不同的分发渠道，会采用两种不同的构建流程：

- **NPM 发布：** 在发布到 NPM registry 时，`@qwen-code/qwen-code-core` 和 `@qwen-code/qwen-code` 中的 TypeScript 源码会通过 TypeScript Compiler（`tsc`）被编译为标准 JavaScript。最终生成的 `dist/` 目录会被发布为 NPM 包。这是 TypeScript 库的标准发布方式。

- **GitHub `npx` 执行：** 当直接从 GitHub 运行最新版本的 Qwen Code 时，`package.json` 中的 `prepare` 脚本会触发另一个构建流程。该脚本使用 `esbuild` 将整个应用及其依赖项打包成一个独立的 JavaScript 文件。这个 bundle 是在用户机器上即时生成的，并不会被提交到代码仓库中。

**Docker 沙箱镜像**

基于 Docker 的执行方式由 `qwen-code-sandbox` 容器镜像支持。该镜像会被发布到容器镜像仓库，其中包含了预装的全局版本的 Qwen Code。

## 发布流程

发布流程通过 GitHub Actions 自动化执行。发布工作流会执行以下操作：

1.  使用 `tsc` 构建 NPM 包。
2.  将 NPM 包发布到 artifact registry。
3.  创建包含打包资源的 GitHub releases。