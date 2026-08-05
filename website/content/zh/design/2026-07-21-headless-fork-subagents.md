# 无头模式的上下文继承子代理

## 问题

显式的 `subagent_type: "fork"` 请求目前只在 `Config.isInteractive()` 为 true 时被尊重。无头模式调用方（如 `qwen --prompt`、TypeScript SDK 和 CI runner）会静默执行一个全新的 `general-purpose` 子代理作为替代。因此请求的与实际生效的上下文模式不同，子代理也接收不到父级会话。

## 设计

fork 的可用性与呈现表面无关。顶层的 fork 请求始终使用现有的 fork 构造路径，该路径会复制父级的历史和缓存安全的生成配置。

无头模式 fork 即使省略了 `run_in_background` 或其为 false，也通过现有的后台代理注册表运行。fork 按定义就是分离的，而注册表为非交互式调用方提供了所需的生命周期：

- 一次性无头执行等待 fork 完成；
- 流消费方接收 `task_started` 和终态任务通知；
- 生效的 `subagent_type: "fork"` 被记录在事件、元数据和子代理遥测中；
- 无法在非交互式会话中显示的权限请求被现有的后台代理策略拒绝，而不是挂起。

交互式 fork 行为保持不变。

来自嵌套子代理的 fork 请求仍然不受支持，但它现在会以显式的工具错误失败，而不是静默运行一个全新的 `general-purpose` 子代理。

## 范围

本变更复用当前的完整历史 fork 行为。它不添加部分历史选择（如 `fork_turns`）；那可以单独引入，不阻塞正确的无头继承。

## 验证

- 核心调度测试覆盖交互式 fork、无头模式 fork、强制后台生命周期、继承的历史构造、权限行为和显式的嵌套 fork 拒绝。
- 非交互式 CLI 测试覆盖面向 SDK 的 `task_started` 事件，并验证它暴露 `subagent_type: "fork"`。
- 桌面 SDK 适配器测试验证运行时的后台结果优先于调用方提供的 `run_in_background: false`。
- 一个端到端的 `qwen --prompt --output-format stream-json` 检查使用一个在 fork 指令中缺失的父级标记，并验证子代理仍能从继承的历史中恢复它。
