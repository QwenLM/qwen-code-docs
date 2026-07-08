# 文件历史快照持久化

## 摘要

本次更改填补了 `/rewind` 文件历史在 A+C 方面的持久化空白，且未更改已持久化的 JSONL schema。

`file_history_snapshot` 记录保持为仅追加（append-only）的系统记录。恢复时，通过读取线性历史中的所有快照记录，并按 `promptId` 进行去重（采用 last-wins 语义）来重建文件历史。这意味着，针对同一 prompt 的更新快照可以在稍后追加，而无需重写旧日志。

## 快照更新记录

`makeSnapshot(promptId)` 仍然创建 turn-boundary 快照，且调用方仍然显式记录它。缺失的 last-turn 情况，通过为 `FileHistoryService` 提供一个可选的 recorder 回调来处理。当 `trackEdit(filePath)` 成功将新备份添加到最新快照，或修复该快照中失败的备份条目时，它会使用更新后的快照调用 recorder。

对于已捕获且未失败的文件，重复调用 `trackEdit` 不会再次记录，因为快照并未发生变化。

Recorder 的错误会被吞没并记录日志。文件编辑必须保持 best-effort：文件历史持久化不能导致 edit 或 write 工具失败。

## 持久化结构

未添加 schema 版本。现有的 payload 已具备足够的结构，可用于向后兼容地重建：

```json
{
  "type": "system",
  "subtype": "file_history_snapshot",
  "systemPayload": {
    "snapshots": []
  }
}
```

没有这些记录的旧日志在恢复时不会包含文件历史状态。格式错误的快照记录会被跳过并输出警告，后续的有效记录仍可使用。

未添加显式的 `isSnapshotUpdate` 标志。追加另一个具有相同 `promptId` 的 `file_history_snapshot` 记录会产生相同的实际效果，因为 `SessionService.loadSession()` 已经按 `promptId` 应用了 last-wins 去重逻辑。

## 范围

本次仅涉及 A+C。

B1 模拟的 `sed -i` 覆盖率将留给单独的 PR 处理。通用 shell 编辑跟踪、`getDiffStats` 并发限制以及单文件失败原因也被推迟。Claude Code 目前不支持这些行为，因此 qwen-code 不应在此次兼容性迭代中添加它们。

由于持久化记录的结构未变，因此无需进行数据迁移。