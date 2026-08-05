# ACP Channel Initialize 性能剖析

## 摘要

Daemon 的 `channel.initialize` span 在 ACP 子进程 spawn 之后开始，在子进程返回
其 ACP initialize 响应时结束。因此它包含 Node 和 ESM 启动、CLI 引导、ACP 模块
加载、引导 `Config.initialize()`、transport 建立和 initialize 处理器。处理器本身
只返回能力，不预期能解释观察到的延迟。

本设计向 ACP initialize 响应添加一个固定的、选择加入的子进程启动 profile，并把
校验过的耗时复制到现有的父侧 `channel.initialize` span 上。它不改变 channel 就
绪、初始化顺序、失败处理或会话行为。

## 协议

bridge 通过 initialize 请求元数据请求 profile 的版本 1：

```json
{
  "_meta": {
    "qwen.daemon.channelStartupProfile": { "v": 1 }
  }
}
```

支持的子进程在相同的顶层响应元数据键下返回 profile。响应只包含固定的耗时
字段、一个完整性标志、响应构建的墙钟时间戳，以及子进程从启动到响应的总耗时。
它绝不包含路径、扩展名、设置或其他用户派生的值。

Profile 把子进程启动划分为不重叠的顶层阶段：

- 进程启动到 profiler 就绪；
- Gemini 模块导入；
- 参数解析；
- 设置加载；
- Config 构造；
- 通用应用初始化；
- ACP 模块导入；
- 引导 Config 初始化；
- transport 构造；
- initialize 处理器执行；
- 固定阶段之间未归因的时间。

引导 Config 初始化细分为初始扩展刷新、hook、skill、最终扩展刷新、层级内存、
工具注册表、工具预热和剩余时间。ripgrep 探测作为工具注册表时间的子项报告，
在计算剩余时间时不再二次扣除。顶层未归因时间还包括 transport 建立与
initialize 请求到达子进程处理器之间的等待。

所有耗时使用 `performance.now()` 并四舍五入到两位小数。响应构建纪元使用
`performance.timeOrigin` 加上响应标记，只用于可选的父侧 transport 估计。

## 采集生命周期

CLI 只在原始参数包含 `--acp` 或 `--experimental-acp` 时动态初始化 ACP
profiler，且在导入 Gemini 运行时之前。profiler 为有限集合的标记名存储首次时间
戳。它不执行文件 I/O、堆捕获、遥测初始化或动态事件保留。

核心启动事件 sink 只在 ACP 引导 Config 初始化期间把固定的 Config 阶段事件转发
给 ACP profiler。这防止后续的每会话 Config 初始化污染启动 profile。被跳过的
Config 阶段仍然发出相邻的开始和结束标记，使成功的启动在裸模式或安全模式下也
能产生完整的 profile。

initialize 处理器在构建第一个响应之后冻结 profiler，无论调用方是否协商了
profile。缺失的标记产生 `complete: false`；采集绝不延迟或失败 initialize 响应。

## 父侧 span 丰富

bridge 在向活跃的 `channel.initialize` span 添加固定数值属性之前校验响应元数据。
未知的 profile 版本被忽略。未知字段被忽略。已知值必须是有限的、非负的，且不
大于 600 秒。无效或缺失的已知字段被省略，并使有效完整性标志为 false。

可选的响应 transport 估计是父侧接收时间减去子进程响应构建纪元。它只在有限、
非负且不大于配置的 initialize 超时时记录。

Profile 解析和遥测丰富是 fail-open 的。缺失、格式错误或不支持的 profile 绝不
改变 initialize 成功、channel 拆除、合并调用方行为或重试行为。新父进程与旧子
进程保持兼容，因为 ACP 元数据是可扩展的；新子进程对未选择加入的旧父进程不
返回 profile。

## 验证

聚焦测试覆盖采集器激活和冻结、固定阶段算术、载荷大小、协议协商、格式错误的
profile、span 丰富、遥测失败隔离、Config 事件顺序和 serve 快路径 bundle 边界。
在任何优化被选定之前，在代表性 2C4G 主机上以配对交替冷启动，把 release 构建
的候选与确切的 #6907 合并基线进行比较。

## P0-B 优化决策

2C4G 的 P0-A profile 把子进程启动 P50 的 67.3% 归因于 Gemini 和 ACP 模块加载。
CPU profile 随后显示源码模块编译是最大的 CPU 成本，且 ACP 静态导入图加载了
Ink、React、React Reconciler 和 Yoga，尽管 ACP 子进程并不渲染 TUI。

可选的边是现有的仅 UI 依赖，而不是新的 ACP 入口点。ACP Session 通过一个 React
hook 导入了 API 错误分类器；扩展补全通过一个渲染组件导入了其数据形态和结果
限制；命令注册表静态加载了只在 `/init` 请求确认、审批模式进入 auto 模式或折叠
历史展开时才需要的 UI 支撑。该优化把两个纯数据辅助函数移出渲染模块，把 React
类型导入改为仅类型导入，并只在那三个交互动作执行时才加载它们的依赖。

ACP initialize 响应、启动顺序、Config 初始化、命令注册表内容、失败处理和
Session 行为保持不变。bundle-metafile 检查跟随 ACP 代理的静态输出闭包，拒绝
Ink、React、React Reconciler 或 Yoga 输入，同时继续允许它们位于动态导入之后。

因果比较使用从同一 main commit
`af6a9b640c5d9097c5151b8705dd73aee8e180d0` 构建的 release 产物，只对候选应用本
优化。两次交替冷启动在排除预热后产生 60 对；一次单独的交替预热运行产生 30
对。第二次冷启动是在第一次运行暴露了 ACP 路径之前的两个候选侧父监听器停滞后
开始的。两次运行的样本都没有被丢弃。合并后的冷 P50 结果是：

| 指标                      | 配对对照组       | P0-B 候选      |               变化 |
| ------------------------- | ---------------: | -------------: | -----------------: |
| ACP 导入                  |        115.06 ms |       52.00 ms | -63.06 ms (-54.8%) |
| 子进程到响应              |       1102.88 ms |     1041.09 ms |          -61.80 ms |
| `channel.initialize`      |       1098.25 ms |     1035.61 ms |          -62.64 ms |
| Process 到首个 Session    |       2046.88 ms |     1980.03 ms |          -66.85 ms |
| 冷 Session 请求           |       1358.95 ms |     1290.23 ms |          -68.72 ms |

每个变体的全部 60 个冷 profile 和每个变体的全部 30 个预热 profile 都是完整的。
每次运行都干净退出，并发首 Session、遥测禁用启动和旧版默认 `single` 行为在两轮
功能验证中都成功。在合并的冷数据中，热 Session P95 从 137.53 ms 变为 104.98 ms，
首次健康检查 P95 从 962.99 ms 变为 824.14 ms，进程树 RSS P95 从 442.27 MiB 变为
435.70 MiB。在预热数据中，Session P50 从 73.90 ms 变为 73.75 ms，P95 从 88.38 ms
变为 76.17 ms。

瞬时的宿主机全局停滞影响了两个变体并被保留。在第一个 30 对运行中，两个候选侧
父监听器停滞把首次健康检查 P95 从 803.82 ms 抬高到 1175.67 ms，尽管健康检查请求
本身只花 6-11 ms 且变更的 ACP 路径尚未启动。诊断性重试反转了方向，对照组/候选
首次健康检查 P95 为 1522.44/727.64 ms；合并全部 60 个保留对产生了上面的值。
确切的 P0-A 合并也与候选进行了作为次要 30 对检查的比较，独立显示了相同的 ACP
导入下降且没有 P95 回归。

因此模块加载候选通过了 P0-B 门禁：选定阶段改善超过 30% 和 10 ms，同时
`channel.initialize` 和 process 到首个 Session 的 P50 都改善超过 10 ms。惰性的
顶层 yargs 命令构建器被拒绝，因为其选定阶段的改善未通过 30% 门禁。工具注册表
和预热仍是单独的解耦描述符设计；扩展刷新、层级内存和 transport 太小，不值得
P0 行为变更。
