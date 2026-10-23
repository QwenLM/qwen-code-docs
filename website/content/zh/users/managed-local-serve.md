# 在本地运行托管会话


托管本地模式使用持久化的嵌入式 H2 数据库。在本地安装了 Java 21 的情况下，
首次启动 Managed 时会自动下载匹配的 Java 服务器 JAR。
它复用运行 Qwen 的 Node 可执行文件、
其 Hosted Harness、原生 worker 入口和生产 WebShell。用户无需安装
MySQL、Docker、Maven 或 systemd。可选的预装捆绑运行时包含
Java；默认下载版和轻量版需要本地 Java 21。

此模式为实验性功能。实现支持 arm64 和 x64 上的原生 macOS 和 Linux。
平台验收结果单独记录；提供打包目标并不代表该平台已通过 E2E 验证。
Managed 运行时归档按如下方式显式构建；普通 CLI
包不包含 Java 负载。可选的完整 Managed
独立归档捆绑所有组件。

## 启动与停止

使用包含 Managed 本地支持的 Qwen 版本。旧版本需要升级
CLI；仅安装运行时无法添加启动器。安装 Java 21
并将 `JAVA_HOME` 设置为其主目录，或将其可执行文件加入 PATH，然后运行：

```sh
qwen serve --managed --open
```

在创建应用数据或启动服务之前，Qwen 会检查 Java 21 并
从官方 Aliyun OSS 发布镜像下载 `qwen-managed-agent-server-<cli-version>.jar` 及其校验和，GitHub Release 作为备选。
它会验证校验和并以原子方式将完整运行时安装到
`<Qwen home>/managed-runtime/<cli-version>/<platform>-<arch>/` 下。后续启动
复用该缓存，无需联网。普通 Qwen 命令不会下载它。
仅下载服务 JAR；Qwen 不会安装 Java 或运行 Maven。
如果匹配的发布版本不可用或下载失败，则不会创建
任何应用数据或服务子进程。请稍后重试或预装匹配的运行时。

对于离线使用或捆绑 Java，请从
分发构建者处获取匹配的
`qwen-code-managed-runtime-<platform>-<arch>.tar.gz` 及其 `.sha256` 文件。在启动前验证并解压：

```sh
shasum -a 256 -c qwen-code-managed-runtime-darwin-arm64.tar.gz.sha256
mkdir -p "${QWEN_HOME:-$HOME/.qwen}"
tar -xzf qwen-code-managed-runtime-darwin-arm64.tar.gz -C "${QWEN_HOME:-$HOME/.qwen}"
qwen serve --managed --open
```

归档安装到
`<Qwen home>/managed-runtime/<cli-version>/<platform>-<arch>/` 下。Qwen 会自动发现
其确切版本和平台对应的目录。运行时
不包含其他 Node、CLI、Harness、worker 或 WebShell 安装。

对于更小的离线负载，选择 `qwen-code-managed-runtime-lite-<platform>-<arch>.tar.gz`
并以相同方式验证/解压。它仅包含服务器 JAR 和
清单。在全新的版本/目标目录中安装一个版本；不要
将轻量版和捆绑版归档叠加安装。轻量版启动器在
JAVA_HOME 非空时使用 `JAVA_HOME/bin/java`，否则使用 PATH 上第一个可用的
`java` 可执行文件。它严格要求 Java 21 并在创建应用状态之前检查
可执行文件。即使 PATH 包含另一个可用的 Java，错误的 JAVA_HOME 也会报错。例如：

```sh
JAVA_HOME=/absolute/java-21-home qwen serve --managed --open
```

在 macOS 上，JAVA_HOME 通常以 `Contents/Home` 结尾。缺失或不兼容的
Java 会在下载 JAR 之前产生安装/配置错误；Qwen 不会下载 Java。
捆绑版始终使用自带的 Java，如果其负载损坏，不会回退到
机器上的 Java。

可选的完整包 `qwen-code-managed-local-<platform>-<arch>.tar.gz` 也可用：
解压后运行 `./qwen-code/bin/qwen serve --managed --open`。

应用绑定到 `127.0.0.1:4170`。使用 `--port 0` 获取可用
端口，或选择固定端口。保持终端打开；Ctrl+C 会关闭
普通守护进程、Java 服务和 Harness。systemd 用于运维管理的
部署，是可选的，此命令不使用它。
如果公共端口被占用，会按照普通守护进程的有限邻近端口
重试策略处理；请使用启动器打印的浏览器地址。

这一条命令会同时启动普通守护进程和 Managed Agent。同一个
WebShell 在 Projects 下统一列出普通和 Managed 的工作区与会话，Managed 工作区带有 Managed 标签，没有执行模式选项卡。新任务遵循所选工作区或对话。本地会话使用
运行命令时所在的目录，而 Managed 会话使用其
应用创建的 Workspaces 或显式导入的本地项目。两者使用
同一个已认证的浏览器来源；
你不需要第二个守护进程命令或浏览器页面。

在 **Add workspace** 中，提交前选择 **Local (daemon)** 或 **Managed (Managed Agent)**。
默认选择当前对话的服务。
工作区行和 **New task** 显示该服务，新任务继承
所选工作区。守护进程现有的 SSH 工作区支持仍然
可用；Managed SSH 注册未集成到此共享对话框中。

终端会打印一个带有 token 片段的浏览器 URL。将其视为本地
密码。浏览器使用该 token 认证每个 API 请求；Java
签名密钥和内部凭据不会传到浏览器。监听器
仅限回环地址。对于无头机器，省略 `--open` 并在该机器上打开打印的 URL，
或使用你自行管理的已认证隧道。

统一应用目前支持本地回环页面。完整
shell 现有的 Mobile access / Local Control 入口未与
Managed 启动集成：配对的 LAN 监听器无法打开此统一页面。移动端
共享需要单独的集成；普通守护进程保留其现有的
Local Control 行为。

Harness 使用常规的 Qwen 模型配置和提供商凭据。
在发送第一个 prompt 之前，使用常规的 Qwen CLI 设置配置模型。
Files 和 Shell 使用 `default` 审批模式；Managed UI 会在操作需要审批时请求
批准。

重启后，继续现有 Session 可能需要等待其之前的 SQL
writer 租约过期（默认 60 秒）。保留原始数据目录
并在该间隔后重试；重启进程不会清除所有权。

## 工作区与持久化数据

默认私有数据目录为 `<Qwen home>/managed-local`，通常为
`~/.qwen/managed-local`。可通过以下方式覆盖：

```sh
qwen serve --managed --managed-data-dir /absolute/private/data --open
```

该目录必须位于所有 Git worktree 之外。同一时间只能有一个启动器使用它；
Java 还持有排他的数据库文件锁。私有服务端口
和凭据在重启间保持稳定。私有端口被
其他应用占用会导致启动失败；选择不同的全新数据
目录或停止冲突的服务，而不是编辑已持久化的信息。

启动时通过现有的幂等 Workspace API 创建应用拥有的默认 Workspace 及其 OWNER 授权。
要使用现有的本地项目，
打开 **Workspace → Choose existing directory**，浏览或输入其绝对
路径，然后添加该文件夹。服务会自动注册其父目录并授予 OWNER
访问权限，保留现有文件不动。新任务在
所选项目中启动。你也可以创建一个空的 Workspace。

启动目录对本地会话仍然可用，不会被自动导入。
`--workspace` 在 Managed 本地模式下仍然不受支持；在
UI 中选择项目。`.qwen-managed-storage.json` 维护标记保留在
Git worktree 之外；不要编辑、删除、暂存或提交它。导入的
项目文件保留在私有 Managed 数据目录之外，需要自行
备份。

本地会话历史继续使用普通 Qwen 存储。它与
Managed 数据目录分开，不包含在仅 Managed 的备份中。

完整保留整个数据目录，包括 `state.json`、
`database/`、`runtime/`、`worker-home/` 和 `workspaces/`。在
进行文件系统备份之前，完成或取消活动工作，关闭其 Session，然后停止应用。持久化的原始 worker 可能在控制平面退出后继续存活；
确认所有 Workspace writer 已停止。未知执行状态需要在离线备份前
执行现有的原始所有者恢复流程。
凭据、数据库、worker 历史和 Workspace 身份属于同一个
安装。仅恢复子集
可能会关闭恢复准入。启动不会重建缺失的标记或
替换损坏的凭据。服务诊断信息位于 `logs/` 中。

macOS 支持原生 worker 和同次启动的持久化接管。可信的整机
重启恢复在本地启动器中仍然禁用。未知工具结果
保留现有的原始所有者恢复规则，不会被盲目重放。
此模式不会添加自动登录时启动或防止笔记本休眠。

## 构建分发

以下命令面向发布构建者，而非最终用户。从同一个代码检出
使用 Node 22+、Java 21 和 Maven 3.8.9+ 构建 CLI 和 Java
服务器：

```sh
corepack pnpm install --frozen-lockfile
npm run build
npm run typecheck
npm run bundle
npm run prepare:package
mvn -f packages/sdk-java/qwencode/pom.xml -DskipTests -Dgpg.skip=true install
mvn -f packages/managed-agent-server/pom.xml verify
npm run package:managed-runtime -- \
  --target darwin-arm64 \
  --server-jar packages/managed-agent-server/target/qwen-managed-agent-server-0.1.0-alpha.jar \
  --jre-home /verified/java-21-home \
  --out-dir /output/managed-runtime
```

运行时构建器只需要此次检出中匹配的服务器 JAR、Java 运行时和 CLI
版本。它不需要已构建的 CLI 资产或 Node
归档。默认写入
`packages/managed-agent-server/target/managed-runtime`，位于 CLI 的
`dist/` 资产之外。它生成运行时归档和每个归档的 `.sha256` 文件。
普通 CLI 单独构建/发布。

使用相同的服务器 JAR 并通过 `--without-jre` 代替 `--jre-home`
构建轻量运行时：

```sh
npm run package:managed-runtime -- \
  --target darwin-arm64 \
  --server-jar packages/managed-agent-server/target/qwen-managed-agent-server-0.1.0-alpha.jar \
  --without-jre \
  --out-dir /output/managed-runtime
```

这会生成 `qwen-code-managed-runtime-lite-darwin-arm64.tar.gz` 及其校验和。
轻量版构建器不需要 Java 输入。对于可选的完整分发：

```sh
npm run package:standalone -- \
  --target darwin-arm64 \
  --node-archive /verified/node-v22-darwin-arm64.tar.gz \
  --managed-server-jar packages/managed-agent-server/target/qwen-managed-agent-server-0.1.0-alpha.jar \
  --managed-jre-home /verified/java-21-home \
  --out-dir /output/managed-local
```

使用包含 `bin/java`、`lib/modules`、
`release` 和 `legal/` 的完整解压运行时主目录。macOS JRE 可能将其放在 `Contents/Home` 下。
构建器检查 Java 主版本、操作系统和架构，包含其
许可证，并在负载清单中记录服务器 SHA-256 和匹配的 CLI 版本。
完整独立版使用 `lib/managed-runtime/` 并
生成 `SHA256SUMS`。在构建前验证运行时输入的发布者校验和。
Windows 和 Bun 的 Managed 执行会被拒绝；启动器需要 Node 22+。

对于显式指定运行时位置，
`QWEN_MANAGED_LOCAL_RUNTIME_DIR=/absolute/managed-runtime` 将本地
CLI 直接指向包含 `manifest.json` 和 `server.jar`
（捆绑版还包含 `jre/`）的目录。
它优先于同位负载和版本化的 Qwen-home 安装。
现有的同位负载优先于 Qwen-home 安装。
选定的无效或不完整负载不会被其他负载替换。
缺失的显式选定负载、错误的 CLI 版本、目标、
Java 主版本或服务器校验和会在子进程启动前失败。仅缺失的
默认缓存会触发 JAR 安装；不会替换现有的损坏负载。
应用启动期间永远不会运行 Maven。

## 发布首次使用 JAR

`Release Managed server runtime` 工作流从已发布的
CLI 发布标签构建，使用该确切源代码修订版的 SDK 和服务器。
手动运行必须从 `main` 分发，默认为试运行。它会验证
CLI 和 Java 模块，构建 `central-release` profile，并将
JAR 和校验和保留为工作流制品，不更改公共仓库。

验证试运行后，发布运维人员可以通过受保护的 `production-release` 环境对同一标签运行
`dry_run=false`。
工作流将服务器制品版本设置为 CLI 版本，向 Maven Central 发布
`com.alibaba:qwen-managed-agent-server:<cli-version>`，附带
源码、Javadoc 和签名，并通过该 GitHub Release 和现有的版本化 OSS 镜像分发相同的主 JAR 及其
`.sha256`。
辅助运维 JAR 不会附加到 Central 发布。现有
资产逐字节比较，不会被不同内容替换。
已发布的 CLI 发布事件也会自动运行此工作流。

CLI 从 OSS/GitHub 下载，而非 Maven Central。它不会将
SDK 作为独立的用户依赖解析：可执行服务器 JAR 包含其 Java
依赖。运行时资产必须在首次使用下载成功前
存在于确切的 CLI 发布中。此 PR 的本地验证不会发布这些
资产或绕过生产发布环境。

请参阅双语[设计文档](../design/2026-10-20-managed-local-serve.md)了解
所有权边界和验证标准，以及
[Java 服务器参考](../../packages/managed-agent-server/README.md)了解
面向运维的 MySQL 部署。