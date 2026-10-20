# 沙箱

本文档说明 Linux 上的工具执行限制以及现有的整个 CLI 沙箱方法。

## Linux 工具执行沙箱

在 Linux 上，将 `bwrap`（Bubblewrap）安装在 `/usr/bin/bwrap`（受支持的系统路径）以获得最强的支持边界，然后在**用户**设置（`~/.qwen/settings.json`，或 `QWEN_HOME` 选择的目录）或管理员**系统**设置中启用工具执行沙箱：

```json
{
  "tools": {
    "executionSandbox": {
      "backend": "auto",
      "filesystem": "workspace-write",
      "network": "closed"
    }
  }
}
```

`filesystem` 和 `network` 是必需的。`backend` 默认为 `auto`，会首先尝试 bwrap。当 bwrap 不可用且 `network` 为 `open` 时，`auto` 可以在具有 Landlock ABI 3 或更高版本的内核上使用捆绑的 Landlock 助手。将 `backend` 设置为 `bwrap` 或 `landlock` 以要求使用该确切实现。Landlock 无法强制执行 `network: closed` 或隐藏显式屏蔽的路径。任一要求都会在命令启动前拒绝 Landlock；自动回退永远不会丢弃剩余的路径掩码。使用 `read-only` 拒绝工作区写入，或使用 `workspace-write` 允许在当前规范工作区内写入。每个命令还会获得私有临时空间。普通的 `includeDirectories` 设置不会授予写入权限。保持工作区与 Qwen 安装、用户配置和运行时状态目录分离。

CLI、模型传输、身份验证和会话存储保留在宿主机上。Shell、终端 `!`、提示 shell 插值、Monitor、Read/Write/Edit 以及受支持的嵌套进程内 Agent/Code Mode 调用使用相同的运行时策略。使用 bwrap 时，`network: closed` 会阻止命令的普通宿主/外部 IP 连接，而 `open` 则共享宿主网络。读取仍然很广泛：此模式不会隐藏宿主机密，也不会承诺隔离路径名 Unix 套接字和宿主服务。审批和 YOLO 不会扩展文件系统或网络策略。标准流是调用者显式提供的能力：已连接的套接字、TTY 或字符设备即使在 `network: closed` 下仍然可用。封闭网络不会撤销那些现有的描述符；当不需要该访问时，避免将宿主服务连接作为 stdin 提供。宿主支持的文件和命名 FIFO stdin 需要捆绑的 Linux x64/arm64 输入助手，并通过私有 Unix 流套接字复制，其写入端已关闭；常规文件偏移量仅通过从该套接字消耗的字节数推进，空闲的 FIFO 写入器不会延迟命令完成。直接读取 fd 0：此输入是套接字而不是 FIFO，不支持通过 `/dev/stdin` 或 `/proc/self/fd/0` 重新打开。SIGINT/SIGTERM 取消命令但仍会排空已接受的 stdout/stderr 字节；关闭的输出会以退出码 141 停止该流，而另一个有效输出继续排空。

Landlock 报告 `partial` 强制执行，因为它限制路径名读取、写入和目录变更，但不创建 PID 或网络命名空间，并且目前无法限制每个元数据操作，包括 `chmod`、`chown`、扩展属性和时间戳。Landlock 命令可以看到宿主进程并使用宿主网络。分离的后代保留 Landlock 文件系统限制，但不会获得 bwrap 的 PID 命名空间生命周期边界。打开的文件描述符保留其现有访问权限。Qwen Code 通过私有只读套接字流式传输宿主支持的文件和命名 FIFO stdin，而不是将这些描述符传递给有效载荷；套接字、字符设备和匿名管道可以共享。输出标准流仍然是调用者的显式目标。执行状态描述符在有效载荷 exec 时关闭。

Landlock 还具有更窄的可写设备表面：它授予对 `/dev/null` 的写入，但不创建 bwrap 的私有 `/dev` 和 `/proc` 挂载。打开 `/dev/full` 或 `/dev/tty` 进行写入以及在 `/dev/shm` 中创建文件被拒绝，因此需要这些操作的程序可能会失败。使用通过 `TMPDIR`、`TMP` 和 `TEMP` 公开的私有临时目录来存储临时文件。已打开的、调用者提供的标准流保留其现有访问权限。启动时的 Landlock 策略探测需要 `/usr/bin/true`；缺少它的宿主即使其内核支持 Landlock 也会使探测失败。

工作区设置无法启用、禁用或修改此策略，即使在受信任的项目中也是如此。有效优先级是系统优先于用户优先于系统默认值，选择完整的策略对象。值必须是字面量；环境替换、未知字段和不完整的对象会被拒绝。`--bare` 和 `--safe-mode` 保留操作员限制。更改需要新的运行时。格式错误或不可读的系统默认、用户或系统设置文件现在会阻止启动（配置退出码 52），而不是将未知策略静默重置为空设置。错误会指明文件和修复操作。修复其 JSON 对象或恢复读取访问权限，然后重启。用户 `.corrupted` 副本仅供参考；原始操作员文件永远不会被清除。仅限工作区的恢复仍然可用，无需操作员限制。格式错误的链接工作区设置（包括链接的 `.qwen` 目录或硬链接文件）需要手动修复；自动恢复会在更改原始文件或之前的损坏副本之前拒绝。有效的链接 JSON 仍然可读。

此初始公共模式支持普通的无头 CLI 和两个终端 UI。ACP、`qwen serve` 和 Web 终端明确拒绝它。MCP/LSP、可执行 hook/extension、worktree/arena 管理、外部代理、speculative execution、文件检查点、自动 skill/memory 维护以及未移植的进程或变更工具被禁用或拒绝。普通的同工作区进程内代理无法添加 hook、MCP 服务器、外部执行器或 worktree 隔离。自定义状态命令、外部 Markdown/图像渲染器、IDE 检测和连接、文件恢复以及宿主 Git diff 预览被禁用。仅限对话的回退仍然可用。

显式操作员诊断（如 `/doctor`、通过 `/memory` 打开或编辑文件和文件夹，以及通过 `/skills` 更改设置）仍然是受信任的宿主操作。这些管理命令不会作为模型可调用的命令公开。选择 skill 会填充输入字段；提交 `/skill-name` 当前会在准备参数或更新使用记录之前报告不支持的模式错误。skill 命令执行和模型 Skill 工具在其准备写入被限制之前仍然不可用。即使更改已保存的设置，自动 memory 和 skill 维护在此运行时中仍然禁用。

在运行任务之前检查和验证活动边界：

```bash
qwen sandbox
qwen sandbox --verify
qwen sandbox -- sh -c 'printf "confined command\n"'
qwen -y -p "Update the project and run its tests"
```

链接的 Git worktree 仅获得对已准入工作区的写入权限。该工作区之外的 Git 公共目录和 worktree 元数据保持只读；此模式不会隐式授权更改另一个 checkout 的仓库元数据。需要这些写入的操作可能会被拒绝。

报告会指明工具边界、请求/有效的后端、强制执行级别、适用时的 Landlock ABI、工作区、文件系统和命令网络策略。`--verify` 检查工作区写入、对宿主机上已知可写文件的拒绝、预期的私有或共享 PID 命名空间身份，以及选定的网络命名空间。通过的后端探测建立准入，而不是在所有继承的环境设置下经过身份验证的完整会话可行性。之后运行普通任务以测试其所需的工具和服务。如果验证无法创建其宿主侧临时装置，请检查 `TMPDIR` 和目录权限；这与边界拒绝不同。后端设置错误在有效载荷执行之前失败，并且永远不会在宿主机上重新运行命令。单命令子命令转发字面参数和重定向的 stdin，同时逐字节保留 stdout 和 stderr；使用终端 `!` 进行交互式 PTY 命令。

### 从整个 CLI bwrap 迁移

替换 `--sandbox bwrap` 并移除 `tools.sandbox: "bwrap"`、`QWEN_SANDBOX=bwrap`、`QWEN_SANDBOX_NET` 和 `QWEN_SANDBOX_PROXY_COMMAND`，然后按上述方式配置 `tools.executionSandbox`。从旧沙箱外部的 shell 重启；继承的 `SANDBOX=bwrap` 会被拒绝。`proxied` 不是受支持的网络策略。不要将此模式与 Docker、Podman、Seatbelt 或继承的整个 CLI 沙箱标记结合使用。旧的 bwrap 设置会产生显式迁移错误。

下面的 Docker、Podman 和 macOS Seatbelt 方法仍然在现有环境中运行整个 CLI。

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

`--sandbox` 和 `-s` 接受可选值：`true`、`false`、`docker`、`podman` 或 `sandbox-exec`。对于带提示的自动选择，使用 `qwen --sandbox=true "query"` 或 `qwen --sandbox -p "query"`。与旧的仅布尔值解析器不同，`qwen --sandbox "query"` 现在将 `query` 视为后端值并拒绝未知后端。`--` 之前的选项即使在后置词之后也使用相同的语法；在提示中使用字面选项文本请使用 `-p "..."`。`--` 停止选项解析，但其尾部标记不会作为默认命令提示转发。会话沙箱标志在管理子命令上不被接受，其 `-s` 别名保留自己的含义。

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

自定义镜像由用户管理。请使用最新的 Qwen Code 安装重建它们以接收安全更新交接；较旧的镜像可能仍使用其原始进程内更新器。

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