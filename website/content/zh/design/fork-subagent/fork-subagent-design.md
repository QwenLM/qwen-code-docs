# 分支子代理设计

> 隐式分支子代理，继承父级的完整对话上下文，并共享提示词缓存，以实现成本高效的并行任务执行。

## 概述

当 Agent 工具在未指定 `subagent_type` 的情况下被调用时，会触发一个隐式的 **分支**——一个后台子代理，它继承父级的对话历史、系统提示词和工具定义。该分支使用 `CacheSafeParams` 确保其 API 请求与父级共享相同的前缀，从而使 DashScope 提示词缓存能够命中。

## 架构

```
父级对话: [SystemPrompt | Tools | Msg1 | Msg2 | ... | MsgN (模型)]
                              ↑ 所有分支共享相同前缀 ↑

分支 A: [...MsgN | placeholder results | "Research A"]  ← 共享缓存
分支 B: [...MsgN | placeholder results | "Modify B"]    ← 共享缓存
分支 C: [...MsgN | placeholder results | "Test C"]      ← 共享缓存
```

## 关键组件

### 1. FORK_AGENT（`forkSubagent.ts`）

合成 Agent 配置，未注册到 `builtInAgents`。包含一个后备的 `systemPrompt`，但实际使用中通过 `generationConfigOverride` 采用父级渲染后的系统提示词。

### 2. CacheSafeParams 集成（`agent.ts` + `forkedQuery.ts`）

```
agent.ts（分支路径）
  │
  ├── getCacheSafeParams()          ← 父级的 generationConfig 快照
  │     ├── generationConfig        ← systemInstruction + tools + temp/topP
  │     └── history                 ← （未使用——我们改为构建 extraHistory）
  │
  ├── forkGenerationConfig          ← 作为 generationConfigOverride 传递
  └── forkToolsOverride             ← 从 tools 中提取的 FunctionDeclaration[]
        │
        ▼
  AgentHeadless.execute(context, signal, {
    extraHistory,                   ← 父级对话历史
    generationConfigOverride,       ← 父级的精确 systemInstruction + tools
    toolsOverride,                  ← 父级的精确 tool 声明
  })
        │
        ▼
  AgentCore.createChat(context, {
    extraHistory,
    generationConfigOverride,       ← 跳过 buildChatSystemPrompt()
  })                                   并跳过 getInitialChatHistory()
        │                                （extraHistory 已包含环境上下文）
        ▼
  new GeminiChat(config, generationConfig, startHistory)
                          ↑ 与父级 config 字节一致
```

### 3. 历史构建（`agent.ts` + `forkSubagent.ts`）

分支的 `extraHistory` 必须以模型消息结尾，以确保当 `agent-headless` 发送 `task_prompt` 时符合 Gemini API 的用户/模型交替规则。

三种情况：

| 父级历史结尾       | extraHistory 构造方式                                               | task_prompt                  |
| ----------------- | ------------------------------------------------------------------- | ---------------------------- |
| `model`（无函数调用） | `[...rawHistory]`（不变）                                           | `buildChildMessage(directive)` |
| `model`（有函数调用） | `[...rawHistory, model(clone), user(responses+directive), model(ack)]` | `'Begin.'`                     |
| `user`（异常情况）    | `rawHistory.slice(0, -1)`（丢弃末尾 user）                           | `buildChildMessage(directive)` |

### 4. 递归分支预防（`forkSubagent.ts`）

`isInForkChild()` 扫描对话历史，检查是否存在 `<fork-boilerplate>` 标签。如果发现，则拒绝分支尝试并返回错误消息。

### 5. 后台执行（`agent.ts`）

分支使用 `void executeSubagent()`（即发即忘），并立即向父级返回 `FORK_PLACEHOLDER_RESULT`。后台任务中的错误会被捕获、记录并反映在显示状态中。

## 数据流

```
1. 模型调用 Agent 工具（未指定 subagent_type）
2. agent.ts: 导入 forkSubagent.js
3. agent.ts: getCacheSafeParams() → forkGenerationConfig + forkToolsOverride
4. agent.ts: 从父级的 getHistory(true) 构建 extraHistory
5. agent.ts: 构建 forkTaskPrompt（directive 或 'Begin.'）
6. agent.ts: 创建 AgentHeadless(FORK_AGENT, ...)
7. agent.ts: void executeSubagent() — 后台运行
8. agent.ts: 立即向父级返回 FORK_PLACEHOLDER_RESULT
9. 后台：
   a. AgentHeadless.execute(context, signal, {extraHistory, generationConfigOverride, toolsOverride})
   b. AgentCore.createChat() — 使用父级的 generationConfig（缓存共享）
   c. runReasoningLoop() — 使用父级的 tool 声明
   d. 分支执行工具，产生结果
   e. 使用最终状态调用 updateDisplay()
```

## 优雅降级

如果 `getCacheSafeParams()` 返回 null（第一次交互，尚无历史记录），分支会回退到：

- 使用 `FORK_AGENT.systemPrompt` 作为系统指令
- 使用 `prepareTools()` 作为 tool 声明

这确保了即使没有缓存共享，分支也始终能工作。

## 文件

| 文件                                                       | 角色                                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `packages/core/src/agents/runtime/forkSubagent.ts`         | FORK_AGENT 配置，buildForkedMessages()，isInForkChild()，buildChildMessage()            |
| `packages/core/src/tools/agent.ts`                         | 分支路径：CacheSafeParams 获取，extraHistory 构建，后台执行                             |
| `packages/core/src/agents/runtime/agent-headless.ts`       | execute() 选项：generationConfigOverride，toolsOverride                                 |
| `packages/core/src/agents/runtime/agent-core.ts`           | CreateChatOptions.generationConfigOverride                                              |
| `packages/core/src/followup/forkedQuery.ts`                | CacheSafeParams 基础设施（已有，未改动）                                                |