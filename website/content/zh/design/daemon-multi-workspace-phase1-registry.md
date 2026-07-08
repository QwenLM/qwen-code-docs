# 守护进程多工作区第一阶段注册表

## 概述

第一阶段引入了 `qwen serve` 的内部单运行时注册表，以及
issue #6378 中提出的两个防护机制：守护进程作用域身份和
可重复的 `--workspace` 输入处理。守护进程仍然只服务一个
主工作区。路由/API 行为保持不变，唯一的区别是现在传入多个
显式的 `--workspace` 值会明确报错，而不是回退到旧的
单工作区路径。守护进程日志文件名和遥测服务实例 ID
也有意从工作区作用域身份更改为守护进程作用域身份；
PR 发布说明中应指出这一迁移。

该注册表是 issue #6378 多工作区推广的未来内部边界，
但此步骤有意避免协议/模式扩展，并且不启用多工作区 CLI 行为。

## 设计

- `WorkspaceRuntime` 封装了当前的单工作区服务对象：
  `workspaceCwd`、`AcpSessionBridge`、`DaemonWorkspaceService`、REST 路由
  文件系统工厂以及当前的客户端 MCP 发送方注册表。
- `WorkspaceRegistry` 仅暴露 `primary`、`list()` 和精确的
  `getByWorkspaceCwd()` 查找。
- `createServeApp` 首先构建现有的 bridge/service/fsFactory 栈，
  然后将其封装为主运行时。
- 现有的 `app.locals.fsFactory` 和 `app.locals.boundWorkspace` 保留在
  原地，用于当前的文件路由。`app.locals.workspaceRegistry` 是新增的。
- 路由模块保持其当前签名。服务器组装层现在
  从 `workspaceRegistry.primary` 传递值。
- 守护进程日志文件名和遥测服务实例 ID 是守护进程作用域的
  （`serve-<pid>.log`、`daemon:<pid>`）。工作区哈希仍然是日志/遥测记录上的属性，
  而不是守护进程身份的一部分。
- `runQwenServe` 接受可能的 yargs 运行时结构，其中 `workspace` 是
  一个数组。单个值的行为仍然与现有的单工作区相同；
  多个值会引发启动错误，直到启用多工作区支持。

## 边界

- 尚不支持可重复的 `--workspace`；重复的值将被拒绝。
- `/capabilities` 或守护进程状态中没有 `workspaces[]`。
- 没有 SDK 类型更改。
- 没有复数形式的 `/workspaces/:workspace/...` 路由。
- 没有会话所有权索引、环境覆盖、`maxTotalSessions` 或
  工作区限定的 ACP/voice/channel worker 行为。

## 审查说明

路由文件系统工厂命名为 `routeFileSystemFactory`，因为
生产环境目前区分了 bridge 文件访问和 REST 路由文件访问。
注册表不能模糊这些边界。

`ClientMcpSenderRegistry` 在此阶段仍保持为当前的进程作用域单守护进程映射。
运行时仅存储现有实例；工作区作用域的
客户端 MCP 隔离是后续多工作区需要关注的问题。

`SessionArchiveCoordinator` 和 `WorkspaceRememberTaskLane` 保持为当前的
服务器组装协作者。它们不是第一阶段注册表的核心职责。

守护进程遥测中间件现在在请求时解析工作区 cwd，
即使第一阶段始终解析为主工作区。这保留了当前行为，
同时避免了在引入工作区限定路由后会出错的主工作区哈希闭包。

## 验证

针对性测试涵盖了精确的注册表查找、`createServeApp` locals 暴露、
注入的路由文件系统工厂保留、现有文件路由 locals 行为、守护进程作用域的日志/遥测身份、请求时工作区哈希、
yargs 单个/重复 `--workspace` 结构、单工作区数组路径，
以及重复 `--workspace` 启动防护。最终验证应运行
集中的 serve 测试以及代码库构建和类型检查。