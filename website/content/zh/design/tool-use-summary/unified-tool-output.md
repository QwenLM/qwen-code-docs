# 统一的工具输出渲染

## 背景

TUI 先前对工具结果有两种渲染模式：

- **紧凑模式**（Ctrl+O）：将已完成的工具结果折叠为一行摘要
- **普通模式**：内联显示完整工具结果，造成过多的垂直噪声

用户需要手动切换模式。大多数情况下，已完成的工具结果（文件内容、搜索结果等）对对话流程没有附加价值。

## 设计

### 核心原则

**单一统一模式**：工具渲染由工具类别决定，而非用户切换的模式。信息收集类工具（读取/搜索/列出）折叠为摘要；变更类工具（编辑/写入/命令/代理）始终单独渲染并显示完整结果。

### 语义摘要（`buildToolSummary`）

不再显示原始工具名和计数（`ReadFile x 3`），而是使用基于计数的格式生成人类可读的摘要：

| 场景               | 输出                                           |
| ------------------ | ---------------------------------------------- |
| 单个工具           | `读取 1 个文件` / `运行 1 条命令`              |
| 多个同类工具       | `读取 3 个文件`                                |
| 混合类型           | `运行 1 条命令，读取 3 个文件，编辑 2 个文件`  |
| 正在执行（活动）   | `正在读取 1 个文件`（现在进行时）              |
| 已完成             | `读取 1 个文件`（过去时）                      |

### 工具类别

| 类别    | 显示名称                            | 过去式动词 | 进行式动词 | 可折叠 |
| ------- | ----------------------------------- | ---------- | ---------- | ------ |
| read    | ReadFile, 读取文件（组）            | 读取       | 正在读取   | 是     |
| edit    | Edit, NotebookEdit                  | 编辑       | 正在编辑   | 否     |
| write   | WriteFile                           | 写入       | 正在写入   | 否     |
| search  | Grep, Glob                          | 搜索       | 正在搜索   | 是     |
| list    | ListFiles, Read Directory           | 列出       | 正在列出   | 是     |
| command | Shell                               | 运行       | 正在运行   | 否     |
| agent   | Agent, Workflow, SendMessage        | 运行       | 正在运行   | 否     |
| other   | （其他所有）                         | 使用       | 正在使用   | 否     |

### 渲染规则

1. **基于类型的分区**：通过 `isCollapsibleTool()` 分割工具——可折叠工具（read/search/list）渲染为 `CompactToolGroupDisplay` 摘要行；不可折叠工具（edit/write/command/agent/other）通过 `ToolMessage` 单独渲染
2. **纯内存组** 有专用的渲染路径（读取/写入计数徽章），优先级更高，但仅当所有操作成功时生效（`!hasErrorTool && every status === Success`）
3. **结果折叠**：仅对状态为 `Success` 的可折叠工具折叠其文本/ANSI 输出。不可折叠的工具（包括 MCP 工具、WebFetch 等）始终显示结果。已取消的工具保持部分输出可见
4. **工具名称** 无论状态如何均以粗体渲染，确保在 `CompactToolGroupDisplay` 和单独的 `ToolMessage` 路径中样式一致
5. **强制展开条件**：当组中任一工具处于确认中、出错、由用户触发、处于焦点 Shell 中或为终端子代理时，所有工具均单独渲染（不分区），且仅对触发条件的工具（出错、确认中、终端子代理）强制显示结果——成功的兄弟工具保持正常的折叠行为
6. **`tool_use_summary`** 项（LLM 生成的语义摘要）无条件渲染，与 `CompactToolGroupDisplay` 的机械计数值并列——它们服务于不同目的（语义上下文 vs 工具计数）
7. **内存徽章**：在纯可折叠路径和混合路径中，当非纯内存组中存在内存操作时均会渲染

### 关键变更

| 文件                            | 变更描述                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| `CompactToolGroupDisplay.tsx`   | 添加了带计数格式的 `buildToolSummary()`、`isCollapsibleTool()`，移除了边框样式                     |
| `ToolMessage.tsx`               | `shouldCollapseResult` 现仅对 `isCollapsibleTool()` 且状态为 `Success` 时才生效；移除了 `isDim`    |
| `ToolGroupMessage.tsx`          | 基于类型的分区取代 `showCompact`；`forceShowResult` 简化为 `forceExpandAll`；高度预算考虑了可折叠摘要行 |
| `MainContent.tsx`               | 移除了 `mergedHistory` 别名、`absorbedCallIds`、`summaryByCallId`、跨组合并逻辑                    |
| `HistoryItemDisplay.tsx`        | `tool_use_summary` 无条件渲染（移除了 `summaryAbsorbed` 门控）                                    |
| `mergeCompactToolGroups.ts`     | `compactToggleHasVisualEffect` 不再对 `tool_group` 触发（紧凑模式对工具渲染无影响）                |

## 替代方案考虑

1. **保留两种模式，改进摘要**：已拒绝——给用户带来不必要的认知负担
2. **每个工具单独摘要（Gemini CLI 风格）**：每个工具有自己的摘要箭头。已拒绝——对于大量工具批次仍然过于冗长
3. **分阶段推出**：已拒绝——用户偏好一次性实现