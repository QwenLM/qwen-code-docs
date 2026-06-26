# Agent Tool 展示实现计划

> **给 Claude：** 必需的子技能：使用 superpowers:executing-plans 逐步实现此计划。

**目标：** 为 Agent 工具执行添加专用的 VSCode/Web UI 展示，使子代理的进度、摘要和失败信息能根据结构化 `rawOutput` 渲染，而不是回退到通用工具卡片。

**架构：** 将 ACP 的 `rawOutput` 通过 VSCode 会话/更新管道保留至 `ToolCallData`，然后让共享的 web UI 路由检测 `task_execution` 载荷并渲染专用的 `AgentToolCall` 组件。使变更保留在 `packages/webui` 共享目录中，确保 VSCode 和 `ChatViewer` 保持一致。

**技术栈：** TypeScript、React、Vitest、共享的 `@qwen-code/webui` 工具调用组件。

### 任务 1：锁定失败的数据流行为

**文件：**

- 修改：`packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.test.ts`
- 创建：`packages/vscode-ide-companion/src/webview/hooks/useToolCalls.test.tsx`

**步骤 1：编写会失败的测试**

- 添加一个会话处理程序测试，断言当 ACP 发送 `task_execution` 载荷时，`tool_call_update` 能转发 `rawOutput`。
- 添加一个钩子测试，断言 `useToolCalls` 能存储并更新 agent 工具调用的 `rawOutput`。

**步骤 2：运行测试以验证失败**

运行：`npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

预期：失败，因为当前处理程序/钩子管道中未保留 `rawOutput`。

### 任务 2：锁定失败的渲染器行为

**文件：**

- 创建：`packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

**步骤 1：编写会失败的测试**

- 使用 `kind: 'other'` 加上 `rawOutput.type === 'task_execution'` 渲染路由后的工具调用。
- 断言任务描述、活动的子工具、摘要和失败原因会从专用的 agent 展示中渲染，而不是通用文本输出。

**步骤 2：运行测试以验证失败**

运行：`npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

预期：失败，因为路由仅依赖于 `kind`，且没有专用的 agent 组件。

### 任务 3：端到端保留结构化的 agent 输出

**文件：**

- 修改：`packages/vscode-ide-companion/src/types/chatTypes.ts`
- 修改：`packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.ts`
- 修改：`packages/vscode-ide-companion/src/webview/hooks/useToolCalls.ts`
- 修改：`packages/webui/src/components/toolcalls/shared/types.ts`

**步骤 1：实现最小的数据模型变更**

- 在 VSCode 会话/webview 工具调用类型中添加可选的 `rawOutput`。
- 在 `QwenSessionUpdateHandler` 中转发 `rawOutput`。
- 在 `useToolCalls` 中存储/合并 `rawOutput`。
- 在共享的 web UI 工具调用数据类型中暴露 `rawOutput`。

**步骤 2：运行聚焦的测试**

运行：`npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

预期：通过。

### 任务 4：添加共享的 agent 工具调用 UI

**文件：**

- 创建：`packages/webui/src/components/toolcalls/AgentToolCall.tsx`
- 修改：`packages/webui/src/components/toolcalls/index.ts`
- 修改：`packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.tsx`
- 修改：`packages/webui/src/components/ChatViewer/ChatViewer.tsx`

**步骤 1：实现最小的渲染器**

- 添加对 `rawOutput.type === 'task_execution'` 的守卫。
- 将任务描述渲染为头部。
- 显示 agent 名称 + 状态、当前运行中的子工具、完成摘要以及失败/取消原因。
- 通过独立渲染每个工具调用，保持布局与多个并行 agent 卡片兼容。

**步骤 2：运行聚焦的渲染器测试**

运行：`npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

预期：通过。

### 任务 5：验证集成的表面

**文件：**

- 修改：`packages/webui/src/index.ts`

**步骤 1：如果需要，导出新的共享组件**

- 重新导出 VSCode 或 `ChatViewer` 所需的任何新组件/类型。

**步骤 2：运行包验证**

运行：`npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`
运行：`npm run check-types --workspace=packages/vscode-ide-companion`
运行：`npm run typecheck --workspace=packages/webui`

预期：所有目标测试和类型检查通过。