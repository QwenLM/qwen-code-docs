# Channel worker 启动失败报告

## 背景

[Issue #6909](https://github.com/QwenLM/qwen-code/issues/6909) 指出了守护进程管理的 channel 中的一个诊断缺口。适配器的 `connect()` 拒绝会被 worker 记录，但该 worker 随后只报告就绪或以 `No channels connected.` 退出。因此 supervisor、动态控制 API、SDK 和 CLI 丢失了可操作的提供方错误。

本改动把有界、清洗过的 `connect()` 失败带过 worker 启动边界。它不改变配置解析、扩展加载、适配器构建、守护进程启动的 fail-fast 行为或启动后的失败历史。

## 行为

- 如果至少有一个被选中的适配器连接成功，worker 变为就绪。其当前快照包含失败的 channel 名称和原因，动态启用仍返回成功并带 `partial: true`。
- 如果在动态启用、替换或重载期间所有适配器都失败，请求返回 `502 channel_worker_start_failed`，并附带尝试的失败。`state` 描述回滚后的当前状态；尝试的失败不持久化到该状态中。
- 如果守护进程启动期间所有适配器都失败，启动保持 fail-fast。由于守护进程监听器不会保持可用，不承诺任何后续的 GET。
- 新的 worker generation 会清除上一 generation 的启动失败。

只有 `connect()` 拒绝会产生这些记录。`phase` 目前是 `connect`；SDK 有意将其放宽为 `string`，使未来新增的 phase 不需要破坏性的类型变更。适配器的 `code` 值是诊断性的，不是跨适配器的稳定分类。

## 契约

当前的 worker 快照可能包含：

```ts
interface ChannelStartupFailure {
  channel: string;
  phase: 'connect';
  code?: string;
  message: string;
}

interface ChannelWorkerSnapshot {
  startupFailures?: ChannelStartupFailure[];
  startupFailuresTruncated?: boolean;
}
```

动态启动失败还可能包含标注了受信任 supervisor 工作空间的失败：

```ts
interface ChannelStartupAttemptFailure extends ChannelStartupFailure {
  workspaceCwd: string;
}
```

现有的顶层错误字符串、回滚字段和状态保持兼容。所有新字段都是可选的。

## IPC 与生命周期

子进程在每个 `connect()` catch 中发出一条 `channel_startup_failure` 消息，并在尝试下一个适配器之前等待 `channel_startup_report_ack`。父进程验证、清洗、存储，然后才确认该项。发送回调不是持久性边界：它只证明 Node 接受了消息，而 ACK 证明 supervisor 在 worker 可以同步退出之前已处理了它。

最多传输 64 条失败。第 65 条失败产生一个 `channel_startup_failures_truncated` 标记，它也会被确认；之后的失败仅留在 stderr。同一时刻只有一份报告未决，因此 ACK 不需要请求标识符。

畸形、超长、乱序或无法确认的启动协议消息会使有界的启动失败并终止子进程。无关的未知 IPC 消息保留现有行为。现有的 ready schema 和验证有意保持不变。

每个就绪前的终结路径都把已接受的失败包装在 `ChannelWorkerStartupError` 中。调和与管理器错误会克隆这些细节，同时把清理或恢复问题单独保留为 `rollbackError`。工作空间从 supervisor 配置添加，绝不来自子进程 IPC。

## 安全与边界

worker 和 supervisor 都会归一化控制字符和不可见字符，精确脱敏守护进程令牌和敏感环境变量值，应用通用的凭据规则，并按 Unicode 码点截断。动态失败的 HTTP 响应和 CLI 展示边界会再次验证、应用通用脱敏、限制输出并忽略畸形条目。

限制为 64 条失败、channel 128 个码点、code 64 个、message 512 个。失败对象和快照在归属边界处克隆，防止调用方变更 supervisor 状态。

## 被否决的替代方案

- 在 supervisor 中读取 stderr 含糊不清，把行为耦合到日志文本，且无法提供可靠的 channel 归属。
- 只等待 `process.send()` 回调仍会与 worker 同步退出竞争。
- 持久化最后一次失败尝试会改变生命周期语义，并与单独的 last-error/历史工作重叠；动态失败改为只存在于失败的响应中。
- 发明认证/网络/配置类别会在各适配器间造成不稳定的分类。实现只保留适配器提供的字符串或有限数值代码。

## 验证

单元测试覆盖 ACK 顺序、全部/部分失败、中止和超时路径、畸形协议输入、ACK 失败、安全的异常访问、精确和通用脱敏、深拷贝、generation 重置、64/65 截断、回滚传播、HTTP 验证、SDK 导出和 CLI 格式化。真实的 plugin-example 集成测试使用本地分配后关闭的端口，产生确定性的 `ECONNREFUSED`，无需外部凭据或网络依赖。
