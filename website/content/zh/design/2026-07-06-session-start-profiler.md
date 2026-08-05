# 会话启动 Profiler

## 总结

此变更为 `GeminiClient.startChat()` 添加了一个内部的、可选的 profiler，以便 #6312 的后续工作能够识别剩余的每次会话初始化热点，从而选择合适的优化方案。

它不会改变会话行为、公共协议字段、SDK 行为、CLI 标志、配置 schema、遥测 schema 或启动 profiler 语义。

## 测量形态

仅当 `QWEN_CODE_PROFILE_SESSION_START=1` 时，profiler 才会启用。

启用后，core 会将 JSONL 记录写入 `Storage.getRuntimeBaseDir()/session-start-perf/` 目录下。每日的 JSONL 文件名使用记录时间戳中的 UTC 日期。每条记录包含时间戳、`SessionStartSource`、成功标志、总耗时、有界阶段耗时，以及历史长度和渲染快照数量等小型聚合计数。#4748 的 daemon profiling 后续工作会在调用方提供可选的不透明 Session ID 时将其加入，使该明细记录能够与跨进程 trace 关联。

测量的阶段遵循现有的 `startChat()` 顺序：工具注册表预热、恢复的延迟工具揭示扫描、延迟提醒设置、初始聊天历史构建、skill 提醒去重 seeding、agent 提醒去重 seeding、系统指令构建、`GeminiChat` 构建、孤立 tool-use 修复、SessionStart hook、可选的 SessionStart 上下文应用以及 `setTools()`。

## 安全边界

输出内容有意排除了 prompt、模型响应、hook 输出、tool 名称、文件路径和工作目录。其唯一的可选标识符是用于将 opt-in 记录与 daemon 遥测关联的不透明 Session ID；它不会添加用户、租户或工作空间身份。阶段名称是静态的代码内置字符串。

所有 profiler 写入都是尽力而为的。文件系统故障会被静默处理，因此性能分析不会因错误处理而中断或拖慢会话。

JSONL writer 在 profile 文件上使用受限权限和 `O_NOFOLLOW`。父目录替换仍然是尽力而为的，因为 Node 在此处没有暴露可移植的 fd 相对追加路径；运行时目录被视为同用户诊断存储，而不是防范本地同用户攻击者的边界。

禁用时，helper 不执行任何文件写入，也不读取高分辨率时钟。

`failedStage` 仅记录通过 profiler wrapper 抛出异常的阶段。其底层 helper 捕获并抑制自身错误的阶段（例如 agent 提醒去重 seeding 和 SessionStart hook），从 profiler 的角度来看仍然视为成功。

## 非目标

此变更不会优化 `GeminiClient.initialize()` 或 `startChat()`。

它不实现 Part B extension 缓存、Part C skill body 懒加载、command snapshot 缓存或任何 daemon 协议更改。

只有在收集了此 profiler 的阶段细分数据，并在相关情况下与 extension 密集型或 skill 密集型 fixtures 进行比较后，才应选择下一个优化方案。