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

将 Harness 保持在 loopback 上。记录其报告的端口；当请求的端口已被占用时，`--port` 可能会自动递增。

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

`bin/qwen-managed-agent-bootstrap` 生成共享的 Harness token 和 capability digest、broker token 以及 Runtime 凭据密钥。它以 0600 模式写入 `config/harness.env`、`config/server.env` 和 `config/application.yml`，除非给出 `--force`，否则拒绝覆盖现有文件，并且仅打印路径：

```bash
bin/qwen-managed-agent-bootstrap
```

生成的 `harness.env` 和 `server.env` 可通过 shell source 加载，也是有效的 systemd `EnvironmentFile`。传入 `--directory /etc/qwen-managed-agent` 以使用 systemd 布局，填写 `SPRING_DATASOURCE_PASSWORD`，并将所有权调整为服务账户。

## 预检

在首次启动前以及安装每个新构件后，使用 `--check` 运行捆绑的启动器。它绑定相同的配置（`config/application.yml` 加环境变量），不启动任何监听器，并为每个输入打印一行：

```bash
bin/qwen-managed-agent-server --check
```

它涵盖 JDK、配置文件及其权限、凭据密钥环、启动属性验证、认证/绑定组合、Harness 可达性、Workspace 文件和 Shell 交叉设置（包括挂载、创建根或 SSH 节点要求）、broker 凭据和目录、Workspace `cwd`、可用端口和 MySQL 连接性、`performance_schema` 授权以及针对 `manifest.json` 的 Flyway 版本。`WARN` 和 `SKIP` 不会失败；任何 `FAIL` 都会以退出码 1 退出。端口检查会绑定配置的地址，因此请先停止服务。该命令不验证 Harness capability digest 或原生 Workspace 存储注册。

## systemd

该发行版包含针对已接受的单主机拓扑的 `systemd/` 单元和环境模板。控制平面单元使用 `KillMode=process`，以便 Runtime worker 在 Broker 重启后继续存活；Harness 单元使用 `KillMode=mixed`，以便其工具进程随它一起终止。按照 `systemd/README.md` 安装它们。

## 启用已接受的本地进程工具路径

工具执行需要现有的 fail closed（失败即拒绝）Runtime 和 Workspace 设置。至少需配置：

```bash
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_ENABLED='true'
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY_ID='reference-v1'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY='<base64-encoded-32-byte-key>'
export QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY='/var/lib/qwen-managed-agent/runtime'
export QWEN_MANAGED_AGENT_NODE_EXECUTABLE='/usr/bin/node'
export QWEN_MANAGED_AGENT_RUNTIME_WORKER_ENTRY='/opt/qwen-code/dist/cli.js'
export QWEN_MANAGED_AGENT_RUNTIME_VERIFIED_WORKSPACE_RECOVERY_ENABLED='true'
```

在准入文件、Shell 或子 Git worktree 工作之前，完成 `docs/server-reference.md` 中"Verified physical Workspace recovery"部分描述的原生存储注册和挂载身份验证。未注册或存在歧义的挂载必须保持不可用。公共 Shell 和 v2 capability 通告在其单独资质认证完成之前保持禁用。

## 升级

1. 下载并验证新归档文件，阅读两份清单。在操作运行中的部署之前，确认新的 Qwen Code/Harness、Java、协议和数据库要求。
2. 停止新的入站流量。根据部署现有的 drain 流程等待已准入的工作完成。
3. 备份 MySQL、`QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY`、Runtime 凭据密钥以及精确的旧发行版。升级期间不要轮换凭据密钥。
4. 停止 Java 服务和 Hosted Harness。保留 Workspace 和持久化 Runtime 状态。随附的控制平面单元使用 `KillMode=process`，因此 `systemctl stop` 会使 Runtime worker 继续运行；在启动新版本之前，使用 `systemctl kill --kill-whom=all -s TERM qwen-managed-agent-server` 收割它们。
5. 安装清单兼容的 Qwen Code/Harness，并使用现有 token 和 capability digest 启动。
6. 使用相同的数据库和持久化设置启动新的 `bin/qwen-managed-agent-server`。Flyway 将正向迁移 schema。
7. 要求 actuator 健康检查通过，读取现有 Session 和历史记录，然后在重新开放入站流量之前完成一个新的无工具轮次。在启用任何可选工具 capability 之前重新进行资质认证。

不支持数据库降级。如果在流量恢复之前启动或验证失败，请修正配置并使用同一构件重试。要回退到清单中 schema 范围较旧的版本，请在接受任何新写入之前同时恢复升级前的数据库和 Runtime 状态备份；切勿假设性地对已迁移的数据库运行旧版服务端。

## 轮换 Runtime 凭据密钥

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

仅当没有已持久化的行引用 `reference-v1` 时才将其退役。`ma_runtime_binding.credential_key_id` 和 `ma_runtime_binding.runtime_credential_key_id` 是仅有的持久化引用；两者都存储 UTF-8 字节。查询时不要使用 `CONVERT`，以便去重保持字节级精确，与密钥选择的方式一致：转换后的值会携带字符集的默认排序规则，会将仅大小写或重音不同的两个 ID 合并，从而隐藏行仍在引用的密钥。

```sql
SELECT DISTINCT credential_key_id AS key_id
FROM ma_runtime_binding WHERE credential_key_id IS NOT NULL
UNION
SELECT DISTINCT runtime_credential_key_id AS key_id
FROM ma_runtime_binding WHERE runtime_credential_key_id IS NOT NULL;
```

结果列出已持久化行仍然需要的 key ID：预期只有活动 ID（`reference-v2`）。只要 `reference-v1` 出现，该密钥就必须保持配置。

密钥环是一个 map，不能通过 `QWEN_MANAGED_AGENT_*` 环境变量提供：宽松绑定会静默地将环境变量形式解析为空或错误 key 的密钥环，且不会报启动错误。在 `config/application.yml` 中配置 `previous-credential-keys`。该发行版附带 `config/application.example.yml`，并且当该文件存在时，两个启动器都会导出 `SPRING_CONFIG_ADDITIONAL_LOCATION=file:<distribution-root>/config/application.yml`，因此位置不再依赖于进程工作目录，也不会在命令的位置参数中添加任何选项。当该变量已设置时，启动器会保持其生效。仅依赖环境变量的部署启动时密钥环为空，因此在未配置旧密钥的情况下轮换 `credential-key-id` 会使该密钥下写入的行无法读取。显式的 `--spring.config.additional-location` 命令行参数优先于此环境默认值；当两者同时存在时，命令行值获胜，捆绑的 `config/application.yml` 不会被加载。

操作员恢复入口读取与服务端相同的活动密钥对和 `previous-credential-keys` map。其启动器以相同方式加载 `config/application.yml`；当文件位于其他位置时，设置 `SPRING_CONFIG_ADDITIONAL_LOCATION=file:<absolute-path>/application.yml`。保持新密钥为活动密钥，同时保留绑定仍在引用的每一个密钥。CSI/迁移维护主入口（包括 CSI Hosted 探针）仍然读取单个凭据密钥对；启动这些入口时，以加密其目标绑定的密钥作为活动密钥对。

成功配置密钥环后，服务端和恢复入口会在每个 protector 实例启动时记录一次已解析的活动 ID 和已配置的 ID。这些 ID 本身不是密钥材料，已经和密文一起存储；诊断信息会对控制字符和非 ASCII 字符进行 JSON 转义，保留空格和大小写，且永远不会包含密钥材料、密文或 token。在使用轮换后的部署前，需要将已配置的 ID 与退役查询返回的精确 ID 进行对比。不可用密钥错误会列出请求的、活动的和已配置的 ID，因此即使存在静默规范化或拼写错误的映射，也能在不暴露密钥的前提下定位问题。该诊断不能证明所有已存储的行都可以被解密。

## 操作员恢复

`bin/qwen-managed-agent-operator-recovery` 启动单独打包的恢复入口点。除非设置了恢复专用环境变量，否则该入口点处于禁用状态，且不会启动 HTTP 服务或 worker。请遵循 `docs/hosted-workspace-recovery.md`；切勿推断物理停止或删除持久化行来绕过安全围栏。

## 范围边界

本发行版不认证多个 Java 控制平面、跨主机接管、公共 CSI、Kubernetes 退役、公共 Shell、v2 通告或稳定的生产支持。这些能力需要单独的发行版证据。