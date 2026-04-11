# Prompt Suggestion 实现状态

> 跟踪 prompt suggestion (NES) 功能在所有包中的实现状态。

## Core Module (`packages/core/src/followup/`)

| 组件                     | 状态    | 代码行数 | 描述                                                       |
| ------------------------ | ------- | -------- | ---------------------------------------------------------- |
| `followupState.ts`       | ✅ Done | ~230     | 框架无关的控制器，支持 timer/debounce                      |
| `suggestionGenerator.ts` | ✅ Done | ~260     | LLM 生成 + 12 条过滤规则 + forked query 支持               |
| `forkedQuery.ts`         | ✅ Done | ~240     | CacheSafeParams + createForkedChat + runForkedQuery        |
| `overlayFs.ts`           | ✅ Done | ~140     | Copy-on-write (COW) 覆盖文件系统                           |
| `speculationToolGate.ts` | ✅ Done | ~150     | 基于 AST shell 解析器的工具边界强制检查                    |
| `speculation.ts`         | ✅ Done | ~540     | 支持流水线 suggestion + 模型覆盖的 speculation 引擎        |

## CLI Integration (`packages/cli/`)

| 组件                         | 状态    | 描述                                                     |
| ---------------------------- | ------- | -------------------------------------------------------- |
| `AppContainer.tsx`           | ✅ Done | Suggestion 生成、speculation 生命周期、UI 渲染           |
| `InputPrompt.tsx`            | ✅ Done | Tab/Enter/Right Arrow 接受操作，dismiss + abort          |
| `Composer.tsx`               | ✅ Done | Props 透传                                               |
| `UIStateContext.tsx`         | ✅ Done | promptSuggestion + dismissPromptSuggestion               |
| `useFollowupSuggestions.tsx` | ✅ Done | 支持 telemetry + 按键追踪的 React hook                   |
| `settingsSchema.ts`          | ✅ Done | 3 个 feature flag + fastModel 配置                       |
| `settings.schema.json`       | ✅ Done | VSCode 配置 schema                                       |

## WebUI Integration (`packages/webui/`)

| 组件                        | 状态    | 描述                                       |
| --------------------------- | ------- | ------------------------------------------ |
| `InputForm.tsx`             | ✅ Done | Tab/Enter/Right Arrow + explicitText 提交  |
| `useFollowupSuggestions.ts` | ✅ Done | 支持 onOutcome 的 React hook               |
| `followup.ts`               | ✅ Done | 子路径入口                                 |
| `components.css`            | ✅ Done | Ghost text 样式                            |
| `vite.config.followup.ts`   | ✅ Done | 独立构建配置                               |

## Telemetry (`packages/core/src/telemetry/`)

| 组件                    | 状态    | 描述                 |
| ----------------------- | ------- | -------------------- |
| `PromptSuggestionEvent` | ✅ Done | 10 个字段            |
| `SpeculationEvent`      | ✅ Done | 7 个字段             |
| `logPromptSuggestion()` | ✅ Done | OpenTelemetry 日志记录器 |
| `logSpeculation()`      | ✅ Done | OpenTelemetry 日志记录器 |

## Test Coverage

| 测试文件                      | 测试用例数 | 描述                                                             |
| ----------------------------- | ---------- | ---------------------------------------------------------------- |
| `followupState.test.ts`       | 14         | 控制器 timer、debounce、accept 回调、onOutcome、clear            |
| `suggestionGenerator.test.ts` | 16         | 全部 12 条过滤规则 + 边界情况 + 误报处理                         |
| `overlayFs.test.ts`           | 15         | COW 写入、读取解析、apply、清理、路径遍历                        |
| `speculationToolGate.test.ts` | 27         | 工具分类、审批模式、shell AST、路径重写                          |
| `forkedQuery.test.ts`         | 6          | 缓存参数 save/get/clear、深拷贝、版本检测                        |
| `speculation.test.ts`         | 7          | ensureToolResultPairing 边界情况                                 |
| `smoke.test.ts`               | 21         | 跨模块 E2E：filter + overlay + toolGate + cache + pairing        |
| `InputPrompt.test.tsx`        | 4          | Tab、Enter+submit、Right Arrow、completion 守卫                  |

## Audit History

| 轮次            | 发现问题数 | 修复问题数                                               |
| --------------- | ---------- | -------------------------------------------------------- |
| R1-R4           | 10         | 10（rule engine → LLM，状态简化）                        |
| R5-R6           | 2          | 2（Enter 快捷键冲突，Right Arrow telemetry）             |
| R7-R8           | 3          | 3（WebUI telemetry，废弃类型，测试覆盖率）               |
| R9              | 0          | —（问题收敛）                                            |
| R10-R11         | 1          | 1（historyManager 依赖）                                 |
| R12-R13         | 1          | 1（评估正则的词边界）                                    |
| Phase 1+2 R1-R4 | 20+        | 20+（权限绕过、overlay 安全性、竞态条件）                |
| **总计**        | **37+**    | **37+**                                                  |

## Claude Code Alignment

| 功能                             | 对齐程度 | 备注                                   |
| -------------------------------- | -------- | -------------------------------------- |
| Prompt text                      | 100%     | 完全一致（仅品牌名称不同）             |
| 12 filter rules                  | 100%+    | \b 词边界优化                          |
| UI interaction (Tab/Enter/Right) | 100%     |                                        |
| Guard conditions                 | 100%     | 13 项检查                              |
| Telemetry                        | 100%     | 10+7 个字段                            |
| Cache sharing                    | ✅       | DashScope cache_control                |
| Speculation                      | ✅       | COW overlay + tool gating              |
| Pipelined suggestion             | ✅       | 在 speculation 完成后生成              |
| State management                 | 100%+    | Controller 模式，Object.freeze         |