# 沙盒

本文档介绍如何在沙盒中运行 Qwen Code，以降低工具执行 shell 命令或修改文件时的风险。

## 前提条件

使用沙盒之前，需要先安装并配置好 Qwen Code：

```bash
npm install -g @qwen-code/qwen-code
```

验证安装：

```bash
qwen --version
```

## 沙盒概述

沙盒将潜在的危险操作（如 shell 命令或文件修改）与宿主系统隔离，在 CLI 和你的环境之间提供安全屏障。

沙盒的优势包括：

- **安全性**：防止意外的系统损坏或数据丢失。
- **隔离性**：将文件系统访问限制在项目目录内。
- **一致性**：确保在不同系统上的可复现环境。
- **安全保障**：降低使用不受信任的代码或实验性命令时的风险。

> [!note]
>
> **命名说明：** 部分沙盒相关的环境变量历史上可能使用了 `GEMINI_*` 前缀。所有新的环境变量均使用 `QWEN_*` 前缀。

## 沙盒方式

最佳的沙盒方式因平台和偏好的容器方案而异。

### 1. macOS Seatbelt（仅限 macOS）

使用 `sandbox-exec` 实现轻量级内置沙盒。

**默认配置文件**：`permissive-open` - 限制对项目目录以外的写入，但允许大多数其他操作和出站网络访问。

**适用场景**：速度快、无需 Docker、对文件写入有强限制。

### 2. 基于容器（Docker/Podman）

跨平台沙盒，提供完整的进程隔离。

默认情况下，Qwen Code 使用 CLI 包中配置的已发布沙盒镜像，并在需要时自动拉取。

容器沙盒会将你的工作区和 `~/.qwen` 目录挂载到容器中，使认证信息和设置在多次运行之间持久保存。

**适用场景**：在任意操作系统上实现强隔离，在已知镜像内保持一致的工具链。

### 选择方式

- **macOS 上**：
  - 需要轻量级沙盒时使用 Seatbelt（推荐大多数用户使用）。
  - 需要完整 Linux 用户态时使用 Docker/Podman（例如，需要 Linux 二进制文件的工具）。
- **Linux/Windows 上**：
  - 使用 Docker 或 Podman。

## 快速开始

```bash
# 使用命令标志启用沙盒
qwen -s -p "analyze the code structure"

# 或为当前 shell 会话启用沙盒（推荐用于 CI / 脚本）
export QWEN_SANDBOX=true   # true 自动选择 provider（见下方说明）
qwen -p "run the test suite"

# 在 settings.json 中配置
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
> - 在 **macOS** 上，`QWEN_SANDBOX=true` 通常会选择 `sandbox-exec`（Seatbelt），如果可用的话。
> - 在 **Linux/Windows** 上，`QWEN_SANDBOX=true` 需要安装 `docker` 或 `podman`。
> - 要强制指定 provider，请设置 `QWEN_SANDBOX=docker|podman|sandbox-exec`。

## 配置

### 启用沙盒（按优先级排序）

1. **环境变量**：`QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **命令标志 / 参数**：`-s`、`--sandbox` 或 `--sandbox=<provider>`
3. **配置文件**：`settings.json` 中的 `tools.sandbox`（例如 `{"tools": {"sandbox": true}}`）。

> [!important]
>
> 如果设置了 `QWEN_SANDBOX`，它将**覆盖** CLI 标志和 `settings.json` 中的配置。

### 配置沙盒镜像（Docker/Podman）

- **CLI 标志**：`--sandbox-image <image>`
- **环境变量**：`QWEN_SANDBOX_IMAGE=<image>`
- **配置文件**：`settings.json` 中的 `tools.sandboxImage`（例如 `{"tools": {"sandboxImage": "ghcr.io/qwenlm/qwen-code:0.14.1"}}`）

优先级顺序（从高到低）：

1. `--sandbox-image`
2. `QWEN_SANDBOX_IMAGE`
3. `tools.sandboxImage`
4. CLI 包中内置的默认镜像（例如 `ghcr.io/qwenlm/qwen-code:<version>`）

`settings.env.QWEN_SANDBOX_IMAGE` 也可作为通用环境变量注入机制，但 `tools.sandboxImage` 是推荐的持久化配置方式。

### macOS Seatbelt 配置文件

内置配置文件（通过 `SEATBELT_PROFILE` 环境变量设置）：

- `permissive-open`（默认）：写入限制，允许网络
- `permissive-closed`：写入限制，禁止网络
- `permissive-proxied`：写入限制，通过代理访问网络
- `restrictive-open`：严格限制，允许网络
- `restrictive-closed`：最大限制
- `restrictive-proxied`：严格限制，通过代理访问网络

> [!tip]
>
> 从 `permissive-open` 开始，如果你的工作流仍然正常，再收紧到 `restrictive-closed`。

### 自定义 Seatbelt 配置文件（macOS）

使用自定义 Seatbelt 配置文件：

1. 在项目中创建名为 `.qwen/sandbox-macos-<profile_name>.sb` 的文件。
2. 设置 `SEATBELT_PROFILE=<profile_name>`。

### 自定义沙盒标志

对于基于容器的沙盒，可以使用 `SANDBOX_FLAGS` 环境变量向 `docker` 或 `podman` 命令注入自定义标志。这对于高级配置很有用，例如针对特定用例禁用安全功能。

**示例（Podman）**：

要禁用卷挂载的 SELinux 标签，可以设置：

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

多个标志可以用空格分隔的字符串提供：

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### 网络代理（所有沙盒方式）

如果要将出站网络访问限制为允许列表，可以在沙盒旁边运行本地代理：

- 设置 `QWEN_SANDBOX_PROXY_COMMAND=<command>`
- 命令必须启动一个监听 `:::8877` 的代理服务器

这与 `*-proxied` Seatbelt 配置文件搭配使用特别有效。

有关允许列表风格代理的示例，请参阅：[示例代理脚本](../../developers/examples/proxy-script.md)。

## Linux UID/GID 处理

在 Linux 上，Qwen Code 默认启用 UID/GID 映射，使沙盒以你的用户身份运行（并复用已挂载的 `~/.qwen`）。可通过以下方式覆盖：

```bash
export SANDBOX_SET_UID_GID=true   # 强制使用宿主 UID/GID
export SANDBOX_SET_UID_GID=false  # 禁用 UID/GID 映射
```

## 故障排查

### 常见问题

**"Operation not permitted"**

- 操作需要访问沙盒以外的资源。
- 在 macOS Seatbelt 上：尝试使用更宽松的 `SEATBELT_PROFILE`。
- 在 Docker/Podman 上：验证工作区是否已挂载，且命令不需要访问项目目录以外的路径。

**缺少命令**

- 容器沙盒：通过 `.qwen/sandbox.Dockerfile` 或 `.qwen/sandbox.bashrc` 添加所需命令。
- Seatbelt：使用宿主机的二进制文件，但沙盒可能限制对某些路径的访问。

**Docker 沙盒中没有 Java**

官方 Qwen Code Docker 镜像有意保持最小化，以保持镜像体积小、安全且拉取速度快。不同用户需要不同的语言运行时（Java、Python、Node.js 等），将所有环境打包到单个镜像中并不实际。因此，Docker 沙盒**默认不包含** Java。

如果你的工作流需要 Java，可以在项目中创建 `.qwen/sandbox.Dockerfile` 来扩展基础镜像：

```dockerfile
FROM ghcr.io/qwenlm/qwen-code:latest

RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

然后重新构建沙盒镜像：

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
```

有关自定义沙盒的更多详情，请参阅[自定义沙盒环境](../../developers/tools/sandbox.md)。

**网络问题**

- 检查沙盒配置文件是否允许网络访问。
- 验证代理配置。

### 调试模式

```bash
DEBUG=1 qwen -s -p "debug command"
```

**注意：** 如果项目的 `.env` 文件中设置了 `DEBUG=true`，由于自动排除机制，它不会影响 CLI。请使用 `.qwen/.env` 文件来配置 Qwen Code 特定的调试设置。

### 检查沙盒

```bash
# 检查环境
qwen -s -p "run shell command: env | grep SANDBOX"

# 列出挂载
qwen -s -p "run shell command: mount | grep workspace"
```

## 安全说明

- 沙盒可以降低风险，但不能消除所有风险。
- 使用允许你正常工作的最严格配置文件。
- 首次拉取/构建后，容器的额外开销极小。
- GUI 应用程序在沙盒中可能无法正常工作。

## 相关文档

- [配置](../configuration/settings)：完整的配置选项。
- [命令](../features/commands)：可用命令。
- [故障排查](../support/troubleshooting)：通用故障排查。
