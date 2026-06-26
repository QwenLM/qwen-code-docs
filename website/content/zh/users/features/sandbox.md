# 沙箱

本文档说明如何在沙箱中运行 Qwen Code，以降低工具执行 shell 命令或修改文件时的风险。

## 前提条件

使用沙箱功能前，你需要安装并配置 Qwen Code：

```bash
npm install -g @qwen-code/qwen-code
```

验证安装：

```bash
qwen --version
```

## 沙箱概述

沙箱将潜在的危险操作（如 shell 命令或文件修改）与宿主机隔离，为 CLI 和你的环境之间提供一道安全屏障。

沙箱的优点包括：

- **安全性**：防止意外损坏系统或丢失数据。
- **隔离性**：限制文件系统访问仅限于项目目录。
- **一致性**：确保不同系统之间可重现的环境。
- **安全性**：处理不可信代码或实验性命令时降低风险。

> [!note]
>
> **命名提示：** 某些沙箱相关的环境变量历史上可能使用了 `GEMINI_*` 前缀。所有新的环境变量均使用 `QWEN_*` 前缀。

## 沙箱方法

理想的沙箱方法可能因平台和你偏好的容器解决方案而异。

### 1. macOS Seatbelt（仅 macOS）

使用 `sandbox-exec` 的轻量级内建沙箱。

**默认配置文件**：`permissive-open` —— 限制项目目录外的写入操作，但允许大多数其他操作和出站网络访问。

**适用场景**：快速，无需 Docker，对文件写入有强有力的防护。

### 2. 容器化（Docker/Podman）

跨平台沙箱，提供完整的进程隔离。

默认情况下，Qwen Code 使用已发布的沙箱镜像（在 CLI 包中配置），并按需拉取。

容器沙箱会将你的工作区和 `~/.qwen` 目录挂载到容器中，以便身份验证和设置在多次运行之间保持不变。

**适用场景**：在任何操作系统上实现强隔离，在已知镜像内使用一致的工具。

### 选择方法

- **macOS 上**：
  - 需要轻量级沙箱时使用 Seatbelt（推荐大多数用户使用）。
  - 需要完整 Linux 用户环境时（例如需要 Linux 二进制文件的工具），使用 Docker/Podman。
- **Linux/Windows 上**：
  - 使用 Docker 或 Podman。

## 快速入门

```bash
# 通过命令标志启用沙箱
qwen -s -p "分析代码结构"

# 或在 Shell 会话中启用沙箱（推荐用于 CI / 脚本）
export QWEN_SANDBOX=true   # true 会自动选择一个提供者（见下方说明）
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
> - 在 **macOS** 上，`QWEN_SANDBOX=true` 通常会在可用时选择 `sandbox-exec`（Seatbelt）。
> - 在 **Linux/Windows** 上，`QWEN_SANDBOX=true` 需要已安装 `docker` 或 `podman`。
> - 要强制指定提供者，请设置 `QWEN_SANDBOX=docker|podman|sandbox-exec`。

## 配置

### 启用沙箱（按优先级顺序）

1. **环境变量**：`QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **命令标志/参数**：`-s`、`--sandbox` 或 `--sandbox=<provider>`
3. **设置文件**：`settings.json` 中的 `tools.sandbox`（例如 `{"tools": {"sandbox": true}}`）。

> [!important]
>
> 如果设置了 `QWEN_SANDBOX`，它将**覆盖** CLI 标志和 `settings.json`。

### 配置沙箱镜像（Docker/Podman）

- **CLI 标志**：`--sandbox-image <image>`
- **环境变量**：`QWEN_SANDBOX_IMAGE=<image>`
- **设置文件**：`settings.json` 中的 `tools.sandboxImage`（例如 `{"tools": {"sandboxImage": "ghcr.io/qwenlm/qwen-code:0.14.1"}}`）

优先级顺序（从高到低）：

1. `--sandbox-image`
2. `QWEN_SANDBOX_IMAGE`
3. `tools.sandboxImage`
4. CLI 包中的内建默认镜像（例如 `ghcr.io/qwenlm/qwen-code:<version>`）

`settings.env.QWEN_SANDBOX_IMAGE` 也可作为通用的环境变量注入机制，但 `tools.sandboxImage` 是推荐的首选持久化设置。

### macOS Seatbelt 配置文件

内建配置文件（通过 `SEATBELT_PROFILE` 环境变量设置）：

- `permissive-open`（默认）：限制写入，允许网络
- `permissive-closed`：限制写入，无网络
- `permissive-proxied`：限制写入，通过代理访问网络
- `restrictive-open`：严格限制，允许网络
- `restrictive-closed`：最大限制
- `restrictive-proxied`：严格限制，通过代理访问网络

> [!tip]
>
> 从 `permissive-open` 开始使用，如果你的工作流程仍然可行，再收紧至 `restrictive-closed`。

### 自定义 Seatbelt 配置文件（macOS）

要使用自定义 Seatbelt 配置文件：

1. 在你的项目中创建一个名为 `.qwen/sandbox-macos-<profile_name>.sb` 的文件。
2. 设置 `SEATBELT_PROFILE=<profile_name>`。

### 自定义沙箱标志

对于基于容器的沙箱，你可以使用 `SANDBOX_FLAGS` 环境变量向 `docker` 或 `podman` 命令注入自定义标志。这对于高级配置（例如，为特定用例禁用安全功能）非常有用。

**示例（Podman）**：

要禁用卷挂载的 SELinux 标签，可以设置以下内容：

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

多个标志可以以空格分隔的字符串形式提供：

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### 网络代理（所有沙箱方法）

如果要限制出站网络访问仅允许列表中的地址，你可以在沙箱旁边运行一个本地代理：

- 设置 `QWEN_SANDBOX_PROXY_COMMAND=<command>`
- 该命令必须启动一个监听在 `:::8877` 的代理服务器。

这对于使用 `*-proxied` Seatbelt 配置文件特别有用。

有关可正常工作的允许列表型代理示例，请参见：[示例代理脚本](../../developers/examples/proxy-script.md)。

## Linux UID/GID 处理

在 Linux 上，Qwen Code 默认启用 UID/GID 映射，以便沙箱以你的用户身份运行（并重用挂载的 `~/.qwen`）。可以通过以下方式覆盖：

```bash
export SANDBOX_SET_UID_GID=true   # 强制使用宿主 UID/GID
export SANDBOX_SET_UID_GID=false  # 禁用 UID/GID 映射
```

## 故障排除

### 常见问题

**"Operation not permitted"（操作不允许）**

- 操作需要访问沙箱外的资源。
- 在 macOS Seatbelt 上：尝试使用更宽松的 `SEATBELT_PROFILE`。
- 在 Docker/Podman 上：确认工作区已挂载，并且你的命令不需要访问项目目录之外的内容。

**缺少命令**

- 容器沙箱：通过 `.qwen/sandbox.Dockerfile` 或 `.qwen/sandbox.bashrc` 添加。
- Seatbelt：使用宿主机的二进制文件，但沙箱可能限制对某些路径的访问。

**Docker 沙箱中 Java 不可用**

官方 Qwen Code Docker 镜像有意保持精简，以保持镜像小巧、安全且拉取快速。不同用户需要不同的语言运行时（Java、Python、Node.js 等），将所有环境打包到一个镜像中并不实际。因此，Java **默认不包含**在 Docker 沙箱中。

如果你的工作流程需要 Java，可以通过在你的项目中创建一个 `.qwen/sandbox.Dockerfile` 来扩展基础镜像：

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

有关自定义沙箱的更多详细信息，请参见[自定义沙箱环境](../../developers/tools/sandbox.md)。

**网络问题**

- 检查沙箱配置文件是否允许网络访问。
- 验证代理配置。

### 调试模式

```bash
DEBUG=1 qwen -s -p "debug command"
```

**注意：** 如果你在项目的 `.env` 文件中设置了 `DEBUG=true`，由于自动排除机制，它不会影响 CLI。请使用 `.qwen/.env` 文件为 Qwen Code 设置特定的调试设置。

### 检查沙箱

```bash
# 检查环境
qwen -s -p "run shell command: env | grep SANDBOX"

# 列出挂载点
qwen -s -p "run shell command: mount | grep workspace"
```

## 安全说明

- 沙箱可以降低风险，但并不能消除所有风险。
- 使用允许你工作的最严格的配置文件。
- 首次拉取/构建后，容器的开销很小。
- GUI 应用程序可能无法在沙箱中工作。

## 相关文档

- [配置](../configuration/settings)：完整的配置选项。
- [命令](../features/commands)：可用的命令。
- [故障排除](../support/troubleshooting)：常规故障排除。