# 沙箱

本文档介绍如何在沙箱环境中运行 Qwen Code，以降低工具执行 Shell 命令或修改文件时带来的风险。

## 前提条件

使用沙箱功能前，需先安装并配置 Qwen Code：

```bash
npm install -g @qwen-code/qwen-code
```

验证安装是否成功：

```bash
qwen --version
```

## 沙箱机制概述

沙箱机制将潜在危险的操作（例如 shell 命令或文件修改）与宿主系统隔离开来，从而在 CLI 与您的运行环境之间构建一道安全屏障。

沙箱机制的优势包括：

- **安全性**：防止意外造成系统损坏或数据丢失。
- **隔离性**：将文件系统访问权限限制在项目目录内。
- **一致性**：确保在不同系统上均可复现相同的运行环境。
- **安全性**：降低处理不可信代码或实验性命令时的风险。

> [!note]
>
> **命名说明**：部分与沙箱相关的环境变量历史上曾使用 `GEMINI_*` 前缀。所有新引入的环境变量均统一采用 `QWEN_*` 前缀。

## 沙箱机制实现方式

您理想的沙箱实现方式可能因所用平台及偏好的容器解决方案而异。

### 1. macOS Seatbelt（仅限 macOS）

轻量级、系统内置的沙箱机制，基于 `sandbox-exec` 实现。

**默认配置文件**：`permissive-open` —— 限制对项目目录以外路径的写入操作，但允许大多数其他操作及出站网络访问。

**适用场景**：运行速度快，无需 Docker，对文件写入提供强保护。

### 2. 基于容器的沙箱（Docker / Podman）

跨平台沙箱方案，提供完整的进程隔离。

默认情况下，Qwen Code 使用一个已发布的沙箱镜像（在 CLI 包中配置），并按需自动拉取。

该容器沙箱会将你的工作区以及 `~/.qwen` 目录挂载进容器内，从而确保认证信息和设置在多次运行间保持持久化。

**适用场景**：在任意操作系统上提供强隔离能力，并在已知镜像中提供一致的工具链环境。

### 选择沙箱方法

- **在 macOS 上**：
  - 若需要轻量级沙箱（推荐大多数用户使用），请使用 Seatbelt。
  - 若需要完整的 Linux 用户空间（例如依赖 Linux 二进制文件的工具），请使用 Docker 或 Podman。
- **在 Linux / Windows 上**：
  - 请使用 Docker 或 Podman。

## 快速开始

```bash

# 通过命令行标志启用沙箱
qwen -s -p "分析代码结构"

# 或为当前 shell 会话启用沙箱（推荐用于 CI / 脚本）
export QWEN_SANDBOX=true   # true 将自动选择一个提供程序（详见下方说明）
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
> **提供程序选择说明：**
>
> - 在 **macOS** 上，`QWEN_SANDBOX=true` 通常会优先选择 `sandbox-exec`（Seatbelt），前提是该工具可用。
> - 在 **Linux / Windows** 上，`QWEN_SANDBOX=true` 要求已安装 `docker` 或 `podman`。
> - 若要强制指定提供程序，请设置 `QWEN_SANDBOX=docker|podman|sandbox-exec`。

## 配置

### 启用沙箱（按优先级顺序）

1. **环境变量**：`QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **命令行标志 / 参数**：`-s`、`--sandbox` 或 `--sandbox=<provider>`
3. **设置文件**：`settings.json` 中的 `tools.sandbox`（例如 `{"tools": {"sandbox": true}}`）。

> [!important]
>
> 若设置了 `QWEN_SANDBOX`，则它将**覆盖** CLI 标志和 `settings.json` 中的配置。

### 配置沙箱镜像（Docker/Podman）

- **CLI 标志**：`--sandbox-image <image>`
- **环境变量**：`QWEN_SANDBOX_IMAGE=<image>`

若两者均未设置，Qwen Code 将使用 CLI 包中预配置的默认镜像（例如 `ghcr.io/qwenlm/qwen-code:<version>`）。

### macOS Seatbelt 配置文件

内置配置文件（通过 `SEATBELT_PROFILE` 环境变量设置）：

- `permissive-open`（默认）：限制写入操作，允许网络访问  
- `permissive-closed`：限制写入操作，禁止网络访问  
- `permissive-proxied`：限制写入操作，仅允许通过代理访问网络  
- `restrictive-open`：严格限制，允许网络访问  
- `restrictive-closed`：最严格的限制  
- `restrictive-proxied`：严格限制，仅允许通过代理访问网络  

> [!tip]  
>  
> 建议从 `permissive-open` 开始，若工作流仍能正常运行，再逐步收紧至 `restrictive-closed`。

### 自定义 Seatbelt 配置文件（macOS）

要使用自定义 Seatbelt 配置文件，请执行以下步骤：

1. 在项目中创建一个名为 `.qwen/sandbox-macos-<profile_name>.sb` 的文件。  
2. 设置环境变量 `SEATBELT_PROFILE=<profile_name>`。

### 自定义沙箱标志

对于基于容器的沙箱机制，你可以通过 `SANDBOX_FLAGS` 环境变量向 `docker` 或 `podman` 命令注入自定义标志。这在需要高级配置（例如为特定用例禁用安全特性）时非常有用。

**示例（Podman）**：

若要禁用卷挂载的 SELinux 标签，可设置如下：

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

多个标志可作为空格分隔的字符串提供：

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### 网络代理（所有沙箱方式）

若需将出站网络访问限制在白名单内，可在沙箱旁运行一个本地代理：

- 设置 `QWEN_SANDBOX_PROXY_COMMAND=<command>`
- 该命令必须启动一个监听 `:::8877` 的代理服务器

此功能与 `*-proxied` Seatbelt 配置文件配合使用尤为有效。

如需一个可运行的白名单式代理示例，请参阅：[示例代理脚本](/developers/examples/proxy-script)

## Linux UID/GID 处理

在 Linux 上，Qwen Code 默认启用 UID/GID 映射，使沙箱以当前用户身份运行（并复用已挂载的 `~/.qwen`）。可通过以下方式覆盖默认行为：

```bash
export SANDBOX_SET_UID_GID=true   # 强制使用宿主机的 UID/GID
export SANDBOX_SET_UID_GID=false  # 禁用 UID/GID 映射
```

## 故障排除

### 常见问题

**“操作不被允许”**

- 该操作需要访问沙箱外部的资源。
- 在 macOS Seatbelt 环境下：尝试使用权限更宽松的 `SEATBELT_PROFILE`。
- 在 Docker/Podman 环境下：请确认工作区已正确挂载，且你的命令未尝试访问项目目录以外的路径。

**缺少命令**

- 容器沙箱：可通过 `.qwen/sandbox.Dockerfile` 或 `.qwen/sandbox.bashrc` 添加所需命令。
- Seatbelt 沙箱：直接使用宿主机上的二进制文件，但沙箱可能限制对某些路径的访问。

**Docker 沙箱中 Java 不可用**

官方 Qwen Code Docker 镜像刻意保持精简，以确保镜像体积小、安全性高且拉取速度快。不同用户所需的运行时环境各不相同（如 Java、Python、Node.js 等），将所有环境打包进单一镜像是不现实的。因此，Java **默认未包含在 Docker 沙箱中**。

若你的工作流需要 Java，可通过在项目根目录创建 `.qwen/sandbox.Dockerfile` 来扩展基础镜像：

```dockerfile
FROM ghcr.io/qwenlm/qwen-code:latest

RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

然后重建沙箱镜像：

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
```

有关自定义沙箱的更多细节，请参阅 [自定义沙箱环境](/developers/tools/sandbox)。

**网络问题**

- 检查沙箱配置文件是否允许网络访问。
- 验证代理配置是否正确。

### 调试模式

```bash
DEBUG=1 qwen -s -p "调试命令"
```

**注意：** 如果项目根目录下的 `.env` 文件中设置了 `DEBUG=true`，由于自动排除机制，该设置不会影响 CLI。如需为 Qwen Code 配置调试选项，请使用 `.qwen/.env` 文件。

### 检查沙箱环境

```bash
# 检查运行环境
qwen -s -p "运行 shell 命令：env | grep SANDBOX"

# 列出挂载点
qwen -s -p "运行 shell 命令：mount | grep workspace"
```

## 安全说明

- 沙箱化可降低风险，但无法完全消除所有安全风险。
- 请使用满足工作需求的最严格沙箱配置文件。
- 容器在首次拉取或构建后，后续开销极小。
- 图形界面（GUI）应用在沙箱中可能无法正常运行。

## 相关文档

- [配置](../configuration/settings)：完整配置选项。
- [命令](../features/commands)：支持的命令列表。
- [故障排查](../support/troubleshooting)：通用问题排查指南。