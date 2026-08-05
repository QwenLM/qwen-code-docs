# `@google/genai` 惰性加载

- **Issue**: #7264 候选 3
- **Scope**: ACP 冷启动导入闭包
- **Status**: 已实现并验证

## 问题

打包的 ACP 运行时目前通过九个急切的运行时导入点到达 `@google/genai` 的 Node 入口。该 SDK 向一个包含 77 个输入的共享 1,196,331 字节 chunk 贡献了 755,788 字节，其中还包括 `google-auth-library` 和 `gaxios`。由于 ACP 引导在应答 `initialize` 之前导入了完整的 CLI 入口，即使引导刻意跳过 Gemini 客户端初始化和 MCP 发现，这个 chunk 也会被解析和求值。

仅把急切导入改为 `import()` 是不够的。ACP 会话创建在返回会话响应之前会调用 `ensureAuthenticated()` 和 `createContentGenerator()`。因此现有的 provider 导入和 `LoggingContentGenerator` 构造会在 `newSession` 期间加载 SDK，把工作从 `channel.initialize` 中移出，却没有改善 process→首个 session。

## 设计

### 轻量同步兼容值

核心编排在 provider 实现之外只使用 SDK 的一小部分同步子集：`FinishReason`、`FunctionCallingConfigMode`、`createUserContent` 和 `createModelContent`。一个包本地的兼容模块提供这些值，同时把 SDK 类型保留为仅类型导入。其内容转换镜像 SDK 的校验和输出形态，使现有调用方保持相同行为而无需对 SDK 求值。

Provider 实现继续使用官方 SDK 类。特别地，本变更不复制或替换 `GenerateContentResponse`。

### 单飞惰性内容生成器

`createContentGenerator()` 仍然在会话生命周期的当前位置校验配置、预加载运行时 fetch 实现并执行 Qwen OAuth 凭据获取。它返回一个私有的惰性 `ContentGenerator`，其记忆化的加载器在第一个异步内容生成器操作时构造所选的 provider 并将其包装进 `LoggingContentGenerator`。

全部四个异步操作共享同一个 loader promise：

- `generateContent`
- `generateContentStream`
- `countTokens`
- `embedContent`

因此并发的首次调用只导入并构造 provider 一次。`useSummarizedThinking()` 保持同步，并由所选 provider 的已知行为提供：Gemini/Vertex 为 true，OpenAI、Qwen OAuth 和 Anthropic 为 false。

Qwen OAuth 凭据获取在 `createContentGenerator()` 内保持急切。因此过期或缺失的缓存凭据继续拒绝 ACP 会话创建，而不是产生一个看似可用、却在第一个提示时才失败的会话。

动态导入失败保留现有的后台更新重启消息，不过 provider chunk 的失败现在会在首次使用生成器时浮现。认证刷新会替换惰性生成器，这也提供了 loader 失败后的重试边界。

### MCP 首次使用

`mcpToTool` 在 `discoverTools()` 内部动态加载。这保留了 SDK 的分页、重名处理、可调用工具回退和 MCP 使用头副作用。因此配置了 MCP 服务器的场景可能在第一个模型提示之前的后台 MCP 发现期间对 `@google/genai` 求值。这是一个有意的首次使用例外：替换 `mcpToTool` 会复制实验性的 SDK 行为，并显著扩大回归面。

有保证的边界是：`@google/genai` 不在 ACP 引导的静态闭包中。在没有配置 MCP 服务器时，它在会话创建期间保持未加载，并在第一个 `ContentGenerator` 操作时加载。

### Bundle 守卫

serve 快路径 metafile 守卫把 `@google/genai` 加入 ACP 禁止包列表。动态 chunk 仍然被允许。这使未来的静态重新导入会以其输出的导入路径让 CI 失败。

## 下游消费方审计

有三条直接的生产创建路径。`Config.refreshAuth()` 拥有主会话生成器。`BaseLlmClient` 拥有为路由的旁路请求缓存的每模型生成器。`createRuntimeContentGeneratorView()` 拥有进程内 agent 后端、subagent 管理器和 fork 出的代理使用的专用生成器。每条路径只存储和消费 `ContentGenerator` 接口，因此私有的惰性包装器保留其所有权和路由边界。

接口消费方只调用 `generateContent`、`generateContentStream`、`countTokens`、`embedContent` 和 `useSummarizedThinking`。主聊天路径、提示 hook、memory/goal/旁路查询、视觉路由、subagent 和会话恢复都不检查具体 provider 或解开 `LoggingContentGenerator`；全仓库搜索未发现任何生产环境的 `instanceof` 或 `getWrapped()` 调用方。MCP 工具发现与生成器所有权分离，并把 SDK 提供的 `mcpToTool` 适配器保留在它自己的首次使用导入之后。

## 已拒绝的备选方案

- **只把当前导入改为动态**：改善了 `channel.initialize`，但在 `newSession` 期间加载同一个 SDK，因此没有解决 process→首个 session。
- **推迟 `GeminiClient.initialize()` 本身**：改变聊天构造、恢复、工具注册、会话就绪和认证错误的时序。
- **复制 `GenerateContentResponse`**：在 SDK 升级中有原型和 getter 漂移的风险，并改变 OpenAI 和 Anthropic 适配器返回的运行时对象。
- **本地替换 `mcpToTool`**：复制一个实验性的 SDK 适配器，并丢弃或必须复现其进程全局的 MCP 遥测行为。
- **导入未文档化的 SDK 内部**：`@google/genai` 没有为这些 helper 和类暴露受支持的轻量子路径。

## 兼容性与失败路径

- Provider 校验保留在 `createContentGenerator()` 中。
- Qwen OAuth 凭据检查保留在 ACP 会话注册之前。
- 首个 loader 在并发提示和旁路查询之间是单飞的。
- 已中止的首个请求仍可能完成模块求值，因为 ESM 导入不可取消；provider 之后收到原始的中止信号。
- 模型配置按今天的方式按引用捕获，因此在首次使用之前进行的同 provider 模型变更会被 provider 构造函数观察到。
- 认证/provider 变更通过现有的 `refreshAuth()` 路径重建惰性生成器。
- 后台 CLI 更新后缺失的动态 chunk 会产生现有的重启指引。

## 验证

单元测试覆盖 helper 对等性、延迟构造、Qwen 凭据时序、单飞行为、provider 专属的 summarized-thinking 值、延迟模块失败和 MCP 发现行为。打包的 metafile 必须显示 `@google/genai` 不在 ACP 静态闭包中，同时保留在动态 provider/MCP chunk 中。

2C4G 验收运行遵循 #7264：30 次配对串行冷启动、`channel.initialize` P50/P95、process→首个 session、预热/热行为、并发首 session、遥测开/关和峰值 RSS。由于本变更把工作移后，它额外记录了即时首提示的 session 响应→首 token 和 process→首 token。一个被首 token 回归完全抵消的启动收益会被报告，而不是当作成功的优化。

## 结果

对照组是当时最新的 `origin/main`（`dd2552018a72a2b5795977211f06435711e5f99a`），其中已经包含惰性遥测/协议工作和惰性 undici 变更。候选组是确切的最终工作树 bundle。两者都从同一个 lockfile 构建，并在提供的 2 vCPU、约 3.5 GiB RAM、无 swap、捆绑 Node.js 22.23.1 的阿里云主机上测试。

ACP 静态闭包从 14,279,497 字节降至 13,280,177 字节（999,320 字节）。对照组闭包包含直接归属于 `@google/genai` 的 755,788 字节；候选组为零。该 SDK 仍存在于动态 chunk 中，供 provider 和 MCP 首次使用。

在遥测启用到 outfile 的情况下，30 次交替配对冷启动产生了：

| 指标                     | 对照组 P50 / P95     | 候选组 P50 / P95      | P50 差值  |
| ------------------------ | -------------------- | --------------------- | --------- |
| `channel.initialize`     | 984.9 / 1010.6 ms    | 954.8 / 972.5 ms      | -30.1 ms  |
| 冷 `POST /session`       | 1293.1 / 1316.0 ms   | 1252.4 / 1291.3 ms    | -40.7 ms  |
| process 到首个 session   | 1924.6 / 1951.1 ms   | 1858.7 / 1901.0 ms    | -65.9 ms  |
| `phase.gemini_import`    | 536.3 / 550.2 ms     | 517.2 / 526.5 ms      | -19.1 ms  |
| 峰值 RSS                 | 414.6 / 427.1 MiB    | 406.5 / 420.5 MiB     | -8.0 MiB  |

在三秒预热之后，`channel.initialize` 在 P50 上仍快 32.7 ms，而 `POST /session` 改善 4.8 ms。并发首 session、遥测禁用和旧版单会话模式全部成功；每个进程树都被清理，遥测禁用模式发出了零条记录。

一次额外的遥测关闭运行以 30 个交替对发出即时的真实 OpenAI 兼容提示。全部 60 个提示都完成了。Process→session 在 P50 上改善 53.4 ms，候选组在 30 对中有 28 对更快。提示→首 token 在模型网络波动下基本中性：候选组 P50 快 24.2 ms，候选组在 30 对中有 16 对更快；P95 慢 297.6 ms，因为两个变体都有无关的多秒级网络离群值。端到端 process→首 token P50 改善 57.6 ms，候选组在 30 对中有 19 对更快。这排除了可证明的中位数成本转移，但首 token 尾部还不足以归因到能声称额外的模型调用性能收益。
