# 统一推理力度 (/effort)

> **实现状态。** 已落地：5级阶梯 + `core/reasoning-effort.ts`（rank clamp/normalize），全局 `model.reasoningEffort` 设置 + 运行时 `Config.setReasoningEffort`/`getReasoningEffort`（在 `handleModelChange` 中跨模型切换重新应用），`/effort` 命令，GLM 逐字展平适配器（`provider/zai.ts`），Gemini `medium`/`xhigh` 映射，**按模型的 Anthropic 门控**（`anthropicSupportedEffortTiers` + clamp：Opus 4.7/4.8 和 5.x 系列透传 `xhigh`/`max`；Opus 4.6/Sonnet 4.6 仅接受 `max`；Opus 4.5 和无版本 id 被 clamp 到 `high`），以及 `model-with-reasoning` 状态行（在 `/effort` 时实时更新），DashScope 阶梯→布尔值映射（设置 effort 会为 qwen 混合模型开启 `enable_thinking`；当 qwen 发布真正的 `reasoning_effort` 字段时，这是唯一需要扩展的单列），以及交互式 `EffortDialog` —— 裸 `/effort` 在交互模式下打开阶梯选择器（并在非交互模式下列出阶梯），通过 `use-effort-command`、UI contexts、`DialogManager` 和 `useDialogClose` 串联。没有延迟实现的内容。

## 问题

每个支持推理的 provider 都暴露了不同的旋钮来控制“模型应该多努力地思考”：OpenAI/DeepSeek/GLM 使用扁平的 `reasoning_effort` 字符串，Anthropic 使用 `output_config.effort`（加上遗留的 `thinking.budget_tokens`），Gemini 3 使用 `thinking_level`（Gemini 2.5 使用 `thinkingConfig.thinkingBudget`），而 Qwen/DashScope 只有一个布尔值 `enable_thinking`。

core 已经承载了统一的 `reasoning: { effort }` 配置结构，并且每个 provider 适配器已经对其进行了转换（参见 Current State），但是没有面向用户的方式在运行时选择 effort 级别。该级别只能通过手动编辑每个模型的生成配置来设置。我们希望有一个 `/effort` 命令，提供一小组阶梯（tiers），将它们映射到当前活跃 provider 支持的任何值，并持久化该选择。

统一层还必须使添加新 provider 变得微不足道：当一个目前只有开/关开关的模型（例如 qwen3）获得真正的 effort 阶梯时，唯一的更改应该是映射/能力表中的一行。

## 目标

- 向用户暴露一个统一的 effort 阶梯：**`low | medium | high | xhigh | max`**（5个阶梯）。
- 一个 `/effort` 斜杠命令：`/effort <tier>` 直接设置；裸 `/effort` 打开选择器对话框。
- 一个**单一全局**设置，适用于所有模型，并在会话间持久化。
- 每个 provider 的转换 + **clamp** 层：不支持的阶梯会回退到当前活跃模型支持的最接近的阶梯，并附带一次性警告（复用现有的 Anthropic clamp UX）。
- 通过现有的 `model-with-reasoning` 状态行预设进行实时显示。
- 添加/调整 provider = 编辑一个能力/映射表，无需新的接线（wiring）。

## 非目标

- 没有 `off` 阶梯。完全禁用推理仍然保留为独立的现有 `reasoning: false` 概念；`/effort` 仅在活跃阶梯之间移动。
- 没有按模型持久化的 effort（决定：全局单一设置）。
- 没有原始的 `budget_tokens` UI。基于预算的 provider（Gemini 2.5，遗留 Anthropic）由阶梯→桶（bucket）映射驱动，不暴露数值。
- 除了填补映射空白和 clamp 之外，不更改现有的每个 provider 的请求接线。
- 没有桌面集成（桌面有自己的 `thinkingLevel` 管道；超出范围）。

## 当前状态

统一配置类型 — [`packages/core/src/core/contentGenerator.ts:104-118`]：

```ts
reasoning?: false | { effort?: 'low' | 'medium' | 'high' | 'max'; budget_tokens?: number }
```

现有的每个 provider 的转换器：

| Provider             | 文件                                                                                   | 行为                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| DeepSeek             | `provider/deepseek.ts:176-218`                                                         | 嵌套 → 扁平 `reasoning_effort`；`low/medium→high`，`xhigh→max`                              |
| Anthropic            | `anthropicContentGenerator.ts:521-593`，clamp `665-693`，beta hdr `393-431`            | `output_config.effort` + thinking；`max`→`high` clamp + 一次性警告；`effort-2025-11-24` beta |
| Gemini               | `geminiContentGenerator.ts:107-146`                                                    | `thinkingConfig`/`thinkingLevel`；`low→LOW`，`high/max→HIGH`                                |
| OpenAI/GLM/DashScope | `openaiContentGenerator/pipeline.ts:689-717` (`buildReasoningConfig`)，strip `597-602` | 转发/剥离 `reasoning_effort`；DashScope 添加 `preserve_thinking`                            |

差距（Gaps）：联合类型缺少 `xhigh`；Gemini 缺少 `medium` 和 `xhigh→high` 规则；必须确认通用 pipeline 为纯 OpenAI/GLM 发出 `reasoning_effort` 并将 `max` clamp 到 `xhigh`；DashScope 没有阶梯→布尔值映射。

## 先例：openclaw

`openclaw/openclaw` 使用了一种更成熟的形态解决了相同的问题，我们从中借鉴（在 `~/Documents/openclaw` 中研究过）：

- **单一规范阶梯 + 数字排名**（`src/auto-reply/thinking.shared.ts`）：`ThinkLevel = off|minimal|low|medium|high|xhigh|adaptive|max`，带有 `THINKING_LEVEL_RANKS`（off:0 … high:40, xhigh:60, max:70；adaptive≡30）。
- **基于排名的 clamp**（`src/llm/model-utils.ts:59` `clampThinkingLevel`）：如果模型支持该级别则使用它；对 xhigh/max 显式 `null` 退出是硬上限（首先向下走）；否则优先选择下一个更强的受支持级别，否则向下走——永远不会默默地将成本提高到模型上限之上。
- **按模型的能力**，而不仅仅是按 provider：catalog 携带 `compat.supportedReasoningEfforts` 和按模型的 `thinkingLevelMap`（值或 `null`）。
- **三个形态映射器**，每个 API 家族一个：
  - OpenAI 兼容 — `mapThinkingLevelToReasoningEffort()`：`off→none`，`adaptive→medium`，`max→xhigh`，否则透传 → `none|minimal|low|medium|high|xhigh`。
  - Anthropic — `mapThinkingLevelToEffort(model, level)`：clamp，然后为自适应思考模型发出 `output_config.effort`，或转换为 `thinkingBudgetTokens`（带有 `adjustMaxTokensForThinking`）用于旧模型。
  - Gemini — `resolveGoogleGemini3ThinkingLevel()`：Gemini 3 Pro → LOW/HIGH，Flash → MINIMAL/LOW/MEDIUM/HIGH；Gemini 2.5 将预算映射到级别（`≤0→MINIMAL, ≤2048→LOW, ≤8192→MEDIUM, 否则 HIGH`；`gemini-2.5-pro` 拒绝预算 0 —— 需要思考）。
  - DeepSeek V4 包装器：`off`→剥离；`xhigh|max→max`，否则 `high`。
- **Provider 思考配置**（`src/plugins/provider-thinking.types.ts`）：声明 `levels`/`defaultLevel`；二元 provider 存储 `low` 但显示 `on`。
- **推理清理器**（`extensions/opencode-go/reasoning-sanitizer.ts`）：在将历史重放到拒绝它们的 provider 时，剥离 `reasoning_content`/`reasoning_effort` 和思考部分。

我们采用的：基于排名的**中心 clamp**、**按模型的能力声明**、**三个形态映射器**，以及**精确的 Gemini 2.5 预算桶**。我们在 v1 中放弃的：`minimal`/`adaptive` 用户阶梯（决定 = 5 个阶梯）—— 它们仍然是有效的_内部_归一化目标，因此模型 catalog 仍然可以声明它们。

## 设计

### Effort 阶梯 & 能力表

规范有序阶梯：`low < medium < high < xhigh < max`。

每个 provider 声明一个受支持的子集；转换器将请求的阶梯在阶梯上**向下** clamp 到最接近的受支持阶梯。映射（规范 → 线路值），用 `↓` 标记 clamp：

| 阶梯   | OpenAI `reasoning_effort` | DeepSeek `reasoning_effort` | GLM-5.2+ `reasoning_effort` | Anthropic `output_config.effort` | Gemini 3 `thinking_level` | Qwen DashScope       |
| ------ | ------------------------- | --------------------------- | --------------------------- | -------------------------------- | ------------------------- | -------------------- |
| low    | low                       | high¹                       | low                         | low                              | low                       | enable_thinking:true |
| medium | medium                    | high¹                       | medium                      | medium                           | medium                    | true                 |
| high   | high                      | high                        | high                        | high (default)                   | high                      | true                 |
| xhigh  | xhigh                     | max¹                        | xhigh                       | xhigh ↓high²                     | high ↓²                   | true                 |
| max    | xhigh ↓ (无 `max`)        | max                         | max                         | max ↓high²                       | high ↓²                   | true                 |

¹ DeepSeek/GLM 记录的内部 grouping（low/medium ≡ high，xhigh ≡ max）。
² Clamp 到模型记录的上限（因 Anthropic 模型而异；Gemini 3 上限为 `high`）。Gemini 2.5 模型将阶梯映射到 `thinkingConfig.thinkingBudget` 桶，而不是 `thinking_level`。

Clamp 是**中心化且基于排名的**（借鉴自 openclaw 的 `clampThinkingLevel`）：为每个阶梯分配一个排名（`low:20, medium:30, high:40, xhigh:60, max:70`）；provider/模型声明其受支持的集合（以及可选的 `xhigh`/`max` 的 `null` 硬上限）；clamp 选择最接近的受支持阶梯 —— 硬上限请求向下走，否则优先选择请求处或低于请求的下一个受支持阶梯。这取代了临时的每个适配器 clamp（例如 Anthropic 当前的 `max→high`）。

能力是**按模型声明的，而不仅仅是按 provider**（openclaw 的经验）：模型的 catalog 条目 / provider 预设携带 `supportedReasoningEfforts?: EffortTier[]`（以及可选的按模型覆盖映射）。未设置时的默认值 = provider 的完整受支持集合。新 provider/模型就是表中的一行；clamp + 三个形态映射器保持不变。

三个形态映射器负责线路转换（每个 API 家族一个），接收已经 clamp 过的阶梯：

- `toReasoningEffort(tier)` — OpenAI/DeepSeek/GLM/DashScope 扁平 `reasoning_effort`（DashScope 则 → `enable_thinking` 布尔值）。
- `toAnthropicThinking(tier, model)` — 自适应模型的 `output_config.effort`，否则为 `thinking.budget_tokens`。
- `toGeminiThinking(tier, model)` — `thinking_level`（Gemini 3）或 `thinkingConfig.thinkingBudget` 桶（Gemini 2.5，阈值按 openclaw）。

### 采样参数规范

DeepSeek 和 GLM 在思考模式下拒绝 `temperature`/`top_p`/`presence_penalty`/`frequency_penalty`。当转换器为这些 provider 启用思考时，它必须从请求体中剥离这些采样参数。

### OpenAI 兼容字段形态差异

“OpenAI 兼容”并不意味着只有一个 effort 字段。规范配置是嵌套的 `reasoning: { effort }` 对象；`buildReasoningConfig()`（`pipeline.ts:689-717`）**逐字**传递它，没有值映射。每个线路字段不同的 provider 必须在其 `buildRequest` 钩子中重塑它。已知的形态：

| 线路形态                               | Providers                                             | qwen-code 处理                                                                                           |
| ------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 嵌套 `reasoning: { effort }`       | OpenAI Responses, OpenRouter, gpt-5.x                 | 透传（默认） ✅                                                                                 |
| 扁平顶层 `reasoning_effort`    | DeepSeek, **GLM/z.ai**, OpenAI Chat Completions, Groq | DeepSeek 适配器展平 ✅；**GLM 没有适配器 → 当前传递嵌套形态，可能是错误的 ❌** |
| `enable_thinking` 布尔值               | qwen3 / DashScope                                     | 适配器发出布尔值（仅禁用）；尚无 effort 阶梯                                                   |
| `extra_body.thinking.enabled` 开关 | GLM                                                   | 独立于 effort 值的开/关旋钮                                                               |
影响：纯透传仅对接受嵌套结构的 provider “开箱即用”。**PR1 必须添加 GLM/z.ai 的扁平化处理**（参考 `deepseek.ts`），并且当 Qwen 添加 effort 字段时，扩展 DashScope adapter 以输出 Qwen API 文档中定义的结构（最可能是扁平的 `reasoning_effort`）。只有当新 provider 接受嵌套的规范结构时才会自动支持；否则需要通过单一 hook 进行结构转换。

### 配置流程与持久化

- 新增全局设置 **`model.reasoningEffort`**：`'low' | 'medium' | 'high' | 'xhigh' | 'max'`，添加到 `settingsSchema.ts` 中（靠近 `generationConfig` 节点，`1412-1504` 行）。
- 在 content-generator 构建时，配置层将 `model.reasoningEffort` 映射为 `generationConfig.reasoning.effort`（作为现有 translator 的唯一真实数据源）。一个全局值，适用于所有模型。
- 运行时变更：添加 `config.setReasoningEffort(tier)`（与 `switchModel` 并列，`config.ts:~2047`），用于更新内存中的 `generationConfig.reasoning.effort` 并刷新当前活跃的 ContentGenerator，然后调用 `persistSetting('model.reasoningEffort', tier)`。

### CLI 交互

- 新增 `effortCommand.ts`（参考 `modelCommand.ts:39-79`）：
  - `/effort` → `{ type: 'dialog', dialog: 'effort' }`
  - `/effort high` → 校验 tier，调用 `config.setReasoningEffort`，持久化并返回确认消息。
  - `completion()` 提供 5 个 tier 的补全。
- 新增 `EffortDialog` Ink 组件，并在 `commands/types.ts:168-198` 中注册 `'effort'` dialog 类型。该对话框列出 5 个 tier，并标注哪些会在当前模型下被截断（例如“在此模型上 max → high”）。
- 状态栏：现有的 `model-with-reasoning` 预设（`statusLinePresets.ts:13,46-51`）读取实时的 effort —— 无需新增预设。

### 类型变更

扩展 `contentGenerator.ts:104-118` 中的 effort 联合类型，添加 `'xhigh'`。`reasoning: false` 的禁用路径保持不变。

## 阶段划分（小型 PR，每个关联一个 issue）

1. **core：阶梯 + 映射 + 截断。** 在联合类型中扩展 `xhigh`；添加基于排名的中央截断 + 每个模型的 `supportedReasoningEfforts`；提取三个结构映射器；填充 Gemini `medium`/`xhigh↓` + 2.5 预算分桶，确认 OpenAI/GLM 的 `reasoning_effort` 输出 + `max↓xhigh`，添加 DashScope tier→bool；采样参数剥离；验证现有的 reasoning 剥离路径（`pipeline.ts:597-602`）是否像 openclaw 的 sanitizer 一样覆盖历史重放。每个 provider translator + 截断边界的单元测试。无 UI。
2. **cli：设置 + 直接命令。** `model.reasoningEffort` schema，配置映射 + `setReasoningEffort` 运行时刷新，`/effort <tier>`，状态栏实时读取。测试。
3. **cli：选择器对话框。** `EffortDialog` + 无参数的 `/effort`，每个模型的截断提示。
4. **docs。** `docs/users/` effort 页面；交叉链接 reasoning/token-caching 文档。

## 测试覆盖

最高价值检查项：每个 provider translator 为每个 tier（包括截断边界）发出正确的传输字段（OpenAI 上的 `max` → `xhigh`，Gemini-3 / 受限 Anthropic 模型上的 `xhigh`/`max` → `high`）；当 DeepSeek/GLM 启用 thinking 时剥离采样参数；`model.reasoningEffort` 在设置中读写往返并映射到 `generationConfig.reasoning.effort`；`setReasoningEffort` 重建 ContentGenerator；一次性截断警告在每个 model+tier 组合上仅触发一次。