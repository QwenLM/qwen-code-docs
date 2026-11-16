# 托管代理参考部署


托管代理参考发行版是实验性的。其接受的初始拓扑结构为：一台可信 Linux 主机上的一个 Java 控制平面及其内嵌的 Runtime Broker、一个 MySQL 数据库，以及一个兼容的 Qwen Hosted Harness。每个发行版中的兼容性清单对该发行版具有权威性。

## 验证与解压

从同一个 GitHub prerelease 下载归档文件、分离清单以及 `SHA256SUMS.txt`。在解压前进行验证：

```bash
sha256sum --check SHA256SUMS.txt
tar -xzf qwen-managed-agent-reference-<version>.tar.gz
cd qwen-managed-agent-reference-<version>
sha256sum --check SHA256SUMS
```

检查 `manifest.json`。确认 `source.revision` 是已审核的版本，`compatibility.qwenCodeVersion` 与 CLI/Harness 安装版本匹配，且 `compatibility.databaseSchema.latestMigrationVersion` 对目标数据库可接受。如果任何校验和或兼容性检查失败，则该发行版无效。

## 前置条件

- 可信应用主机上的 Linux。
- JDK 21 或更高版本。
- 与 `compatibility.node` 匹配的 Node.js 以及与 `compatibility.qwenCodeVersion` 匹配的 Qwen Code。
- MySQL 8，搭配空数据库或此前由较旧兼容参考发行版管理的数据库。
- 用于 Runtime 状态和授权 Workspace 的私有持久化目录。
- 稳定的数据库凭据、Runtime 凭据密钥环和 Harness token，存储在归档文件之外。

Java 归档文件不包含 npm CLI。请单独安装或构建精确兼容的 Qwen Code 版本，并定位其 `dist/cli.js` 以供 Runtime worker 使用。

## 启动 Hosted Harness

选择一个 token 和 capability digest，并将相同的值提供给 Harness 和 Java 服务：

```bash
export QWEN_MANAGED_AGENT_HARNESS_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_CAPABILITY_DIGEST='sha256:<64-hex-digest>'

QWEN_SERVER_TOKEN="$QWEN_MANAGED_AGENT_HARNESS_TOKEN" \
QWEN_HOSTED_HARNESS_CAPABILITY_DIGEST="$QWEN_MANAGED_AGENT_CAPABILITY_DIGEST" \
qwen serve --profile hosted-harness --port 4170 --hostname 127.0.0.1 --no-web
```

将 Harness 保持在 loopback 上。Hosted Harness profile 不会切换到其他端口：当 `--port` 被占用时，Harness 会启动失败并指出该端口。

## 启动 Java 控制平面

在另一个终端中，配置相同的 Harness、数据库以及现有的 Workspace 目录：

```bash
export SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:3306/qwen_managed_agent'
export SPRING_DATASOURCE_USERNAME='qwen'
export SPRING_DATASOURCE_PASSWORD='<private-password>'
export QWEN_MANAGED_AGENT_HARNESS_ENABLED='true'
export QWEN_MANAGED_AGENT_HARNESS_BASE_URL='http://127.0.0.1:4170'
export QWEN_MANAGED_AGENT_HARNESS_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_CAPABILITY_DIGEST='sha256:<64-hex-digest>'
export QWEN_MANAGED_AGENT_WORKSPACE_CWD='/srv/qwen-workspace'

bin/qwen-managed-agent-server
```

无法以环境变量形式表达的设置（如 Runtime 凭据密钥环）应放在 `config/application.yml` 中。从捆绑的模板开始，并保持该文件私有：

```bash
cp config/application.example.yml config/application.yml
chmod 600 config/application.yml
```

两个启动器在文件存在时都会自动加载它。启动器使用此归档文件中的服务端 JAR。Spring Flyway 在服务就绪前执行正向数据库迁移。等待以下命令返回成功：

```bash
curl --fail http://127.0.0.1:8080/actuator/health
```

启用的 Harness 会开启 Managed Session Store。Store 的基础 URL 默认使用此服务端的明文 loopback 监听器。其 workspace ID 默认使用 Runtime Broker 从 `QWEN_MANAGED_AGENT_WORKSPACE_CWD` 派生的 ID，因此在启用下方工具路径时身份保持一致。已设置 `QWEN_MANAGED_AGENT_WORKSPACE_ID` 的部署必须保留它：未绑定的 Session 根据该 ID 解析其 Store 作用域。仅当 Harness 通过其他地址访问此服务端，或监听器提供 TLS 时，才设置 `QWEN_MANAGED_AGENT_SESSION_STORE_BASE_URL`。

此基础配置支持纯文本 Hosted Session。除非配置了签名或认证入口，否则请将监听器保持在 loopback 上。完整的认证、API 和 capability 配置打包在 `docs/server-reference.md` 中。

## 引导凭据

`bin/qwen-managed-agent-bootstrap` 生成共享的 Harness token 和 capability digest、broker token、Runtime 凭据密钥以及数据库密码。它以 0600 模式写入 `config/harness.env`、`config/server.env`、`config/application.yml` 和 `config/mysql-setup.sql`，除非给出 `--force`，否则拒绝覆盖现有文件，并且仅打印路径：

```bash
bin/qwen-managed-agent-bootstrap
```

token 和 digest，以及工具路径的 Broker URL 和 token，仅写入 `harness.env`：`server.env` 通过 `QWEN_MANAGED_AGENT_HARNESS_CREDENTIALS_FILE` 引用该文件，控制平面从中读取。当该文件与 `QWEN_MANAGED_AGENT_HARNESS_TOKEN` 或 `QWEN_MANAGED_AGENT_CAPABILITY_DIGEST` 同时设置时，或者当该文件中的 Broker token 与 `QWEN_MANAGED_AGENT_RUNTIME_BROKER_TOKEN` 同时设置时，它拒绝启动，因此轮换只需更改一个文件。生成的 `harness.env` 和 `server.env` 可通过 shell source 加载，也是有效的 systemd `EnvironmentFile`。

`mysql-setup.sql` 创建 `qwen_managed_agent` 数据库和 `server.env` 中指定的 `qwen` 账户，同时为 `localhost` 和 `127.0.0.1` 创建，并授予 Flyway 所需的 `performance_schema` 权限。以 MySQL 管理员身份运行一次，例如 `mysql -u root < config/mysql-setup.sql`，然后删除它；`server.env` 保留密码。它在第一条失败的语句处停止，因此永远不会更改现有的数据库或账户。容器中的 MySQL 看到的是网关地址而不是 `127.0.0.1`；请为该主机创建账户。

对于 systemd 布局，以 root 身份运行并传入 `--directory /etc/qwen-managed-agent --service-user qwen-managed-agent`。该账户随后拥有 `harness.env` 和 `application.yml`，`server.env` 为 `0640 root:qwen-managed-agent`，新目录为 `0750 root:qwen-managed-agent`，而 `mysql-setup.sql` 仍归 root 所有。bootstrap 拒绝不存在的账户，或账户无法进入的目录。`server.env` 还记录 `QWEN_MANAGED_AGENT_SERVICE_USER`，因此预检会以该账户身份检查文件访问权限，即使以 root 身份运行也是如此。

## 预检

在首次启动前以及安装每个新构件后，使用 `--check` 运行捆绑的启动器。它绑定相同的配置（`config/application.yml` 加环境变量），不启动任何监听器，并为每个输入打印一行：

```bash
bin/qwen-managed-agent-server --check
```

它涵盖 JDK、服务账户、配置文件及其权限、凭据密钥环、启动属性验证、认证/绑定组合、Harness 可达性、Workspace 文件和 Shell 交叉设置（包括挂载、创建根或 SSH 节点要求）、broker 凭据和目录、Workspace `cwd`、可用端口和 MySQL 连接性、`performance_schema` 授权以及针对 `manifest.json` 的 Flyway 版本。`WARN` 和 `SKIP` 不会失败；任何 `FAIL` 都会以退出码 1 退出。端口检查会绑定配置的地址，因此请先停止服务。该命令不验证 Harness capability digest 或原生 Workspace 存储注册。

## systemd

该发行版包含针对已接受的单主机拓扑的 `systemd/` 单元和环境模板。控制平面单元使用 `KillMode=process`，以便 Runtime worker 在 Broker 重启后继续存活；Harness 单元使用 `KillMode=mixed`，以便其工具进程随它一起终止。按照 `systemd/README.md` 安装它们。

## 启用已接受的本地进程工具路径

工具执行需要现有的 fail closed（失败即拒绝）Runtime 和 Workspace 设置。至少需配置：

```bash
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_ENABLED='true'
# Omit when harness.env carries QWEN_MANAGED_RUNTIME_BROKER_TOKEN, as the bootstrap's does.
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY_ID='reference-v1'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY='<base64-encoded-32-byte-key>'
export QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY='/var/lib/qwen-managed-agent/runtime'
export QWEN_MANAGED_AGENT_NODE_EXECUTABLE='/usr/bin/node'
export QWEN_MANAGED_AGENT_RUNTIME_WORKER_ENTRY='/opt/qwen-code/dist/cli.js'
export QWEN_MANAGED_AGENT_RUNTIME_VERIFIED_WORKSPACE_RECOVERY_ENABLED='true'
```

Hosted Harness 通过自己的环境（而非命令行或上述控制平面的变量）访问同一个 Broker：设置 `QWEN_MANAGED_RUNTIME_BROKER_URL='http://127.0.0.1:4182'` 和 `QWEN_MANAGED_RUNTIME_BROKER_TOKEN` 为 `harness.env` 中的 Broker token，或者在启动 Harness 的任何环境中设置。`qwen serve` 在读取后会从环境中移除这两者，因此 Harness 启动的任何进程都不会继承该 token，并且控制平面会将 `QWEN_MANAGED_RUNTIME_BROKER_` 变量排除在 Runtime worker 之外。使用 bootstrap 的文件时，`harness.env` 已包含这两者，控制平面从该文件获取 Broker token，因此保持 `QWEN_MANAGED_AGENT_RUNTIME_BROKER_TOKEN` 未设置；同时设置两份副本会拒绝启动。这两行 Harness 变量必须一起设置或都不设置，每行都是普通的 `KEY=value` 行：启动拒绝只包含其中一行或任一行为空的文件，Harness 也会拒绝，以及 `export KEY=value` 形式的行（systemd 会忽略）。预检的 `broker-url` 行以 Harness 的 URL 解析器相同的方式读取文件中的 URL，因此 `http://127.1:4182` 等同于 `http://127.0.0.1:4182`。当该 URL 通过 `http` 指向 Broker 自己的监听器时通过。当 Harness 会拒绝该 URL 时失败（必须是 `http` 或 `https` origin，且纯 `http` 仅允许在 loopback 接口上使用），以及当它通过 `https` 指向监听器时失败（纯 HTTP 的 Broker 无法接受）。当 URL 指向其他地址或端口时警告（只有代理可以转发）；绑定到 loopback 之外特定地址的 Broker 需要 `QWEN_MANAGED_AGENT_RUNTIME_BROKER_ALLOW_NON_LOOPBACK=true`，总是这样访问。绑定到 `0.0.0.0` 的 Broker 也需要该设置，但仍然服务 loopback，Harness 在 `http://127.0.0.1:4182` 直接拨号，该行通过。IPv6 URL 如 `http://[::1]:4182` 在那里警告，因为该绑定仅在控制平面的 JVM 监听两个协议族时采用 IPv6，而在 `-Djava.net.preferIPv4Stack=true` 下不会。当文件没有 Broker URL 时也警告，这就是通过自己的环境或命令行获得该对的 Harness 在预检中的样子；那里的警告是预期的，将该对移入文件意味着从 `server.env` 中删除 `QWEN_MANAGED_AGENT_RUNTIME_BROKER_TOKEN`。

在准入文件、Shell 或子 Git worktree 工作之前，完成 `docs/server-reference.md` 中"Verified physical Workspace recovery"部分描述的原生存储注册和挂载身份验证。未注册或存在歧义的挂载必须保持不可用。公共 Shell 执行默认保持禁用。Shell 生命周期 v2 默认通告；显式的生命周期列表会替换默认值，空列表则禁用它。MCP 生命周期仍需显式包含。Capability 通告不构成部署资质认证。

## 运行部署

### 维护命令

`bin/qwen-managed-agent-admin <command> [arguments]` 通过 Spring Boot 的 `PropertiesLauncher` 从服务端 jar 运行离线维护入口点，如 `storage-registration`、`workspace-migration` 和 CSI 命令。不带参数运行可列出命令，对某个命令不带参数运行可查看其用法。与服务器启动器类似，当 `config/application.yml` 存在且未设置 `SPRING_CONFIG_ADDITIONAL_LOCATION` 时，它使用该文件。大多数打开数据库的命令使用自己的凭据而非 `server.env` 的 `SPRING_DATASOURCE_*`：Workspace 命令读取 `W1_JDBC_URL`、`W1_JDBC_USER` 和 `W1_JDBC_PASSWORD`，CSI 命令读取 `K2_JDBC_URL`、`K2_JDBC_USER` 和 `K2_JDBC_PASSWORD`。有两个例外：`operator-recovery` 和 `resident-retirement` 启动服务器的 Spring 配置并使用其数据源，因此它们从环境和 `config/application.yml` 中读取 `SPRING_DATASOURCE_URL`、`SPRING_DATASOURCE_USERNAME` 和 `SPRING_DATASOURCE_PASSWORD` 以及其他控制平面设置；使用加载了 `server.env` 的方式运行它们。`csi-protection` 不打开数据库，`resolved-configuration` 也不打开，后者打印服务器配置在当前运行环境中解析出的 Runtime 状态目录、认证模式和可信 actor header，以及控制平面的 URL、其健康端点和 Hosted Harness；升级命令以相同方式运行它来查找 Runtime 状态和这些 URL。每个命令都是一个带有自身前置条件的离线流程，随命令文档一起记录；运行前请满足这些条件。`bin/qwen-managed-agent-admin operator-recovery` 是 Hosted Shell 恢复流程的入口。

### 升级

在 systemd 布局中，新发行版的 `bin/qwen-managed-agent-upgrade` 分阶段运行升级。从解压并验证后的归档文件中以 root 身份运行每个阶段：

```bash
cd qwen-managed-agent-reference-<new-version>
# 传入 backup 获得的 check 选项，如 --skip-database。
bin/qwen-managed-agent-upgrade check
# 停止新的入站流量并等待已准入的工作完成。
bin/qwen-managed-agent-upgrade stop
bin/qwen-managed-agent-upgrade backup --to /var/backups/qwen-managed-agent/<date>
bin/qwen-managed-agent-upgrade install --backup /var/backups/qwen-managed-agent/<date>
# check 打印的手动步骤，如为 Harness 安装 Qwen Code。
bin/qwen-managed-agent-upgrade start
bin/qwen-managed-agent-upgrade verify --tenant <tenant> --turn
# 重新开放入站流量。
```

每个阶段都会重新读取单元、其环境文件和已安装的发行版，除非上一阶段将它们留在预期状态，否则拒绝继续，因此中断的升级会从失败的阶段恢复。`--server-unit` 和 `--harness-unit` 命名 `qwen-managed-agent-server` 和 `qwen-hosted-harness` 之外的单元；命令通过它们找到已安装的发行版、环境文件和服务账户。

- `check` 不做任何更改。它根据 `SHA256SUMS` 验证新发行版，比较两个发行版（版本、服务端 jar 中的 Flyway 脚本、Java、Node.js 和 Qwen Code），并读取 Harness Broker 设置、单元模板、已安装 `config/` 中的操作员文件和发行版布局。其 `backup-tools` 和 `runtime-state` 行告诉 `backup` 是否会在给定选项下运行，因此也将 backup 选项传给 `check`；它打印的计划会重复这些选项。重复值中的控制字符打印在 `...'` 内，bash、ksh 和 zsh 可以读回但 POSIX `/bin/sh` 不能；对包含该拼写的计划使用这些 shell 之一。它为每个输入打印一行，并在手动步骤出现的位置打印计划，任何 FAIL 都会以退出码 1 退出。当新发行版更改或移除了已安装数据库运行过的脚本时，`database` 行失败：在首个正式发行版之前，发行版可能会就地重写其 schema 基线，这样的发行版无法在现有数据库上启动。当发行版添加了一个未排序在已安装数据库运行过的最新脚本之后的版本化脚本时，它也会失败，Flyway 拒绝应用这样的脚本。
- `stop` 重复 `backup-tools` 之上的检查，除非通过否则不停止任何内容。`backup-tools` 和 `runtime-state` 行仅门控 `backup`，因此在 `stop` 之前用 `check` 解决它们。它停止控制平面，停止 `KillMode=process` 留在其 cgroup 中的 Runtime worker 并等待它们（`--timeout`，默认 60 秒），然后停止 Harness。它计算 cgroup systemd 名称中的 worker 数量，在统一层次结构中或在 cgroup v1 上使用 systemd 自己的名称，无法读取该 cgroup 时拒绝。一旦安装了新发行版，`stop` 会跳过检查，因此它也会停止 `start` 留下的运行中的控制平面。JVM 在 `SIGTERM` 时以退出码 143 退出，因此没有模板的 `SuccessExitStatus=143` 安装的控制平面单元在停止后显示为 `failed`；`stop` 会说明这一点，一旦模板的更改被迁移，`systemctl reset-failed` 会清除状态。
- `backup --to <new empty directory>` 需要两个单元都已停止且没有遗留 worker，并在新发行版安装后拒绝，因为其 `from.release` 会命名新发行版。已存在的目录必须为空且属于 root。它使用 `mysqldump` 写入 `database.sql`，通过备份外临时目录中的选项文件传递单元的 `SPRING_DATASOURCE_*` 凭据，而不是在命令行上传递；`mysqldump` 不读取其他选项文件，因此 root 的 `~/.my.cnf` 无法替换它们。它写入 Runtime 状态目录的 `runtime-state.tar`、单元文件及其环境文件、Harness 凭据文件和 `SPRING_CONFIG_ADDITIONAL_LOCATION` 文件的 `configuration.tar`，以及已安装 `config/` 和发行版中任何这些文件的 `release-config.tar`，按其在发行版中的路径记录。符号链接的文件作为链接和其指向的文件一起写入。每个文件在 `0700` 目录中为 `0600`，最后写入的 `backup.json` 记录其校验和、转储所在的数据库，以及 `install` 将前一发行版留在的位置。`--mysqldump <path>` 命名另一个客户端，`--skip-database` 在数据库通过其他方式备份时跳过转储。失败的备份，或被 `SIGINT`、`SIGTERM` 或 `SIGHUP` 终止的备份，会移除其写入的内容和选项文件。`SIGKILL` 不移除任何内容；移除它留下的 `${TMPDIR:-/tmp}/qwen-managed-agent-upgrade-*` 目录，其中包含凭据。
  - `check` 和 `backup` 从服务端自身的配置获取 Runtime 状态目录。它们以控制平面单元运行服务端的方式运行新发行版的服务端 jar：使用其账户、工作目录和环境，以及当 `SPRING_CONFIG_ADDITIONAL_LOCATION` 未设置或为空时启动器的默认 `config/application.yml`。jar 以服务端的方式准备 Spring 的环境，因此每个配置文件、导入和 profile 都算数，`SPRING_APPLICATION_JSON`、来自 `JAVA_TOOL_OPTIONS` 的系统属性和宽松名称也算，相对目录在单元的工作目录中解析。它不启动任何内容也不打开任何连接。当无法解析配置，或单元传递了启动器参数（`systemctl` 不会精确打印这些参数）时，`backup` 拒绝直到 `--runtime-state <directory>` 命名服务端使用的目录，或 `--runtime-state none` 表示不保留任何目录。没有配置的目录时，如在没有工具路径的部署上，`backup` 不归档 Runtime 状态并说明这一点。
- `install --backup <directory>` 拒绝其他发行版的备份、已更改的备份文件、控制平面已启动过的备份，以及非单元 `SPRING_DATASOURCE_URL` 命名的数据库的备份。它将发行版复制到 `<distribution>-releases/<version>`，如 `/opt/qwen-managed-agent-releases/<version>`（`--releases` 命名另一个目录；对每个阶段传递相同的目录），从已安装 `config/` 复制操作员文件并保留其所有者和模式，并通过一次重命名将发行版路径指向新发行版。副本自身的文件，即 `SHA256SUMS` 列出的文件，使每个账户都可读，因此服务账户可以运行以限制性 umask 解压的发行版。首次运行将已安装目录移动到 `<releases>/<old version>` 并在其位置放置链接，因此单元保持其路径。前一发行版保持在原位。现有的 `<releases>/<version>`，如解压到那里的归档文件，仅在其 `SHA256SUMS` 是新发行版的且文件匹配时使用，其列出的文件以相同方式变为可读；失败的副本会被移除。首次运行的两次重命名之间的崩溃会在缺失的发行版路径旁留下 `<distribution>.upgrade-<suffix>`；每个阶段随后命名完成安装的 `mv -T`。另一步骤中被终止的安装可能在发行版目录中留下部分副本 `.<version>.partial-<suffix>`、发行版路径旁的 `<distribution>.upgrade-<suffix>` 链接，或新发行版 `config/` 中操作员文件的 `.tmp-<suffix>` 副本；`layout` 行列出它们，下一次 `install` 会移除它们。后缀是 `install` 生成的八个十六进制数字，因此操作员自己的 `<distribution>.upgrade-backup` 不会被触及。在发行版安装后再次运行，如中断的会话后，`install` 会说明这一点并指向 `start`。
- `start` 在 `install` 之前拒绝，在 Harness Broker 设置仍需要下方步骤 5 时也拒绝。它启动 Harness，或重启早期 `start` 留下的运行中的 Harness 以便读取此后修复的内容，以服务账户和单元环境运行 `bin/qwen-managed-agent-server --check`，仅在该检查通过时启动控制平面，并等待健康的 actuator（`--timeout`，默认 300 秒；一次探测最多等待 5 秒）。Flyway 在此启动期间迁移 schema。在健康��前退出的控制平面会被停止并报告，即使是 systemd 的 `Restart=on-failure` 在再次运行时会重新启动的那个：迁移 schema 的启动期间的退出值得在 `start` 再次运行前在日志中查看。在超时时仍不健康的继续保持运行；查看其日志，然后运行 `verify`，或 `stop` 并再次 `start`。
  - `start` 和 `verify` 以相同方式查找 Harness、控制平面及其健康端点，因此在 `server.env` 不显示的端口或地址也算：在配置文件中、在命令行上或在 `SPRING_APPLICATION_JSON` 中。Harness 在 `qwen.managed-agent.harness.base-url` 指定的位置。控制平面在 `server.port`、`server.address` 和 `server.ssl` 绑定的位置，通配符地址通过 loopback 接口访问，健康端点遵循 Spring Boot 的管理设置：`management.server.port` 将其移动到该端口，在 `management.server.address` 上和 `management.server.base-path` 下。`--server-url <url>` 命名控制平面，例如在代理后面，健康端点随后是 `<url>/actuator/health`。阶段仅检查它拨号的 URL：两者都探测健康端点，`verify --tenant` 在认证模式为 `open` 时也读取 API，以及当 `--actor` 时，服务端命名可信 actor header。0 或更小的端口没有可等待的 URL，因此阶段拒绝直到 `--server-url` 命名一个；它还拒绝 `fetch` 拒绝拨号的 URL：带区域的链路本地 IPv6 地址、Fetch 标准阻止的端口（如 6000），或没有 `http://` 或 `https://` 的 `--server-url`、带用户名或密码（拒绝时打印为 `***` 直到最后一个 ` @`）、带查询或片段（追加到其后的路径会落入其中），或带任何其他 ` @`（可能是以数字开头的密码的其余部分，在路径中将 ` @` 写为 `%40`），`check` 以相同方式判断 `--server-url`：`start` 同样拒绝不是 `http` 或 `https` 的 Harness URL，以及在 Harness 启用时服务端 Harness 连接器会拒绝的 URL：除了带主机且无凭据、查询或片段的 `http` 或 `https` URL 之外的任何内容，因为服务端用 `java.net.URI` 读取它，因此带下划线的主机名也会被拒绝；当配置无法解析时，`start` 只接受纯 `http` 或 `https` URL、`java.net.URI` 和 `fetch` 都读取的带最多五位数字端口和 URI 字符路径的主机，其余留给预检。当健康端点不报告 UP 时，`start` 和 `verify` 说明它最后回答的内容；对于此主机不信任的证书，运行命令时将 `NODE_EXTRA_CA_CERTS` 指向其 CA。当配置无法解析，或单元传递启动器参数时，它们使用 `server.env` 命名的 URL 并打印说明这一点的行。
- `verify` 以相同方式运行 `--check --online` 并读取 actuator，等待最多 `--timeout`（默认 300 秒）的回答。使用 `--tenant <id>`，它读取租户最近的 Session 及其 Items，在 `--turn` 创建一个之前；`--turn` 创建一个 Session 并等待一个轮次，这会调用模型，在 `5xx` 回答或连接断开时轮询过去；当跳过 Session 读取时，`turn` 行会说明。没有请求超过 `--timeout`。没有 actor 的请求只列出 Workspace 之外的 Session；`--actor <id>` 通过 `QWEN_MANAGED_AGENT_TRUSTED_ACTOR_HEADER` 命名的 header 发送一个。`verify` 以 `backup` 读取 Runtime 状态目录的方式读取认证模式，签名认证跳过两种读取；改为通过入站读取 Session。

该命令仅启动和停止单元。它从不停止入站流量、安装 Qwen Code、编辑环境或单元文件，或删除发行版。当 `check` 警告单元模板已更改时，将更改迁移到已安装单元并在 `start` 之前运行 `systemctl daemon-reload`。

#### 手动流程

其他布局遵循这些步骤。在 systemd 布局中，命令运行 `stop`、`backup`、`install`、`start` 和 `verify`，`check` 打印它留给操作员的步骤及其位置：停止和重新开放入站流量、安装 Qwen Code 以及在步骤 5 中编辑 `harness.env`，以及迁移已更改的单元模板。

1. 下载并验证新归档文件，阅读两份清单。在操作运行中的部署之前，确认新的 Qwen Code/Harness、Java、协议和数据库要求。
2. 停止新的入站流量。根据部署现有的 drain 流程等待已准入的工作完成。
3. 备份 MySQL、`QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY`、完整的 Runtime 凭据密钥环、操作员拥有的 `server.env` 和 `harness.env`，以及精确的旧发行版。发行版升级期间不要轮换凭据密钥。
4. 停止 Java 服务和 Hosted Harness。保留 Workspace 和持久化 Runtime 状态。随附的控制平面单元使用 `KillMode=process`，因此 `systemctl stop` 会使 Runtime worker 继续运行；在启动新版本之前，使用 `systemctl kill --kill-whom=all -s TERM qwen-managed-agent-server` 收割它们。
5. 安装清单兼容的 Qwen Code/Harness，并使用现有 token 和 capability digest 启动。在工具路径主机上，首先将 `harness.env` 中的任何 `QWEN_HOSTED_HARNESS_BROKER_ARGS` 行替换为 `QWEN_MANAGED_RUNTIME_BROKER_URL` 和 `QWEN_MANAGED_RUNTIME_BROKER_TOKEN`：没有代码再读取该行，因此没有它们 Harness 启动时不带 Broker。当 `server.env` 启用 Harness 并将 `harness.env` 指定为其凭据文件时（如 bootstrap 的文件那样），还要从 `server.env` 中删除 `QWEN_MANAGED_AGENT_RUNTIME_BROKER_TOKEN`；控制平面随后从 `harness.env` 获取 token，保留两份副本会拒绝启动。之前的发行版不读取任何新行，并且在没有已删除 token 的情况下拒绝启动其 Broker，因此回退到它会从步骤 3 的备份恢复这两个文件。
6. 使用相同的数据库和持久化设置启动新的 `bin/qwen-managed-agent-server`。Flyway 将正向迁移 schema。
7. 要求 actuator 健康检查通过，读取现有 Session 和历史记录，然后在重新开放入站流量之前完成一个新的无工具轮次。在启用任何可选工具 capability 之前重新进行资质认证。

不支持数据库降级。如果在流量恢复之前启动或验证失败，请修正配置并使用同一构件重试。要回退到清单中 schema 范围较旧的版本，请在接受任何新写入之前同时恢复升级前的数据库和 Runtime 状态备份；切勿假设性地对已迁移的数据库运行旧版服务端。

### 轮换 Runtime 凭据密钥

轮换凭据密钥应独立于发行版升级进行。先备份数据库和当前密钥，然后配置新的活动密钥对，并将旧密钥对保留在 `previous-credential-keys` 下：

```yaml
qwen:
  managed-agent:
    runtime-broker:
      credential-key-id: reference-v2
      credential-key: <base64-encoded-32-byte-v2-key>
      previous-credential-keys:
        '[reference-v1]': <base64-encoded-32-byte-v1-key>
```

每个 map key 都必须用 `[ ... ]` 包裹。Spring 的宽松绑定会规范化普通 key——诸如 `legacy/v1`、`legacy:v1` 或 `legacy v1` 这样的 ID 无论是否在 YAML 中加引号，都会被绑定为 `legacyv1`——导致密钥环永远无法匹配已持久化的 key ID，该 ID 下写入的行即使配置了密钥也仍然无法读取。方括号形式可保留精确的 ID。

重启唯一的 Java 控制平面，验证现有绑定可以加载，并验证新的绑定行记录的是 `reference-v2`。新密钥仅使用活动密钥；旧行仍在其记录的 key ID 下加密。服务端不会在读取时重新加密旧行，移除仍在被引用的密钥会使这些行无法读取。

仅当没有已持久化的行引用 `reference-v1` 时才将其退役。Runtime 绑定、完整的 Session 模型配置和 extension 设置保留 key ID。按字节比较它们，以便大小写或重音差异不会隐藏仍然需要的密钥：

```sql
SELECT DISTINCT credential_key_id AS key_id
FROM ma_runtime_binding WHERE credential_key_id IS NOT NULL
UNION
SELECT DISTINCT runtime_credential_key_id AS key_id
FROM ma_runtime_binding WHERE runtime_credential_key_id IS NOT NULL
UNION
SELECT DISTINCT CAST(model_config_key_id AS BINARY) AS key_id
FROM ma_session WHERE model_config_key_id IS NOT NULL
UNION
SELECT DISTINCT CAST(encryption_key_id AS BINARY) AS key_id
FROM ma_extension_settings WHERE encryption_key_id IS NOT NULL;
```

结果列出已持久化行仍然需要的 key ID。保持每个返回的密钥都已配置；仅当 `reference-v1` 不在结果中时才可以将其退役。

Session 模型配置只写入一次；关闭或删除 Session 会保留其行。Extension 设置保留早期修订。轮换活动密钥不会重新加密或移除这些记录，因此它们的旧 key ID 在记录保留期间会留在结果中。此流程不提供重新加密或物理清除步骤；保持所需密钥已配置，不要为了清除检查而删除行。

密钥环是一个 map，不能通过 `QWEN_MANAGED_AGENT_*` 环境变量提供：宽松绑定会静默地将环境变量形式解析为空或错误 key 的密钥环，且不会报启动错误。在 `config/application.yml` 中配置 `previous-credential-keys`。该发行版附带 `config/application.example.yml`，并且当该文件存在时，两个启动器都会导出 `SPRING_CONFIG_ADDITIONAL_LOCATION=file:<distribution-root>/config/application.yml`，因此位置不再依赖于进程工作目录，也不会在命令的位置参数中添加任何选项。当该变量已设置时，启动器会保持其生效。仅依赖环境变量的部署启动时密钥环为空，因此在未配置旧密钥的情况下轮换 `credential-key-id` 会使该密钥下写入的行无法读取。显式的 `--spring.config.additional-location` 命令行参数优先于此环境默认值；当两者同时存在时，命令行值获胜，捆绑的 `config/application.yml` 不会被加载。

操作员恢复入口读取与服务端相同的活动密钥对和 `previous-credential-keys` map。其启动器以相同方式加载 `config/application.yml`；当文件位于其他位置时，设置 `SPRING_CONFIG_ADDITIONAL_LOCATION=file:<absolute-path>/application.yml`。保持新密钥为活动密钥，同时保留绑定仍在引用的每一个密钥。CSI/迁移维护主入口（包括 CSI Hosted 探针）仍然读取单个凭据密钥对；启动这些入口时，以加密其目标绑定的密钥作为活动密钥对。

成功配置密钥环后，服务端和恢复入口会在每个 protector 实例启动时记录一次已解析的活动 ID 和已配置的 ID。这些 ID 本身不是密钥材料，已经和密文一起存储；诊断信息会对控制字符和非 ASCII 字符进行 JSON 转义，保留空格和大小写，且永远不会包含密钥材料、密文或 token。在使用轮换后的部署前，需要将已配置的 ID 与退役查询返回的精确 ID 进行对比。不可用密钥错误会列出请求的、活动的和已配置的 ID，因此即使存在静默规范化或拼写错误的映射，也能在不暴露密钥的前提下定位问题。该诊断不能证明所有已存储的行都可以被解密。

### 操作员恢复

`bin/qwen-managed-agent-admin operator-recovery` 从可执行服务端 jar 运行恢复入口点。除非设置了恢复专用环境变量，否则该入口点处于禁用状态，且不会启动 HTTP 服务或 worker。请遵循 `docs/hosted-workspace-recovery.md`；切勿推断物理停止或删除持久化行来绕过安全围栏。

## 范围边界

本发行版不认证多个 Java 控制平面、跨主机接管、公共 CSI、Kubernetes 退役、公共 Shell、v2 通告或稳定的生产支持。这些能力需要单独的发行版证据。