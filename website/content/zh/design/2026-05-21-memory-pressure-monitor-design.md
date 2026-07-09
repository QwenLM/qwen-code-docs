# 内存压力监控器

## 问题

长时间运行的 Qwen Code 会话可能会因为大型工具返回结果、重复的文件读取、聊天历史以及原生/外部内存分配而积累内存。在此次更改之前，核心包具备诊断和会话重置清理功能，但在正常工具执行期间内存压力升高时，缺乏运行时的响应机制。

缓存方面最具价值的缺失在于 `FileReadCache`：它已经有了有界的 FIFO 大小限制，但缺乏基于时间的驱逐路径。这意味着，即使进程处于内存压力下，会话也会保留非活跃的文件读取元数据，直到达到硬性条目限制。

## 目标

- 在工具执行后添加低开销的内存压力检查。
- 优先进行精准清理，而非破坏性清理。
- 当 cgroup v2 或 cgroup v1 内存限制文件可用时，遵守容器内存限制。
- 在高内存主机上，在 JavaScript 堆 OOM 之前对 V8 堆压力做出反应。
- 保持子代理/作用域 `Config` 实例与父会话清理隔离。
- 通过环境变量使行为可配置，而不增加新的面向用户的设置界面。

## 非目标

- 不添加后台轮询循环。
- 不将显式 GC 设为默认行为；仅在启用且 Node 启动时带有 `--expose-gc` 参数时才运行。
- 不更改先前读取的强制语义。缓存驱逐可以移除旧元数据，但不得削弱对保留条目的过期文件检查。

## 设计

`Config.initialize()` 为每个初始化的 `Config` 创建一个 `MemoryPressureMonitor`。`getMemoryPressureMonitor()` 镜像了现有的 `getFileReadCache()` `Object.create` 隔离模式：当通过原型委托创建子 config 时，该 getter 会延迟安装一个绑定到该子 config 的自有监控器。

`CoreToolScheduler.executeSingleToolCall()` 在结束工具 span 后的 `finally` 块中调用 `scheduleCheck()`。`scheduleCheck()` 使用 `queueMicrotask` 合并同一事件循环轮次中的多次调用，因此并发的类读取工具批次不会为每个工具结果运行一次内存检查。

监控器使用两个压力信号中较强的一个：

- RSS 除以有效进程内存限制。当 cgroup v2 的 `/sys/fs/cgroup/memory.max` 为有限正值时优先使用；否则回退到 cgroup v1 的 `/sys/fs/cgroup/memory/memory.limit_in_bytes`，最后回退到 `os.totalmem()`。cgroup v1 巨大的“无限制”哨兵值会被忽略。
- V8 `heapUsed` 除以 `getHeapStatistics().heap_size_limit`。

同时使用这两个信号很重要，因为容器通常因 RSS/cgroup 限制而失败，而本地高内存机器在 RSS 占总系统内存很大比例之前，就可能遇到 V8 堆 OOM。

默认阈值故意设置得足够保守，以便在 OS 或容器 OOM killer 介入之前做出反应：

- `softPressureRatio = 0.50`
- `hardPressureRatio = 0.65`
- `criticalRatio = 0.80`
- `cleanupCooldownMs = 5000`
- `enableExplicitGC = false`

环境变量覆盖：

- `QWEN_MEMORY_PRESSURE_SOFT`
- `QWEN_MEMORY_PRESSURE_HARD`
- `QWEN_MEMORY_PRESSURE_CRITICAL`
- `QWEN_MEMORY_ENABLE_GC=1`

无效的比例会回退到默认值。有效比例必须满足 `soft < hard < critical` 的顺序，soft 的下限为 `0.3`，critical 的上限为 `0.98`。比例环境变量使用 `Number()` 进行严格解析，因此像 `0.8extra` 这样的值会被拒绝，而不是被部分接受。无效的内存压力环境配置会在回退到默认值之前，向 stderr 和调试日志写入明显的警告。

## 清理策略

压力级别映射到越来越强的清理操作：

- `soft`：驱逐 60 分钟内未访问的过期 `FileReadCache` 条目。
- `hard`：驱逐 30 分钟内未访问的缓存条目。
- `critical`：清空文件读取缓存，并可选地触发 `global.gc()`。

监控器故意不强制进行聊天压缩。压缩可能会调用模型后端并重写活跃的聊天状态，因此只应从能够与对话循环安全协调的调用点触发。

调度器对清理采用“即发即弃”（fire-and-forget）模式，但监控器使用 `cleanupInProgress` 和冷却时间戳来保护清理步骤。更高压力的清理可以绕过冷却时间，并在正在进行的较低压力清理之后排队，因此在 `soft` 清理完成时不会丢失 `critical` 检查。成功清理后，它会在 `setImmediate()` 上记录 RSS 增量，但 RSS 变化仅用于诊断：即使 JavaScript 对象变得可回收，V8 和 libc 也可能保留已释放的页面。连续失败计算的是清理步骤的异常，而不是未变化的 RSS，并且计数器会在新会话中重置。如果连续三次成功的清理尝试释放的 RSS 少于 1%，监控器会发出 `memory-cleanup-ineffective` 作为诊断信号，而不会将清理步骤本身视为失败。

## 测试覆盖

该实现包含以下测试覆盖：

- 阈值验证测试；
- 环境配置解析、回退、可见警告和显式 GC 测试；
- 使用模拟 `process.memoryUsage()` 的压力分类测试；
- cgroup v2 `memory.max` 和 cgroup v1 `memory.limit_in_bytes` 行为测试；
- V8 堆限制行为测试；
- `scheduleCheck()` 合并测试；
- 在工具执行后调用 `scheduleCheck()` 的调度器集成测试；
- `soft` 和 `critical` 清理操作测试；
- 抛出清理步骤的清理失败计数测试；
- 清理监听器异常隔离和无效清理诊断测试；
- 通过 `Object.create` 实现的子 `Config` 监控器隔离测试；
- `FileReadCache.evictNotAccessedSince()` 行为测试。

## 风险与权衡

- 清理后 RSS 可能保持不变，因为 V8 或 libc 可能会保留已释放的内存。会记录 RSS 增量，但 RSS 不变不计为清理失败。
- 基于时间的文件读取缓存驱逐可能会降低旧文件的快速路径命中率，但它会保留最近活跃的条目，并且仅在内存压力下运行。