# 有界的 Replay 快照窗口

## 问题

实时 daemon 会话目前在内存中保留 replay 历史，以便 `POST /session/:id/load` 能够为在会话已存在之后才附加的客户端注入 replay。这种 replay 保留必须有独立于 SSE ring 的边界：response-mode 恢复可以批量种入大量历史更新，而长时间运行的会话中已完成的实时轮次会无限累积。

磁盘上的会话历史仍然是完整的权威 transcript 来源。PR-1 只为 daemon 的内存中实时 replay 窗口设置边界；它不会添加完整 transcript 端点。

## 目标

- 按序列化字节数为每个实时会话的保留 replay 事件设置上限，默认 4 MiB，并在启动时拒绝无效配置。
- 该上限同时适用于已完成的实时轮次 replay 片段，以及 response-mode 或 stream-mode 恢复的历史 replay。
- 保留现有的快照传输结构：`compactedReplay`、`liveJournal` 和 `lastEventId`。
- 即使单个单元超过上限，也至少保留一个真实的 replay 事件或一个已完成的实时轮次片段。
- 通过在 `compactedReplay` 开头放置一个无 id 的 `history_truncated` 标记来暴露截断。
- 将 `history_truncated` 仅视为状态。它不得触发 `state_resync_required`、reload 循环或回写入 replay 窗口。

## 非目标

- ~~PR-1 不对单个进行中的实时轮次设置上限；`liveJournal` 继续持有活跃轮次直到边界。~~ 已由 DAEMON-009（PR #7622）添加：`liveJournal` 现在受 `maxJournalEvents`（默认 10 000）和 `maxJournalBytes`（默认 8 MiB）限制，可通过 `--max-journal-events` / `--max-journal-bytes` 配置。
- 不设轮次数上限。轮次数仅在引擎能够精确计数被丢弃的已完成轮次片段时才具有诊断意义。
- 不为这个增量事件提供 `/capabilities` 特性标签。解析后的上限值会在 daemon 状态中暴露。
- 不提供完整 transcript 端点。PR-2 必须设计分页或流式的 transcript 读取，且不得暴露一次性的完整数组响应。

## 设计

`TurnBoundaryCompactionEngine` 将保留的 replay 存储为有序片段，而不是无界的扁平数组。一个已完成的实时轮次是一个片段。恢复/批量种入的 replay 以事件级片段存储，这样在超过字节上限时可以独立丢弃最旧的恢复事件。

大小计算复用 EventBus 的安全 JSON 计大小语义。计大小失败会记录诊断日志，并将该事件计为零字节，从而使 publish 和 seed 路径保持其绝不抛异常的约定。

当 `replayBytes > maxReplayBytes` 时，引擎在仍剩多个片段时丢弃最旧的片段。它会递增 `truncatedEvents`，并且仅对被丢弃的实时轮次片段递增 `truncatedTurns`。`snapshot()` 会将保留的片段展平，并在开头插入：

```json
{
  "type": "history_truncated",
  "data": {
    "reason": "replay_window_exceeded",
    "truncatedEvents": 12,
    "retainedEvents": 8,
    "maxBytes": 4194304,
    "truncatedTurns": 3,
    "fullTranscriptAvailable": true
  }
}
```

该标记是合成的且无 id。它被排除在字节统计和瞬时 replay 保留之外。`ingest()`、`seed(snapshot)` 和 `seedReplayEvents()` 都会将其过滤掉，因此加载有界快照不会使标记累积。

`EventBus.seedReplayEvents()` 为恢复 replay 事件分配 id 和时间戳，调用压缩引擎的专用 seed 方法，并像以前一样清空 SSE ring。这可以防止批量恢复 replay 被追加到 `liveJournal`。

CLI 接线通过 yargs、fast-path 解析器、`ServeOptions`、服务器接线、`BridgeOptions`、bridge 状态和 daemon 状态渲染传递一个解析后的上限值。无效值（`0`、负数、非整数、`NaN`、`Infinity` 或超过 256 MiB 的值）会 fail closed（失败即拒绝）。

SDK 和 WebUI 识别 `history_truncated`，校验其负载，将其投射到视图状态计数器和 transcript 状态，并渲染一条终端状态行。该事件不是未知/debug 事件，也不属于 resync 门控的一部分。

## 审计备注

第 1 轮：仅对已完成实时轮次设置上限是不够的，因为 response-mode 恢复可以在没有实时边界的情况下种入大量历史 replay。因此设计添加了 `seedReplayEvents()` 和事件级历史片段。

第 2 轮：对截断复用 `state_resync_required` 会造成 reload 循环，因为 `/load` 会不断返回同一个有界窗口。设计改用了一个独立的状态标记，它从不设置 `awaitingResync`。

第 3 轮：当单个轮次包含大型工具输出时，轮次数上限无法约束内存。PR-1 使用仅按字节的强制执行，并将活跃轮次的上限设置排除在范围之外。

第 4 轮：以数组形式返回完整 transcript 会在请求时重现同样的峰值内存问题。PR-2 被明确限定为分页或流式。

第 5 轮：截断后 replay 为空会使客户端丢失所有可见状态。即使最新片段超出大小，引擎也会保留它。

## 验证计划

- 单元测试实时轮次裁剪、恢复 seed 裁剪、标记放置、瞬时标记过滤、超大小最新片段保留、安全计大小失败，以及 EventBus 绝不抛异常的行为。
- 单元测试有界窗口下的 bridge response-mode 恢复和实时会话加载行为。
- 单元测试 CLI 解析、fast-path 解析、runQwenServe 校验、服务器 bridge 接线和 daemon 状态上限。
- 单元测试 SDK 已知事件校验、reducer 状态、UI 规范化器、transcript 状态、终端渲染和 WebUI replay 注入。
- 最终验证保持在 `npm run build`、`npm run typecheck` 和 `npm run lint`。
