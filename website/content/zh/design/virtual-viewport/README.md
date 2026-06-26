# 适用于长对话的 ink 7 虚拟视口

状态：**已实现**，PR #4146 包含：
核心视口、带自动隐藏动画的 ASCII 滚动条、SGR 鼠标滚轮、`ui.useTerminalBuffer` 开关、键盘滚动键。
滚动条拖拽 / 应用内搜索 / 备用缓冲区模式 / 双写入宿主回滚缓冲区推迟到 V.3 及以上（参见 §7）。
作者：秦奇
追踪分支：`feat/virtual-viewport-on-ink7`（基础分支：`main`）

## 1. 问题

多个用户报告的闪烁 / 延迟问题最终都归结到同一架构事实：ink 的 `<Static>` 是**只追加**的，而 qwen-code 的 `MainContent.tsx` 在每次渲染时都将完整的 `mergedHistory` 传入其中。对于一个 1000 轮对话，这意味着每次状态变更都会触发 1000 个 `HistoryItemDisplay` React 渲染 + ink 布局传递。

当前由此引发的症状：

| 问题             | 症状                                               | 当前的贡献因素                                             |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| #2950           | 长会话中持续上下滚屏风暴                           | 每次刷新时完整 Static 重新挂载                                |
| #3118           | 切回窗口时持续闪烁                                 | `clearTerminal` + `historyRemountKey++` 触发完整重新挂载      |
| #3007           | 通用界面闪烁                                       | 与 #3118 相同                                                |
| #3838（UI 侧）  | 滚动条无限增长                                     | 每次累积增量渲染增加行数；没有视口淘汰                        |
| #3899 → #3905   | Ctrl+O 冻结终端数秒                                | 部分修复的案例，通过 `setImmediate` 分块锁定                  |

PR #3905 明确指出：

> 讨论了替代方案（固定前缀 + 活动尾部、**真正的视口虚拟化**、ANSI 输出缓存），但每种方案都会改变 UX 或需要架构重写。

本文档提出的正是这种架构重写。

## 2. 参考实现

调研了两个已经解决（或绕过）相同问题的开源基于 ink 的 CLI：

### 2.1 claude-code (`/Users/gawain/Documents/codebase/opensource/claude-code`)

在 `src/ink/` 中维护自己的**分支 ink**：

- `ink.tsx` —— 1722 行自定义主循环
- `log-update.ts` —— 773 行自定义差异渲染器，带有滚动区域（`DECSTBM`）优化，当会触及回滚缓冲区时使用全帧回退
- `screen.ts` / `frame.ts` —— 显式的 Screen / Frame 对象，`cellAt` / `diffEach` 单元格级别差异比较
- `render-to-screen.ts` —— 公开 `renderToScreen(node)`，可离线将任意节点树渲染到 `Screen` 对象。这是“一次渲染、缓存、回放”的基础能力——即虚拟化
- `screens/REPL.tsx`：
  - `visibleStreamingText = streamingText.substring(0, streamingText.lastIndexOf('\n') + 1) || null` —— 仅暴露完整行给渲染器
  - 带有 `scrollRef`、`cursorNavRef` 的 `ScrollBox`
  - `Markdown.tsx` 的 `StreamingMarkdown` 在最后一个顶级块边界处拆分内容，记忆化稳定前缀，仅重新解析不稳定后缀
- `Markdown.tsx` 的令牌缓存（LRU-500）—— 在卸载→重新挂载时存活，因此虚拟滚动的重新挂载命中缓存而无需重新词法分析

**我们不复制此方法的原因**：完全分支 ink 的维护不可持续（仅 `ink.tsx` 就有 1722 行，加上自定义协调器）。每个上游 ink 修复都必须手动合并。这种成本对于 claude-code 的规模是合理的；对于 qwen-code 则不适用。

### 2.2 gemini-cli (`/Users/gawain/Documents/codebase/opensource/gemini-cli`)

使用 `@jrichman/ink@6.6.9`（一个较小的分支，增加了 `ResizeObserver` 和 `StaticRender` 导出），并以**纯组件形式提供完整的虚拟化列表**：

| 文件                                         | 行数 | 角色                                                                   |
| --------------------------------------- | --- | ---------------------------------------------------------------------- |
| `components/shared/VirtualizedList.tsx` | 764 | 核心视口 + 测量 + 滚动锚点 + 每项大小变化跟踪                          |
| `components/shared/ScrollableList.tsx`  | 278 | 封装 `VirtualizedList`，添加按键导航 + 平滑滚动 + 滚动条              |
| `contexts/ScrollProvider.tsx`           | 469 | 鼠标拖拽、滚动锁定、焦点上下文                                         |
| `hooks/useBatchedScroll.ts`             | 35  | 合并同一 Tick 内的滚动更新                                             |
| `hooks/useAnimatedScrollbar.ts`         | 130 | 滚动条淡入/淡出动画                                                    |

`MainContent.tsx` 通过 `isAlternateBufferOrTerminalBuffer` 标志在两种渲染路径间切换：

```tsx
if (isAlternateBufferOrTerminalBuffer) {
  return <ScrollableList data={virtualizedData} renderItem={renderItem} ... />;
}

return <Static items={[<AppHeader />, ...staticHistoryItems, ...lastResponseHistoryItems]}>...</Static>;
```

`HistoryItemDisplay` 被 `React.memo` 包裹，因此未变化的项不会重新渲染。

**这是生产级参考。**

## 3. ink 7 能力检查

qwen-code 处于正在进行的 `chore/upgrade-ink-7` 分支上。检查了 `node_modules/ink/build/index.d.ts` 的导出：

- ✅ `useBoxMetrics(ref): {width, height, left, top, hasMeasured}` —— 在布局变化时自动更新。**功能等价于 `ResizeObserver`。**
- ✅ `measureElement(node)` —— 一次性命令式测量
- ✅ `useWindowSize` —— 终端尺寸变化
- ✅ `useAnimation` —— 用于滚动条淡出
- ✅ `Static`, `Box`, `Text` 等
- ❌ `ResizeObserver`（组件/类） —— 需要适配
- ❌ `StaticRender` —— 需要自定义实现

**结论**：ink 7 拥有所有必需的原语。无需交换分支。

## 4. 战略决策

**将 gemini-cli 的 `ScrollableList` + `VirtualizedList` + 辅助 hooks/contexts 移植到 qwen-code，将 `ResizeObserver` 适配为 `useBoxMetrics`，并自行实现 `StaticRender`。**

已拒绝的替代方案：

| 替代方案                           | 拒绝理由                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 像 claude-code 一样分支 ink         | 维护负担不可持续                                                                                                |
| 切换到 `@jrichman/ink`             | 逆转正在进行的 ink 7 升级；丢失 ink 7 的 React 19.2 + 协调器 0.33 + 新差异渲染器改进                              |
| 从头构建虚拟化                     | 重新发明约 1700 行已验证的设计；gemini-cli 的参考已经存在且可用                                                     |

## 5. 架构

### PR #4146 后的文件映射

```
packages/cli/src/ui/
├── components/shared/
│   ├── VirtualizedList.tsx          [新建] 核心视口 + ASCII 滚动条
│   ├── ScrollableList.tsx           [新建] 键盘 + 鼠标滚轮封装
│   └── StaticRender.tsx             [新建] React.memo 封装（替代 gemini-cli 的 ink 分支导出）
├── hooks/
│   ├── useBatchedScroll.ts          [新建] 合并同一 Tick 的滚动更新
│   ├── useMouseEvents.ts            [新建] 启用 SGR 鼠标模式 + 解析标准输入事件
│   └── useAnimatedScrollbar.ts      [新建] 滚动时拇指块闪烁 + 空闲自动隐藏
├── utils/
│   └── mouse.ts                     [新建] SGR + X11 鼠标事件解析器（从 gemini-cli 移植）
├── components/MainContent.tsx       [修改] 添加虚拟化分支 + 稳定性引用
└── AppContainer.tsx                 [修改] 将滚动相关 UI 状态注入上下文 + 控制 refreshStatic
```

推迟到后续 PR：

- **滚动条拖拽 + 点击定位** —— 需要屏幕绝对元素坐标，受限于原生 ink 7 的限制（参见 V.4 / V.7）。
- **应用内 `/` 搜索** —— claude-code 的 `TranscriptSearchBar` 模式（V.5）。
- **备用缓冲区模式** —— `contexts/ScrollProvider.tsx` 风格的焦点 / 锁定，配合完整备屏接管（V.6）。

### 设置（V.2）

```ts
// settings schema
ui: {
  /**
   * 启用虚拟化历史渲染以支持长对话。
   * 为 true 时，仅可见视口中的项通过 React 渲染；
   * 滚动出的项保留在终端回滚缓冲区中。
   *
   * 默认值：false。在长对话中验证稳定性之前为 opt-in。
   */
  useTerminalBuffer?: boolean;  // 别名保持与 gemini-cli 兼容
}
```

`MainContent.tsx` 读取设置并切换路径：

```tsx
const useTerminalBuffer = uiState.settings?.ui?.useTerminalBuffer ?? false;

if (useTerminalBuffer) {
  return <ScrollableList .../>; // 虚拟化
}

return <Static .../>; // 现有路径，保持不变
```

原有的 `<Static>` 路径保持不变 —— 未选择加入的用户不会有回归风险。

## 6. 从 gemini-cli 源码的关键适配

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

我们的适配（声明式 ink 7 钩子）：

```ts
const containerRef = useRef<DOMElement>(null);
const { width: containerWidth, height: containerHeight } =
  useBoxMetrics(containerRef);
```

`useBoxMetrics` 已处理附加/分离及布局变化订阅；命令式簿记消失。

### 6.2 每项大小变化跟踪器（`itemsObserver`）

更难。gemini-cli 通过单个 `ResizeObserver` 观察 N 个项节点，并通过 `WeakMap` 将条目路由到键：

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

`useBoxMetrics` 是**每个钩子单个引用**，因此无法 1:1 替换。两个选项：

**选项 A — 将测量下推到 `VirtualizedListItem`**

每个 `VirtualizedListItem` 已经作为自己的组件运行（已记忆化）。在其内部添加 `useBoxMetrics`；通过回调属性向上报告高度：

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

**选项 B — 在父组件中使用 `measureElement` + `useLayoutEffect`**

父组件存储可见项的引用，在每次渲染后运行布局效果进行测量。反应性较低但更简单：

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

**推荐：选项 A。** 职责分离更清晰，利用 ink 7 内置的变化检测。避免了“测量风暴”风险——即每次渲染都测量所有内容。

### 6.3 `StaticRender` — 自定义实现

gemini-cli 从 `@jrichman/ink` 导入 `StaticRender`。查看 `VirtualizedList.tsx` 中的使用方式：

```tsx
{shouldBeStatic ? (
  <StaticRender width={...} key={`${itemKey}-static-${width}`}>
    {content}
  </StaticRender>
) : (
  content
)}
```

语义：在给定宽度下渲染 `content` 一次；后续具有相同键 + 宽度的渲染返回缓存的结果。

对于 ink 7，等价做法是使用 `React.memo` 包裹一个稳定组件，并保证父组件不会重新渲染它。自定义实现：

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

结合父组件的稳定 `key` 属性（`${itemKey}-static-${width}`），改变子元素或宽度会导致新的挂载；否则 React 跳过重新渲染。

这是核心能力：那些是**静态**的项（例如已完成的 Gemini 消息）会被测量 + 渲染一次，并且永远不会再通过 React 重新遍历。

### 6.4 记忆化 `HistoryItemDisplay`

gemini-cli 的做法：

```ts
const MemoizedHistoryItemDisplay = memo(HistoryItemDisplay);
```

qwen-code 中采用相同模式。虚拟化要真正跳过重新渲染，必须这么做。

## 7. PR 序列

| PR        | 标题（草稿）                                                               | 范围                                                                                                                                                                              | 代码行数         | 依赖关系     | 风险                                           |
| --------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------ | ---------------------------------------------- |
| **#4146** | feat(cli): 基于 ink 7 的长对话虚拟视口                                     | 核心原语 + 带**自动隐藏动画**的 ASCII 滚动条 + SGR **鼠标滚轮** + `ui.useTerminalBuffer` 开关 + `MainContent`/`AppContainer` 集成 + 测试                   | ~2800 行         | `main`       | ✅ **已发布** — 类型检查通过，vitest 绿色      |
| **V.3**   | test(integration): 针对流式/调整大小/shell 的捕获套件回归测试               | 从 PR #3663 移植 3 个捕获脚本                                                                                                                                                      | ~2000（仅测试） | #4146        | 待完成                                        |
| **V.4**   | feat(cli): 滚动条拖拽 + 点击定位                                           | 滚动条列上的 SGR 鼠标命中测试。需要屏幕绝对坐标 —— 要么向上游 ink 7 提交 `getBoundingBox`，要么自己实现 yoga 遍历。自动隐藏动画已在 #4146 中发布。 | ~400              | #4146        | 已推迟 — 坐标阻塞                             |
| **V.5**   | feat(cli): 应用内 `/` 搜索                                                 | 视口内高亮 + n/N 导航（claude-code 的 `TranscriptSearchBar` 模式）                                                                                                                 | ~300              | #4146        | 已推迟                                       |
| **V.6**   | feat(cli): 备用缓冲区模式（完整备屏接管）                                   | 额外设置 `ui.useAlternateBuffer`                                                                                                                                                   | ~500              | #4146        | 已推迟 — 需要单独的 UX 决策                  |
| **V.7**   | research: 保留宿主终端回滚缓冲区（双写入）                                   | `@jrichman/ink` 的 `overflowToBackbuffer` 仅存在于分支中。选项：向上游 ink 7 提交 PR，自己实现双写入，或接受损失。调研中。                 | —                 | #4146        | 结构上受限于原生 ink 7                        |

V.3（集成测试）是更默认值前的剩余关键路径项。V.4–V.6 填补与 gemini-cli 功能对等的剩余差距；V.7 是开放研究，因为我们需要的底层 ink 属性（`overflowToBackbuffer`）只存在于 gemini-cli 的 `@jrichman/ink` 分支中。

## 8. 验证计划

每个 PR 必须满足（在标记“准备审查”之前）：

- `npm run typecheck --workspace=@qwen-code/qwen-code` —— 干净
- `npm run lint --workspace=@qwen-code/qwen-code` —— 干净
- `cd packages/cli && npx vitest run` —— 全部绿色
- 根据项目工作流进行多轮无方向审计

端到端（V.3 之后）：

- 长对话基准测试：1000 轮会话，测量
  - 首次绘制时间（初始挂载 + 绘制）
  - Ctrl+O 切换延迟
  - 调整大小延迟
  - 流式渲染期间的每帧渲染时间
- 比较 `useTerminalBuffer: false`（旧版）与 `true`（虚拟化）

## 9. 待定问题 / 需要决策

1. **设置名称**：`ui.useTerminalBuffer`（gemini-cli 兼容）还是 `ui.virtualizedHistory`（更具描述性）？
2. **默认值**：发布为 `false`（选择加入），还是先通过环境变量分阶段推出？
3. **静态项启发式**：gemini-cli 仅将 `header` 标记为静态。我们是否也应标记已完成的 Gemini 消息、不再在 `pendingHistoryItems` 中的工具结果等？
4. **鼠标支持**：gemini-cli 的 `ScrollProvider` 包含用于滚动条的鼠标拖拽。现在移植还是等到 V.4？
5. **与 #3905 的兼容性**：~~PR #3905（Ctrl+O 冻结修复）是开放的，并修改了同一 `MainContent.tsx`。协调合并顺序——V.2 很可能在 #3905 之上变基。~~ **已解决**：#3905 的渐进式重放已进入 `main`，并在 `MainContent.tsx` 的旧版 `<Static>` 分支中保留；VP 分支为 opt-in 用户取代了它，因为冻结触发器（完整的 Static 重新挂载）不再适用。
6. **与 `chore/re-upgrade-ink-7-0-3` 的兼容性**：PR #4146 在此基础上堆叠。#4119（ink 7.0.3 重新升级 PR）合并到 `main` 后，PR #4146 的基础将重新定位到 `main`。

## 10. 风险

| 风险                                                                      | 可能性 | 缓解措施                                                                                              |
| ------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| 每项使用 `useBoxMetrics` 会在长列表上产生测量风暴                          | 中等     | §6.2 中的选项 A 已经对每项记忆化；只有渲染窗口中的项承担成本。在 V.3 中进行基准测试。 |
| 自定义 `StaticRender` 实现可能遗漏 @jrichman 分支处理的边界情况            | 中等     | 如果可用，审计 gemini-cli 的 StaticRender 源码；否则依赖功能测试 + 基准测试。            |
| 随着新路径演化，`<Static>` 旧版路径发生漂移                               | 低       | 功能标志开关保持两条路径活跃；CI 通过设置矩阵运行两者。                             |
| ink 7 仍存在上游未修复的错误                                               | 低       | 我们已通过 `chore/upgrade-ink-7` 使用 ink 7；此 PR 未引入额外的 ink 风险。        |
| 长时间运行会话在测量缓存中累积内存                                          | 中等     | 在 `heights` 记录超过 N×视口（例如 5×）时添加 LRU 淘汰。V.3 进行基准测试。             |
## 11. 审批清单

- [x] 架构方向已批准 — 从 gemini-cli 迁移（§4）
- [x] 设置名称 + 默认值已确定 — `ui.useTerminalBuffer`，默认 `false`（opt-in）
- [x] 静态项启发式 — `isStaticItem={(item) => item.id > 0}`（已完成的历史项）
- [x] 鼠标支持范围 — 推迟到 V.4；#4146 中仅键盘滚动
- [x] 与 #3905 合并顺序（§9.5）— #3905 已在 `main` 分支中；#4146 保留旧的渐进式回放路径，并仅在 VP 用户中取代它
- [x] PR #4146 实现完成