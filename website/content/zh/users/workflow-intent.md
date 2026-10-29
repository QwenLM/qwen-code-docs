# 为单轮请求工作流


对于跨普通提交的已保存偏好，请参见
[会话 Workflow 模式](./workflow-mode.md)。

在 `tools.workflowsEnabled` 启用的情况下，在用户提交中包含 `ultracode` 或已有的
`workflow` 关键字，可以建议该轮次使用 Workflow 工具。例如：`ultracode: audit these three modules`。
模型会自行判断该请求是否适合使用工作流。该关键字不会
启动工作流、更改权限、选择模型或改变推理力度。

终端中 Ink 和 OpenTUI 的输入、IDE 编辑器输入以及 Web Shell 编辑器
输入均支持此提醒。它会与你的显示消息分开添加到模型请求中。
下一次普通提交不会继承该提醒。工具续接和自动重试不会再次添加。
粘贴到编辑器中的文本视为人类输入；附件展开
和 Hook 添加的上下文则不算。

召回的历史记录和 Ink Vim 寄存器粘贴仍属于未知输入，包括
清空缓冲区或禁用 Vim 之后的情况。新输入的 Vim 插入模式内容
仍可激活该提醒。

`ultracode` 会忽略完整引用/代码片段以及类似路径的标记，例如
`ultracode.js`、`x-ultracode` 或 `ultracode/file`。已有的 `workflow`
兼容规则接受带边缘标点的独立空白分隔词，例如 `(workflow)`，但不接受 `workflows` 或 `my-workflow-runner`。
当两个关键字同时出现时，只添加一个提醒。

普通的 `qwen -p`、标准输入、定时输入和 SDK 字符串提示不会
自动加入。TypeScript SDK 流式输入可以显式标识
每条原始人类消息：

```ts
import { query, type SDKUserMessage } from ' @qwen-code/sdk';

async function* messages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: crypto.randomUUID(),
    parent_tool_use_id: null,
    origin: { kind: 'human' },
    message: { role: 'user', content: 'ultracode: inspect the modules' },
  };
}

for await (const event of query({ prompt: messages() })) {
  console.log(event);
}
```

对于应用生成的上下文、自动化、工具结果
和历史重放，省略 `origin`。缺失或无效的 origin 不会破坏
普通聊天，只是不会有关键字提醒。该声明不授予任何工具权限。
ACP 客户端可以使用已有的每请求 `_meta['qwen.submittedPrompt']`
声明来传递原始人类文本；守护进程私有元数据仍为保留字段。

将 `ui.disableWorkflowKeywordTrigger` 设为 `true` 可在这些入口点
禁用两个关键字。在终端设置对话框中，该选项名为
**Disable Workflow Keyword Trigger**，对新提交生效。
当工作流或所需工具表面不可用时，也会省略该提醒。仅名称的工作流会话只建议已保存的工作流
（使用 `{ name, args }`）；不会建议编写脚本。
