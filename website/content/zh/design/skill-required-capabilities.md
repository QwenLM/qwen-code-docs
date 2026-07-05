# Skill 必需能力设计

状态：设计说明；本 PR 采用选项 B，并将 `required-capabilities` 留作未来提案。

## 背景

Web Shell 可以通过其 Markdown 渲染器渲染自定义的围栏代码块（fenced code blocks）。图表渲染器提案使用 `echarts-fulldata` 围栏代码块，以便模型返回完整的 ECharts option 和 dataset payload，Web Shell 会将其渲染为交互式图表。

该输出契约仅在能够渲染它的客户端中有效。在 CLI、ACP 客户端或任何其他没有匹配渲染器的界面中，相同的响应将显示为一大段代码块，而不是图表。

最初的内置图表 skill 提案依赖于文本提示来告诉模型该格式是用于 Web Shell 的。这是一种软性防护。如果该 skill 在非 Web Shell 会话中暴露，模型仍然可以选择客户端无法渲染的输出格式。

对于当前的 PR，Qwen Code 保留了 Web Shell 中的渲染器扩展点，但不在 core 中内置 `qwencode-viz`。Web Shell 包包含一个可复制的非自动加载 skill 模板，host 应仅在同时注册了 `echarts-fulldata` 渲染器时才安装或注入该 skill。

## 问题

Qwen Code 需要一种明确的方法来决定是否应向模型和用户展示特定于 host 的 skill。

对于 `qwencode-viz`，具体的问题是：

- core 是否应该支持通用的 `required-capabilities` skill 元数据字段？
- 或者 `qwencode-viz` 根本不应该作为 core 内置 skill，而是仅由安装或注入它的 Web Shell 客户端提供？

## 目标

- 防止在当前客户端无法满足其输出契约时，暴露特定于渲染器的 skill。
- 保持启动 skill 提醒、显式 skill 激活、斜杠命令发现和 skill 验证的一致性。
- 避免将 `qwencode-viz` 硬编码为特例。
- 在未声明能力要求时，保留现有的 skill 行为。
- 保持设计的可扩展性，以支持未来的 host 能力，而不仅仅是 ECharts。

## 非目标

- 实现 ECharts 渲染器本身。
- 重新设计所有客户端/服务端能力协商。
- 更改现有 skill frontmatter 的语义。
- 在第一个版本中解决多客户端共享会话的能力变更问题。

## 当前相关机制

代码库中已经有几种可见性控制机制，但没有一种代表客户端的渲染能力：

- `disable-model-invocation`：防止 skill 被模型自动调用。
- `user-invocable`：控制内置 skill 是否可作为命令使用。
- `paths`：将 skill 的可用性限制在匹配的工作区路径内。
- `skills.disabled`：禁用已配置的 skill。
- `allowedTools`：目前由内置 skill 加载使用，在 cron 工具不可用时隐藏面向 cron 的 skill。
- 斜杠命令 `supportedModes`：按执行模式过滤命令。
- Daemon 和 ACP 能力对象：描述协议或客户端支持，但目前未与 skill 暴露关联。

目前不存在 `required-capabilities` 或等效的 skill frontmatter。添加它将是一个新的 skill 契约。

## 选项 A：添加 `required-capabilities`

添加一个通用的 skill frontmatter 字段：

```yaml
---
name: qwencode-viz
description: Render analytical charts in Web Shell using echarts-fulldata fenced code blocks.
required-capabilities:
  - markdown.codeBlock.echarts-fulldata
---
```

当当前客户端/会话未声明所有列出的能力时，该 skill 将被视为不可用。

### 能力命名

使用带命名空间的字符串能力：

```text
markdown.codeBlock.echarts-fulldata
```

这保持了字段的通用性，同时使契约精确：

- `markdown`：该能力属于渲染后的 Markdown。
- `codeBlock`：该能力适用于围栏代码块渲染。
- `echarts-fulldata`：渲染器支持的特定语言/info 字符串。

未来的示例可能包括：

- `markdown.codeBlock.vega-lite`
- `markdown.codeBlock.mermaid-interactive`
- `artifact.openUrl`

### Skill 元数据

在解析 frontmatter 键 `required-capabilities` 后，将 `requiredCapabilities?: string[]` 添加到 skill 配置中。

两个 skill 解析路径都应理解该字段：

- `packages/core/src/skills/skill-load.ts`
- `packages/core/src/skills/skill-manager.ts`

该字段应为可选。缺失或为空表示该 skill 没有客户端能力要求。

### 运行时能力来源

将客户端/会话能力添加到运行时配置中：

```ts
interface ConfigParameters {
  clientCapabilitiesProvider?: () => ReadonlySet<string>;
}
```

在 `Config` 上暴露一个辅助方法，例如：

```ts
config.getClientCapabilities(): ReadonlySet<string>
```

然后集中进行检查：

```ts
function skillMeetsRequiredCapabilities(skill: Skill, config: Config): boolean {
  return skill.config.requiredCapabilities.every((capability) =>
    config.getClientCapabilities().has(capability),
  );
}
```

### 过滤点

能力过滤器应在 skill 暴露给模型或用户之前应用：

- `packages/core/src/tools/skill-utils.ts` 中的 `collectAvailableSkillEntries` 应跳过缺少所需能力的 skill。这可以保持启动 skill 提醒、增量提醒、`SkillTool` 验证和模型可调用激活的一致性。
- `BundledSkillLoader` 在创建面向用户的命令时，应跳过不可用的内置 skill。
- `SkillCommandLoader` 在创建面向用户的命令时，应跳过不可用的文件系统 skill。

重要的不变式是：除非项目有意支持手动覆盖，否则对模型隐藏的 skill 不应仍然作为可调用命令出现。

### Web Shell 注册

Web Shell 应显式声明渲染器支持，而不是依赖不透明的 `renderCodeBlock` 回调的存在。

例如：

```tsx
<WebShell
  customization={{
    markdown: {
      renderableCodeBlockLanguages: ['echarts-fulldata'],
      renderCodeBlock(info) {
        // render custom blocks
      },
    },
  }}
/>
```

Web Shell 客户端可以将其映射为：

```text
markdown.codeBlock.echarts-fulldata
```

即使渲染器回调包含自定义逻辑、回退机制或多个受支持的语言，这也能使能力声明保持稳定。

### Daemon 和 ACP 传播

对于托管或基于 daemon 的会话，客户端能力集需要在加载或列出 skill 之前到达 core。一个最小化版本可以在创建会话时传递能力：

```ts
interface CreateSessionRequest {
  clientCapabilities?: string[];
}
```

daemon 桥接器、SDK 和 ACP 会话创建流程可以将其存储为会话范围的配置。

在第一个版本中，能力可以是会话范围的。如果多个客户端附加到同一个会话，应记录其行为为使用会话创建时的能力。

### 优点

- 保持 `qwencode-viz` 作为一个规范的内置 skill。
- 防止特定于 host 的输出契约泄漏到不受支持的客户端中。
- 为未来特定于渲染器或特定于 host 的 skill 创建可重用的机制。
- 使依赖关系显式化且可测试。

### 缺点

- 增加了一个新的横切 skill 元数据字段。
- 需要在 Web Shell、daemon、SDK 和 ACP 界面之间建立客户端/会话能力传递机制。
- 需要为共享会话行为编写详细的文档。
- 如果 `qwencode-viz` 是唯一预期的受能力门控的 skill，可能会引入过多不必要的机制。

## 选项 B：客户端提供的 Skill

不添加通用的 `required-capabilities` 字段。相反，避免在 core 中内置 `qwencode-viz`。由 Web Shell 客户端或任何支持该渲染器的客户端自行提供该 skill。

可能的分发模型：

- Web Shell host 安装 `.qwen/skills/qwencode-viz/SKILL.md`。
- Web Shell 包提供一个可选的非自动加载 skill 模板，host 可以在启用图表渲染时复制或安装该模板。
- Web Shell 集成提供一个扩展 skill 包。
- Web Shell 集成仅在其图表渲染器启用时注入等效的模型指令。

在此模型中，该 skill 可用仅仅是因为渲染客户端选择提供它。

### 优点

- 对 core 的改动最小。
- 没有新的全局 skill 元数据契约。
- 能力可用性自然地由实现渲染器的客户端拥有。
- 避免了 daemon 或 ACP 的能力传递，除非客户端已经有 skill 注入机制。

### 缺点

- 除非所有客户端复制相同的内容，否则没有规范的内置 skill。
- 增加了每个 Web Shell 集成者的负担。
- 在客户端之间切换的用户可能会看到不一致的 skill 可用性。
- 没有为未来特定于 host 的 skill 创建通用的保障机制。
- 在 core 中更难测试，因为可用性取决于外部安装或注入。

## 建议

对于本 PR，使用选项 B。

这保持了 core skill 系统不变，并避免了在不受支持的客户端中暴露 `echarts-fulldata` 指令。Web Shell 渲染器钩子对于任何 host 拥有的块渲染器仍然有用，而特定于图表的模型指令则变成了显式的 host 选择加入。

从长远来看，将此作为产品/API 边界决策进行讨论。

如果维护者预期 Qwen Code 随着时间的推移会支持更多客户端渲染的输出契约，请选择选项 A。在这种情况下，`required-capabilities` 是一个小型的通用契约，可确保 skill 暴露在 CLI、Web Shell、ACP 和未来客户端中保持一致和准确。

如果预期 `qwencode-viz` 将保持为仅限 Web Shell 的扩展，并且维护者不希望 core skill 依赖于客户端渲染功能，请选择选项 B。在这种情况下，应从 core 中移除当前的内置 skill，并由支持 `echarts-fulldata` 的 Web Shell 客户端提供。

仅当维护者乐于将客户端/会话能力作为 skill 系统的一部分时，才建议将选项 A 作为未来的默认选项。否则，保持 host 渲染器 skill 由客户端拥有。

## 开放性问题

- 能力应该是会话范围、请求范围还是客户端范围？
- 缺失的能力是应该隐藏用户可调用的命令，还是仅隐藏模型可调用的 skill 激活？
- 能力名称应该是自由格式的字符串，还是根据已知的注册表进行验证？
- 不可用的 skill 应该完全从 `/skills` 中隐藏，还是显示为禁用状态并附带原因？
- 对于故意想在不受支持的客户端中发出原始 `echarts-fulldata` 块的用户，是否应该有手动覆盖机制？
- 字段名应该是 `required-capabilities`、`requires-capabilities` 还是 `client-capabilities`？

## 验证计划

如果实现了选项 A，请添加以下测试：

- 两个 skill 解析路径中的 frontmatter 解析。
- 当缺少能力时，`collectAvailableSkillEntries` 隐藏 skill。
- 当存在能力时，显示相同的 skill。
- 与 `paths`、`skills.disabled` 和 `disable-model-invocation` 的交互。
- `BundledSkillLoader` 和 `SkillCommandLoader` 的命令可见性。
- Web Shell 从受支持的代码块语言到客户端能力的映射。
- Daemon 或 ACP 会话创建保留能力集。
- 现有的内置 skill 集成测试，以确保没有 `required-capabilities` 的 skill 保持不变。

## 迁移

现有 skill 无需迁移，因为新字段是可选的。

对于当前的选项 B 路径，从 core 内置 skill 中移除图表 skill。Web Shell 包模板不得由 core 自动加载；host 通过安装或注入它来选择加入。

如果接受选项 A，请添加：

```yaml
required-capabilities:
  - markdown.codeBlock.echarts-fulldata
```

到未来的内置 `qwencode-viz` 中。

如果接受选项 B，请从 core 内置 skill 中移除图表 skill，并记录 Web Shell 客户端在注册 `echarts-fulldata` 渲染器时如何安装或注入它。