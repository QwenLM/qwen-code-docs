# 推测引擎设计

> 在用户确认之前，使用写时复制（copy-on-write）文件隔离，推测性地执行已接受的建议。当用户按下 Tab 键时，结果会立即显示。

## 概述

当显示提示建议时，**推测引擎**会立即使用分支的 GeminiChat 在后台开始执行该建议。文件写入会进入临时覆盖目录。如果用户接受了建议，则覆盖文件会被复制到真实文件系统，并且推测的对话会被注入到主聊天历史中。如果用户输入了其他内容，则推测会被中止，覆盖目录会被清理。

## 架构

```
User sees suggestion "commit this"
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  startSpeculation()                                          │
│                                                              │
│  ┌─────────────────┐    ┌────────────────────┐               │
│  │ 分支的 GeminiChat│    │  OverlayFs          │              │
│  │ (缓存共享)       │    │  /tmp/qwen-         │              │
│  │                  │    │   speculation/       │              │
│  │  systemInstruction│   │   {pid}/{id}/        │              │
│  │  + tools          │   │                      │              │
│  │  + history prefix │   │  COW: first write    │              │
│  │                  │    │  copies original     │              │
│  └────────┬─────────┘    └──────────┬───────────┘             │
│           │                         │                         │
│           ▼                         │                         │
│  ┌──────────────────────────────────┴──────────────────────┐  │
│  │  推测循环（最多 20 轮，100 条消息）                       │  │
│  │                                                         │  │
│  │  模型响应                                               │  │
│  │       │                                                 │  │
│  │       ▼                                                 │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │  speculationToolGate                             │   │  │
│  │  │                                                  │   │  │
│  │  │  Read/Grep/Glob/LS/LSP → 允许（+ 覆盖目录读取） │   │  │
│  │  │  Edit/WriteFile → 重定向到覆盖目录               │   │  │
│  │  │    （仅在 auto-edit/yolo 模式下）                 │   │  │
│  │  │  Shell → AST 检查只读？允许 : 边界               │   │  │
│  │  │  WebFetch/WebSearch → 边界                       │   │  │
│  │  │  Agent/Skill/Memory/Ask → 边界                   │   │  │
│  │  │  未知/MCP → 边界                                │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  │       │                                                 │  │
│  │       ▼                                                 │  │
│  │  Tool 执行：toolRegistry.getTool → build → execute      │  │
│  │  （绕过 CoreToolScheduler — 由 toolGate 控制）           │  │
│  │                                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                              │
│  完成后 → generatePipelinedSuggestion()                       │
└──────────────────────────────────────────────────────────────┘
           │
           │  用户按下 Tab / Enter
           ▼
     ┌─── status === 'completed'? ───┐
     │ 是                     否（边界）│
     ▼                                ▼
┌─────────────────────────┐  ┌────────────────────────┐
│  acceptSpeculation()    │  │  丢弃推测               │
│                         │  │  abort + cleanup        │
│  1. applyToReal()       │  │  正常提交查询           │
│  2. ensureToolPairing() │  │  (addMessage)           │
│  3. addHistory()        │  └────────────────────────┘
│  4. render tool_group   │
│  5. cleanup overlay     │
│  6. pipelined suggest   │
└─────────────────────────┘
           │
           │  用户输入其他内容
           ▼
┌──────────────────────────────────────────────────────────────┐
│  abortSpeculation()                                          │
│                                                              │
│  1. abortController.abort() — 取消 LLM 调用                 │
│  2. overlayFs.cleanup() — 删除临时目录                       │
│  3. 更新推测状态（中止时不发送遥测）                         │
└──────────────────────────────────────────────────────────────┘
```

## 写时复制覆盖

```
真实 CWD：/home/user/project/
覆盖目录：/tmp/qwen-speculation/12345/a1b2c3d4/

写入 src/app.ts：
  1. 复制 /home/user/project/src/app.ts → overlay/src/app.ts（仅首次）
  2. 工具写入 overlay/src/app.ts

读取 src/app.ts：
  - 如果在 writtenFiles 中 → 从 overlay/src/app.ts 读取
  - 否则 → 从 /home/user/project/src/app.ts 读取

新建文件 (src/new.ts)：
  - 直接在 overlay/src/new.ts 创建（无需复制原件）

接受：
  - copyFile(overlay/src/app.ts → /home/user/project/src/app.ts)
  - copyFile(overlay/src/new.ts → /home/user/project/src/new.ts)
  - rm -rf overlay/

中止：
  - rm -rf overlay/
```

## 工具门控安全

| 工具                                                       | 动作      | 条件                                        |
| ---------------------------------------------------------- | -------- | ------------------------------------------- |
| read_file, grep, glob, ls, lsp                             | 允许      | 读取路径通过覆盖目录解析                     |
| edit, write_file                                           | 重定向    | 仅在 auto-edit / yolo 批准模式下            |
| edit, write_file                                           | 边界      | 在默认 / plan 批准模式下                     |
| shell                                                      | 允许      | `isShellCommandReadOnlyAST()` 返回 true     |
| shell                                                      | 边界      | 非只读命令                                  |
| web_fetch, web_search                                      | 边界      | 网络请求需要用户同意                        |
| agent, skill, memory, ask_user, todo_write, exit_plan_mode | 边界      | 推测期间不能与用户交互                      |
| 未知 / MCP 工具                                            | 边界      | 安全默认                                    |

### 路径重写

- **写入工具**：`rewritePathArgs()` 通过 `overlayFs.redirectWrite()` 将 `file_path` 重定向到覆盖目录
- **读取工具**：`resolveReadPaths()` 如果之前已写入，则通过 `overlayFs.resolveReadPath()` 将 `file_path` 重定向到覆盖目录
- **重写失败**：视为边界（例如，cwd 之外的绝对路径会在 `redirectWrite` 中抛出异常）

## 边界处理

当在中间轮次遇到边界时：

1. 已执行的工具调用被保留（基于索引跟踪，而非名称）
2. 未执行的函数调用从模型消息中剥离
3. 部分工具响应被添加到历史中
4. 在注入之前，`ensureToolResultPairing()` 验证完整性

## 流水线建议

在推测完成后（无边界），第二次 LLM 调用生成**下一个**建议：

```
上下文：原始对话 + "commit this" + 推测消息
→ LLM 预测："push it"
→ 存储在 state.pipelinedSuggestion 中
→ 接受时：setPromptSuggestion("push it") — 立即显示
```

这支持 Tab-Tab-Tab 工作流，每次接受后立即显示下一步。

流水线建议重用从 `suggestionGenerator.ts` 导出的 `SUGGESTION_PROMPT` 常量（不是本地副本），以确保与初始建议质量一致。

## 快速模型

`startSpeculation` 接受可选的 `options.model` 参数，通过 `runSpeculativeLoop` 和 `generatePipelinedSuggestion` 传递给 `runForkedQuery`。通过顶层 `fastModel` 设置进行配置（空值 = 使用主模型）。所有后台任务（建议生成、推测和流水线建议）都使用相同的 `fastModel`。可通过 `/model --fast <name>` 或 `settings.json` 设置。

## UI 渲染

推测完成后，`acceptSpeculation` 通过 `historyManager.addItem()` 渲染结果：

- **用户消息**：渲染为 `type: 'user'` 条目
- **模型文本**：渲染为 `type: 'gemini'` 条目
- **工具调用**：渲染为 `type: 'tool_group'` 条目，包含结构化的 `IndividualToolCallDisplay` 条目（工具名称、参数描述、结果文本、状态）

这向用户显示完整的推测输出，包括工具调用细节，而不仅仅是纯文本。

## 分支查询（缓存共享）

### CacheSafeParams

```typescript
interface CacheSafeParams {
  generationConfig: GenerateContentConfig; // systemInstruction + tools
  history: Content[]; // 精选，最多 40 条
  model: string;
  version: number; // 配置更改时递增
}
```

- 每次主对话成功轮次后，在 `GeminiClient.sendMessageStream()` 中保存
- 在 `startChat()` / `resetChat()` 时清除，以防止跨会话泄漏
- 历史截断为 40 条；`createForkedChat` 使用浅拷贝（参数已经是深拷贝快照）
- 显式禁用思考模式（`thinkingConfig: { includeThoughts: false }`）——推测不需要推理 token，会浪费成本/延迟。这不会影响缓存前缀匹配（由 systemInstruction + tools + history 决定）
- 版本检测通过 `JSON.stringify` 比较 systemInstruction + tools

### 缓存机制

DashScope 已通过以下方式启用前缀缓存：

- `X-DashScope-CacheControl: enable` 请求头
- 在消息和工具上添加 `cache_control: { type: 'ephemeral' }` 注解

分支的 `GeminiChat` 使用相同的 `generationConfig`（包括 tools）和 history 前缀，因此 DashScope 现有的缓存机制会自动产生缓存命中。

## 常量

| 常量                     | 值   | 描述                              |
| ------------------------ | ---- | --------------------------------- |
| MAX_SPECULATION_TURNS    | 20   | 最大 API 往返次数                 |
| MAX_SPECULATION_MESSAGES | 100  | 推测历史中的最大消息数            |
| SUGGESTION_DELAY_MS      | 300  | 显示建议前的延迟                  |
| ACCEPT_DEBOUNCE_MS       | 100  | 快速接受的防抖锁                  |
| MAX_HISTORY_FOR_CACHE    | 40   | 在 CacheSafeParams 中保存的历史条目数 |

## 文件结构

```
packages/core/src/followup/
├── followupState.ts          # 框架无关的状态控制器
├── suggestionGenerator.ts    # 基于 LLM 的建议生成 + 12 条过滤规则
├── forkedQuery.ts            # 缓存感知的分支查询基础设施
├── overlayFs.ts              # 写时复制覆盖文件系统
├── speculationToolGate.ts    # 工具边界强制
├── speculation.ts            # 推测引擎（开始/接受/中止）
└── index.ts                  # 模块导出
```