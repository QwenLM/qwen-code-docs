# 提示建议实现状态

> 跟踪提示建议（NES）功能在所有包中的实现状态。

## 核心模块（`packages/core/src/followup/`）

| 组件                    | 状态    | 行数   | 描述                                                   |
| ----------------------- | ------- | ------ | ------------------------------------------------------ |
| `followupState.ts`      | ✅ 完成 | ~230   | 与框架无关的控制器，带计时器/防抖                       |
| `suggestionGenerator.ts`| ✅ 完成 | ~260   | LLM 生成 + 12 条过滤规则 + 分支查询支持                |
| `forkedQuery.ts`        | ✅ 完成 | ~240   | CacheSafeParams + createForkedChat + runForkedQuery     |
| `overlayFs.ts`          | ✅ 完成 | ~140   | 写时复制覆盖文件系统                                   |
| `speculationToolGate.ts`| ✅ 完成 | ~150   | 带有 AST shell 解析器的工具边界强制执行                 |
| `speculation.ts`        | ✅ 完成 | ~540   | 推测引擎，支持流水线提示 + 模型覆盖                     |

## CLI 集成（`packages/cli/`）

| 组件                           | 状态    | 描述                                               |
| ------------------------------ | ------- | -------------------------------------------------- |
| `AppContainer.tsx`             | ✅ 完成 | 提示生成、推测生命周期、UI 渲染                    |
| `InputPrompt.tsx`              | ✅ 完成 | Tab/Enter/右箭头接受，取消 + 中止                   |
| `Composer.tsx`                 | ✅ 完成 | Props 传递                                         |
| `UIStateContext.tsx`           | ✅ 完成 | promptSuggestion + dismissPromptSuggestion          |
| `useFollowupSuggestions.tsx`   | ✅ 完成 | React 钩子，含遥测 + 按键跟踪                       |
| `settingsSchema.ts`            | ✅ 完成 | 3 个功能标志 + fastModel 设置                       |
| `settings.schema.json`         | ✅ 完成 | VSCode 设置模式                                     |

## WebUI 集成（`packages/webui/`）

| 组件                          | 状态    | 描述                                    |
| ----------------------------- | ------- | --------------------------------------- |
| `InputForm.tsx`               | ✅ 完成 | Tab/Enter/右箭头 + explicitText 提交     |
| `useFollowupSuggestions.ts`   | ✅ 完成 | React 钩子，支持 onOutcome               |
| `followup.ts`                 | ✅ 完成 | 子路径入口                              |
| `components.css`              | ✅ 完成 | 幽灵文本样式                            |
| `vite.config.followup.ts`     | ✅ 完成 | 单独的构建配置                          |

## 遥测（`packages/core/src/telemetry/`）

| 组件                     | 状态    | 描述             |
| ------------------------ | ------- | ---------------- |
| `PromptSuggestionEvent`  | ✅ 完成 | 10 个字段        |
| `SpeculationEvent`       | ✅ 完成 | 7 个字段         |
| `logPromptSuggestion()`  | ✅ 完成 | OpenTelemetry 日志器 |
| `logSpeculation()`       | ✅ 完成 | OpenTelemetry 日志器 |

## 测试覆盖率

| 测试文件                           | 测试数 | 描述                                                     |
| ---------------------------------- | ------ | -------------------------------------------------------- |
| `followupState.test.ts`           | 14     | 控制器计时器、防抖、接受回调、onOutcome、清除            |
| `suggestionGenerator.test.ts`     | 16     | 所有 12 条过滤规则 + 边界情况 + 误报                     |
| `overlayFs.test.ts`               | 15     | COW 写入、读取解析、应用、清理、路径遍历                  |
| `speculationToolGate.test.ts`     | 27     | 工具分类、审批模式、shell AST、路径重写                   |
| `forkedQuery.test.ts`             | 6      | 缓存参数保存/获取/清除、深拷贝、版本检测                 |
| `speculation.test.ts`             | 7      | ensureToolResultPairing 边界情况                          |
| `smoke.test.ts`                   | 21     | 跨模块端到端：过滤器 + 覆盖 + 工具门 + 缓存 + 配对       |
| `InputPrompt.test.tsx`            | 4      | Tab、Enter+提交、右箭头、完成守卫                        |

## 审计历史

| 轮次              | 发现缺陷 | 修复缺陷                                               |
| ----------------- | -------- | ------------------------------------------------------ |
| R1-R4             | 10       | 10（规则引擎 → LLM，状态简化）                         |
| R5-R6             | 2        | 2（Enter 按键冲突，右箭头遥测）                         |
| R7-R8             | 3        | 3（WebUI 遥测、死类型、测试覆盖率）                     |
| R9                | 0        | —（收敛）                                              |
| R10-R11           | 1        | 1（historyManager 依赖）                                |
| R12-R13           | 1        | 1（求值正则表达式单词边界）                             |
| 阶段 1+2 R1-R4    | 20+      | 20+（权限绕过、覆盖安全性、竞态条件）                   |
| **总计**          | **37+**  | **37+**                                                |

## Claude Code 对齐

| 功能                                | 对齐程度 | 备注                                  |
| ----------------------------------- | -------- | ------------------------------------- |
| 提示文本                            | 100%     | 相同（仅品牌名称）                    |
| 12 条过滤规则                       | 100%+    | \b 单词边界改进                       |
| UI 交互（Tab/Enter/右箭头）          | 100%     |                                       |
| 守卫条件                            | 100%     | 13 项检查                             |
| 遥测                                | 100%     | 10+7 个字段                           |
| 缓存共享                            | ✅       | DashScope cache_control               |
| 推测                                | ✅       | COW 覆盖 + 工具门控                   |
| 流水线提示                          | ✅       | 在推测完成后生成                       |
| 状态管理                            | 100%+    | 控制器模式，Object.freeze             |