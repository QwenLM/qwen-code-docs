# Qwen Code 中的沙箱机制

本文档提供了 Qwen Code 中沙箱机制的使用指南，包括前置条件、快速开始和配置说明。

## 前置条件

在使用沙箱功能之前，你需要先安装并设置 Qwen Code：

```bash
npm install -g @qwen-code/qwen-code
```

验证安装是否成功：

```bash
qwen --version
```

## 沙箱机制概述

沙箱机制将潜在危险操作（如 shell 命令或文件修改）与你的主机系统隔离，在 AI 操作与你的运行环境之间提供一道安全屏障。

使用沙箱的好处包括：

- **安全性**：防止意外的系统损坏或数据丢失。
- **隔离性**：将文件系统访问限制在项目目录内。
- **一致性**：确保在不同系统上具有一致的可复现环境。
- **安全性**：在处理不受信任的代码或实验性命令时降低风险。

## 沙箱方法

根据你的平台和首选的容器解决方案，理想的沙箱方法可能有所不同。

### 1. macOS Seatbelt（仅限 macOS）

使用 `sandbox-exec` 实现轻量级、内置的沙箱功能。

**默认配置文件**：`permissive-open` - 限制在项目目录外的写入操作，但允许大多数其他操作。

### 2. 基于容器（Docker/Podman）

跨平台沙箱，提供完整的进程隔离。

**注意**：需要在本地构建沙箱镜像，或使用组织 registry 中发布的镜像。

## 快速开始

```bash

# 通过命令行标志启用沙箱
qwen -s -p "analyze the code structure"

# 使用环境变量
export GEMINI_SANDBOX=true
qwen -p "run the test suite"

# 在 settings.json 中配置
{
  "sandbox": "docker"
}
```

## 配置

### 启用沙箱（按优先级顺序）

1. **命令行标志**：`-s` 或 `--sandbox`
2. **环境变量**：`GEMINI_SANDBOX=true|docker|podman|sandbox-exec`
3. **配置文件**：在 `settings.json` 中设置 `"sandbox": true`

### macOS Seatbelt 配置文件

内置配置文件（通过 `SEATBELT_PROFILE` 环境变量设置）：

- `permissive-open`（默认）：写入限制，允许网络访问
- `permissive-closed`：写入限制，无网络访问
- `permissive-proxied`：写入限制，通过代理访问网络
- `restrictive-open`：严格限制，允许网络访问
- `restrictive-closed`：最大限制

### 自定义沙箱标志

对于基于容器的沙箱，你可以使用 `SANDBOX_FLAGS` 环境变量将自定义标志注入到 `docker` 或 `podman` 命令中。这在需要高级配置时非常有用，例如为特定用例禁用安全功能。

**示例 (Podman)**：

要禁用卷挂载的 SELinux 标签，可以设置如下内容：

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

多个标志可以以空格分隔的字符串形式提供：

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

## Linux UID/GID 处理

沙箱会自动处理 Linux 上的用户权限。你可以通过以下方式覆盖这些权限：

```bash
export SANDBOX_SET_UID_GID=true   # 强制使用宿主机 UID/GID
export SANDBOX_SET_UID_GID=false  # 禁用 UID/GID 映射
```

## 故障排除

### 常见问题

**"Operation not permitted"**

- 操作需要访问沙盒外部资源。
- 尝试使用更宽松的配置文件，或添加挂载点。

**命令缺失**

- 添加到自定义 Dockerfile 中。
- 通过 `sandbox.bashrc` 安装。

**网络问题**

- 检查沙盒配置是否允许网络访问。
- 验证代理设置。

### 调试模式

```bash
DEBUG=1 qwen -s -p "debug command"
```

**注意：** 如果项目中的 `.env` 文件设置了 `DEBUG=true`，不会影响 CLI，因为会自动排除。请使用 `.qwen/.env` 文件来配置 Qwen Code 特定的调试设置。

### 检查沙盒状态

```bash

# 检查环境变量
qwen -s -p "run shell command: env | grep SANDBOX"

# 列出挂载点
qwen -s -p "run shell command: mount | grep workspace"
```

## 安全说明

- 沙盒机制可以降低风险，但不能完全消除。
- 请使用能满足工作需求的最严格配置。
- 首次构建后，容器的性能开销很小。
- GUI 应用可能无法在沙盒中正常运行。

## 相关文档

- [配置](./cli/configuration.md): 完整的配置选项。
- [命令](./cli/commands.md): 可用命令。
- [故障排除](./troubleshooting.md): 通用故障排除指南。