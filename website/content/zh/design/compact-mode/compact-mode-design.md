# 紧凑模式设计：竞品分析与优化

> Ctrl+O 紧凑/详细模式切换 —— 与 Claude Code 的竞品分析、当前实现回顾及优化建议。
>
> 用户文档：[设置 — ui.compactMode](../../users/configuration/settings.md)。

## 1. 概要

Qwen Code 和 Claude Code 都提供了 Ctrl+O 快捷键来切换紧凑和详细工具输出视图，但**设计理念、默认状态和交互模式存在根本差异**。本文档提供了深入的源码级对比，识别了 UX 差距，并为 Qwen Code 提出了优化方案。

| 维度                | Claude Code                             | Qwen Code                                     |
| -------------------- | --------------------------------------- | --------------------------------------------- |
| 默认模式             | 紧凑 (verbose=false)                     | 详细 (compactMode=false)                       |
| 切换语义             | 临时查看详情                             | 持久偏好开关                                  |
| 持久性               | 仅当前会话，重启后重置                   | 持久化到 settings.json                        |
| 作用范围             | 全局屏幕切换 (prompt ↔ transcript)      | 组件级渲染切换                                |
| 冻结快照             | 无（无此概念）                           | 无（已移除）                                  |
| 每个工具的展开提示   | 是 ("ctrl+o to expand")                 | 是 ("Press Ctrl+O to show full tool output") |

## 2. Claude Code 实现分析

### 2.1 架构

Claude Code 使用基于**屏幕**的方法，而非组件级的渲染切换：

```
┌──────────────────────────────────┐
│         AppState (Zustand)       │
│  verbose: boolean (default: false)│
│  screen: 'prompt' | 'transcript' │
└──────────┬───────────────────────┘
           │
     ┌─────┴──────┐
     │  Ctrl+O    │  切换屏幕模式
     │  Handler    │  非渲染标志
     └─────┬──────┘
           │
     ┌─────▼──────────────┐
     │    REPL.tsx         │
     │  screen='prompt'  → 紧凑视图 (默认)
     │  screen='transcript'→ 详细视图
     └────────────────────┘
```

### 2.2 关键源文件

| 组件              | 文件                                               | 关键逻辑                                               |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------- |
| 切换处理器       | `src/hooks/useGlobalKeybindings.tsx:90-132`        | 在 `'prompt'` 和 `'transcript'` 之间切换 `screen`     |
| 快捷键           | `src/keybindings/defaultBindings.ts:44`            | `app:toggleTranscript`                                  |
| 状态定义         | `src/state/AppStateStore.ts:472`                   | `verbose: false` (仅会话)                              |
| 展开提示         | `src/components/CtrlOToExpand.tsx:29-46`           | 每个工具的 "(ctrl+o to expand)" 文本                    |
| 消息过滤         | `src/components/Messages.tsx:93-151`               | 紧凑视图下的 `filterForBriefTool()`                     |
| 权限             | `src/components/permissions/PermissionRequest.tsx` | 在覆盖层渲染，从不隐藏                                  |

### 2.3 设计决策

1. **紧凑是默认。** 用户开箱即看到简洁界面；详情是可选操作。
2. **会话范围。** `verbose` 在每个新会话中重置为 `false` —— Claude Code 认为用户通常更喜欢紧凑视图，仅临时需要详情。
3. **屏幕级切换。** Ctrl+O 不改变组件的渲染方式；它会将整个显示从 "prompt" 屏幕（紧凑）切换为 "transcript" 屏幕（详细）。
4. **无冻结快照。** 不存在快照冻结概念。切换时，显示会立即使用当前状态更新。
5. **权限对话框独立。** 工具批准在专用覆盖层中渲染，不受详细/紧凑切换影响。
6. **每个工具的提示。** `CtrlOToExpand` 组件在单个工具产生较大输出时显示上下文提示，在子代理中隐藏。

### 2.4 用户流程

```
会话开始 → 紧凑模式 (默认)
     │
     ├─ 工具输出汇总为单行
     ├─ 大工具输出显示 "(ctrl+o to expand)" 提示
     │
     ├─ 用户按下 Ctrl+O
     │     └─→ 屏幕切换到 transcript (详细视图)
     │         └─ 用户看到所有工具输出、思考过程等
     │
     ├─ 用户再次按下 Ctrl+O
     │     └─→ 屏幕切回 prompt (紧凑)
     │
     └─ 会话结束 → verbose 重置为 false
```

## 3. Qwen Code 实现分析

### 3.1 架构

Qwen Code 使用**组件级渲染标志**，每个 UI 组件从 context 中读取：

```
┌─────────────────────────────────────┐
│      CompactModeContext             │
│  compactMode: boolean (default: false)│
│  setCompactMode: (v) => void        │
└──────────┬──────────────────────────┘
           │
     ┌─────┴──────┐
     │  Ctrl+O    │  切换 compactMode
     │  Handler    │  持久化到 settings
     └─────┬──────┘
           │
     ┌─────▼──────────────────┐
     │  每个组件读取           │
     │  compactMode 并         │
     │  决定如何渲染           │
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

### 3.2 关键源文件

| 组件             | 文件                                  | 关键逻辑                                       |
| --------------- | ------------------------------------- | ----------------------------------------------- |
| 切换处理器      | `AppContainer.tsx:1684-1690`          | 切换 `compactMode`，持久化到 settings           |
| Context         | `CompactModeContext.tsx`              | `compactMode`，`setCompactMode`                 |
| 工具组          | `ToolGroupMessage.tsx:105-110`        | 带 4 个强制展开条件的 `showCompact`             |
| 工具消息        | `ToolMessage.tsx:346-350`             | 在紧凑模式下隐藏 `displayRenderer`              |
| 紧凑显示        | `CompactToolGroupDisplay.tsx:49-108`  | 单行摘要，含状态和提示                           |
| 确认            | `ToolConfirmationMessage.tsx:113-147` | 简化 3 选项紧凑批准                             |
| 提示            | `Tips.tsx:14-29`                      | 启动提示轮换包含紧凑模式提示                     |
| 设置同步        | `SettingsDialog.tsx:189-193`          | 与 CompactModeContext 同步 + refreshStatic       |
| MainContent     | `MainContent.tsx:60-76`               | 渲染实时 pendingHistoryItems                     |
| 思考过程        | `HistoryItemDisplay.tsx:123-133`      | 在紧凑模式下隐藏 `gemini_thought`                |

### 3.3 设计决策

1. **详细是默认。** 用户默认看到所有工具输出和思考过程。
2. **持久偏好。** `compactMode` 保存到 `settings.json`，跨会话持久。
3. **组件级渲染。** 每个组件从 context 读取 `compactMode` 并调整自身渲染。
4. **强制展开保护。** 四个条件覆盖紧凑模式，确保关键 UI 元素始终可见（确认、错误、shell、用户触发）。
5. **无冻结快照。** 切换始终显示实时输出 —— 无冻结快照。
6. **设置对话框同步。** 在设置中切换紧凑模式会通过 `setCompactMode` 立即更新 React 状态。
7. **非侵入式发现。** 紧凑模式通过启动提示轮换而非持久的底部指示器引入，避免 UI 杂乱。

### 3.4 用户流程

```
会话开始 → 详细模式 (默认)
     │
     ├─ 所有工具输出、思考过程、详情可见
     │
     ├─ 用户按下 Ctrl+O（或在设置中切换）
     │     └─→ compactMode = true，持久化
     │         ├─ 工具组显示单行摘要
     │         ├─ 思考/思考内容隐藏
     │         └─ 确认、错误、shell 仍展开
     │
     ├─ 用户再次按下 Ctrl+O
     │     └─→ compactMode = false，持久化
     │         └─ 所有详情再次可见
     │
     └─ 下一会话 → 与上次会话相同模式
```

## 4. 关键差异深度分析

### 4.1 默认模式理念

| 方面               | Claude Code (紧凑默认)                  | Qwen Code (详细默认)                         |
| -------------------- | --------------------------------------- | --------------------------------------------- |
| 第一印象             | 简洁、极简 —— 专业感                    | 信息丰富 —— 完全透明                          |
| 学习曲线             | 用户必须学会 Ctrl+O 才能看到详情        | 用户可以立即看到所有内容                      |
| 目标受众             | 有经验的用户，信任工具                  | 希望了解背后过程的用户                        |
| 信息过载             | 默认避免                                | 新用户可能遇到                                |
| 可发现性             | 每个工具的 "(ctrl+o to expand)" 提示    | 启动提示轮换 + ? 快捷键 + /help               |

**分析：** Claude Code 的紧凑默认之所以有效，是因为其用户群体通常是有经验的开发者，他们信任工具且不需要看到每次工具调用。Qwen Code 的详细默认在其早期阶段是合适的，此时通过透明建立用户信任很重要。

### 4.2 持久化模型

| 方面             | Claude Code               | Qwen Code                  |
| ---------------- | ------------------------- | -------------------------- |
| 持久化？         | 否 —— 仅会话              | 是 —— 到 settings.json     |
| 理由             | 详细是临时查看            | 模式是用户偏好             |
| 重启行为         | 始终以紧凑模式启动        | 以最后一次使用的模式启动   |

**分析：** Claude Code 将查看详情视为临时需求 —— 你查看后返回。Qwen Code 将其视为稳定偏好 —— 某些用户始终需要详情，另一些始终需要紧凑。两者都合理；Qwen Code 的方法更灵活。

### 4.3 确认保护

| 方面                    | Claude Code                                 | Qwen Code                                            |
| ----------------------- | ------------------------------------------- | ---------------------------------------------------- |
| 机制                   | 覆盖/模态层（结构上分离）                     | 在 `showCompact` 中的强制展开条件                     |
| 覆盖范围                | 完整 —— 批准永远不会被隐藏                    | 完整 —— 4 个条件覆盖所有交互状态                      |
| 紧凑确认 UI             | 不适用（覆盖层始终完整）                     | 简化的 3 选项 RadioButtonSelect                      |

**分析：** Claude Code 的架构分离（覆盖层）更健壮。Qwen Code 的强制展开方法有效，但要求每个新的交互状态都明确添加到条件列表中。

### 4.4 渲染方法

| 方面         | Claude Code                         | Qwen Code                                  |
| ------------ | ----------------------------------- | ------------------------------------------ |
| 切换范围     | 屏幕级 (prompt ↔ transcript)        | 组件级（每个组件决定）                      |
| 粒度         | 全有或全无                          | 每个组件细粒度                              |
| 灵活性       | 低 —— 全局开关                      | 高 —— 组件可以覆盖                          |
| 一致性       | 有保证                              | 取决于每个组件的实现                        |

**分析：** Qwen Code 的组件级方法更灵活（例如，特定条件的强制展开），但需要更多纪律来保持一致性。Claude Code 的屏幕级方法更简单，保证了行为一致。

## 5. 优化建议

### 5.1 [P0] 保持详细为默认 —— 无需更改

Qwen Code 的详细默认在其当前阶段是正确的选择。新用户需要透明来建立信任。随着产品成熟，可以考虑将紧凑设为默认（如 Claude Code）。

### 5.2 [P1] 大型输出的每个工具展开

Claude Code 在产生大型输出的单个工具上显示 "(ctrl+o to expand)"。Qwen Code 目前只有全局切换。考虑：

- 当单个工具输出超过 N 行时，在紧凑模式下显示每个工具的 "展开" 提示。
- 范围：未来增强，当前不是优先事项。

### 5.3 [P2] 考虑会话范围的临时覆盖

某些用户可能希望紧凑模式作为默认，但偶尔需要在特定会话中使用详细模式。考虑同时支持：

- `settings.json` → 持久默认（当前行为）
- 会话中的 Ctrl+O → 仅当前会话的临时覆盖（Claude Code 行为）
- 会话重启 → 恢复到 settings.json 的值

这为用户提供了两全其美的体验。实现需要将 "设置默认" 与 "会话覆盖" 状态分离。

### 5.4 [P2] 确认的结构性分离

目前，确认保护依赖于 `ToolGroupMessage` 中的 `showCompact` 条件。考虑更健壮的方法：

- 在单独的层中渲染确认（类似 Claude Code 的覆盖方法）。
- 这将使紧凑模式在架构上不可能影响确认。
- 优先级较低，因为当前的强制展开方法运行正确。

## 6. 当前实现状态

在 `feat/compact-mode-optimization` 分支更改之后：

| 功能                          | 状态 | 备注                                             |
| ---------------------------- | ------ | ------------------------------------------------- |
| 启动提示提示                   | 已完成 | Tips 轮换中的紧凑模式提示（非侵入式）              |
| 键盘快捷键 (?) 中的 Ctrl+O   | 已完成 | 添加到 KeyboardShortcuts 组件                      |
| /help 中的 Ctrl+O            | 已完成 | 添加到 Help 组件                                   |
| 设置对话框同步               | 已完成 | 同步 compactMode 与 CompactModeContext             |
| 无冻结快照                   | 已完成 | 切换始终显示实时输出                               |
| 确认保护                     | 已完成 | 强制展开 + WaitingForConfirmation 保护             |
| Shell 保护                   | 已完成 | `!isEmbeddedShellFocused` 强制展开                 |
| 错误保护                     | 已完成 | `!hasErrorTool` 强制展开                           |
| 用户文档已更新               | 已完成 | settings.md, keyboard-shortcuts.md                 |

## 7. 文件参考

### Qwen Code

| 文件                                                                | 用途                                                 |
| ------------------------------------------------------------------- | ---------------------------------------------------- |
| `packages/cli/src/ui/AppContainer.tsx`                              | 切换处理器、状态初始化、context 提供者                |
| `packages/cli/src/ui/contexts/CompactModeContext.tsx`                | Context 定义                                         |
| `packages/cli/src/ui/components/messages/ToolGroupMessage.tsx`       | 强制展开逻辑                                         |
| `packages/cli/src/ui/components/messages/ToolMessage.tsx`            | 每个工具输出隐藏                                     |
| `packages/cli/src/ui/components/messages/CompactToolGroupDisplay.tsx` | 紧凑视图渲染                                         |
| `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx` | 紧凑确认 UI                                          |
| `packages/cli/src/ui/components/MainContent.tsx`                     | 挂起历史项渲染                                       |
| `packages/cli/src/ui/components/Tips.tsx`                            | 带紧凑模式提示的启动提示                              |
| `packages/cli/src/ui/components/Help.tsx`                            | /help 快捷键条目                                     |
| `packages/cli/src/ui/components/KeyboardShortcuts.tsx`               | ? 快捷键条目                                         |
| `packages/cli/src/ui/components/SettingsDialog.tsx`                  | 设置同步                                             |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`              | 思考内容隐藏                                         |
| `packages/cli/src/config/settingsSchema.ts`                         | 设置定义                                             |
| `packages/cli/src/config/keyBindings.ts`                            | Ctrl+O 绑定                                          |

### Claude Code (参考)

| 文件                                               | 用途                             |
| -------------------------------------------------- | -------------------------------- |
| `src/hooks/useGlobalKeybindings.tsx`               | 切换处理器                       |
| `src/state/AppStateStore.ts`                       | 状态定义 (verbose: false)        |
| `src/components/CtrlOToExpand.tsx`                 | 每个工具展开提示                 |
| `src/components/Messages.tsx`                      | 简要消息过滤                     |
| `src/screens/REPL.tsx`                             | 屏幕级模式切换                   |
| `src/components/permissions/PermissionRequest.tsx` | 基于覆盖层的确认                  |