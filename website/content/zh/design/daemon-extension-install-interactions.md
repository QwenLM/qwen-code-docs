# Daemon 扩展安装交互

## 背景

daemon 以异步工作空间操作的方式安装扩展。有些扩展要求用户在安装进行中选择 Claude marketplace 插件或提供配置值。

## 设计

扩展操作可以进入 `waiting_for_input`。其状态一次暴露一个非敏感交互：

- `marketplace_plugin` 包含 marketplace 名称和可选插件。
- `setting` 包含设置的名称、描述、环境变量，以及该值是否敏感。

客户端轮询现有的操作状态端点，然后把答案提交到 `POST /workspace/extensions/operations/:operationId/interactions/:interactionId`。答案校验通过后，操作的内存回调恢复执行。

设置的值绝不会出现在操作状态、结果或日志中。现有的扩展设置机制继续负责存储它们。

## 生命周期

安装和更新操作共享二十分钟的生命周期。每次交互最多可使用操作剩余生命周期中的十分钟。其他扩展变更操作保持其现有超时。等待中的操作仍然留在现有的串行化变更队列中，因此其他扩展变更操作无法观察到部分安装的状态。
