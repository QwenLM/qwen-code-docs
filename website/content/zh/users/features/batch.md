# 批处理模式（DashScope）

DashScope Batch API 以实时价格一半的成本异步运行请求，完成窗口至少为 24 小时。Qwen Code 通过 `/batch-api` 使用它：你描述一个批量任务，agent 准备一个计划，`qwen batch` 负责提交、跟踪并将结果写入文件。

## 配置 Batch 模型

在 `settings.json` 中声明一次端点和凭据，然后通过 `batch.model` 选择它。你的普通对话模型和认证保持不变，即使对话使用 Qwen OAuth 或其他提供商也是如此。

```json
{
  "env": { "DASHSCOPE_API_KEY": "your-key" },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.7-plus",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "envKey": "DASHSCOPE_API_KEY"
      }
    ]
  },
  "batch": { "authType": "openai", "model": "qwen3.7-plus" }
}
```

将这些字段合并到你现有的设置中，保留其他提供商条目。`envKey` 指定 `settings.env` 中的键名（或环境变量）；无需单独在 shell 中导出。提供商的 `generationConfig` 控制 Batch 的 generation。`wireApi` 是请求协议，不是 Batch 开关：省略它或使用 `"chat-completions"`；此执行器不支持 `"responses"`。

`batch.authType` 默认为 `openai`。模型必须精确匹配一个带有 `baseUrl` 且 `envKey` 已填充的 OpenAI 兼容 chat-completions 条目。如果 ID 重复，将 `batch.baseUrl` 设置为确切配置的 URL。无效的选择会在任何上传之前失败；它们永远不会回退到对话凭据。更改此选择后重启交互式会话，使其后台收集器使用与子命令相同的设置。

如果没有 Batch 选择，则保留之前的行为：Batch 复用主模型的配置，并要求 OpenAI 兼容的 API key 认证。Qwen OAuth 凭据本身没有 Batch 路由。运行 `qwen batch check` 可以验证就绪状态而不会提交付费请求。

## 何时适合使用批处理

- **半价，无缓存。** Batch 对成功请求按实时标价的 50% 计费，但前缀缓存在批处理中永远不会命中（实测 `cached_tokens: 0`）。实时模式对缓存输入按标价的 20% 计费，因此批处理仅在每个请求的共享内容较少时才划算：在缓存命中率 `h` 下，实时模式的输入成本约为标价的 `1 − 0.8h`，当 `h` 超过 0.625 时批处理就不划算了。
- **适合场景：** 大量独立的单轮次请求，每个请求以其自身内容为主——翻译或总结一组文档、按文件提取数据。长输出更有利于批处理。
- **不适合场景：** 共享的长规则手册或带短条目的少样本前缀、少量条目、需要多轮次的任何任务。将 agent 自身的轮次通过 Batch 路由，实测成本为实时的 1.03 倍，且慢数小时。
- **延迟：** 从几秒到几小时不等，主要是排队时间，且因模型而异。可以指望它便宜，但不要指望它快。

在提交任务之前检查，先实时发送一个请求，比较 `usage.prompt_tokens_details.cached_tokens` 和 `usage.prompt_tokens`。

## `/batch-api`

```text
/batch-api translate the Markdown docs in docs/zh into English,
writing them to docs/en with the same file names
```

Agent 运行 `qwen batch check`，确认任务合适，读取少量样本，将计划写入 `.qwen/batch/plans/`，并预览——不会上传或计费任何内容：

```bash
qwen batch run .qwen/batch/plans/<slug>.json --dry-run
# preview: 42 item(s), window 24h — nothing uploaded, nothing billed
# model qwen-plus, thinking off, max output 8192 tokens (frozen from your current settings; retries reuse them)
# writes new files to: docs/en/ (42)
# ~180,000 in / ~190,000 out tokens (rough estimate); ...
# snapshot 3f9c2a7e5d10b884; submit exactly this batch with: qwen batch run .qwen/batch/plans/<slug>.json --expect 3f9c2a7e5d10b884
```

然后它提交该快照。此命令的审批提示是你决定花费的地方，预览就在其上方；如果计划、源文件或你的设置在中间发生了变化，提交将被拒绝。

```bash
qwen batch run .qwen/batch/plans/<slug>.json --expect 3f9c2a7e5d10b884
# task translate-docs-20260923103000: 42 item(s), window 24h
# ...
# batch job: batch_abc123
```

`run` 立即返回，**你无需手动收集**。Agent 将 `qwen batch collect <task-id> --wait` 作为后台任务启动（可在 `/tasks` 中查看）并结束其轮次，因此你可以继续工作。该进程通过 HTTP 轮询提供商——等待期间不会调用模型——当批处理完成时，它写入结果并退出。然后 agent 被唤醒一次：它告诉你哪些已交付、保留或失败，并执行你在原始请求中要求的任何后续操作。失败的项目永远不会自动重试，因为重试会再次计费。

如果会话先关闭，也不会丢失任何内容：交互式会话在启动时和运行期间收集项目的已完成任务，并发布一条通知。将 `general.batchAutoCollect` 设置为 `false` 可以关闭此功能。无头模式运行（`qwen -p`）、`qwen serve` 和 IDE/ACP 客户端不会自动收集。

这些命令可以在任何目录下工作，也可以在会话中使用 `!` 前缀（例如 `!qwen batch collect <task-id>`）执行，这样不会消耗模型轮次：

```bash
qwen batch check                         # verify setup; nothing is billed
qwen batch collect <task-id> [--wait [--timeout <s>]]   # validate + write target files
qwen batch retry <task-id>               # resubmit only the failed items
qwen batch retry <task-id> --max-output-tokens 8192  # include truncated ones
qwen batch list                          # every recorded task, with its project
qwen batch cancel <task-id>              # partial results are still billed
qwen batch clean <task-id>               # delete the local record (cancels nothing)
```

`collect` 将每个项目报告为：

- **delivered** — 已写入目标位置；
- **held** — 源文件在提交后发生了变化（`retry` 会针对新源文件重新提交），或者目标已存在但内容不同（解决后重新运行 `collect`；不会发起新请求）；
- **failed** — 截断、为空、工具调用或提供商错误；`retry` 会重新提交这些项目，截断的项目仅在使用更大的 `--max-output-tokens` 时重新提交。

重新运行 `collect` 始终安全：已交付的项目不会重做，用量也不会重复计算。结果写入磁盘后，远程输入和输出文件会被删除。

## 记录、安全和成本

- 任务记录存放在 `~/.qwen/batch/tasks/<task-id>/`（`QWEN_BATCH_HOME` 可覆盖），权限仅限所有者，因为它们包含源文件和输出的完整副本。项目 `.qwen/batch/` 下的计划文件会被 `.gitignore` 忽略。
- 任务绑定到提交时使用的端点和 API key（仅存储 key 的短哈希）；切换账户或区域后，命令会拒绝执行，直到你切换回来。
- 如果创建调用的响应丢失，`run` 会失败，任务被标记为 `submit-unknown`，`collect` 会根据提供商的批处理列表进行对账而不是重新提交——重复提交会导致双重计费。
- 同一时间只有一个 `qwen batch` 命令可以操作某个任务。
- 运行会冻结你当前的采样参数、输出限制和思考模式；重试会复用这些设置。
- 估算基于 token 数量，除非你设置了 `QWEN_BATCH_INPUT_PRICE_PER_1M_USD` 和 `QWEN_BATCH_OUTPUT_PRICE_PER_1M_USD`。粗略估算不考虑思考 token，而思考 token 可能是输出的数倍。计划的 `maxCostUsd` 会根据请求上限的最坏情况进行强制执行：它需要这些价格、`maxOutputTokens`，以及关闭思考或设置 `thinking_budget`，否则运行会被拒绝。两个数字都不包含你的会话在准备计划时的花费。
- 远程清理失败不会阻止 `retry`、`cancel` 或 `clean`；后续的 `collect` 会重试它。提供商无法完整提供（一次重新下载后）或已不再拥有的结果文件会导致受影响的项目失败，而不是让任务卡住。
- 当批处理可能仍在运行或持有未收集的结果时，`clean` 会拒绝，除非你传递 `--force`。
- 目标必须保持在项目内且在任何隐藏路径之外（`.git/`、`.github/`、`.qwen/` 等，任意深度）：结果会在你批准计划后数小时写入。预览会列出目标目录。

设计文档：[`docs/design/2026-09-23-batch-api-design.md`](../../design/2026-09-23-batch-api-design.md)。
离线端到端检查（伪造的 Batch API，真实的已构建 CLI）位于 [`docs/verification/batch-api/`](../../verification/batch-api/README.md)。