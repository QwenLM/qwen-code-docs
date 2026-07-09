# 渠道生命周期状态总览

日期：2026-07-01

## 目标

提供一个统一的审查视图，总结所有受支持渠道适配器的生命周期状态行为，并明确指出哪些内容被有意排除在范围之外。

## 范围

- Telegram
- Weixin
- DingTalk
- Feishu

## 明确的非目标

- Slack 仍不在范围内。
- QQ Bot 的生命周期状态 UI 仍不在范围内。
- 插件示例的生命周期状态 UI 仍不在范围内。
- DingTalk 的终止 emoji 仍不在范围内。

## 审查矩阵

| 渠道 | 支持的生命周期事件 | 原生展示面 | `started` 行为 | `text_chunk` 行为 | 终止行为 | 不支持 / 无操作原因 | 具体测试文件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Telegram | `started`, `completed`, `cancelled`, `failed` | 正在输入指示器 | 启动现有的每个聊天一次的输入循环。重复的 `started` 事件不会增加额外的循环。 | 被生命周期钩子忽略。响应内容通过正常的回复路径继续。 | 在任何终止事件发生时停止输入循环，且不会遗留过期的 interval。 | `tool_call` 没有原生的状态展示面，不需要适配器 UI。 | `packages/channels/telegram/src/TelegramAdapter.test.ts` |
| Weixin | `started`, `completed`, `cancelled`, `failed` | 正在输入指示器 | 为当前活跃的聊天调用一次 `setTyping(chatId, true)`。重复的 `started` 事件不会重新叠加输入状态。 | 被生命周期钩子忽略。响应内容通过正常的发送路径继续。 | 在终止事件时调用 `setTyping(chatId, false)`。失败的启动尝试会清除本地状态，以便后续的 `started` 可以重试。 | `tool_call` 没有独立的状态展示面，不应发送额外的消息。 | `packages/channels/weixin/src/WeixinAdapter.test.ts` |
| DingTalk | `started`, `completed`, `cancelled`, `failed` | 入站消息的“眼睛” Reaction | 当 conversation id 可用时，附加一次现有的“眼睛” Reaction。 | 被生命周期钩子忽略。响应内容通过正常的发送路径继续。 | 在终止事件时撤回“眼睛” Reaction，包括取消后延迟解决的附加竞态。 | 直接的机器人 webhook 聊天不暴露 Reaction 所需的 conversation id，因此生命周期状态在那里是无操作。`tool_call` 也没有范围内的 UI。 | `packages/channels/dingtalk/src/DingtalkAdapter.test.ts` |
| Feishu | `started`, `completed`, `cancelled`, `failed` | 流式卡片状态标签 | 在现有卡片流处于活动状态时，保持卡片处于运行状态，并为运行标签预留空间。 | 不被生命周期钩子直接消费。内容流式传输仍由现有的响应/卡片流钩子负责。 | 将卡片状态标签最终确定为已完成、已取消或已失败，且不会覆盖流式传输的回答正文。 | `tool_call` 保持隐藏，因为卡片仅使用回答流加上终止状态标签。 | `packages/channels/feishu/src/adapter.test.ts`, `packages/channels/feishu/src/markdown.test.ts` |
| QQ Bot | 无 | 无 | 无操作。 | 无操作。QQ Bot 仍然通过出站消息发送流式传输回复块，但不通过生命周期状态更新。 | 无操作。 | 该渠道没有输入中或任务状态的端点，并且 `QQChannel` 在设计上将 `onPromptStart`、`onPromptEnd` 和 `onTaskLifecycle` 留空。 | `packages/channels/qqbot/src/send.test.ts`, `packages/channels/qqbot/src/api.test.ts` |
| Plugin example | 无 | 仅 WebSocket 协议消息 | 生命周期状态无操作。 | 通过 mock 协议的 `chunk` 消息类型从 `onResponseChunk` 流式传输响应块，在生命周期状态处理之外。 | 在响应完成时发送最终的出站消息，在生命周期状态处理之外。 | mock 渠道仅演示传输链路；它没有原生的输入中、Reaction 或状态展示面。 | `integration-tests/channel-plugin.test.ts` |

## 审查备注

- Feishu 生命周期的 `text_chunk` 在生命周期钩子中仍为无操作。它不会在那里追加或更新回答内容。
- Slack 被有意排除在此矩阵之外，因为它不在范围内。
- DingTalk 的终止事件在此范围内仅撤回现有的“眼睛” Reaction。不添加终止 emoji。