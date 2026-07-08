# serve server.ts 分阶段拆分

## Goal

分阶段拆分 `packages/cli/src/serve/server.ts`，且不改变 daemon 行为。第一阶段提取边界已明确的共享辅助函数和路由组，同时保持 `createServeApp()` 负责连接中间件、有状态依赖、传输挂载以及最终错误处理。

## Middleware And Route Order

应用组装顺序是公共行为的一部分，必须保持稳定：

1. 同源 `Origin` 剥离
2. CORS 和主机白名单
3. 在允许的环回设置上，认证前的 `/health` 和 `/demo`
4. 访问日志
5. Web Shell 静态资源
6. Bearer 认证
7. 速率限制
8. JSON body 解析器和 JSON 解析器错误映射
9. 按需进行认证后的 `/health` 和 `/demo`
10. daemon 遥测
11. REST 路由组
12. ACP HTTP 和 WebSocket 路由
13. Web Shell 回退
14. 最终错误处理程序

## Extracted Boundaries

`server/request-helpers.ts` 负责 request-body 清理、client-id 解析、环回检测、路径/查询验证以及权限投票 body 解析。路由模块依赖此文件，而不是从 `server.ts` 导入。

`server/error-response.ts` 负责 bridge 错误分类和 HTTP 响应映射。导出的包装器接受一个可选的 daemon logger，以便路由模块能够保持现有的 stderr 和 daemon-log 行为。

`server/session-list.ts` 负责 REST 和 ACP HTTP 调用方使用的持久化与实时 session 列表合并。

`server/fs-factory.ts` 负责默认 workspace 文件系统工厂的构建以及发出 fs 审计警告。

`server/telemetry.ts` 负责路由分类和 daemon HTTP 遥测中间件。

`server/prompt-deadline.ts` 负责 prompt 截止时间解析及其 abort 哨兵类。

路由模块遵循现有的 `registerXRoutes(app, deps)` 风格。它们只接收所需的依赖，而不是一个单一的 god context。

## Non-goals

此阶段不更改响应体、状态码、请求头、SSE 帧格式、认证顺序或错误分类。它不删除诸如 `status.ts`、`event-bus.ts` 或 `in-memory-channel.ts` 等兼容性重导出 shim。它不重命名历史文档或清理不相关的 camelCase 路径。

此阶段后 `server.ts` 可能仍超过 200 行。验收标准是建立稳定的边界，使后续提取 session 和 SSE 的过程变得按部就班。

## Audit Notes

第一轮检查了架构边界，并拒绝引入新的 Router 抽象，因为现有的路由模块已经使用了直接的 `registerXRoutes(app, deps)` 函数。

第二轮检查了失败路径，并将错误分类保留在一个辅助函数中，从而防止路由提取时 HTTP 状态码发生静默漂移。

第三轮检查了兼容性，并保留了 `run-qwen-serve.ts`、ACP HTTP 分发和测试所消费的公共导出。

第四轮检查了测试策略，并依赖于聚焦的 `server.test.ts`、ACP HTTP 和路由测试，因为这是没有用户可见行为变更的结构化重构。