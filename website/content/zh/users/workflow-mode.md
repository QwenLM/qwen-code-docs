# 会话 Workflow 模式


Workflow 模式会保存一项偏好设置，使当前会话中的普通新提交考虑使用 Workflow 工具。该模式默认关闭。模型仍会自行判断 workflow 是否有用，所有权限、信任、预算和工具限制仍然有效。启用该模式不会启动运行、改变推理力度，也不会改变默认设置。

Workflow 工具为 opt-in。在开启模式之前，请在设置中启用 `tools.workflowsEnabled` 或设置 `QWEN_CODE_ENABLE_WORKFLOWS=1`：

```sh
QWEN_CODE_ENABLE_WORKFLOWS=1 qwen --workflow-mode on
qwen --resume <session-id> --workflow-mode off
```

当 Workflow 工具不可用时，使用 `--workflow-mode on` 启动会导致初始化失败。`QWEN_CODE_DISABLE_WORKFLOWS=1` 的优先级高于启用 Workflow 工具。

在任一终端渲染器中，使用 `/workflows mode` 或 `/workflows mode status` 查看状态，使用 `/workflows mode on` 或 `/workflows mode off` 修改状态。这些模式控制可以在响应流式传输时运行；它们影响后续的符合条件的提交。页脚显示 `Workflow mode: on`，如果保存的偏好当前无法应用，则显示 `Workflow mode: on (unavailable)`。现有的 `/workflows` 运行列表和暂停控制保持原有行为。

状态将 `requested`（保存的偏好）、`available`（所需工具当前可用）和 `effective`（两者均为 true）分开。开启需要 Workflow 工具可用。当工具不可用时仍然可以关闭。失去某个工具不会清除已保存的开启偏好；恢复该工具后该偏好会重新生效。

该模式受普通本地会话和常规 daemon 会话支持，包括次级工作区所有者。托管会话、SSH 会话、派生/子代理会话和 session-agent 会话，以及禁用聊天记录的会话，不支持模式更改。不支持该协议的会话不会广播此能力或选项。写入失败时已发布的模式保持不变。

## 提醒与输入行为

首次符合条件的提交会收到一条仅模型可见的提醒。在没有其他变化的情况下，后续稀疏提醒分别在第 11 次和第 21 次提交时出现，之后每十次符合条件的提交出现一次。关闭模式或失去能力会在下一次符合条件的提交时发送一条退出通知。只有实际的模型调度才会消耗提醒或推进计数；调度前的取消或拒绝不会。重试和回退尝试共享同一个传递令牌。如果取消操作从模型历史中移除了已调度的模式提醒，下一次符合条件的提交会重新宣布当前状态。

普通的 CLI、SDK 和 ACP 提交可以在无人工来源声明的情况下使用此显式模式。工具续接、重试、hook、斜杠命令生成的提示、shell 模式、侧查询、自动 Goal/Cron/通知/channel 轮次，以及子代理，不会添加新的模式提醒或推进其计数。当模式或尚未传递的状态转换需要上下文时，prompt speculation 会暂停。

[单轮关键字提示](./workflow-intent.md)保持独立。其人工来源要求和退出设置不变。有效的关键字和模式提醒共享同一个信封；关闭持久模式不会禁用有效的单轮关键字。仅模式提醒不会激活临时关键字指示器或关键字遥测。

## 会话生命周期

恢复时会还原所选 transcript 分支上最后一条有效的布尔记录，并一次性宣布已保存的开启或关闭状态。显式的 CLI 或 SDK 初始值会在会话就绪后一次性覆盖该恢复值。初始值冲突，或在 Workflow 工具不可用时初始值为开启，都会导致初始化失败。新建或已清除的会话默认关闭。fork 独立继承其选定的检查点；rewind 保留当前偏好并将其锚定在恢复后的分支中。成功的压缩会在下一次符合条件的全新提交时重新宣布状态。恢复失败或分支切换重建了上一个会话的历史后，下一次符合条件的提交会重新宣布其保存的状态。没有保存偏好的会话保持静默。

## TypeScript SDK 和 ACP

```ts
const session = query({
  prompt: messages(),
  options: { workflowMode: true },
});
const state = await session.getWorkflowMode();
await session.setWorkflowMode(false);
```

`workflowMode` 为可选：省略时保留恢复的值，而 `false` 则显式保存为关闭。初始化会协商并暂存初始值；`Query.initialized` 为控制握手。get/set 操作会等待会话就绪。会话初始化进行中时，重复的初始化请求会被拒绝。较旧的 CLI 会在首次提示之前拒绝显式模式请求，而不是静默忽略。自定义传输使用相同的控制协议。

ACP 广播标准的 `workflow_mode` 配置选项，取值为 `on` 和 `off`。其 `currentValue` 反映请求的状态，而 `_meta['qwen.workflowMode']` 包含 `available`、`effective` 以及可选的 `reason`。已提交的更改和能力刷新会通过 `config_option_update` 发布完整选项。

Daemon 客户端使用现有的会话 config-option 端点或 `setSessionConfigOption(sessionId, 'workflow_mode', 'on', clientId)`。该选项不接受 `persist` 覆盖：它始终为会话级持久。上下文回读和更新属于该会话的当前所有者，包括其租约和 generation 检查。Web/IDE 专用控制不包含在此实现中。