# 生命周期 hook 中的会话来源

## 背景

Daemon 会话创建时已经会将可选的 `sourceType` 和 `sourceId` 值通过
`_meta['qwen.session.source']` 转发给 ACP。ACP 运行时目前使用来源类型来禁用
channel 会话的原生 cron，但生命周期 hook 的载荷无法观测到这两个值。因此当
`SessionStart` 在桥接持久化其来源之前触发时，接收方无法对新会话做归因。

## 设计

在 ACP 会话边界处一次性解析现有的来源元数据。将这两个可选字符串存储在会话的
`Config` 上，与会话 id 及其他会话作用域状态放在一起，并暴露只读 getter。

hook 事件处理器将存在的来源值添加到其公共输入中：

- `sourceType` 变为 `source_type`。
- `sourceId` 变为 `source_id`。

条件式对象展开会省略缺失的值，而不是序列化空或 undefined 的字段。由于每个
生命周期事件都使用公共输入构建器，`SessionStart`、`UserPromptSubmit`、`Stop`
和 `SessionEnd` 都获得相同的归因信息，无需按事件单独接线。

## 边界

这是对现有创建元数据的只读透传。它不改变 REST 创建请求、ACP 桥接元数据键、
能力协商、会话持久化或恢复行为。没有来源元数据创建的会话保持原有的 hook
载荷结构。

## 验证

- hook 处理器测试覆盖 `SessionStart` 载荷中来源字段存在和缺失两种情况。
- ACP 会话测试覆盖 channel 来源元数据向会话 `Config` 的传播。
- 现有的 channel worker 测试继续覆盖创建元数据，包括将 channel 实例名作为
  `sourceId`。
