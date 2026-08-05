# Daemon 会话来源元数据

## 动机

Daemon 客户端需要在 daemon 重启之后识别是哪个集成创建了会话。仅存活的 bridge 元数据是不够的，因为存活条目在加载或恢复时会从持久化的 transcript 重建。

## API

`POST /session` 接受两个可选的不可变字段：

- `sourceType`：小写的来源令牌（`[a-z][a-z0-9_-]{0,63}`）。
- `sourceId`：最多 256 个字符的非空标识符。只有在存在 `sourceType` 时才有效。

这些字段由会话创建、状态和工作空间会话列表响应返回。现有会话会省略这两个字段。在 `sessionScope: single` 下，附加会返回现有会话的来源，绝不采用附加请求的来源。

工作空间会话列表接受 `sourceType` 和可选的 `sourceId` 查询参数。`sourceId` 要求 `sourceType`；两者同时存在时会一起匹配。来源过滤器不与 organized 视图组合。

Daemon 定时任务会为其专用会话打上 `sourceType: "scheduled_task"` 以及以持久任务 id 作为 `sourceId` 的标记。

Daemon channel worker 为其创建的会话打上 `sourceType: "channel"` 以及以配置的 channel 实例名（例如 `feishu-main`）作为 `sourceId` 的标记，使 channel 实例——并通过 channel 配置，channel 类型（dingtalk/feishu/...）——可以在 daemon 数据平面上被归因。加载或附加现有会话绝不会重新标记其创建来源。

## 持久化

新会话会在其 JSONL transcript 头部附近存储一条 `session_source` 系统记录：

```json
{
  "type": "system",
  "subtype": "session_source",
  "systemPayload": {
    "sourceType": "web_shell",
    "sourceId": "window-1"
  }
}
```

bridge 通过一个等待完成的 ACP 控制方法请求会话子进程追加这条记录，与现有的 `parent_session` 持久化边界一致。创建响应会暴露 `sourcePersisted`，以便调用方在记录失败时检测到降级的仅存活来源。

`SessionService` 在为列表响应扫描 transcript 头部时以及加载/恢复之前读取该记录，使恢复的存活摘要保留来源。

## 分支

分叉的 transcript 不得复制 `session_source`；否则新分支会声称拥有原始会话的创建者。分支在其创建路径显式分配来源之前没有来源。

## 兼容性

两个字段都是可选的。较旧的 transcript 和客户端保持有效。REST、ACP-over-HTTP 和 TypeScript SDK 转发创建和列表过滤字段。实现这些字段的 daemon 会宣告 `session_source_metadata`；SDK 在发送来源元数据或来源过滤器之前检查该能力，使较旧的 daemon 不能静默忽略它们并返回未过滤的结果。这些值仅用于归因，不得用作授权信号，因为客户端可以提供它们。

如果客户端在接收到新创建的会话之前断开连接，daemon 会同时移除存活会话及其新写入的 transcript。并发的附加会阻止这两个操作，为已附加的客户端保留会话。
