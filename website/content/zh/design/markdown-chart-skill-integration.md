# Markdown 图表 Skill 集成

状态：已接受

## 集成契约

Qwen Code WebShell 拥有契约的渲染侧：

- `@qwen-code/web-shell` 包含 `markdown-chart` 渲染器和 ECharts 运行时。
- 宿主安装规范的
  [`markdown-chart` skill](https://github.com/datafe/markdown-chart/tree/main/skills/markdown-chart)，
  使模型发出可渲染的图表块。
- Qwen Code core 不捆绑也不注入该 skill。项目可以将其安装在
  `.qwen/skills/markdown-chart/SKILL.md`；也支持用户级 skill 安装。

对于该 skill 产生的常规 `data.kind="inline"` 输出，WebShell 宿主不需要
任何图表专属代码：

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://127.0.0.1:4170"
  token={token}
  sessionId={sessionId}
/>;
```

## 引用数据

如果宿主向 skill 暴露真实的受控数据集并允许 `data.kind="ref"`，它通过
自定义注册表提供 `resolveDataRef`：

```tsx
import {
  createMarkdownChartRegistry,
  WebShellWithProviders,
} from '@qwen-code/web-shell';

const chartRegistry = createMarkdownChartRegistry({
  resolveDataRef: async (ref, context) =>
    loadControlledChartDataset(ref, context),
});
const markdown = { chart: { registry: chartRegistry } };

<WebShellWithProviders
  baseUrl="http://127.0.0.1:4170"
  token={token}
  sessionId={sessionId}
  markdown={markdown}
/>;
```

渲染器绝不自行获取 ref 或读取本地路径。`resolveDataRef` 是宿主拥有的边界，
从模型可见的引用通向受信数据集。默认注册表接受归一化的 `artifact://` 和
`session-file://` ref，将块解析为 JSON，校验 option，然后把归一化的 ref
连同声明的格式和尺寸传给解析器。解析器等待以 30 秒为限。在图表挂载期间，
保持 `markdown`、`chart` 和 `labels` 覆盖引用稳定。

## 流式行为

共享的 React 适配器区分已闭合的图表围栏和激活的未结束尾部围栏：

- 已闭合的 `markdown-chart` 块立即渲染，并在后续回答文本流式输出期间保持
  挂载，包括围栏位于引用块内的情况。
- 只有激活的未结束图表围栏显示加载状态。

## 范围

- skill 定义模型输出契约；它不加载渲染器。
- WebShell 定义渲染契约；它不自动安装 skill。
- 不需要 daemon、ACP 或客户端能力协商的变更。
- 不引入自动的网络或文件系统访问。
