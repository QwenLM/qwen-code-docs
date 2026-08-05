# SessionDelete hook

## 目标

在一个被显式选中的会话删除后通知用户的 hook。

## 契约

- `SessionDelete` 在 `SessionService.removeSession` 或 `removeSessions` 报告
  一个会话记录已被移除后运行。
- 该 hook 是 fire-and-forget 的。它的输出和失败不能撤销或延迟已完成的删除。
- 载荷包含 hook 运行时的常规 hook 字段外加 `deleted_session_id`。hook 运行时
  拥有 hook 配置；被删除的会话可以是非活跃的，没有活跃的 hook 运行时。
- 交互式 `/delete` 流程和 ACP 的显式 `deleteSession` 扩展方法会发出该事件。
  清理、回滚、归档、关闭和 daemon REST 批量删除不会。

## 理由

`SessionEnd` 描述的是活跃对话的生命周期。永久删除是存储生命周期工作，且可以
针对非活跃的会话记录，因此它需要单独的事件和标识符。只在成功后运行可防止
hook 让关闭并删除的流程处于部分完成状态。

Daemon REST 删除在移除会话记录的进程中没有 `Config` 或 `HookSystem` 拥有者。
接线该路径需要一个显式的工作空间 hook 执行契约，而不是重建一个已删除会话的
内存态 hook。这被有意排除在本变更范围之外。
