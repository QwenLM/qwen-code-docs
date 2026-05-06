# 紧凑模式设计：竞品分析与优化建议

> Ctrl+O 紧凑/详细模式切换 —— 与 Claude Code 的竞品分析、当前实现审查及优化建议。
>
> 用户文档：[Settings — ui.compactMode](../../users/configuration/settings.md)。

## 1. 执行摘要

Qwen Code 和 Claude Code 均提供 Ctrl+O 快捷键用于切换紧凑和详细的工具输出视图，但两者的**设计理念、默认状态和交互模型存在根本差异**。本文档从源码层面进行深度对比，识别 UX 差距，并为 Qwen Code 提出优化建议。

| 维度                 | Claude Code                                 | Qwen Code                                     |
| -------------------- | ------------------------------------------- | --------------------------------------------- |
| 默认模式             | 紧凑模式 (verbose=false)                    | 详细模式 (compactMode=false)                  |
| 切换语义             | 临时查看详细信息                            | 持久化偏好切换                                |
| 持久化               | 仅限当前会话，重启后重置                    | 持久化至 settings.json                        |
| 作用范围             | 全局屏幕切换 (prompt ↔ transcript)          | 按组件渲染切换                                |
| 冻结快照             | 无（无此概念）                              | 无（已移除）                                  |
| 单工具展开提示       | 有 ("ctrl+o to expand")                     | 有 ("Press Ctrl+O to show full tool output")  |

## 2. Claude Code 实现分析

### 2.1 架构

Claude Code 采用**基于屏幕（screen-based）**的方案，而非组件级渲染切换：

```
┌──────────────────────────────────┐
│         AppState (Zustand)       │
│  verbose: boolean (default: false)│
│  screen: 'prompt' | 'transcript' │
└──────────┬───────────────────────┘
           │
     ┌─────┴──────┐
     │  Ctrl+O    │  toggles screen mode
     │  Handler    │  NOT a rendering flag
     └─────┬──────┘
           │
     ┌─────▼──────────────┐
     │    REPL.tsx         │
     │  screen='prompt'  → compact view (default)
     │  screen='transcript'→ detailed view
     └────────────────────┘
```

### 2.2 核心源文件

| 组件             | 文件                                               | 核心逻辑                                               |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------- |
| 切换处理器       | `src/hooks/useGlobalKeybindings.tsx:90-132`        | 在 `'prompt'` 和 `'transcript'` 之间切换 `screen`       |
| 快捷键绑定       | `src/keybindings/defaultBindings.ts:44`            | `app:toggleTranscript`                                  |
| 状态定义         | `src/state/AppStateStore.ts:472`                   | `verbose: false`（仅限会话）                            |
| 展开提示         | `src/components/CtrlOToExpand.tsx:29-46`           | 单工具 "(ctrl+o to expand)" 文本                        |
| 消息过滤器       | `src/components/Messages.tsx:93-151`               | 紧凑视图使用 `filterForBriefTool()`                     |
| 权限             | `src/components/permissions/PermissionRequest.tsx` | 在覆盖层渲染，永不隐藏                                  |

### 2.3 设计决策

1. **紧凑模式为默认状态。** 用户开箱即见简洁界面，详细信息需主动开启。
2. **仅限当前会话。** 每次新会话 `verbose` 均重置为 `false` —— Claude Code 假设用户通常偏好紧凑视图，仅需临时查看详情。
3. **屏幕级切换。** Ctrl+O 不改变组件渲染方式，而是将整个显示在 "prompt" 屏幕（紧凑）和 "transcript" 屏幕（详细）之间切换。
4. **无冻结快照。** 无快照冻结概念。切换时，显示会立即更新为当前状态。
5. **权限对话框独立。** 工具审批在专用覆盖层渲染，不受 verbose/compact 切换影响。
6. **单工具提示。** `CtrlOToExpand` 组件在单个工具产生大量输出时显示上下文提示，在子代理中会被抑制。

### 2.4 用户流程

```
Session start → compact mode (default)
     │
     ├─ Tool outputs are summarized in a single line
     ├─ Large tool output shows "(ctrl+o to expand)" hint
     │
     ├─ User presses Ctrl+O
     │     └─→ Screen switches to transcript (detailed view)
     │         └─ User sees all tool output, thinking, etc.
     │
     ├─ User presses Ctrl+O again
     │     └─→ Screen switches back to prompt (compact)
     │
     └─ Session ends → verbose resets to false
```

## 3. Qwen Code 实现分析

### 3.1 架构

Qwen Code 采用**组件级渲染标志**，各 UI 组件从 Context 中读取该标志：

```
┌─────────────────────────────────────┐
│      CompactModeContext             │
│  compactMode: boolean (default: false)│
│  setCompactMode: (v) => void        │
└──────────┬──────────────────────────┘
           │
     ┌─────┴──────┐
     │  Ctrl+O    │  toggles compactMode
     │  Handler    │  persists to settings
     └─────┬──────┘
           │
     ┌─────▼──────────────────┐
     │  Each component reads  │
     │  compactMode and       │
     │  decides how to render │
     └────────────────────────┘
           │
     ┌─────▼──────────────────────────────┐
     │  ToolGroupMessage                   │
     │    showCompact = compactMode        │
     │      && !hasConfirmingTool          │
     │      && !hasErrorTool               │
     │      && !isEmbeddedShellFocused     │
     │      && !isUserInitiated            │
     └────────────────────────────────────┘
```

### 3.2 核心源文件

| 组件           | 文件                                  | 核心逻辑                                       |
| -------------- | ------------------------------------- | ----------------------------------------------- |
| 切换处理器     | `AppContainer.tsx:1684-1690`          | 切换 `compactMode`，持久化至设置                |
| Context        | `CompactModeContext.tsx`              | `compactMode`, `setCompactMode`                 |
| 工具组         | `ToolGroupMessage.tsx:105-110`        | `showCompact` 含 4 个强制展开条件               |
| 工具消息       | `ToolMessage.tsx:346-350`             | 紧凑模式下隐藏 `displayRenderer`                |
| 紧凑显示       | `CompactToolGroupDisplay.tsx:49-108`  | 单行摘要，含状态 + 提示                         |
| 确认           | `ToolConfirmationMessage.tsx:113-147` | 简化的 3 选项紧凑审批                           |
| 提示           | `Tips.tsx:14-29`                      | 启动 Tips 轮播包含紧凑模式提示                  |
| 设置同步       | `SettingsDialog.tsx:189-193`          | 与 CompactModeContext 同步 + refreshStatic      |
| MainContent    | `MainContent.tsx:60-76`               | 渲染 live pendingHistoryItems                   |
| 思考过程       | `HistoryItemDisplay.tsx:123-133`      | 紧凑模式下隐藏 `gemini_thought`                 |

### 3.3 设计决策

1. **详细模式为默认状态。** 用户默认可见所有工具输出和思考过程。
2. **偏好持久化。** `compactMode` 保存至 `settings.json`，跨会话保留。
3. **组件级渲染。** 各组件从 Context 读取 `compactMode` 并自行调整渲染。
4. **强制展开保护。** 四个条件覆盖紧凑模式，确保关键 UI 元素始终可见（确认、错误、Shell、用户主动触发）。
5. **无快照冻结。** 切换始终显示实时输出 —— 无冻结快照。
6. **设置对话框同步。** 从设置切换紧凑模式时，通过 `setCompactMode` 立即更新 React 状态。
7. **低干扰的可发现性。** 紧凑模式通过启动 Tips 轮播引入，而非持久化页脚指示器，避免 UI 杂乱。

### 3.4 用户流程

```
Session start → verbose mode (default)
     │
     ├─ All tool outputs, thinking, details visible
     │
     ├─ User presses Ctrl+O (or toggles in Settings)
     │     └─→ compactMode = true, persisted
     │         ├─ Tool groups show single-line summary
     │         ├─ Thinking/thought content hidden
     │         └─ Confirmations, errors, shell still expanded
     │
     ├─ User presses Ctrl+O again
     │     └─→ compactMode = false, persisted
     │         └─ All details visible again
     │
     └─ Next session → same mode as last session
```

## 4. 核心差异深度剖析

### 4.1 默认模式理念

| 方面                 | Claude Code（紧凑默认）           | Qwen Code（详细默认）                     |
| -------------------- | --------------------------------- | ----------------------------------------- |
| 第一印象             | 简洁、极简 —— 专业感              | 信息丰富 —— 完全透明                      |
| 学习成本             | 用户需学习 Ctrl+O 查看详情        | 用户可立即查看所有内容                    |
| 目标用户             | 信任工具的经验开发者              | 希望了解底层执行过程的用户                |
| 信息过载             | 默认避免                          | 新用户可能遇到                            |
| 功能可发现性         | 单工具 "(ctrl+o to expand)" 提示  | 启动 Tips 轮播 + ? 快捷键 + /help         |

**分析：** Claude Code 的紧凑默认之所以有效，是因为其用户群多为经验丰富的开发者，他们信任工具且无需查看每次工具调用。Qwen Code 的详细默认更适合其当前阶段，通过透明度建立用户信任至关重要。

### 4.2 持久化模型

| 方面           | Claude Code               | Qwen Code                  |
| -------------- | ------------------------- | -------------------------- |
| 是否持久化？   | 否 —— 仅限会话            | 是 —— 写入 settings.json   |
| 设计依据       | 详细查看是临时需求        | 模式属于用户偏好           |
| 重启行为       | 始终从紧凑模式开始        | 从上次使用的模式开始       |

**分析：** Claude Code 将详细查看视为瞬时需求 —— 查看后即返回。Qwen Code 将其视为稳定偏好 —— 部分用户始终需要详情，另一些始终需要紧凑。两者均合理；Qwen Code 的方案更灵活。

### 4.3 确认保护机制

| 方面                  | Claude Code                                 | Qwen Code                                            |
| --------------------- | ------------------------------------------- | ---------------------------------------------------- |
| 机制                  | 覆盖层/模态层（结构分离）                   | `showCompact` 中的强制展开条件                       |
| 覆盖范围              | 完全 —— 审批绝不会被隐藏                    | 完全 —— 4 个条件覆盖所有交互状态                     |
| 紧凑确认 UI           | 不适用（覆盖层始终为完整视图）              | 简化的 3 选项 RadioButtonSelect                      |

**分析：** Claude Code 的架构分离（覆盖层）更稳健。Qwen Code 的强制展开方案有效，但要求每个新增交互状态都必须显式添加到条件列表中。

### 4.4 渲染方案

| 方面       | Claude Code                         | Qwen Code                                  |
| ---------- | ----------------------------------- | ------------------------------------------ |
| 切换范围   | 屏幕级 (prompt ↔ transcript)        | 组件级（各组件自行决定）                   |
| 粒度       | 全有或全无                          | 按组件细粒度控制                           |
| 灵活性     | 低 —— 全局开关                      | 高 —— 组件可覆盖                           |
| 一致性     | 有保障                              | 取决于各组件的实现                         |

**分析：** Qwen Code 的组件级方案更灵活（例如针对特定条件强制展开），但需要更强的规范来维护一致性。Claude Code 的屏幕级方案更简单，且能保证行为一致。

## 5. 优化建议

### 5.1 [P0] 保持详细模式为默认 —— 无需更改

Qwen Code 的详细默认是当前阶段的正确选择。新用户需要透明度来建立信任。随着产品成熟，可考虑将紧凑模式设为默认（如 Claude Code）。

### 5.2 [P1] 大型输出的单工具展开

Claude Code 会在产生大量输出的单个工具上显示 "(ctrl+o to expand)"。Qwen Code 目前仅有全局切换。建议：

- 当单个工具输出超过 N 行时，在紧凑模式下显示单工具“展开”提示。
- 范围：未来增强功能，非当前优先级。

### 5.3 [P2] 考虑会话级覆盖

部分用户可能希望默认使用紧凑模式，但偶尔需要在特定会话中查看详细模式。建议同时支持两者：

- `settings.json` → 持久化默认值（当前行为）
- 会话期间按 Ctrl+O → 仅当前会话临时覆盖（Claude Code 行为）
- 会话重启 → 恢复为 settings.json 的值

这能让用户兼顾两者优势。实现上需将“设置默认值”与“会话覆盖”状态分离。

### 5.4 [P2] 确认操作的架构分离

目前，确认保护依赖 `ToolGroupMessage` 中的 `showCompact` 条件。建议采用更稳健的方案：

- 在独立层渲染确认操作（类似 Claude Code 的覆盖层方案）。
- 这将从架构上杜绝紧凑模式影响确认操作的可能。
- 优先级较低，因为当前的强制展开方案已能正常工作。

## 6. 当前实现状态

在 `feat/compact-mode-optimization` 分支的变更之后：

| 功能                             | 状态   | 备注                                             |
| -------------------------------- | ------ | ------------------------------------------------- |
| 启动 Tips 提示                   | 已完成 | Tips 轮播中包含紧凑模式提示（低干扰）             |
| 键盘快捷键 (?) 中的 Ctrl+O       | 已完成 | 已添加至 KeyboardShortcuts 组件                   |
| /help 中的 Ctrl+O                | 已完成 | 已添加至 Help 组件                                |
| 设置对话框同步                   | 已完成 | compactMode 与 CompactModeContext 同步            |
| 无快照冻结                       | 已完成 | 切换始终显示实时输出                              |
| 确认保护                         | 已完成 | 强制展开 + WaitingForConfirmation 守卫            |
| Shell 保护                       | 已完成 | `!isEmbeddedShellFocused` 强制展开                |
| 错误保护                         | 已完成 | `!hasErrorTool` 强制展开                          |
| 用户文档更新                     | 已完成 | settings.md, keyboard-shortcuts.md                |

## 7. 文件参考

### Qwen Code

| 文件                                                                  | 用途                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------- |
| `packages/cli/src/ui/AppContainer.tsx`                                | 切换处理器、状态初始化、Context Provider             |
| `packages/cli/src/ui/contexts/CompactModeContext.tsx`                 | Context 定义                                         |
| `packages/cli/src/ui/components/messages/ToolGroupMessage.tsx`        | 强制展开逻辑                                         |
| `packages/cli/src/ui/components/messages/ToolMessage.tsx`             | 单工具输出隐藏                                       |
| `packages/cli/src/ui/components/messages/CompactToolGroupDisplay.tsx` | 紧凑视图渲染                                         |
| `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx` | 紧凑确认 UI                                          |
| `packages/cli/src/ui/components/MainContent.tsx`                      | 待处理历史项渲染                                     |
| `packages/cli/src/ui/components/Tips.tsx`                             | 包含紧凑模式提示的启动 Tips                          |
| `packages/cli/src/ui/components/Help.tsx`                             | /help 快捷键条目                                     |
| `packages/cli/src/ui/components/KeyboardShortcuts.tsx`                | ? 快捷键条目                                         |
| `packages/cli/src/ui/components/SettingsDialog.tsx`                   | 设置同步                                             |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`               | 思考内容隐藏                                         |
| `packages/cli/src/config/settingsSchema.ts`                           | 设置定义                                             |
| `packages/cli/src/config/keyBindings.ts`                              | Ctrl+O 绑定                                          |

### Claude Code（参考）

| 文件                                               | 用途                           |
| -------------------------------------------------- | ------------------------------ |
| `src/hooks/useGlobalKeybindings.tsx`               | 切换处理器                     |
| `src/state/AppStateStore.ts`                       | 状态定义（verbose: false）     |
| `src/components/CtrlOToExpand.tsx`                 | 单工具展开提示                 |
| `src/components/Messages.tsx`                      | 简短消息过滤器                 |
| `src/screens/REPL.tsx`                             | 屏幕级模式切换                 |
| `src/components/permissions/PermissionRequest.tsx` | 基于覆盖层的确认               |