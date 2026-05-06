# Fork Subagent 设计

> 隐式 fork subagent，继承父级的完整对话上下文并共享 prompt cache，以实现高性价比的并行任务执行。

## 概述

当调用 Agent tool 时未指定 `subagent_type`，将触发隐式 **fork** —— 一个在后台运行的 subagent，它会继承父级的对话历史、system prompt 和 tool 定义。该 fork 使用 `CacheSafeParams` 确保其 API 请求与父级共享相同的前缀，从而命中 DashScope 的 prompt cache。

## 架构

```
Parent conversation: [SystemPrompt | Tools | Msg1 | Msg2 | ... | MsgN (model)]
                              ↑ identical prefix for all forks ↑

Fork A: [...MsgN | placeholder results | "Research A"]  ← shared cache
Fork B: [...MsgN | placeholder results | "Modify B"]    ← shared cache
Fork C: [...MsgN | placeholder results | "Test C"]      ← shared cache
```

## 核心组件

### 1. FORK_AGENT (`forkSubagent.ts`)

合成的 agent 配置，未注册到 `builtInAgents` 中。包含一个备用的 `systemPrompt`，但实际运行时通过 `generationConfigOverride` 使用父级渲染后的 system prompt。

### 2. CacheSafeParams 集成 (`agent.ts` + `forkedQuery.ts`)

```
agent.ts (fork path)
  │
  ├── getCacheSafeParams()          ← parent's generationConfig snapshot
  │     ├── generationConfig        ← systemInstruction + tools + temp/topP
  │     └── history                 ← (not used — we build extraHistory instead)
  │
  ├── forkGenerationConfig          ← passed as generationConfigOverride
  └── forkToolsOverride             ← FunctionDeclaration[] extracted from tools
        │
        ▼
  AgentHeadless.execute(context, signal, {
    extraHistory,                   ← parent conversation history
    generationConfigOverride,       ← parent's exact systemInstruction + tools
    toolsOverride,                  ← parent's exact tool declarations
  })
        │
        ▼
  AgentCore.createChat(context, {
    extraHistory,
    generationConfigOverride,       ← bypasses buildChatSystemPrompt()
  })                                   AND skips getInitialChatHistory()
        │                              (extraHistory already has env context)
        ▼
  new GeminiChat(config, generationConfig, startHistory)
                          ↑ byte-identical to parent's config
```

### 3. History 构建 (`agent.ts` + `forkSubagent.ts`)

fork 的 `extraHistory` 必须以 model 消息结尾，以便在 `agent-headless` 发送 `task_prompt` 时保持 Gemini API 要求的 user/model 交替格式。

分为三种情况：

| 父级历史结尾类型 | `extraHistory` 构建方式 | `task_prompt` |
| ----------------------------- | ---------------------------------------------------------------------- | ------------------------------ |
| `model`（无 function calls） | `[...rawHistory]`（保持不变） | `buildChildMessage(directive)` |
| `model`（含 function calls） | `[...rawHistory, model(clone), user(responses+directive), model(ack)]` | `'Begin.'` |
| `user`（罕见情况） | `rawHistory.slice(0, -1)`（移除末尾的 user 消息） | `buildChildMessage(directive)` |

### 4. 防止递归 Fork (`forkSubagent.ts`)

`isInForkChild()` 会扫描对话历史中是否存在 `<fork-boilerplate>` 标签。若发现该标签，则拒绝 fork 尝试并返回错误信息。

### 5. 后台执行 (`agent.ts`)

Fork 使用 `void executeSubagent()`（fire-and-forget 模式）并立即向父级返回 `FORK_PLACEHOLDER_RESULT`。后台任务中的错误会被捕获、记录日志，并反映在显示状态中。

## 数据流

```
1. Model calls Agent tool (no subagent_type)
2. agent.ts: import forkSubagent.js
3. agent.ts: getCacheSafeParams() → forkGenerationConfig + forkToolsOverride
4. agent.ts: build extraHistory from parent's getHistory(true)
5. agent.ts: build forkTaskPrompt (directive or 'Begin.')
6. agent.ts: createAgentHeadless(FORK_AGENT, ...)
7. agent.ts: void executeSubagent() — background
8. agent.ts: return FORK_PLACEHOLDER_RESULT to parent immediately
9. Background:
   a. AgentHeadless.execute(context, signal, {extraHistory, generationConfigOverride, toolsOverride})
   b. AgentCore.createChat() — uses parent's generationConfig (cache-shared)
   c. runReasoningLoop() — uses parent's tool declarations
   d. Fork executes tools, produces result
   e. updateDisplay() with final status
```

## 优雅降级

如果 `getCacheSafeParams()` 返回 null（首轮对话，尚无历史），fork 将回退至：

- 使用 `FORK_AGENT.systemPrompt` 作为 system instruction
- 使用 `prepareTools()` 获取 tool declarations

这确保了即使无法共享 cache，fork 也能正常运行。

## 相关文件

| 文件 | 职责 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/core/src/agents/runtime/forkSubagent.ts`   | FORK_AGENT 配置、buildForkedMessages()、isInForkChild()、buildChildMessage() |
| `packages/core/src/tools/agent.ts`                   | Fork 路径：获取 CacheSafeParams、构建 extraHistory、后台执行 |
| `packages/core/src/agents/runtime/agent-headless.ts` | execute() 选项：generationConfigOverride、toolsOverride |
| `packages/core/src/agents/runtime/agent-core.ts`     | CreateChatOptions.generationConfigOverride |
| `packages/core/src/followup/forkedQuery.ts`          | CacheSafeParams 基础设施（现有代码，无变更） |