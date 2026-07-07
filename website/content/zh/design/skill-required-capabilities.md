# Skill 所需能力设计

状态：设计笔记；本 PR 采用 Option B，并将 `required-capabilities` 作为未来提案保留。

## 背景

Web Shell 可以通过其 Markdown 渲染器渲染自定义的围栏代码块（fenced code blocks）。图表渲染器提案使用 `echarts-fulldata` 围栏代码块，以便模型返回完整的 ECharts option 和 dataset payload，Web Shell 会将其渲染为交互式图表。

该输出契约仅在能够渲染它的客户端中有效。在 CLI、ACP 客户端或任何其他没有匹配渲染器的界面中，相同的响应将显示为一大段代码块，而不是图表。

最初的内置图表 skill 提案依赖于文本提示来告诉模型该格式适用于 Web Shell。这是一种软性防护（soft guard）。如果该 skill 在非 Web Shell 会话中暴露，模型仍然可以选择客户端无法渲染的输出格式。

对于当前的 PR，Qwen Code 保留了 Web Shell 中的渲染器扩展点，但不在核心中内置 `qwencode-viz`。Web Shell 包包含一个可复制的、非自动加载的 skill 模板，宿主（hosts）只有在同时注册了 `echarts-fulldata` 渲染器时，才应安装或注入该 skill。

## 问题

Qwen Code 需要一种明确的方法来决定是否应向模型和用户展示特定于宿主的 skill。

对于 `qwencode-viz`，具体的问题是：

- 核心是否应该支持通用的 `required-capabilities` skill 元数据字段？
- 或者 `qwencode-viz` 根本不应该作为核心内置 skill，而是仅由安装或注入它的 Web Shell 客户端提供？

## 目标

- 防止在当前客户端无法满足其输出契约时，暴露特定于渲染器的 skill。
- 保持启动 skill 提醒、显式 skill 激活、斜杠命令发现和 skill 验证的一致性。
- 避免将 `qwencode-viz` 硬编码为特例。
- 在未声明能力要求时，保留现有的 skill 行为。
- 保持设计的可扩展性，以支持未来的宿主能力，而不仅限于 ECharts。

## 非目标

- 实现 ECharts 渲染器本身。
- 重新设计所有客户端/服务端能力协商。
- 更改现有 skill frontmatter 的语义。
- 在第一版中解决多客户端共享会话的能力变更问题。

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

## Option A：添加 `required-capabilities`

添加一个通用的 skill frontmatter 字段：

```yaml
---
name: qwencode-viz
description: Render analytical charts in Web Shell using echarts-fulldata fenced code blocks.
required-capabilities:
  - markdown.codeBlock.echarts-fulldata
---
```

当当前客户端/会话未公布所有列出的能力时，该 skill 将被视为不可用。

### 能力命名

使用命名空间字符串能力：

```text
markdown.codeBlock.echarts-fulldata
```

这保持了字段的通用性，同时使契约精确：

- `markdown`：该能力属于渲染的 Markdown。
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

- `packages/core/src/tools/skill-utils.ts` 中的 `collectAvailableSkillEntries` 应跳过缺少所需能力的 skill。这可以保持启动 skill 提醒、增量提醒（delta reminders）、`SkillTool` 验证和模型可调用激活的一致性。
- `BundledSkillLoader` 在创建面向用户的命令时，应跳过不可用的内置 skill。
- `SkillCommandLoader` 在创建面向用户的命令时，应跳过不可用的文件系统 skill。

重要的不变式（invariant）是：对模型隐藏的 skill 不应仍然作为可调用命令出现，除非项目有意支持手动覆盖。

### Web Shell 注册

Web Shell 应明确公布渲染器支持，而不是依赖于不透明的 `renderCodeBlock` 回调的存在。

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

这使得能力声明保持稳定，即使渲染器回调包含自定义逻辑、回退（fallbacks）或多个受支持的语言。

### Daemon 和 ACP 传播

对于托管或基于 daemon 的会话，客户端能力集需要在加载或列出 skill 之前到达核心。一个最小版本可以在创建会话时传递能力：

```ts
interface CreateSessionRequest {
  clientCapabilities?: string[];
}
```

Daemon 桥接、SDK 和 ACP 会话创建流程可以将其存储为会话范围的配置。

在第一版中，能力可以是会话范围的。如果多个客户端附加到同一会话，其行为应记录为使用会话创建时的能力。

### 优点

- 保持 `qwencode-viz` 作为一个规范的内置 skill。
- 防止特定于宿主的输出契约泄漏到不受支持的客户端中。
- 为未来特定于渲染器或特定于宿主的 skill 创建可重用的机制。
- 使依赖关系显式化且可测试。

### 缺点

- 添加了一个新的横切（cross-cutting）skill 元数据字段。
- 需要跨 Web Shell、daemon、SDK 和 ACP 界面进行客户端/会话能力传递。
- 需要为共享会话行为编写谨慎的文档。
- 如果 `qwencode-viz` 是唯一预期的能力门控（capability-gated）skill，可能会引入过多的机制。

## Option B：客户端提供的 Skill

不添加通用的 `required-capabilities` 字段。相反，避免在核心中内置 `qwencode-viz`。Web Shell 客户端或任何支持该渲染器的客户端自行提供该 skill。

可能的分发模型：

- Web Shell 宿主安装 `.qwen/skills/qwencode-viz/SKILL.md`。
- Web Shell 包附带一个可选的非自动加载 skill 模板，宿主可以在启用图表渲染时复制或安装该模板。
- Web Shell 集成附带一个扩展 skill 包。
- Web Shell 集成仅在其图表渲染器启用时注入等效的模型指令。

在此模型中，该 skill 可用仅仅是因为渲染客户端选择提供它。

### Web Shell 宿主集成

希望获得图表输出的 Web Shell 宿主应同时选择契约的两半：

1. 注册一个 `echarts-fulldata` Markdown 代码块渲染器。
2. 从 `packages/web-shell/docs/examples/qwencode-viz/SKILL.md` 提供匹配的图表 skill。

例如：

```tsx
import * as echarts from 'echarts';
import {
  WebShellWithProviders,
  createEchartsFullDataRenderer,
} from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://127.0.0.1:4170"
  token={token}
  sessionId={sessionId}
  markdown={{
    renderCodeBlock: createEchartsFullDataRenderer({
      loadEcharts: () => echarts,
      resolveDataRef: async (ref, meta) =>
        loadControlledChartDataset(ref, meta),
    }),
  }}
/>;
```

在此渲染器配置中，`loadEcharts` 允许宿主提供受认可的 ECharts 运行时，可以是静态导入或延迟加载的模块。`resolveDataRef` 仅用于 `data.kind="ref"` 图表块；它是宿主拥有的桥接，将模型可见的数据引用转换为受信任的 dataset。模型侧的信封（envelope）格式由 `packages/web-shell/docs/examples/qwencode-viz/SKILL.md` 中的可选 skill 模板描述；渲染器侧的验证位于 `packages/web-shell/client/components/messages/EchartsFullDataBlock.tsx`。

该 skill 文件应仅由执行此注册的宿主安装或注入。一个简单的基于文件的集成可以复制：

```text
packages/web-shell/docs/examples/qwencode-viz/SKILL.md
```

到工作区或用户 skill 目录，例如：

```text
.qwen/skills/qwencode-viz/SKILL.md
```

拥有自己 skill 分发层的集成可以改为将同一文件作为规范源内容加载，并通过该层暴露它。在这两种情况下，核心都不会自动加载该 skill；宿主拥有启用它的权限，因为宿主拥有渲染器。

对于 `data.kind="ref"` 信封，内置渲染器在调用宿主控制的 `resolveDataRef(ref, meta)` 实现之前，会验证 `data.ref` 是否使用了规范化的 `artifact://` 或 `session-file://` 引用。渲染器还会将块解析为 JSON 并在渲染前对 ECharts option 进行清理；它不会自行评估模型提供的 JavaScript、获取任意 URL 或读取本地文件。自定义渲染器应保留相同的分离：首先是渲染器级别的 JSON/ref/option 验证，其次是宿主拥有的 artifact 解析。

基于 daemon 的宿主可以将工作区文件 API 视为一个 artifact 后端。例如，宿主可以将图表 artifact 持久化到受控的工作区目录（如 `.qwen/artifacts/`），暴露模型侧的引用（如 `artifact://chart-data/orders.csv`），并通过 daemon `GET /file?path=.qwen/artifacts/chart-data/orders.csv` 解析它们。这保持了 `artifact://` 作为公开的图表契约，同时允许第一版实现重用 daemon 工作区文件。

在调用 daemon 之前，解析器仍必须强制执行 artifact 根目录：

```tsx
const ARTIFACT_ROOT = '.qwen/artifacts/';
const MAX_CHART_DATA_BYTES = 256 * 1024;

async function resolveDataRef(
  ref: string,
  meta: { format?: string; dimensions?: string[] },
) {
  const artifactPrefix = 'artifact://';
  if (!ref.startsWith(artifactPrefix)) {
    throw new Error(`Unsupported chart data ref: ${ref}`);
  }

  const artifactPath = ref.slice(artifactPrefix.length);
  if (
    artifactPath.length === 0 ||
    artifactPath.startsWith('/') ||
    artifactPath.includes('\\') ||
    artifactPath.split('/').includes('..')
  ) {
    throw new Error(`Invalid chart data ref: ${ref}`);
  }

  const url = new URL('/file', daemonBaseUrl);
  url.searchParams.set('path', `${ARTIFACT_ROOT}${artifactPath}`);
  url.searchParams.set('maxBytes', String(MAX_CHART_DATA_BYTES));

  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`Failed to read chart data: ${response.status}`);
  }

  const file = (await response.json()) as { content: string };
  return meta.format === 'csv'
    ? parseCsvAsArrayRows(file.content, meta.dimensions)
    : JSON.parse(file.content);
}
```
此示例有意仅映射 `.qwen/artifacts/` 下规范化的 `artifact://` 路径。如果宿主后续将 artifacts 迁移至对象存储或会话级别的 artifact 服务，只需修改 `resolveDataRef`；面向模型的 `echarts-fulldata` 代码块可继续使用相同的 ref 结构。

### 优点

- 核心改动最小。
- 无需新增全局 skill 元数据契约。
- 能力的可用性自然由实现渲染器的客户端负责。
- 避免了 daemon 或 ACP 的底层对接工作，除非客户端已经具备 skill 注入机制。

### 缺点

- 除非所有客户端复制相同的内容，否则不存在标准的内置 skill。
- 增加了每个 Web Shell 集成者的负担。
- 用户在切换客户端时，可能会遇到 skill 可用性不一致的问题。
- 无法为未来特定于宿主的 skill 提供通用的保障机制。
- 核心模块的测试难度增加，因为可用性依赖于外部安装或注入。

## 建议

针对此 PR，建议采用选项 B。

这样可以保持核心 skill 系统不变，并避免在不支持的客户端中暴露 `echarts-fulldata` 指令。Web Shell 渲染器 hook 依然适用于任何宿主拥有的代码块渲染器，同时特定于图表的模型指令将转变为需要宿主显式 opt-in 的功能。

从长远来看，应将其作为产品/API 边界决策进行讨论。

如果维护者预期 Qwen Code 未来会支持更多客户端渲染的输出契约，请选择选项 A。在这种情况下，`required-capabilities` 作为一个轻量级的通用契约，能够确保 skill 在 CLI、Web Shell、ACP 及未来客户端中的暴露行为准确无误。

如果预期 `qwencode-viz` 将保持为仅限 Web Shell 的扩展，且维护者不希望核心 skill 依赖客户端的渲染功能，请选择选项 B。在这种情况下，应将当前的内置 skill 从核心中移除，改由支持 `echarts-fulldata` 的 Web Shell 客户端来提供。

只有当维护者接受将客户端/会话能力纳入 skill 系统时，才建议将选项 A 作为未来的默认方案。否则，应继续由客户端自行管理宿主渲染器相关的 skill。

## 待讨论问题

- 能力（capabilities）的作用域应该是会话级、请求级还是客户端级？
- 缺失能力时，是应该隐藏用户可调用的命令，还是仅隐藏模型可调用的 skill 激活？
- 能力名称应该是自由格式的字符串，还是需要对照已知的注册表进行校验？
- 不可用的 skill 是完全从 `/skills` 中隐藏，还是显示为禁用状态并说明原因？
- 对于有意在不支持的客户端中输出原始 `echarts-fulldata` 代码块的用户，是否应提供手动覆盖（override）机制？
- 字段名应命名为 `required-capabilities`、`requires-capabilities` 还是 `client-capabilities`？

## 验证计划

若采用选项 A，需增加以下测试：

- 两条 skill 解析路径中的 Frontmatter 解析。
- `collectAvailableSkillEntries` 在缺失能力时隐藏 skill 的逻辑。
- 具备能力时正常显示该 skill 的逻辑。
- 与 `paths`、`skills.disabled` 及 `disable-model-invocation` 的交互行为。
- `BundledSkillLoader` 和 `SkillCommandLoader` 的命令可见性。
- Web Shell 中支持的代码块语言到客户端能力的映射。
- Daemon 或 ACP 会话创建时保留能力集。
- 现有的内置 skill 集成测试，以确保未配置 `required-capabilities` 的 skill 行为保持不变。

## 迁移

现有 skill 无需迁移，因为新字段是可选的。

针对当前的选项 B 方案，需将图表 skill 从核心内置 skill 中移除。Web Shell 包模板不得由核心自动加载，宿主需通过安装或注入该模板来显式启用。

若采用选项 A，请添加：

```yaml
required-capabilities:
  - markdown.codeBlock.echarts-fulldata
```

至未来的内置 `qwencode-viz` 中。

若采用选项 B，需将图表 skill 从核心内置 skill 中移除，并编写文档说明 Web Shell 客户端在注册 `echarts-fulldata` 渲染器时如何安装或注入该 skill。