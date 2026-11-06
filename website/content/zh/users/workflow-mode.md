# 会话 Workflow 模式


Workflow 模式会在当前会话中为普通新提交保存一项偏好设置，使其考虑使用 Workflow 工具。该模式默认关闭。模型仍会自行判断是否需要使用 workflow，所有权限、信任、预算和工具限制继续生效。启用该模式不会启动运行、不会更改推理力度，也不会更改你的默认设置。

Workflow 工具需要主动启用。在设置中启用 `tools.workflowsEnabled`，或在开启模式之前设置
`QWEN_CODE_ENABLE_WORKFLOWS=1`：

```sh
QWEN_CODE_ENABLE_WORKFLOWS=1 qwen --workflow-mode on
qwen --resume <session-id> --workflow-mode off
```

如果在 Workflow 工具不可用时以 `--workflow-mode on` 启动，初始化将失败。`QWEN_CODE_DISABLE_WORKFLOWS=1` 的优先级高于启用 Workflow 工具。

在任意终端渲染器中，使用 `/workflows mode` 或
`/workflows mode status` 查看状态，使用 `/workflows mode on` 或
`/workflows mode off` 进行更改。这些模式控制可以在响应流式输出期间运行；它们会影响后续的符合条件的提交。页脚会显示
`Workflow mode: on`，如果保存的偏好当前无法应用，则显示 `Workflow mode: on (unavailable)`。现有的 `/workflows` 运行列表和暂停
控制保留其原有行为。

该状态将 `requested`（保存的偏好）、`available`（所需工具当前可用）和 `effective`（两者均为 true）分开管理。
开启模式需要 Workflow 工具可用。在工具不可用时仍可关闭模式。丢失某个工具不会清除已保存的开启
偏好；恢复该工具后，该偏好将再次生效。

该模式支持普通本地会话和常规守护进程会话，
包括次级工作区所有者。托管会话、SSH 会话、派生/子代理会话和
会话代理会话，以及禁用了聊天记录的会话，不支持模式更改。不支持的协议会话不会广播该
能力或选项。写入失败时，已发布的模式保持不变。

## Web Shell 和 VS Code

Web Shell、分屏面板和现代 VS Code 聊天中的编辑器在
**+** 菜单中为受支持的会话列出 **Workflow** 选项。勾选标记表示
保存的偏好，而非模式当前是否能生效；在较宽的
屏幕上，第二行会简要说明该模式的作用或其当前状态。当
偏好开启时，工具栏会显示一个 **Workflow** 标签；其工具提示包含
状态详情，点击可关闭该模式。如果偏好已开启
但工具不可用，该选项仍保持勾选，标签以
警告颜色显示，两者均可用于关闭该模式。

在会话创建或恢复之前，该控件显示一个可用性
占位符。它不会创建会话或保存未来偏好。未广播支持的宿主（包括旧版服务器）会隐藏该选项。隐藏
**+** 菜单的宿主既不显示该选项，也不显示标签。

来自其他客户端的更改会自动更新同一会话的控件。
在写入或重连期间，最后确认的值保持可见，
选项和标签在状态确认之前处于禁用状态。超时是
未确认的结果，而非成功的更改；客户端会读取当前
状态，而不是自动重试写入。活跃的响应不会
禁用该选项或标签：更改会应用于下一个新的轮次，
且不会改变推理力度。

## 提醒与输入行为

第一个符合条件的提交会收到一条仅面向模型的提醒。在没有其他
变化的情况下，后续提醒会在第 11 次和第 21 次提交时出现，之后每隔十次
符合条件的提交出现一次。关闭模式或丧失能力会在下一个符合条件的提交时发送一条退出通知。只有实际的模型调度才会消耗一次
提醒或推进计数；调度前的取消或拒绝不会。重试和回退尝试共享同一个投递令牌。如果
取消从模型历史中移除了已调度的模式提醒，下一个
符合条件的提交会重新通告当前状态。

普通 CLI、SDK 和 ACP 提交可以使用此显式模式，无需
人类来源声明。工具续接、重试、hook、斜杠命令生成的
提示、shell 模式、侧查询、自动 Goal/Cron/通知/channel
轮次以及子代理不会添加新的模式提醒或推进其计数。
当模式或未投递的转换需要上下文时，Prompt speculation 会暂停。

[单轮关键词提示](./workflow-intent.md) 保持独立。其人类
来源要求和退出设置不变。有效的关键词
和模式提醒共享同一个信封；关闭持久模式不会
禁用有效的单轮关键词。仅模式提醒不会激活
临时关键词指示器或关键词遥测。

## 会话生命周期

恢复会在所选转录分支上恢复最后有效的布尔记录，
并通告一次已保存的开启或关闭状态。显式的 CLI 或 SDK
初始值会在会话就绪后一次性覆盖该恢复值。
冲突的初始值或在 Workflow 工具不可用时的初始开启值会导致初始化失败。新建或清空的会话默认关闭。fork
会独立继承其选定的检查点；rewind 会保留
当前偏好并将其锚定在恢复的分支中。成功的
压缩会在下一个符合条件的新提交时重新通告状态。
在恢复失败或分支切换重建了前一个会话的历史之后，
下一个符合条件的提交会重新通告其保存的状态。没有
保存偏好的会话保持静默。

## TypeScript SDK 和 ACP

```ts
const session = query({
  prompt: messages(),
  options: { workflowMode: true },
});
const state = await session.getWorkflowMode();
await session.setWorkflowMode(false);
```

`workflowMode` 是可选的：省略时保留恢复的值，而 `false`
会显式保存关闭状态。初始化会协商并暂存初始值；
`Query.initialized` 是控制握手。get/set 操作会等待
会话就绪。会话初始化进行中时，重复的初始化请求会被拒绝。旧版 CLI 会在第一个提示之前拒绝显式模式请求，
而非静默忽略。自定义传输使用相同的
控制协议。

ACP 广播一个标准的 `workflow_mode` 配置选项，值为 `on` 和
`off`。其 `currentValue` 反映请求的状态，而
`_meta['qwen.workflowMode']` 包含 `available`、`effective` 以及可选的
`reason`。已提交的更改和能力刷新会通过 `config_option_update` 发布完整选项。

守护进程客户端使用现有的会话配置选项端点或
`setSessionConfigOption(sessionId, 'workflow_mode', 'on', clientId)`。该选项
不接受 `persist` 覆盖：它始终是会话级持久的。上下文
回读和更新属于该会话的当前所有者，包括其
租约和 generation 检查。Web Shell 和现代 VS Code 宿主使用
这些相同的会话控制和更新。