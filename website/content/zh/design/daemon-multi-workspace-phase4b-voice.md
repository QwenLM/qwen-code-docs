# 工作空间限定的 Voice

## 目标

为每个受信任的工作空间运行时暴露现有的 daemon Voice 设置、批量转写和流式转写面，且不改变旧式仅主工作空间的路由。

## 设计

`GET`/`POST /workspaces/:workspace/voice`、`POST /workspaces/:workspace/voice/transcribe` 和 `WS /workspaces/:workspace/voice/stream` 按 id 或编码 cwd 解析一个已注册的受信任运行时。它们使用该运行时的 cwd、有效环境、bridge 和工作空间设置。通过复数 REST 的 Voice 设置写入总是使用工作空间作用域；次级 ACP 语音写入使用相同的作用域，因此它们无法修改共享的用户设置。

一个进程作用域的 `WorkspaceVoiceCoordinator` 拥有现有的八个活跃 Voice 操作上限。它同时核算旧式和工作空间限定路径上的 WebSocket 和 REST 批量工作。移除 drain 拒绝新的准入，但让现有 Voice 工作在非强制移除的活动快照中保持可见。运行时 dispose 只在其 bridge 关闭之前中止所选运行时的 Voice 租约。

## 兼容性

旧式 `/workspace/voice`、`/workspace/voice/transcribe` 和 `/voice/stream` 保持绑定到主工作空间。ACP 方法名和 Voice 设置 schema 不变。当共享的 ACP/Voice WebSocket 监听器启用时，`workspace_qualified_voice` 通告所有限定的 Voice 模态。现有的 Voice 模态能力标签保持为主工作空间信号，不是次级运行时的前提条件，次级运行时的配置由所选路由校验。

未知的工作空间选择器返回 `400 workspace_mismatch`；已注册但不受信任的运行时在读取 Voice 设置或音频之前返回 `403 untrusted_workspace`。共享的八操作准入上限覆盖旧式和复数路由的批量与流式工作。批量容量失败返回带 `Retry-After: 5` 的 `503 voice_capacity_exceeded`；流式容量失败发送一个错误帧并以代码 `1013` 关闭。
