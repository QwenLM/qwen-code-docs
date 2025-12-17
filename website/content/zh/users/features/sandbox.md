# 沙盒

本文档解释了如何在沙盒中运行 Qwen Code，以降低工具执行 shell 命令或修改文件时的风险。

## 先决条件

在使用沙盒功能之前，你需要安装并设置 Qwen Code：

```bash
npm install -g @qwen-code/qwen-code
```

验证安装：

```bash
qwen --version
```

## 沙箱概述

沙箱将潜在危险的操作（例如 shell 命令或文件修改）与主机系统隔离，在 CLI 和你的环境之间提供一道安全屏障。

沙箱的优势包括：

- **安全性**：防止意外的系统损坏或数据丢失。
- **隔离性**：将文件系统访问限制在项目目录内。
- **一致性**：确保在不同系统间环境可重现。
- **安全性**：在处理不受信任的代码或实验性命令时降低风险。

> [!note]
>
> **命名说明**：出于向后兼容考虑，一些与沙箱相关的环境变量仍使用 `GEMINI_*` 前缀。

## 沙箱方法

根据你的平台和偏好的容器解决方案，理想的沙箱方式可能有所不同。

### 1. macOS Seatbelt（仅限 macOS）

使用 `sandbox-exec` 实现的轻量级内置沙盒机制。

**默认配置文件**：`permissive-open` —— 限制在项目目录外进行写入操作，但允许大多数其他操作和出站网络访问。

**最适合场景**：快速启动、无需 Docker、对文件写入提供强有力的限制。

### 2. 基于容器（Docker/Podman）

跨平台沙盒机制，具备完整的进程隔离能力。

Qwen Code 默认使用一个已发布的沙盒镜像（在 CLI 包中配置），并在需要时自动拉取该镜像。

**最适合场景**：在任意操作系统上实现强隔离，在已知镜像内保持一致的工具环境。

### 选择方法

- **在 macOS 上**：
  - 当你需要轻量级沙盒机制时，请使用 Seatbelt（推荐大多数用户使用）。
  - 当你需要完整的 Linux 用户态工具链时（例如依赖 Linux 二进制文件的工具），请使用 Docker/Podman。
- **在 Linux/Windows 上**：
  - 使用 Docker 或 Podman。

## 快速开始

```bash

# 使用命令行标志启用沙盒机制
qwen -s -p "分析代码结构"
```

```markdown
# 或为你的 shell 会话启用沙箱（推荐用于 CI / 脚本）
export GEMINI_SANDBOX=true   # true 会自动选择一个提供者（见下方说明）
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
> **提供者选择说明：**
>
> - 在 **macOS** 上，如果可用，`GEMINI_SANDBOX=true` 通常会选择 `sandbox-exec`（Seatbelt）。
> - 在 **Linux/Windows** 上，`GEMINI_SANDBOX=true` 需要安装 `docker` 或 `podman`。
> - 若要强制指定提供者，请设置 `GEMINI_SANDBOX=docker|podman|sandbox-exec`。

## 配置

### 启用沙箱（按优先级顺序）

1. **环境变量**：`GEMINI_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **命令行标志 / 参数**：`-s`、`--sandbox` 或 `--sandbox=<provider>`
3. **配置文件**：在你的 `settings.json` 中的 `tools.sandbox`（例如，`{"tools": {"sandbox": true}}`）。

> [!important]
>
> 如果设置了 `GEMINI_SANDBOX`，它将**覆盖** CLI 标志和 `settings.json` 中的配置。
```

### 配置沙箱镜像（Docker/Podman）

- **CLI 标志**：`--sandbox-image <image>`
- **环境变量**：`GEMINI_SANDBOX_IMAGE=<image>`

如果你没有设置其中任何一个，Qwen Code 将使用 CLI 包中配置的默认镜像（例如 `ghcr.io/qwenlm/qwen-code:<version>`）。

### macOS Seatbelt 配置文件

内置配置文件（通过 `SEATBELT_PROFILE` 环境变量设置）：

- `permissive-open`（默认）：写入限制，允许网络
- `permissive-closed`：写入限制，无网络
- `permissive-proxied`：写入限制，通过代理访问网络
- `restrictive-open`：严格限制，允许网络
- `restrictive-closed`：最大限制
- `restrictive-proxied`：严格限制，通过代理访问网络

> [!tip]
>
> 从 `permissive-open` 开始，如果工作流程仍然正常运行，则可以收紧到 `restrictive-closed`。

### 自定义 Seatbelt 配置文件 (macOS)

要使用自定义的 Seatbelt 配置文件：

1. 在你的项目中创建一个名为 `.qwen/sandbox-macos-<profile_name>.sb` 的文件。
2. 设置 `SEATBELT_PROFILE=<profile_name>`。

### 自定义沙箱标志

对于基于容器的沙箱机制，你可以通过 `SANDBOX_FLAGS` 环境变量向 `docker` 或 `podman` 命令注入自定义标志。这在需要高级配置时非常有用，例如为特定用例禁用安全功能。

**示例（Podman）**：

要禁用卷挂载的 SELinux 标签功能，可以设置如下内容：

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

多个标志可以以空格分隔的字符串形式提供：

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### 网络代理（所有沙箱方法）

如果你想将出站网络访问限制到一个白名单，可以在沙箱旁边运行一个本地代理：

- 设置 `GEMINI_SANDBOX_PROXY_COMMAND=<命令>`
- 该命令必须启动一个监听在 `:::8877` 的代理服务器

这与 `*-proxied` Seatbelt 配置文件一起使用时特别有用。

有关可用的白名单式代理示例，请参见：[示例代理脚本](/developers/examples/proxy-script)。

## Linux UID/GID 处理

沙箱会自动处理 Linux 上的用户权限。你可以通过以下方式覆盖这些权限：

```bash
export SANDBOX_SET_UID_GID=true   # 强制使用宿主 UID/GID
export SANDBOX_SET_UID_GID=false  # 禁用 UID/GID 映射
```

## 自定义沙盒环境（Docker/Podman）

如果你需要在容器内使用额外的工具（例如 `git`、`python`、`rg`），可以创建一个自定义 Dockerfile：

- 路径：`.qwen/sandbox.Dockerfile`
- 然后运行：`BUILD_SANDBOX=1 qwen -s ...`

这将基于默认沙盒镜像构建一个项目特定的镜像。

## 故障排除

### 常见问题

**“Operation not permitted”**

- 操作需要访问沙盒外资源。
- 在 macOS Seatbelt 中：尝试使用更宽松的 `SEATBELT_PROFILE`。
- 在 Docker/Podman 中：确认工作目录已挂载，并且你的命令不需要访问项目目录之外的路径。

**缺少命令**

- 容器沙盒：通过 `.qwen/sandbox.Dockerfile` 或 `.qwen/sandbox.bashrc` 添加所需命令。
- Seatbelt：你使用的是宿主机的二进制文件，但沙盒可能会限制对某些路径的访问。

**网络问题**

- 检查沙盒配置是否允许网络访问。
- 验证代理设置。

### 调试模式

```bash
DEBUG=1 qwen -s -p "debug command"
```

**注意：** 如果你在项目的 `.env` 文件中设置了 `DEBUG=true`，由于自动排除机制，它不会影响 CLI。请使用 `.qwen/.env` 文件来设置 Qwen Code 特定的调试选项。

### 检查沙盒

```bash

# 检查环境变量
qwen -s -p "run shell command: env | grep SANDBOX"

# 列出挂载点
qwen -s -p "run shell command: mount | grep workspace"
```

## 安全说明

- 沙盒可以降低风险，但不能完全消除所有风险。
- 请使用能完成工作的最严格的配置文件。
- 首次拉取/构建后，容器的开销很小。
- 图形界面应用程序可能无法在沙盒中运行。

## 相关文档

- [配置](../configuration/settings)：完整的配置选项。
- [命令](../features/commands)：可用的命令。
- [故障排查](../support/troubleshooting)：一般性故障排查指南。