# Agent 工具显示实现计划

> **For Claude:** 必需子技能：使用 superpowers:executing-plans 逐步执行此计划。

**目标：** 为 Agent 工具执行添加专用的 VSCode/Web UI 显示界面，使子 Agent 的进度、摘要和失败信息能够基于结构化的 `rawOutput` 进行渲染，而不是回退到通用的工具卡片。

**架构：** 在 VSCode session/update 管道中将 ACP 的 `rawOutput` 保留并传递至 `ToolCallData`，随后让共享的 Web UI 路由检测 `task_execution` 负载并渲染专用的 `AgentToolCall` 组件。将变更保留在 `packages/webui` 中共享，以确保 VSCode 和 `ChatViewer` 保持同步。

**技术栈：** TypeScript、React、Vitest 以及共享的 `@qwen-code/webui` tool-call 组件。

### 任务 1：锁定数据流失败行为

**文件：**

- 修改：`packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.test.ts`
- 创建：`packages/vscode-ide-companion/src/webview/hooks/useToolCalls.test.tsx`

**步骤 1：编写失败测试用例**

- 添加 session handler 测试，断言当 ACP 发送 `task_execution` 负载时，`tool_call_update` 会转发 `rawOutput`。
- 添加 hook 测试，断言 `useToolCalls` 会存储并更新 agent tool call 的 `rawOutput`。

**步骤 2：运行测试以验证其失败**

运行：`npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

预期结果：测试失败，因为当前 handler/hook 管道中未保留 `rawOutput`。

### 任务 2：锁定渲染器失败行为

**文件：**

- 创建：`packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

**步骤 1：编写失败测试用例**

- 渲染路由后的 tool call，设置 `kind: 'other'` 且 `rawOutput.type === 'task_execution'`。
- 断言任务描述、活跃的子工具、摘要以及失败原因均通过专用的 agent 显示组件渲染，而非通用的文本输出。

**步骤 2：运行测试以验证其失败**

运行：`npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

预期结果：测试失败，因为当前路由仅依赖 `kind` 进行匹配，且不存在专用的 agent 组件。

### 任务 3：端到端保留结构化 agent 输出

**文件：**

- 修改：`packages/vscode-ide-companion/src/types/chatTypes.ts`
- 修改：`packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.ts`
- 修改：`packages/vscode-ide-companion/src/webview/hooks/useToolCalls.ts`
- 修改：`packages/webui/src/components/toolcalls/shared/types.ts`

**步骤 1：实现最小化的数据模型变更**

- 在 VSCode session/webview 的 tool-call 类型中添加可选的 `rawOutput`。
- 在 `QwenSessionUpdateHandler` 中转发 `rawOutput`。
- 在 `useToolCalls` 中存储/合并 `rawOutput`。
- 在共享的 Web UI tool-call 数据类型中暴露 `rawOutput`。

**步骤 2：运行针对性测试**

运行：`npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

预期结果：测试通过。

### 任务 4：添加共享的 agent tool-call UI

**文件：**

- 创建：`packages/webui/src/components/toolcalls/AgentToolCall.tsx`
- 修改：`packages/webui/src/components/toolcalls/index.ts`
- 修改：`packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.tsx`
- 修改：`packages/webui/src/components/ChatViewer/ChatViewer.tsx`

**步骤 1：实现最小化的渲染器**

- 添加针对 `rawOutput.type === 'task_execution'` 的守卫逻辑。
- 将任务描述渲染为标题。
- 显示 agent 名称与状态、当前运行的子工具、完成摘要以及失败/取消原因。
- 通过独立渲染每个 tool call，确保布局兼容多个并行的 agent 卡片。

**步骤 2：运行针对性渲染器测试**

运行：`npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

预期结果：测试通过。

### 任务 5：验证集成界面

**文件：**

- 修改：`packages/webui/src/index.ts`

**步骤 1：按需导出新的共享组件**

- 重新导出 VSCode 或 `ChatViewer` 所需的任何新组件/类型。

**步骤 2：运行包验证**

运行：`npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`
运行：`npm run check-types --workspace=packages/vscode-ide-companion`
运行：`npm run typecheck --workspace=packages/webui`

预期结果：所有目标测试和类型检查均通过。