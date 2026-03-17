# Qwen Code 的执行与部署

本文档介绍如何运行 Qwen Code，并说明 Qwen Code 所采用的部署架构。

## 运行 Qwen Code

运行 Qwen Code 有多种方式，具体选择取决于你的使用场景。

---

### 1. 标准安装（推荐普通用户使用）

这是面向终端用户的推荐安装方式，需从 NPM 仓库下载 Qwen Code 安装包。

- **全局安装：**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  然后可在任意位置运行 CLI：

  ```bash
  qwen
  ```

- **通过 NPX 执行：**

  ```bash
  # 无需全局安装，直接从 NPM 运行最新版本
  npx @qwen-code/qwen-code
  ```

### 2. 在沙箱中运行（Docker/Podman）

为保障安全与隔离性，Qwen Code 可在容器内运行。这也是 CLI 执行可能产生副作用的工具时的默认方式。

- **直接从镜像仓库拉取运行：**  
  你可以直接运行已发布的沙箱镜像。这种方式适用于仅安装了 Docker、且希望直接运行 CLI 的环境。
  ```bash
  # 运行已发布的沙箱镜像
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **使用 `--sandbox` 标志：**  
  如果你已在本地安装了 Qwen Code（即通过上文所述的标准方式安装），可指示其在沙箱容器内运行。
  ```bash
  qwen --sandbox -y -p "你的提示词"
  ```

### 3. 从源码运行（Qwen Code 贡献者推荐）

本项目的贡献者需要直接从源码运行 CLI。

- **开发模式：**  
  此方法支持热重载，适用于活跃开发阶段。  
  ```bash
  # 在仓库根目录下执行
  npm run start
  ```
- **类生产模式（链接本地包）：**  
  此方法通过链接本地包来模拟全局安装，适用于在生产工作流中测试本地构建版本。  

  ```bash
  # 将本地 cli 包链接至全局 node_modules
  npm link packages/cli

  # 现在你可以使用 `qwen` 命令运行本地版本
  qwen
  ```

---

### 4. 从 GitHub 运行最新的 Qwen Code 提交版本

你可以直接从 GitHub 仓库运行最新提交的 Qwen Code 版本。此方式适用于测试尚在开发中的功能。

```bash

# 直接从 GitHub 的 main 分支运行 CLI
npx https://github.com/QwenLM/qwen-code

## 部署架构

上述执行方式依赖于以下架构组件与流程：

**NPM 包**

Qwen Code 项目是一个单体仓库（monorepo），其核心包发布至 NPM 仓库：

- `@qwen-code/qwen-code-core`：后端部分，负责逻辑处理与工具执行；
- `@qwen-code/qwen-code`：面向用户的前端部分。

在执行标准安装或直接从源码运行 Qwen Code 时，均会使用这些包。

**构建与打包流程**

根据分发渠道的不同，采用两种独立的构建流程：

- **NPM 发布流程**：向 NPM 仓库发布时，`@qwen-code/qwen-code-core` 和 `@qwen-code/qwen-code` 中的 TypeScript 源代码通过 TypeScript 编译器（`tsc`）编译为标准 JavaScript。生成的 `dist/` 目录即为最终发布到 NPM 包中的内容。这是 TypeScript 类库的标准做法。

- **GitHub `npx` 执行流程**：当直接从 GitHub 运行最新版 Qwen Code 时，`package.json` 中的 `prepare` 脚本会触发另一套流程。该脚本使用 `esbuild` 将整个应用及其所有依赖项打包为一个独立、自包含的 JavaScript 文件。该打包过程在用户本地机器上即时完成，且生成的文件不会提交至代码仓库。

**Docker 沙箱镜像**

基于 Docker 的执行方式由 `qwen-code-sandbox` 容器镜像提供支持。该镜像发布至容器注册中心，其中已预装并全局配置了 Qwen Code。

## 发布流程

发布流程通过 GitHub Actions 自动化完成。发布工作流执行以下操作：

1.  使用 `tsc` 构建 NPM 包。
2.  将 NPM 包发布到制品注册表。
3.  创建包含打包资源的 GitHub 版本发布。