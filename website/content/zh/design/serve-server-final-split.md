# serve server.ts 最终拆分

## 目标

继续分阶段拆分 `packages/cli/src/serve/server.ts`，且不改变 daemon 行为。本次迭代将剩余的内联 REST 处理器、小型中间件辅助函数、能力构建、device-flow 注册表设置以及限流器设置移入专门的内聚模块中。`createServeApp()` 依然是 daemon 状态、中间件顺序、路由注册、ACP 传输挂载、Web Shell 回退以及最终错误处理的组合点。

## 中间件与路由顺序

组装顺序是 daemon 契约的一部分，必须在 `createServeApp()` 中保持视觉上可审查：

1. 同源 `Origin` 剥离
2. CORS 和主机白名单
3. 预认证 `/health` 和 `/demo`（在允许的 loopback 设置下）
4. 访问日志
5. Web Shell 静态资源
6. bearer 认证
7. 限流
8. JSON body 解析器和 JSON 解析错误映射
9. 后认证 `/health` 和 `/demo`（在需要时）
10. daemon 遥测
11. REST 路由组
12. ACP HTTP 和 WebSocket 路由
13. Web Shell 回退
14. 最终错误处理器

## 抽离的模块边界

`server/self-origin.ts`、`server/access-log.ts`、`server/rate-limiter-setup.ts` 和 `server/error-handlers.ts` 负责原本内联在 `createServeApp()` 中的小型中间件/设置代码块。它们被刻意设计得很轻量，并在 `server.ts` 中保持相同的注册顺序。

`server/serve-features.ts` 负责语言代码列表、语音转写能力缓存以及对外公布的功能信封输入构建。其缓存失效函数仍由 workspace 设置重载/变更路径调用。

`server/device-flow-registry.ts` 负责默认 Qwen OAuth 提供者注册、事件 sink 绑定、审计 stderr 面包屑以及 `app.locals` 注册表安装。

`routes/capabilities.ts` 负责 `GET /capabilities`。

`routes/workspace-mcp-control.ts` 负责 MCP 重启/管理/运行时添加/移除变更。

`routes/workspace-lifecycle.ts` 负责 `/workspace/init` 和 `/workspace/reload`。

`routes/workspace-tools.ts` 负责 `/workspace/tools/:name/enable`。

每个路由模块仅接收其所需的依赖项。所有新模块均不导入 `server.ts`，这保持了依赖方向的单向性并避免了循环依赖。

## `server.ts` 中保留的内容

`server.ts` 仍然负责应用创建、绑定 workspace 的规范化、bridge/filesystem/workspace 构建、变更门控创建、路由排序、ACP HTTP/WebSocket 挂载、Web Shell 静态资源/回退放置，以及现有调用方使用的兼容性导出。

本次 PR 不要求将该文件缩减到 200 行以下。验收标准是它不包含内联的 REST 端点处理器，并且读起来像一个组装文件，其行为顺序可以在一个地方进行审查。

## 非目标

本次迭代不更改响应体、状态码、请求头、SSE 帧、ACP 行为、认证门控、限流层级、device-flow 语义或错误分类。它不移除 `status.ts`、`event-bus.ts` 或 `in-memory-channel.ts` 兼容性 shim。它不重命名历史文档，也不引入 Router 框架或用于路由的单一 god context。

## 审查说明

第一轮检查了架构边界，保留了现有的 `registerXRoutes(app, deps)` 模式，而没有添加 Router 抽象。

第二轮检查了依赖方向，将 device-flow/runtime 设置移至辅助函数之后，且不允许任何路由模块导入 `server.ts`。

第三轮检查了故障路径，保留了 bridge 错误映射、JSON body 解析器错误、严格变更门控和 client-id 验证调用点，确保行为不变。

第四轮检查了兼容性，保留了 `server.ts` 中供 `run-qwen-serve.ts`、ACP HTTP 调用方和测试使用的公共导出。

第五轮检查了测试策略，使用了聚焦的 `server.test.ts`、路由测试、ACP HTTP 测试、类型检查、构建、lint、内联端点 grep 以及 `git diff --check`。