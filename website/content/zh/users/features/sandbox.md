# 沙箱

本文档说明如何在沙箱内运行 Qwen Code，以降低工具执行 shell 命令或修改文件时的风险。

## 先决条件

使用沙箱之前，你需要安装并设置 Qwen Code：

```bash
npm install -g @qwen-code/qwen-code
```

验证安装

```bash
qwen --version
```

## 沙箱隔离概述

沙箱隔离将潜在危险操作（如 shell 命令或文件修改）与你的主机系统隔离开来，在 CLI 和你的环境之间提供安全屏障。

沙箱隔离的好处包括：

- **安全性**：防止意外的系统损坏或数据丢失。
- **隔离性**：限制文件系统访问仅限于项目目录。
- **一致性**：确保在不同系统间环境的可重现性。
- **安全性**：在处理不受信任的代码或实验性命令时降低风险。

> [!note]
>
> **命名说明**：一些与沙箱相关的环境变量仍使用 `GEMINI_*` 前缀以保持向后兼容性。

## 沙箱隔离方法

根据你的平台和偏好的容器解决方案，你理想的沙箱隔离方法可能会有所不同。

### 1. macOS Seatbelt（仅限 macOS）

使用 `sandbox-exec` 的轻量级内置沙箱。

**默认配置文件**：`permissive-open` - 限制在项目目录外的写入操作，但允许大多数其他操作和出站网络访问。

**最适合**：快速、无需 Docker、对文件写入提供强保护。

### 2. 基于容器（Docker/Podman）

具有完整进程隔离的跨平台沙箱。

默认情况下，Qwen Code 使用一个已发布的沙箱镜像（在 CLI 包中配置），并根据需要拉取该镜像。

容器沙箱将你的工作区和 `~/.qwen` 目录挂载到容器中，以便认证信息和设置在运行之间保持持久化。

**最适合**：任何操作系统上的强隔离，在已知镜像内提供一致的工具。

### 选择方法

- **在 macOS 上**：
  - 当你需要轻量级沙箱时使用 Seatbelt（推荐大多数用户使用）。
  - 当你需要完整的 Linux 用户空间时使用 Docker/Podman（例如，需要 Linux 二进制文件的工具）。
- **在 Linux/Windows 上**：
  - 使用 Docker 或 Podman。

## 快速开始

```bash

# 使用命令标志启用沙箱
qwen -s -p "分析代码结构"

# 或为你的 shell 会话启用沙箱（推荐用于 CI / 脚本）
export GEMINI_SANDBOX=true   # true 自动选择提供者（参见下面的说明）
qwen -p "运行测试套件"

# 在 settings.json 中配置
{
  "tools": {
    "sandbox": true
  }
}
```

> [!tip]
>
> **提供者选择说明：**
>
> - 在 **macOS** 上，如果可用，`GEMINI_SANDBOX=true` 通常会选择 `sandbox-exec`（Seatbelt）。
> - 在 **Linux/Windows** 上，`GEMINI_SANDBOX=true` 需要安装 `docker` 或 `podman`。
> - 要强制指定提供者，请设置 `GEMINI_SANDBOX=docker|podman|sandbox-exec`。

## 配置

### 启用沙箱（按优先级顺序）

1. **环境变量**: `GEMINI_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **命令行标志/参数**: `-s`, `--sandbox`, 或 `--sandbox=<provider>`
3. **设置文件**: 你 `settings.json` 中的 `tools.sandbox`（例如，`{"tools": {"sandbox": true}}`）。

> [!important]
>
> 如果设置了 `GEMINI_SANDBOX`，它将**覆盖** CLI 标志和 `settings.json`。

### 配置沙箱镜像（Docker/Podman）

- **CLI 标志**: `--sandbox-image <image>`
- **环境变量**: `GEMINI_SANDBOX_IMAGE=<image>`

如果你没有设置其中任何一个，Qwen Code 将使用 CLI 包中配置的默认镜像（例如 `ghcr.io/qwenlm/qwen-code:<version>`）。

### macOS Seatbelt 配置文件

内置配置文件（通过 `SEATBELT_PROFILE` 环境变量设置）：

- `permissive-open`（默认）：写入限制，允许网络
- `permissive-closed`：写入限制，无网络
- `permissive-proxied`：写入限制，通过代理网络
- `restrictive-open`：严格限制，允许网络
- `restrictive-closed`：最大限制
- `restrictive-proxied`：严格限制，通过代理网络

> [!tip]
>
> 从 `permissive-open` 开始，然后如果工作流程仍然有效，则收紧到 `restrictive-closed`。

### 自定义 Seatbelt 配置文件（macOS）

要使用自定义 Seatbelt 配置文件：

1. 在项目中创建一个名为 `.qwen/sandbox-macos-<profile_name>.sb` 的文件。
2. 设置 `SEATBELT_PROFILE=<profile_name>`。

### 自定义沙箱标志

对于基于容器的沙箱，你可以使用 `SANDBOX_FLAGS` 环境变量将自定义标志注入到 `docker` 或 `podman` 命令中。这对于高级配置很有用，例如为特定用例禁用安全功能。

**示例（Podman）**：

要禁用卷挂载的 SELinux 标签，可以设置以下内容：

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

可以提供多个标志作为空格分隔的字符串：

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### 网络代理（所有沙箱方法）

如果你想将出站网络访问限制在白名单内，可以在沙箱旁边运行一个本地代理：

- 设置 `GEMINI_SANDBOX_PROXY_COMMAND=<command>`
- 命令必须启动一个监听在 `:::8877` 的代理服务器

这与 `*-proxied` Seatbelt 配置文件特别有用。

有关工作中的白名单式代理示例，请参见：[示例代理脚本](/developers/examples/proxy-script)。

## Linux UID/GID 处理

在 Linux 上，Qwen Code 默认启用 UID/GID 映射，以便沙箱以你的用户身份运行（并重用挂载的 `~/.qwen`）。可通过以下方式覆盖：

```bash
export SANDBOX_SET_UID_GID=true   # 强制使用主机 UID/GID
export SANDBOX_SET_UID_GID=false  # 禁用 UID/GID 映射
```

## 故障排除

### 常见问题

**"Operation not permitted"**

- 操作需要访问沙盒外的资源。
- 在 macOS Seatbelt 上：尝试使用更宽松的 `SEATBELT_PROFILE`。
- 在 Docker/Podman 上：验证工作区是否已挂载，并且你的命令不需要访问项目目录之外的资源。

**缺少命令**

- 容器沙盒：通过 `.qwen/sandbox.Dockerfile` 或 `.qwen/sandbox.bashrc` 添加它们。
- Seatbelt：使用主机上的二进制文件，但沙盒可能会限制对某些路径的访问。

**网络问题**

- 检查沙盒配置文件是否允许网络访问。
- 验证代理配置。

### 调试模式

```bash
DEBUG=1 qwen -s -p "debug command"
```

**注意：** 如果你在项目的 `.env` 文件中有 `DEBUG=true`，由于自动排除机制，它不会影响 CLI。请使用 `.qwen/.env` 文件进行 Qwen Code 特定的调试设置。

### 检查沙盒

```bash

# 检查环境
qwen -s -p "run shell command: env | grep SANDBOX"

# 列出挂载点
qwen -s -p "run shell command: mount | grep workspace"
```

## 安全注意事项

- 沙箱化可以降低风险，但不能完全消除所有风险。
- 使用允许你工作的最严格的配置文件。
- 容器在首次拉取/构建后开销很小。
- GUI 应用程序可能无法在沙箱中运行。

## 相关文档

- [配置](../configuration/settings)：完整配置选项。
- [命令](../features/commands)：可用命令。
- [故障排除](../support/troubleshooting)：常规故障排除。