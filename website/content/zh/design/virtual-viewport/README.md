# ink 7 长对话虚拟视口

状态：**已实现**，PR #4146 包含：
核心视口、带自动隐藏动画的 ASCII 滚动条、SGR 鼠标滚轮、`ui.useTerminalBuffer` 开关、键盘滚动快捷键。
滚动条拖拽 / 应用内搜索 / 备用缓冲区模式 / 双写到宿主滚动历史 已推迟至 V.3+（见 §7）。
作者：秦奇
追踪分支：`feat/virtual-viewport-on-ink7`（基于：`main`）

## 1. 问题

用户反馈的多个闪烁 / 卡顿问题，根源均在同一架构事实：ink 的 `<Static>` 是**只追加**的，而 qwen-code 的 `MainContent.tsx` 在每次渲染时都会将整个 `mergedHistory` 传入。对于 1000 轮对话，每次状态变更都会触发 1000 次 `HistoryItemDisplay` React 渲染 + ink 布局传递。

当前存在的问题症状：

| 问题            | 症状                                 | 当前原因                                                      |
| --------------- | ------------------------------------ | ------------------------------------------------------------- |
| #2950           | 长会话出现持续的上下滚动风暴         | 每次刷新时 Static 完全重新挂载                                |
| #3118           | 切换回窗口时持续闪烁                 | `clearTerminal` + `historyRemountKey++` 触发完全重挂载        |
| #3007           | 通用界面闪烁                         | 与 #3118 相同                                                 |
| #3838（UI 侧）  | 滚动条无限增长                       | 每次累积增量渲染都会添加行；没有视口淘汰机制                  |
| #3899 → #3905   | Ctrl+O 导致终端冻结数秒              | 已部分修复，通过 `setImmediate` 分块处理解决                  |

PR #3905 明确指出：

> 讨论了多种替代方案（sealed prefix + live tail、**真正的视口虚拟化**、ANSI 输出缓存），但每种方案要么改变 UX，要么需要架构重写。

本设计方案正是要进行这一架构重写。

## 2. 参考实现

调研了两个已解决（或绕过）此问题的开源 ink CLI：

### 2.1 claude-code（`/Users/gawain/Documents/codebase/opensource/claude-code`）

维护了自己**分叉的 ink**，位于 `src/ink/`：

- `ink.tsx` — 1722 行自定义主循环
- `log-update.ts` — 773 行自定义差异渲染器，带滚动区域（`DECSTBM`）优化，当滚动历史会被触及时回退到全帧模式
- `screen.ts` / `frame.ts` — 显式 Screen / Frame 对象，`cellAt` / `diffEach` 单元格级差异比较
- `render-to-screen.ts` — 暴露 `renderToScreen(node)`，可将任意节点树带外渲染到 `Screen` 对象。这是"渲染一次、缓存、重放"即虚拟化的底层能力
- `screens/REPL.tsx`：
  - `visibleStreamingText = streamingText.substring(0, streamingText.lastIndexOf('\n') + 1) || null` — 只将完整行暴露给渲染器
  - `ScrollBox` 带 `scrollRef`、`cursorNavRef`
  - `Markdown.tsx` 的 `StreamingMarkdown` 在最后一个顶层块边界处分割内容，对稳定前缀做 memoize，只重新解析不稳定的后缀
- `Markdown.tsx` token 缓存（LRU-500）— 在卸载→重挂载后依然有效，虚拟滚动重新挂载时命中缓存，无需重新词法分析

**为何不复制此方案**：完整分叉 ink 维护成本不可持续（仅 `ink.tsx` 就有 1722 行，加上自定义协调器）。每个上游 ink 修复都需要手动合并。这一成本对 claude-code 的规模是合理的；对 qwen-code 则不然。

### 2.2 gemini-cli（`/Users/gawain/Documents/codebase/opensource/gemini-cli`）

使用 `@jrichman/ink@6.6.9`（一个添加了 `ResizeObserver` 和 `StaticRender` 导出的较小分叉），并以**纯组件**形式提供了**完整的虚拟化列表**：

| 文件                                    | 行数 | 职责                                                         |
| --------------------------------------- | ---- | ------------------------------------------------------------ |
| `components/shared/VirtualizedList.tsx` | 764  | 核心视口 + 测量 + 滚动锚点 + 每项大小变更追踪               |
| `components/shared/ScrollableList.tsx`  | 278  | 封装 `VirtualizedList`，添加按键导航 + 平滑滚动 + 滚动条     |
| `contexts/ScrollProvider.tsx`           | 469  | 鼠标拖拽、滚动锁定、焦点上下文                               |
| `hooks/useBatchedScroll.ts`             | 35   | 合并同一 tick 内的滚动更新                                   |
| `hooks/useAnimatedScrollbar.ts`         | 130  | 滚动条淡入/淡出动画                                          |

`MainContent.tsx` 通过 `isAlternateBufferOrTerminalBuffer` 标志在两种渲染路径之间切换：

```tsx
if (isAlternateBufferOrTerminalBuffer) {
  return <ScrollableList data={virtualizedData} renderItem={renderItem} ... />;
}

return <Static items={[<AppHeader />, ...staticHistoryItems, ...lastResponseHistoryItems]}>...</Static>;
```

`HistoryItemDisplay` 被 `React.memo` 包裹，未变更的条目不会重新渲染。

**这是生产级参考实现。**

## 3. ink 7 能力检查

qwen-code 正在 `chore/upgrade-ink-7` 分支上。检查了 `node_modules/ink/build/index.d.ts` 的导出：

- ✅ `useBoxMetrics(ref): {width, height, left, top, hasMeasured}` — 布局变更时自动更新。**`ResizeObserver` 的功能等价物。**
- ✅ `measureElement(node)` — 单次命令式测量
- ✅ `useWindowSize` — 终端大小变更
- ✅ `useAnimation` — 用于滚动条淡出
- ✅ `Static`、`Box`、`Text` 等
- ❌ `ResizeObserver`（组件/类）— 需要适配
- ❌ `StaticRender` — 需要自定义实现

**结论**：ink 7 具备所需的全部原语。无需切换分叉。

## 4. 策略决策

**将 gemini-cli 的 `ScrollableList` + `VirtualizedList` + 配套 hooks/contexts 移植到 qwen-code，将 `ResizeObserver` 适配为 `useBoxMetrics`，并自定义实现 `StaticRender`。**

被否决的替代方案：

| 替代方案                      | 否决原因                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| 像 claude-code 一样分叉 ink   | 维护成本不可持续                                                                                    |
| 切换到 `@jrichman/ink`        | 会撤销进行中的 ink 7 升级，损失 ink 7 的 React 19.2 + reconciler 0.33 + 新差异渲染器的改进         |
| 从零构建虚拟化                | 重新发明约 1700 行经过验证的设计；gemini-cli 的参考实现已经存在且可用                              |

## 5. 架构

### PR #4146 后的文件结构

```
packages/cli/src/ui/
├── components/shared/
│   ├── VirtualizedList.tsx          [NEW] 核心视口 + ASCII 滚动条
│   ├── ScrollableList.tsx           [NEW] 键盘 + 鼠标滚轮封装
│   └── StaticRender.tsx             [NEW] React.memo 封装（替代 gemini-cli 的 ink 分叉导出）
├── hooks/
│   ├── useBatchedScroll.ts          [NEW] 合并同一 tick 的滚动更新
│   ├── useMouseEvents.ts            [NEW] 启用 SGR 鼠标模式 + 解析 stdin 事件
│   └── useAnimatedScrollbar.ts      [NEW] 滚动时滑块闪现 + 空闲自动隐藏
├── utils/
│   └── mouse.ts                     [NEW] SGR + X11 鼠标事件解析器（从 gemini-cli 移植）
├── components/MainContent.tsx       [MOD] 添加虚拟化分支 + 稳定性 refs
└── AppContainer.tsx                 [MOD] 将滚动相关 UI 状态注入 context + 控制 refreshStatic
```

推迟到后续 PR：

- **滚动条拖拽 + 点击定位** — 需要屏幕绝对元素坐标，受限于原生 ink 7 限制（见 V.4 / V.7）。
- **应用内 `/` 搜索** — claude-code 的 `TranscriptSearchBar` 模式（V.5）。
- **备用缓冲区模式** — `contexts/ScrollProvider.tsx` 风格的焦点 / 锁定，带完整的 alt-screen 接管（V.6）。

### 配置项（V.2）

```ts
// settings schema
ui: {
  /**
   * 为长对话启用虚拟化历史渲染。
   * 为 true 时，只有可见视口内的条目通过 React 渲染；
   * 已滚出的条目保留在终端滚动历史缓冲区中。
   *
   * 默认值：false。在长对话上验证稳定前保持可选启用。
   */
  useTerminalBuffer?: boolean;  // 别名保持与 gemini-cli 兼容
}
```

`MainContent.tsx` 读取配置并切换路径：

```tsx
const useTerminalBuffer = uiState.settings?.ui?.useTerminalBuffer ?? false;

if (useTerminalBuffer) {
  return <ScrollableList .../>; // 虚拟化
}

return <Static .../>; // 现有路径，保持不变
```

旧版 `<Static>` 路径保持不变——未选择启用的用户不存在回退风险。

## 6. 来自 gemini-cli 源码的关键适配

### 6.1 `ResizeObserver` → `useBoxMetrics`

gemini-cli 的容器观察器（命令式模式）：

```ts
const containerObserverRef = useRef<ResizeObserver | null>(null);

const containerRefCallback = useCallback((node: DOMElement | null) => {
  containerObserverRef.current?.disconnect();
  containerRef.current = node;
  if (node) {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const newHeight = Math.round(entry.contentRect.height);
        const newWidth = Math.round(entry.contentRect.width);
        setContainerHeight((prev) => (prev !== newHeight ? newHeight : prev));
        setContainerWidth((prev) => (prev !== newWidth ? newWidth : prev));
      }
    });
    observer.observe(node);
    containerObserverRef.current = observer;
  }
}, []);
```

我们的适配（声明式 ink 7 hook）：

```ts
const containerRef = useRef<DOMElement>(null);
const { width: containerWidth, height: containerHeight } =
  useBoxMetrics(containerRef);
```

`useBoxMetrics` 已处理挂载/卸载 + 布局变更订阅；命令式的样板代码随之消失。

### 6.2 每项大小变更追踪器（`itemsObserver`）

难度更高。gemini-cli 通过单个 `ResizeObserver` 观察 N 个条目节点，并通过 `WeakMap` 将 entry 路由到对应的 key：

```ts
const nodeToKeyRef = useRef(new WeakMap<DOMElement, string>());
const itemsObserver = useMemo(
  () =>
    new ResizeObserver((entries) => {
      setHeights((prev) => {
        let next = null;
        for (const entry of entries) {
          const key = nodeToKeyRef.current.get(entry.target);
          if (key && prev[key] !== Math.round(entry.contentRect.height)) {
            if (!next) next = { ...prev };
            next[key] = Math.round(entry.contentRect.height);
          }
        }
        return next ?? prev;
      });
    }),
  [],
);
```

`useBoxMetrics` 是**单 ref 单 hook**，无法 1:1 替换。有两种方案：

**方案 A — 将测量下推到 `VirtualizedListItem`**

每个 `VirtualizedListItem` 本身已是独立组件（memoized）。在其内部添加 `useBoxMetrics`，通过回调 prop 向上报告高度：

```tsx
const VirtualizedListItem = memo(({ itemKey, onHeightChange, ...props }) => {
  const ref = useRef<DOMElement>(null);
  const { height, hasMeasured } = useBoxMetrics(ref);
  useEffect(() => {
    if (hasMeasured) onHeightChange(itemKey, height);
  }, [itemKey, height, hasMeasured, onHeightChange]);
  return <Box ref={ref}>{...}</Box>;
});
```

**方案 B — 在父组件中使用 `measureElement` + `useLayoutEffect`**

父组件存储可见条目的 refs，在每次渲染后运行 layout-effect 进行测量。响应性较低但更简单：

```ts
useLayoutEffect(() => {
  const newHeights: Record<string, number> = { ...heights };
  let changed = false;
  for (const [key, ref] of itemRefs.current) {
    if (ref) {
      const { height } = measureElement(ref);
      if (newHeights[key] !== height) {
        newHeights[key] = height;
        changed = true;
      }
    }
  }
  if (changed) setHeights(newHeights);
});
```

**推荐：方案 A。** 职责分离更清晰，利用了 ink 7 内置的变更检测。避免了每次渲染都测量所有内容的"测量风暴"风险。

### 6.3 `StaticRender` — 自定义实现

gemini-cli 从 `@jrichman/ink` 导入 `StaticRender`。查看 `VirtualizedList.tsx` 中的用法：

```tsx
{shouldBeStatic ? (
  <StaticRender width={...} key={`${itemKey}-static-${width}`}>
    {content}
  </StaticRender>
) : (
  content
)}
```

语义：以给定宽度渲染一次 `content`；后续使用相同 key + 宽度的渲染返回缓存结果。

在 ink 7 中，等价实现是使用普通的 `React.memo` 加上父组件保证不会重新渲染的稳定组件。自定义实现如下：

```tsx
import { memo } from 'react';
import { Box } from 'ink';

interface StaticRenderProps {
  children: React.ReactElement;
  width?: number | string;
}

const StaticRender = memo(
  ({ children, width }: StaticRenderProps) => (
    <Box width={width} flexDirection="column" flexShrink={0}>
      {children}
    </Box>
  ),
  (prev, next) => prev.children === next.children && prev.width === next.width,
);
```

结合父组件稳定的 `key` prop（`${itemKey}-static-${width}`），当 children 或 width 变化时触发全新挂载；否则 React 跳过重新渲染。

这是核心能力：静态条目（例如已完成的 Gemini 消息）只被测量和渲染一次，永远不会再走 React 流程。

### 6.4 Memoize `HistoryItemDisplay`

gemini-cli 的做法：

```ts
const MemoizedHistoryItemDisplay = memo(HistoryItemDisplay);
```

qwen-code 采用相同模式。这是虚拟化实际跳过重新渲染的必要条件。

## 7. PR 序列

| PR        | 标题（草稿）                                                                | 范围                                                                                                                                                                              | 行数              | 依赖         | 风险                                           |
| --------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------ | ---------------------------------------------- |
| **#4146** | feat(cli): ink 7 长对话虚拟视口                                             | 核心原语 + 带**自动隐藏动画**的 ASCII 滚动条 + SGR **鼠标滚轮** + `ui.useTerminalBuffer` 开关 + `MainContent`/`AppContainer` 接线 + 测试                                           | ~2800 行          | `main`       | ✅ **已发布** — 类型检查通过，vitest 全绿      |
| **V.3**   | test(integration): 流式传输/大小调整/shell 的捕获套件回归测试               | 从 PR #3663 移植 3 个捕获脚本                                                                                                                                                      | ~2000（仅测试）   | #4146        | 待处理                                         |
| **V.4**   | feat(cli): 滚动条拖拽 + 点击定位                                            | 滚动条列上的 SGR 鼠标命中测试。需要屏幕绝对坐标——要么将上游 `getBoundingBox` 引入 ink 7，要么自己实现 yoga walker。自动隐藏动画已在 #4146 中发布。                                 | ~400              | #4146        | 已推迟 — 坐标问题阻塞                          |
| **V.5**   | feat(cli): 应用内 `/` 搜索                                                  | 视口范围内的高亮 + n/N 导航（claude-code 的 `TranscriptSearchBar` 模式）                                                                                                           | ~300              | #4146        | 已推迟                                         |
| **V.6**   | feat(cli): 备用缓冲区模式（完整 alt-screen 接管）                           | 新增配置项 `ui.useAlternateBuffer`                                                                                                                                                 | ~500              | #4146        | 已推迟 — 需要单独的 UX 决策                    |
| **V.7**   | research: 保留宿主终端滚动历史（双写）                                      | `@jrichman/ink` 的 `overflowToBackbuffer` 仅存在于分叉中。选项：向 ink 7 提交上游 PR、自己实现双写或接受缺失。调研中。                                                             | —                 | #4146        | 结构上受限于原生 ink 7                         |

V.3（集成测试）是翻转默认值前剩余的关键路径项。V.4–V.6 填补了与 gemini-cli 的剩余功能差距；V.7 是开放性研究，因为我们需要的底层 ink prop（`overflowToBackbuffer`）仅存在于 gemini-cli 的 `@jrichman/ink` 分叉中。

## 8. 验证计划

每个 PR（"可审查"前的强制项）：

- `npm run typecheck --workspace=@qwen-code/qwen-code` — 通过
- `npm run lint --workspace=@qwen-code/qwen-code` — 通过
- `cd packages/cli && npx vitest run` — 全部绿色
- 按项目工作流进行多轮无方向审计

端到端（V.3 之后）：

- 长对话基准测试：1000 轮会话，测量
  - 首次渲染时间（初始挂载 + 绘制）
  - Ctrl+O 切换延迟
  - 大小调整延迟
  - 流式传输期间的每帧渲染时间
- 对比 `useTerminalBuffer: false`（旧版）与 `true`（虚拟化）

## 9. 待解决问题 / 需要决策

1. **配置项名称**：`ui.useTerminalBuffer`（与 gemini-cli 兼容）还是 `ui.virtualizedHistory`（更具描述性）？
2. **默认值**：以 `false` 发布（可选启用）还是先通过环境变量分阶段推出？
3. **静态条目启发式规则**：gemini-cli 只将 `header` 标记为静态。我们是否还应标记已完成的 Gemini 消息、不再在 `pendingHistoryItems` 中的工具结果等？
4. **鼠标支持**：gemini-cli 的 `ScrollProvider` 包含滚动条鼠标拖拽。现在移植还是跳过到 V.4？
5. **与 #3905 的兼容性**：~~PR #3905（Ctrl+O 冻结修复）还在开放中，修改了同一个 `MainContent.tsx`。协调合并顺序——V.2 很可能会在 #3905 之上 rebase。~~ **已解决**：#3905 的渐进式重放已落地到 `main`，并在 `MainContent.tsx` 的旧版 `<Static>` 分支中得到保留；VP 分支仅对可选启用用户取代了它，因为冻结触发条件（完整 Static 重挂载）不再适用。
6. **与 `chore/re-upgrade-ink-7-0-3` 的兼容性**：PR #4146 在其之上叠加。#4119（ink 7.0.3 重升级 PR）合并到 `main` 后，PR #4146 的基础将重新指向 `main`。

## 10. 风险

| 风险                                                               | 可能性 | 缓解措施                                                                                              |
| ------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------- |
| 每项 `useBoxMetrics` 在长列表上产生测量风暴                        | 中     | §6.2 的方案 A 已对每项做 memoize；只有渲染窗口内的条目承担成本。在 V.3 中基准测试。                   |
| 自定义 `StaticRender` 实现遗漏了 @jrichman 分叉处理的边缘情况     | 中     | 审计 gemini-cli 的 StaticRender 源码（如可获取）；否则依赖功能测试 + 基准测试。                       |
| `<Static>` 旧版路径随新路径演进而产生漂移                         | 低     | 功能标志控制两条路径都保持活跃；CI 通过配置矩阵同时运行两者。                                         |
| ink 7 上游仍有未填补的 bug                                         | 低     | 我们已通过 `chore/upgrade-ink-7` 使用 ink 7；本 PR 不引入额外的 ink 风险。                            |
| 长时间运行的会话在测量缓存中积累内存                               | 中     | 当 `heights` Record 大小超过 N×视口（如 5×）时添加 LRU 淘汰。V.3 基准测试这一点。                    |

## 11. 审批清单

- [x] 架构方向已确认 — 从 gemini-cli 移植（§4）
- [x] 配置项名称 + 默认值已确定 — `ui.useTerminalBuffer`，默认 `false`（可选启用）
- [x] 静态条目启发式规则 — `isStaticItem={(item) => item.id > 0}`（已完成的历史条目）
- [x] 鼠标支持范围 — 推迟到 V.4；#4146 中仅支持键盘滚动
- [x] 与 #3905 的合并顺序（§9.5）— #3905 已在 `main` 中；#4146 保留旧版渐进式重放路径，仅对 VP 用户取代它
- [x] PR #4146 实现完成
