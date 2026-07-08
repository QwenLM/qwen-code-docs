# 大型管道帧处理度量

## 摘要

本 PR 是针对大型 `qwen serve` ACP 管道帧的度量与设计步骤。它不会更改管道有效载荷、帧限制、EventBus 行为、SDK 行为、公共协议字段、CLI 标志、HTTP 查询参数或公开声明的能力。

直接目标是收集超大 NDJSON 管道消息的低基数归因数据，以便下一个 sidecar 设计能够使用真实的 `pipe.message_bytes` 分布，而不是猜测的阈值。

## 当前限制

目前 ACP 子管道没有单帧字节上限。现有的守护进程指标仅使用 `direction` 属性记录 `pipe.message_bytes`，这虽然是有意保持低基数的，但无法解释是哪些有效载荷类型导致了大型帧。

SDK SSE 读取器已经为浏览器/事件流交付设置了独立的 16 MiB 缓冲区上限。该上限并不限制守护进程到子管道的帧大小，也无法解释管道帧的来源。

批量会话回放目前具有 10,000 次更新的计数上限。它没有字节上限，因此有限数量的大型更新仍然可能产生一个大型响应帧。

## 度量形态

新的内部 NDJSON 观察器在消息成功从管道读取或写入管道后，会接收 `{ direction, bytes, message }`。现有的字节钩子仍然只接收 `bytes`，从而保留当前的指标路径。

守护进程为每一帧记录现有的管道计数、总计、最大值、直方图指标和状态字段。大型帧归因仅在 `bytes >= 256 * 1024` 时运行。

大型帧日志采用每个守护进程进程窗口进行采样，限制为每 60 秒 50 条记录。被抑制的采样计数会附加到下一条记录的大型帧日志中。

记录的字段仅限于低敏感度的归因信息：direction、字节大小、阈值、JSON-RPC 消息类型、method、source class、更新计数、达到上限时的汇总更新计数和策略、会话更新类型、混合会话更新标记、工具名称、工具来源、原始输出类型、content 和 raw output 的浅层文本字节最大值、有界的近似非字符串原始输出字节加上上限标记，以及速率限制抑制计数器。不会记录有效载荷、会话 ID、客户端 ID、文件路径、提示词和原始工具输出。

直方图保持低基数，仅保留 `direction`；不会将 method、工具名称、会话更新和 source class 等字段添加为指标属性。

## Source Classes

观察器仅使用可以从帧形状中证明的 source class：

- `session_update_notification`：带有 `params.update` 的 `session/update` 通知。
- `load_session_bulk_replay_response`：携带 `_meta["qwen.session.loadReplay"]` 的 JSON-RPC 响应。
- `load_updates_response`：携带 `result.updates` 以及加载更新响应标记的 JSON-RPC 响应。
- `jsonrpc_request`：任何其他带有 method 的 JSON-RPC 请求或通知。
- `jsonrpc_response`：任何其他 JSON-RPC 响应。
- `unknown`：其他任何情况。

管道层无法可靠地区分实时的与重放的 `session/update` 帧，因此此度量不会发出 `live` 或 `replay` 归因字段。

## 下一阶段的 Sidecar 候选方案

可能的 sidecar 目标是由 `tool_call_update` 携带的大型工具输出，尤其是 `content[]` 和 `rawOutput` 中的文本。后续的实现应在更新中保留一个小的线路预览或存根，同时将完整主体放入由守护进程管理的 sidecar 中。

元数据应通过 `_meta` 传递，以便旧客户端忽略它，而新客户端可以选择解析 sidecar 内容。在实现之前，sidecar 契约应定义生命周期、访问控制、清理、字节阈值、回退行为和客户端 UX。

批量回放和 `qwen/session/loadUpdates` 需要单独处理，因为响应可能由于许多中等大小的更新或少数大型更新而变得很大。度量字段包括 `updateCount`、`summarizedUpdateCount`、`summarizedUpdateStrategy`、`maxContentTextBytes`、`maxRawOutputTextBytes`、`maxRawOutputApproxBytes` 和 `maxRawOutputApproxBytesCapped`，以区分这些情况，而无需遍历无界的更新数组或物化大型非字符串原始输出。当更新数组超过摘要预算时，最大字段是根据确定性的前缀加后缀样本计算的，而不是进行全量扫描。

## 非目标

本 PR 不实现 sidecar 存储、临时文件传输、帧上限、回放环字节上限、压缩修剪、EventBus 字节上限或 ACP HTTP 绑定缓冲区字节上限。

本 PR 不添加 `?maxFrameBytes` 或 `?maxQueuedBytes` 查询参数、CLI 标志、SDK 选项或能力。守护进程的内存和传输预算不应被任意客户端提高。

本 PR 不更改公共事件 schema。任何未来的 sidecar 协议必须是增量式的，并需单独审查。