# Sandbox

本文档介绍如何在 Sandbox 中运行 Qwen Code，以降低工具执行 Shell 命令或修改文件时的风险。

## 前置条件

在使用沙箱功能前，你需要先安装并配置 Qwen Code：

```bash
npm install -g @qwen-code/qwen-code
```

验证安装：

```bash
qwen --version
```

## Sandbox 概述

Sandbox 会将潜在危险的操作（如执行 Shell 命令或修改文件）与你的主机系统隔离开来，在 CLI 和你的运行环境之间建立一道安全屏障。

使用 Sandbox 的优势包括：

- **安全性**：防止意外损坏系统或丢失数据。
- **隔离性**：将文件系统访问限制在项目目录内。
- **一致性**：确保在不同系统上环境可复现。
- **可靠性**：在处理不受信任的代码或实验性命令时降低风险。

> [!note]
>
> **命名说明：** 历史上部分 Sandbox 相关的环境变量可能使用过 `GEMINI_*` 前缀。所有新增的环境变量均使用 `QWEN_*` 前缀。

## Sandbox 实现方式

最适合你的 Sandbox 方案可能因平台和偏好的容器解决方案而异。

### 1. macOS Seatbelt（仅限 macOS）

基于 `sandbox-exec` 的轻量级内置沙箱方案。

**默认配置**：`permissive-open` - 限制在项目目录外写入，但允许大多数其他操作和出站网络访问。

**适用场景**：快速启动，无需 Docker，对文件写入提供强限制。

### 2. 基于容器（Docker/Podman）

跨平台沙箱方案，提供完整的进程隔离。

默认情况下，Qwen Code 会使用已发布的 Sandbox 镜像（在 CLI 包中配置），并在需要时自动拉取。

容器沙箱会将你的工作区和 `~/.qwen` 目录挂载到容器内，以便在多次运行之间保留认证信息和配置。

**适用场景**：在任何操作系统上实现强隔离，并在已知镜像内保持工具链一致。

### 如何选择

- **macOS 用户**：
  - 如果需要轻量级沙箱，请使用 Seatbelt（推荐大多数用户使用）。
  - 如果需要完整的 Linux 用户空间（例如依赖 Linux 二进制的工具），请使用 Docker/Podman。
- **Linux/Windows 用户**：
  - 请使用 Docker 或 Podman。

## 快速开始

```bash
# Enable sandboxing with command flag
qwen -s -p "analyze the code structure"

# Or enable sandboxing for your shell session (recommended for CI / scripts)
export QWEN_SANDBOX=true   # true auto-picks a provider (see notes below)
qwen -p "run the test suite"

# Configure in settings.json
{
  "tools": {
    "sandbox": true
  }
}
```

> [!tip]
>
> **Provider 选择说明：**
>
> - 在 **macOS** 上，如果可用，`QWEN_SANDBOX=true` 通常会选择 `sandbox-exec` (Seatbelt)。
> - 在 **Linux/Windows** 上，`QWEN_SANDBOX=true` 需要已安装 `docker` 或 `podman`。
> - 如需强制指定 provider，请设置 `QWEN_SANDBOX=docker|podman|sandbox-exec`。

## 配置

### 启用 Sandbox（按优先级排序）

1. **环境变量**：`QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **命令行标志/参数**：`-s`、`--sandbox` 或 `--sandbox=<provider>`
3. **配置文件**：`settings.json` 中的 `tools.sandbox`（例如 `{"tools": {"sandbox": true}}`）。

> [!important]
>
> 如果设置了 `QWEN_SANDBOX`，它将**覆盖** CLI 标志和 `settings.json` 中的配置。

### 配置 Sandbox 镜像（Docker/Podman）

- **CLI 标志**：`--sandbox-image <image>`
- **环境变量**：`QWEN_SANDBOX_IMAGE=<image>`

如果两者均未设置，Qwen Code 将使用 CLI 包中配置的默认镜像（例如 `ghcr.io/qwenlm/qwen-code:<version>`）。

### macOS Seatbelt 配置

内置配置（通过 `SEATBELT_PROFILE` 环境变量设置）：

- `permissive-open`（默认）：限制写入，允许网络
- `permissive-closed`：限制写入，禁止网络
- `permissive-proxied`：限制写入，网络通过代理
- `restrictive-open`：严格限制，允许网络
- `restrictive-closed`：最大限制
- `restrictive-proxied`：严格限制，网络通过代理

> [!tip]
>
> 建议从 `permissive-open` 开始，如果你的工作流运行正常，再逐步收紧至 `restrictive-closed`。

### 自定义 Seatbelt 配置（macOS）

使用自定义 Seatbelt 配置的步骤：

1. 在项目中创建名为 `.qwen/sandbox-macos-<profile_name>.sb` 的文件。
2. 设置 `SEATBELT_PROFILE=<profile_name>`。

### 自定义 Sandbox 标志

对于基于容器的沙箱，你可以通过 `SANDBOX_FLAGS` 环境变量向 `docker` 或 `podman` 命令注入自定义标志。这适用于高级配置，例如在特定场景下禁用某些安全特性。

**示例（Podman）**：

如需在挂载卷时禁用 SELinux 标签，可设置如下：

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

多个标志可通过空格分隔的字符串提供：

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### 网络代理（适用于所有 Sandbox 方式）

如果希望将出站网络访问限制为白名单模式，可以在沙箱旁运行本地代理：

- 设置 `QWEN_SANDBOX_PROXY_COMMAND=<command>`
- 该命令必须启动一个监听 `:::8877` 的代理服务器

这在搭配 `*-proxied` Seatbelt 配置时尤为有用。

如需可用的白名单代理示例，请参阅：[Example Proxy Script](/developers/examples/proxy-script)。

## Linux UID/GID 处理

在 Linux 上，Qwen Code 默认启用 UID/GID 映射，使沙箱以你的用户身份运行（并复用已挂载的 `~/.qwen`）。如需覆盖默认行为，可设置：

```bash
export SANDBOX_SET_UID_GID=true   # Force host UID/GID
export SANDBOX_SET_UID_GID=false  # Disable UID/GID mapping
```

## 故障排查

### 常见问题

**"Operation not permitted"**

- 操作需要访问沙箱外部的资源。
- macOS Seatbelt：尝试使用权限更宽松的 `SEATBELT_PROFILE`。
- Docker/Podman：确认工作区已正确挂载，且你的命令不需要访问项目目录之外的路径。

**Missing commands**

- 容器沙箱：通过 `.qwen/sandbox.Dockerfile` 或 `.qwen/sandbox.bashrc` 添加所需命令。
- Seatbelt：使用主机二进制文件，但沙箱可能会限制对某些路径的访问。

**Java not available in Docker sandbox**

官方 Qwen Code Docker 镜像刻意保持精简，以确保镜像体积小、安全性高且拉取速度快。不同用户需要不同的语言运行时（Java、Python、Node.js 等），将所有环境打包进单个镜像并不现实。因此，Docker 沙箱**默认不包含** Java。

如果你的工作流需要 Java，可以在项目中创建 `.qwen/sandbox.Dockerfile` 来扩展基础镜像：

```dockerfile
FROM ghcr.io/qwenlm/qwen-code:latest

RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

然后重新构建沙箱镜像：

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
```

有关自定义沙箱的更多详情，请参阅 [Customizing the sandbox environment](/developers/tools/sandbox)。

**Network issues**

- 检查沙箱配置是否允许网络访问。
- 验证代理配置是否正确。

### 调试模式

```bash
DEBUG=1 qwen -s -p "debug command"
```

**注意：** 如果项目的 `.env` 文件中包含 `DEBUG=true`，由于自动排除机制，它不会影响 CLI。请使用 `.qwen/.env` 文件来配置 Qwen Code 专属的调试设置。

### 检查沙箱状态

```bash
# Check environment
qwen -s -p "run shell command: env | grep SANDBOX"

# List mounts
qwen -s -p "run shell command: mount | grep workspace"
```

## 安全说明

- 沙箱能降低风险，但无法完全消除所有安全隐患。
- 在满足工作需求的前提下，尽量使用限制最严格的配置。
- 首次拉取/构建后，容器带来的性能开销极小。
- 沙箱内可能无法运行 GUI 应用程序。

## 相关文档

- [Configuration](../configuration/settings)：完整的配置选项。
- [Commands](../features/commands)：可用命令列表。
- [Troubleshooting](../support/troubleshooting)：通用故障排查指南。