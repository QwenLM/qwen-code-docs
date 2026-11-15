# CI 与发布变量

CI 与发布流程的若干可调节参数以 GitHub Actions 仓库变量（`vars.*` 上下文）的形式暴露，运维人员无需提交 pull request 即可调整。本页列出影响 `.github/workflows/ci.yml` 与 `.github/workflows/release.yml` 中测试执行的变量，以及它们的默认值和适用范围。

## 设置变量

仓库维护者在 **Settings → Secrets and variables → Actions → Variables** 下设置这些变量。未设置（或为空）的变量将使用工作流表达式中的回退值。worker 上限仅在 reserved runner（预留运行器）上生效，即使其变量已设置也是如此。

工作流文件是这些参数的权威来源，测试套件逐字节固定工作流表达式：`scripts/tests/package-scripts.test.js` 固定 `release.yml` 中共享的 worker 上限表达式（带 `ecs-qwen-` 守卫的 `QWEN_CI_VITEST_MAX_WORKERS`），`scripts/tests/no-ak-integration-ci.test.js` 固定 `ci.yml` 中的 worker 上限表达式，`scripts/tests/release-workflow.test.js` 固定 `release.yml` 的重试和工作区测试超时表达式。`scripts/tests/package-scripts.test.js` 还会对照两个工作流检查文档中记录的默认值和工作流位置。由于此守卫在完整配置 CI 通道（`test:scripts`）上运行，而非仅在文档检查上运行，请在提交 pull request 之前使用 `npm run test:scripts`（或 `npx vitest run --config ./scripts/tests/vitest.config.ts scripts/tests/package-scripts.test.js`）在本地验证仅修改本页的编辑。如果文档与工作流不一致，以工作流为准，并在同一变更中更新本页。

## 变量

| 变量                                       | 默认值 | 使用位置                | 控制内容                                                                        |
| ------------------------------------------ | ------ | ----------------------- | ------------------------------------------------------------------------------- |
| `QWEN_CI_VITEST_RETRY`                     | `2`    | `ci.yml`                | 主 CI 工作区和脚本测试步骤的重试次数                                            |
| `QWEN_CI_HOST_LOAD_MAX_RATIO`              | `2.0`  | `ci.yml`                | 在单元测试套件启动前拒绝自托管 Linux 主机的每 CPU 负载上限                      |
| `QWEN_CI_RPC_RETRY`                        | `1`    | `ci.yml`                | 仅因 Vitest worker RPC 超时而失败的全绿工作区套件的重跑次数                     |
| `QWEN_RELEASE_VITEST_RETRY`                | `2`    | `release.yml`           | 发布工作区测试分片的重试次数                                                    |
| `QWEN_RELEASE_WORKSPACE_TIMEOUT_MINUTES`   | `45`   | `release.yml`           | 发布流水线中每个发布工作区测试分片的作业超时时间                                            |
| `QWEN_CI_VITEST_MAX_WORKERS`               | `4`    | `ci.yml`、`release.yml` | reserved runner 上主 CI 单元测试与发布工作区/质量测试的 worker 上限             |

### 重试次数

`QWEN_CI_VITEST_RETRY` 和 `QWEN_RELEASE_VITEST_RETRY` 分别作为 `--retry=<n>` 传递给 Vitest，用于主 CI 测试步骤（每个工作区的 `test:ci`，该步骤在两个并发通道中运行，以及 `npm run test:scripts:unit`）和发布通道（`npm run test:release:workspaces`）。两个通道使用独立变量，以便分别调节。

Vitest 在同一次运行中重跑失败的测试。这有助于应对偶发的资源争用，但在重试预算内恢复的失败会将检查标记为通过，且不会被 flaky-rerun 跟踪器记录为失败。应保持预算适度，而非用重试来掩盖不稳定的测试套件。两个变量也接受字面值 `off`，此时完全省略 `--retry` 标志，而非传递 `--retry=0`（命令行的 `--retry=0` 会覆盖工作区自身的 Vitest 配置，并禁用有意的重试策略）。

### 争用主机上的 Worker RPC 超时

`QWEN_CI_RPC_RETRY` 是一个与 `--retry` 不同的调节手段：它会重跑整个工作区套件，且仅当该套件自身的报告显示没有失败的测试，并且 Vitest 的 worker 到 main 的 RPC 预算（`Timeout calling "onTaskUpdate"`）是唯一的未处理错误时才会触发。在此资源池上，这种情况是主机争用而非回归——main 的运行 43018456551 和 43016357976 都在 `packages/channels/github` 中以 902 个测试全部通过但仍变红。第一次尝试保留 npm 自身的批处理调用；只有被 npm 标记为失败的工作区才会被重跑，每个单独重跑。

发布通道已在其自己的分片上授予相同的通过规则（`.github/scripts/run-release-workspace-tests.sh`），证据规则由 `scripts/tests/release-workflow.test.js` 固定在那里：运行必须达到通过的计数，不得被信号杀死，并且 Vitest 自身的未处理错误计数必须等于报告中传输超时的数量。是计数，而非崩溃标题——标题由生产者选择，因此任何基于标题的模式都是不完整的。`Errors` 数字是整个报告的总和，而传输数字仅在 Vitest 的 `Unhandled Errors` 部分内计数——测试的控制台输出也会在列 0 处回显，因此打印的副本不能移动它——并且在这些部分内，它匹配错误自身的标题行（列 0 处的 `Error: [vitest-worker]: Timeout calling`），而不仅仅是引用该前缀的消息、堆栈或代码帧。因此一次尝试的绿色计数无法掩盖后续尝试的崩溃。

Linux 通道故意将未处理错误保持为致命（`scripts/tests/unit-vitest-configs.test.ts`，#10438），因此这不会忽略它们：任何失败的测试、任何第二个未处理错误，或在报告之前死去的进程都会拒绝重试。超过两次尝试的停滞仍然会失败。设置 `0` 可使第一次失败成立。

**计数是唯一的界限。** 重跑没有时间条件：此通道的早期版本曾在测试步骤预算剩余不到一半时跳过重跑，该守卫被移除而非修复。它在预算的 74% 处拒绝重跑，因为它将批次的运行时间计算了两次，而从通道脚本内部无法获得正确的版本——步骤在脚本之前启动（`chown -R`、`mktemp`、磁盘采样器），因此脚本自身的 `SECONDS` 并非步骤的时钟，而从工作流传入步骤的起始时间会比它所避免的单次截断引入更多的新表面。被接受的成本：足够晚发出的重跑可能被步骤的 `timeout-minutes: 45` 杀死。当这种情况发生时作业会失败，并且第一次尝试的日志仍然存在，因为第一次尝试被 tee 到文件中——保留证据的截断，而非在四分之一的预算未使用的情况下丢弃重试的拒绝。

### 主机负载准入

`QWEN_CI_HOST_LOAD_MAX_RATIO` 是单元测试分片中 `Host load gate (self-hosted)` 步骤的每 CPU 负载上限。该 gate 从 `/proc/loadavg` 采样五分钟负载平均值并与 `nproc` 对比，最多等待六个样本，间隔十秒，只要有一个样本低于上限就立即准入作业。仍处于或高于上限的主机会在套件启动前使该步骤失败。

该 gate 无法移动作业：GitHub 已经放置了它，只有重跑才会将其落到另一台主机上。它改变的是作业何时失败。旁边的磁盘 floor gate 基于空闲字节和 inode 准入，而这无法说明 CPU 争用；在 2026-11-11，hk1 资源池在负载 53-98 下运行 64 CPU 主机，有 28-140 个并发 Vitest 进程，正是这种占用率耗尽了 60 秒的测试预算、Vitest 的 worker 到 main 的 RPC 预算，以及测试步骤的整个 45 分钟预算。拒绝会耗费已花费的安装成本并返还该预算，并提示重新运行而非分支作者导致的测试失败。

**该 gate 是后盾，而非预测器。** 默认值 `2.0` 根据 2026-11-11 失败的分片以及同一小时内同一资源池通过的四个分片的每 CPU 五分钟负载平均值校准：

| 分片 | 主机   | 入口时 | 中位数 | 峰值 | 结果                   |
| ---- | ------ | ------ | ------ | ---- | ---------------------- |
| 2/2  | hk1-4  | 1.34   | 1.43   | 1.54 | worker RPC 超时        |
| 2/2  | hk1-30 | 1.45   | 1.42   | 1.54 | worker RPC 超时        |
| 2/2  | hk1-29 | 0.85   | 1.42   | 1.54 | 45 分钟步骤超时        |
| 1/2  | hk1-7  | 0.94   | 1.40   | 1.49 | 通过                   |
| 2/2  | hk5-27 | 1.03   | 1.03   | 1.19 | 通过                   |
| 1/2  | hk2-32 | 0.75   | 0.97   | 1.18 | 通过                   |
| 1/2  | hk3-28 | 0.48   | 0.67   | 0.87 | 通过                   |

这些区间存在重叠。一个通过的主机达到了 1.49，而一个失败的主机从 0.85 开始——占用率在运行期间增长，并且三个失败的主机中只有两个在套件开始时已经处于争用状态。没有任何入口时的阈值能够将它们分开，因此一个足够严格以捕捉那两个争用主机的上限也会拒绝那些明确通过的主机。`2.0` 位于每个完成了其套件的主机上测量的每个读数之上：它拒绝了一个这些样本都没有存活的主机，并且不会对表中的任何事件触发。收紧它应当预期会产生误拒绝；再提高则会使 gate 失效。

表中的 RPC 抖动是一个不同的问题，此 gate 并非其修复方案：决定它需要套件自身的报告，而套件运行之前该报告并不存在。#16945 为那种情况添加了一个通道级的重跑——全绿报告且唯一的未处理错误是 worker RPC 超时。两者相互独立，可以分别调节或禁用。

该上限是一个比率，而非绝对负载，因为资源池混合了不同规格的主机。在调整集群大小时设置 `off` 可准入每个主机。该 gate 仅在自托管 Linux 上运行；GitHub 托管和 macOS 通道不受影响，并且无法读取的 CPU 计数或负载平均值，或缺少 `awk`，会以警告准入作业而非阻塞通道。格式错误的阈值会作为配置错误失败，而非静默禁用该 gate。

### 工作区测试超时

`QWEN_RELEASE_WORKSPACE_TIMEOUT_MINUTES` 设置发布流水线中三个 `workspace_tests` 分片各自的作业级 `timeout-minutes`。超时时间根据 reserved host 的繁忙程度而非测试套件本身来设定，因此当 host 争用时应增大此值，而非假定存在测试回归。

### 自托管 runner 上的 Vitest worker 上限

`QWEN_CI_VITEST_MAX_WORKERS` 限制以下步骤中列出的 Vitest 进程数（`VITEST_MAX_THREADS` / `VITEST_MAX_FORKS`，匹配的最小值强制为 `1`），适用于名称以 `ecs-qwen-` 开头的 reserved 自托管 runner。该变量仅由主 CI 工作区测试步骤以及发布的 `workspace_tests` 和 `quality_scripts` 步骤导出；CI 和发布工作流中落在同一 reserved 资源池上的其他使用 Vitest 的集成测试不消费此变量，它们使用各自的 Vitest 限制。web-shell E2E smoke 运行在 ARM64 资源池上，使用自己的两个 Playwright worker，因此此上限不适用于它。在 GitHub 托管的 runner 上，此变量被忽略，Vitest 使用其自身默认值。

每次 Vitest 运行独立应用此上限。主 CI 工作区测试步骤同时运行两个通道（`.github/scripts/ci/run-unit-test-lanes.sh`）：主通道以上限运行 CLI 和 core 套件，侧通道以上限的一半（至少为 1）运行其他工作区的套件和 `npm run test:scripts:unit`，因此在峰值时该步骤运行上限加上该一半的数量。在 GitHub 托管的 runner 上，侧通道的 Vitest 运行使用 2 个 worker。

该步骤分为两个分片（`Linux unit tests (shard N/2)`），每个分片向每次 Vitest 运行传递 `--shard=N/2`。分片也独立应用此上限，因此资源池最多同时看到两个这样的步骤。它们不执行 `prepare` 构建就安装，并解包 `test_build` 一次性构建的树。`Test (ubuntu-latest, Node 22.x)` 仅在构建和所有分片都通过时才通过。

`test_build` 是唯一执行构建的作业。它通过 `scripts/ci-build-cache.mjs` 构建：pull request 恢复其 base commit 的 `main` push 保存的构建（`key --at <base>`），回退到最新的缓存构建，并仅重建输入发生变化的工作区：工作区中除测试外的跟踪文件、根文件、`scripts/tests/` 之外的 `patches/` 和 `scripts/`，以及它依赖的工作区。推送到 `main` 总是从头构建并保存该构建。缓存键不携带 CPU 架构信息：标记为 x64 的资源池包含 ARM64 主机，且唯一的架构特定输出（bundle 的 opentui 原生库）在每次恢复和解包后会为主机重新复制（`ci-build-cache.mjs host-assets`）。

单元测试分片、两个 `Integration Tests (no-AK, shard N/2)` 分片和两个 web-shell smoke 分片都解包那一棵树。`test_build` 还运行读取该树的检查：serve fast-path bundle 闭合、core 子路径导出和 settings-schema 新鲜度检查（`Lint & Static` 曾经为之构建的内容）。`Integration Tests (no-AK, No Sandbox)` 仅在构建和所有集成分片都通过时才通过。Draft pull request 跳过集成分片和浏览器 smoke；将其标记为 ready for review 会启动包含它们的运行。仅限于 `packages/managed-agent-server/` 或 `packages/sdk-java/` 的变更（TypeScript 套件读取的文件除外）被归类为 `java_only`：`Lint & Static` 运行其负载加上命名这些树的 `scripts/tests` 套件，TypeScript 构建和测试通道跳过。

### 测试执行之外的相关变量

`release.yml` 还暴露了 `QWEN_RELEASE_STATIC_TIMEOUT_MINUTES`（默认 `60`，控制 `quality_static` lint 通道）和 `QWEN_RELEASE_BUILD_TIMEOUT_MINUTES`（默认 `45`，控制 `quality_build` 打包通道）。由于它们管控的是静态 lint 和产物构建而非测试执行，因此不在本页的测试执行范围之内。