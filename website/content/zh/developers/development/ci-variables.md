# CI 与发布变量

CI 与发布流程的若干可调节参数以 GitHub Actions 仓库变量（`vars.*` 上下文）的形式暴露，运维人员无需提交 pull request 即可调整。本页列出影响 `.github/workflows/ci.yml` 与 `.github/workflows/release.yml` 中测试执行的变量，以及它们的默认值和适用范围。

## 设置变量

仓库维护者在 **Settings → Secrets and variables → Actions → Variables** 下设置这些变量。未设置（或为空）的变量将使用工作流表达式中的回退值。worker 上限仅在 reserved runner 上生效，即使其变量已设置也是如此。

工作流文件是这些参数的权威来源，测试套件逐字节固定工作流表达式：`scripts/tests/package-scripts.test.js` 固定 `release.yml` 中共享的 worker 上限表达式（带 `ecs-qwen-` 守卫的 `QWEN_CI_VITEST_MAX_WORKERS`），`scripts/tests/no-ak-integration-ci.test.js` 固定 `ci.yml` 中的 worker 上限表达式，`scripts/tests/release-workflow.test.js` 固定 `release.yml` 的重试和工作区测试超时表达式。`scripts/tests/package-scripts.test.js` 还会对照两个工作流检查文档中记录的默认值和工作流位置。由于此守卫在完整配置 CI 通道（`test:scripts`）上运行，而非仅在文档检查上运行，请在提交 pull request 之前使用 `npm run test:scripts`（或 `npx vitest run --config ./scripts/tests/vitest.config.ts scripts/tests/package-scripts.test.js`）在本地验证仅修改本页的编辑。如果文档与工作流不一致，以工作流为准，并在同一变更中更新本页。

## 变量

| 变量                                       | 默认值 | 使用位置                | 控制内容                                                                        |
| ------------------------------------------ | ------ | ----------------------- | ------------------------------------------------------------------------------- |
| `QWEN_CI_VITEST_RETRY`                     | `2`    | `ci.yml`                | 主 CI 工作区和脚本测试步骤的重试次数                                            |
| `QWEN_RELEASE_VITEST_RETRY`                | `2`    | `release.yml`           | 发布工作区测试分片的重试次数                                                    |
| `QWEN_RELEASE_WORKSPACE_TIMEOUT_MINUTES`   | `45`   | `release.yml`           | 每个发布工作区测试分片的作业超时时间                                            |
| `QWEN_CI_VITEST_MAX_WORKERS`               | `4`    | `ci.yml`、`release.yml` | reserved runner 上主 CI 单元测试和发布工作区/质量测试的 worker 上限             |

### 重试次数

`QWEN_CI_VITEST_RETRY` 和 `QWEN_RELEASE_VITEST_RETRY` 分别作为 `--retry=<n>` 传递给 Vitest，用于主 CI 测试步骤（`npm run test:ci:workspaces` 和 `npm run test:scripts`）和发布通道（`npm run test:release:workspaces`）。两个通道使用独立变量，以便分别调节。

Vitest 在同一次运行中重跑失败的测试。这有助于应对偶发的资源争用，但在重试预算内恢复的失败会将检查标记为通过，且不会被 flaky-rerun 跟踪器记录为失败。应保持预算适度，而非用重试来掩盖不稳定的测试套件。两个变量也接受字面值 `off`，此时完全省略 `--retry` 标志，而非传递 `--retry=0`（命令行 `--retry=0` 会覆盖工作区自身的 Vitest 配置，并禁用有意的重试策略）。

### 工作区测试超时

`QWEN_RELEASE_WORKSPACE_TIMEOUT_MINUTES` 设置发布流水线中三个 `workspace_tests` 分片各自的作业级 `timeout-minutes`。超时时间根据 reserved host 的繁忙程度而非测试套件本身来设定，因此当 host 争用时应增大此值，而非假定存在测试回归。

### 自托管 runner 上的 Vitest worker 上限

`QWEN_CI_VITEST_MAX_WORKERS` 限制以下步骤中的 Vitest 进程数（`VITEST_MAX_THREADS` / `VITEST_MAX_FORKS`，匹配的最小值强制为 `1`），适用于名称以 `ecs-qwen-` 开头的 reserved 自托管 runner。该变量仅由主 CI 工作区测试步骤以及发布的 `workspace_tests` 和 `quality_scripts` 步骤导出；CI 和发布工作流中落在同一 reserved 资源池上的其他使用 Vitest 的集成测试不消费此变量，它们使用各自的 Vitest 限制。web-shell E2E smoke 固定使用 `ubuntu-latest`，因此此上限不适用于它。在 GitHub 托管的 runner 上，此变量被忽略，Vitest 使用其自身默认值。

### 测试执行之外的相关变量

`release.yml` 还暴露了 `QWEN_RELEASE_STATIC_TIMEOUT_MINUTES`（默认 `60`，控制 `quality_static` lint 通道）和 `QWEN_RELEASE_BUILD_TIMEOUT_MINUTES`（默认 `45`，控制 `quality_build` 打包通道）。由于它们管控的是静态 lint 和产物构建而非测试执行，因此不在本页的测试执行范围之内。