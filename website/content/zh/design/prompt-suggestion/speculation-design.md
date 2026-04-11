# 推测引擎设计

> 在用户确认前，使用写时复制（Copy-on-Write）文件隔离机制推测执行已接受的建议。当用户按下 Tab 键时，结果将即时显示。

## 概述

当显示提示建议时，**推测引擎**会立即使用 fork 的 GeminiChat 在后台开始执行它。文件写入操作会指向一个临时覆盖（overlay）目录。如果用户接受该建议，覆盖目录中的文件将被复制到真实文件系统，且推测的对话内容会被注入到主聊天历史中。如果用户输入了其他内容，推测将被中止，覆盖目录也会被清理。

## 架构

```
用户看到建议 "commit this"
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  startSpeculation()                                          │
│                                                              │
│  ┌─────────────────┐    ┌────────────────────┐               │
│  │ Forked GeminiChat│    │  OverlayFs          │              │
│  │ (cache-shared)   │    │  /tmp/qwen-         │              │
│  │                  │    │   speculation/       │              │
│  │  systemInstruction│   │   {pid}/{id}/        │              │
│  │  + tools          │   │                      │              │
│  │  + history prefix │   │  COW: 首次写入时     │              │
│  │                  │    │  复制原文件          │              │
│  └────────┬─────────┘    └──────────┬───────────┘             │
│           │                         │                         │
│           ▼                         │                         │
│  ┌──────────────────────────────────┴──────────────────────┐  │
│  │  推测循环（最多 20 轮，100 条消息）                       │  │
│  │                                                         │  │
│  │  模型响应                                                │  │
│  │       │                                                 │  │
│  │       ▼                                                 │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │  speculationToolGate                             │   │  │
│  │  │                                                  │   │  │
│  │  │  Read/Grep/Glob/LS/LSP → 允许 (+ 覆盖目录读取)   │   │  │
│  │  │  Edit/WriteFile → 重定向到覆盖目录               │   │  │
│  │  │    (仅限 auto-edit/yolo 模式)                    │   │  │
│  │  │  Shell → AST 检查只读? 允许 : 边界               │   │  │
│  │  │  WebFetch/WebSearch → 边界                       │   │  │
│  │  │  Agent/Skill/Memory/Ask → 边界                   │   │  │
│  │  │  Unknown/MCP → 边界                              │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  │       │                                                 │  │
│  │       ▼                                                 │  │
│  │  工具执行: toolRegistry.getTool → build → execute       │  │
│  │  (绕过 CoreToolScheduler — 由 toolGate 控制)            │  │
│  │                                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                              │
│  完成时 → generatePipelinedSuggestion()                      │
└──────────────────────────────────────────────────────────────┘
           │
           │  用户按下 Tab / Enter
           ▼
     ┌─── status === 'completed'? ───┐
     │ 是                      否（边界） │
     ▼                                ▼
┌─────────────────────────┐  ┌────────────────────────┐
│  acceptSpeculation()    │  │  丢弃推测               │
│                         │  │  中止 + 清理            │
│  1. applyToReal()       │  │  正常提交查询           │
│  2. ensureToolPairing() │  │  (addMessage)           │
│  3. addHistory()        │  └────────────────────────┘
│  4. render tool_group   │
│  5. cleanup overlay     │
│  6. pipelined suggest   │
└─────────────────────────┘
           │
           │  用户改为输入其他内容
           ▼
┌──────────────────────────────────────────────────────────────┐
│  abortSpeculation()                                          │
│                                                              │
│  1. abortController.abort() — 取消 LLM 调用                 │
│  2. overlayFs.cleanup() — 删除临时目录                       │
│  3. 更新推测状态（中止时不上报遥测数据）                     │
└──────────────────────────────────────────────────────────────┘
```

## 写时复制（Copy-on-Write）覆盖层

```
真实 CWD: /home/user/project/
覆盖目录:  /tmp/qwen-speculation/12345/a1b2c3d4/

写入 src/app.ts:
  1. 复制 /home/user/project/src/app.ts → overlay/src/app.ts（仅首次）
  2. 工具写入 overlay/src/app.ts

读取 src/app.ts:
  - 若在 writtenFiles 中 → 从 overlay/src/app.ts 读取
  - 否则 → 从 /home/user/project/src/app.ts 读取

新文件 (src/new.ts):
  - 直接创建 overlay/src/new.ts（无需复制原文件）

接受:
  - copyFile(overlay/src/app.ts → /home/user/project/src/app.ts)
  - copyFile(overlay/src/new.ts → /home/user/project/src/new.ts)
  - rm -rf overlay/

中止:
  - rm -rf overlay/
```

## 工具门控安全

| 工具                                                       | 动作     | 条件                                         |
| ---------------------------------------------------------- | -------- | -------------------------------------------- |
| read_file, grep, glob, ls, lsp                             | allow    | 读取路径通过覆盖目录解析                     |
| edit, write_file                                           | redirect | 仅限 auto-edit / yolo 审批模式               |
| edit, write_file                                           | boundary | 在 default / plan 审批模式下                 |
| shell                                                      | allow    | `isShellCommandReadOnlyAST()` 返回 true      |
| shell                                                      | boundary | 非只读命令                                   |
| web_fetch, web_search                                      | boundary | 网络请求需用户同意                           |
| agent, skill, memory, ask_user, todo_write, exit_plan_mode | boundary | 推测期间无法与用户交互                       |
| Unknown / MCP tools                                        | boundary | 安全默认值                                   |

### 路径重写

- **写入工具**：`rewritePathArgs()` 通过 `overlayFs.redirectWrite()` 将 `file_path` 重定向到覆盖目录
- **读取工具**：若文件曾被写入，`resolveReadPaths()` 通过 `overlayFs.resolveReadPath()` 将 `file_path` 重定向到覆盖目录
- **重写失败**：视为边界情况（例如，cwd 外的绝对路径会在 `redirectWrite` 中抛出异常）

## 边界处理

当在单轮对话中途触发边界时：

1. 保留已执行的工具调用（基于索引跟踪，而非名称）
2. 从模型消息中剥离未执行的函数调用
3. 将部分工具响应添加到历史记录
4. 注入前通过 `ensureToolResultPairing()` 验证完整性

## 流水线建议

推测完成（未触发边界）后，第二次 LLM 调用会生成**下一个**建议：

```
上下文：原始对话 + "commit this" + 推测消息
→ LLM 预测："push it"
→ 存储于 state.pipelinedSuggestion
→ 接受时：setPromptSuggestion("push it") — 即时显示
```

这支持了 Tab-Tab-Tab 工作流，每次接受都会立即显示下一步。

流水线建议复用了从 `suggestionGenerator.ts` 导出的 `SUGGESTION_PROMPT` 常量（而非本地副本），以确保与初始建议的质量一致。

## 快速模型

`startSpeculation` 接受可选的 `options.model` 参数，该参数会贯穿 `runSpeculativeLoop` 和 `generatePipelinedSuggestion` 传递至 `runForkedQuery`。通过顶层 `fastModel` 设置进行配置（为空则使用主模型）。所有后台任务（建议生成、推测和流水线建议）均使用相同的 `fastModel`。可通过 `/model --fast <name>` 或 `settings.json` 进行设置。

## UI 渲染

推测完成后，`acceptSpeculation` 通过 `historyManager.addItem()` 渲染结果：

- **用户消息**：渲染为 `type: 'user'` 项
- **模型文本**：渲染为 `type: 'gemini'` 项
- **工具调用**：渲染为 `type: 'tool_group'` 项，包含结构化的 `IndividualToolCallDisplay` 条目（工具名称、参数描述、结果文本、状态）

这会向用户展示完整的推测输出（包含工具调用详情），而不仅仅是纯文本。

## Forked 查询（缓存共享）

### CacheSafeParams

```typescript
interface CacheSafeParams {
  generationConfig: GenerateContentConfig; // systemInstruction + tools
  history: Content[]; // curated, max 40 entries
  model: string;
  version: number; // increments on config changes
}
```

- 在 `GeminiClient.sendMessageStream()` 中每次主轮次成功后保存
- 在 `startChat()` / `resetChat()` 时清除，防止跨会话泄漏
- 历史记录截断至 40 条；`createForkedChat` 使用浅拷贝（参数已是深拷贝快照）
- 显式禁用思考模式（`thinkingConfig: { includeThoughts: false }`）——推测不需要推理 token，且会浪费成本/增加延迟。这不会影响缓存前缀匹配（仅由 systemInstruction + tools + history 决定）
- 通过 `JSON.stringify` 比较 systemInstruction + tools 进行版本检测

### 缓存机制

DashScope 已通过以下方式启用前缀缓存：

- `X-DashScope-CacheControl: enable` 请求头
- 消息和工具上的 `cache_control: { type: 'ephemeral' }` 注解

Forked 的 `GeminiChat` 使用相同的 `generationConfig`（包含 tools）和历史记录前缀，因此 DashScope 现有的缓存机制会自动产生缓存命中。

## 常量

| 常量                     | 值  | 描述                                   |
| ------------------------ | --- | -------------------------------------- |
| MAX_SPECULATION_TURNS    | 20  | 最大 API 往返次数                      |
| MAX_SPECULATION_MESSAGES | 100 | 推测历史记录中的最大消息数             |
| SUGGESTION_DELAY_MS      | 300 | 显示建议前的延迟                       |
| ACCEPT_DEBOUNCE_MS       | 100 | 快速接受操作的防抖锁                   |
| MAX_HISTORY_FOR_CACHE    | 40  | 保存在 CacheSafeParams 中的历史记录条数 |

## 文件结构

```
packages/core/src/followup/
├── followupState.ts          # 框架无关的状态控制器
├── suggestionGenerator.ts    # 基于 LLM 的建议生成 + 12 条过滤规则
├── forkedQuery.ts            # 支持缓存感知的 forked 查询基础设施
├── overlayFs.ts              # 写时复制覆盖文件系统
├── speculationToolGate.ts    # 工具边界强制执行
├── speculation.ts            # 推测引擎（启动/接受/中止）
└── index.ts                  # 模块导出
```