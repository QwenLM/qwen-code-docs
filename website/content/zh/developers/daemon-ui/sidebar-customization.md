# WebShell 侧边栏 — 自定义指南

`WebShellSidebar` 是在 web-shell `App` 组件中渲染的会话列表和导航面板。本文档将每个可视区域映射到其当前的自定义能力，并标识没有外部注入点的区域。

## 启用侧边栏

侧边栏**默认禁用**。传递 `sidebar` prop 以启用：

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://localhost:4170"
  sidebar={true} // 简单启用
  // 或使用细粒度选项：
  // sidebar={{ enabled: true, defaultCollapsed: false, ... }}
/>;
```

## 布局概览

```
┌─────────────────────────────────────┐
│ ① 品牌区（topRow）                   │  ✅ 可自定义
├─────────────────────────────────────┤
│ ② 主导航                             │  ✅ 可自定义
│    [＋ 新任务]  [🧩 插件]            │
│    [📅 定时任务] [🎯 目标]           │
│    [自定义渲染...]                    │
├─────────────────────────────────────┤
│ ③ 项目头部                           │  ✅ 显示/隐藏
│    📁 项目 ▼ [🔍] [＋]              │
│    会话列表条目...                    │
│    📦 已归档会话                      │
├─────────────────────────────────────┤
│ ④ 底部操作栏                         │  ✅ 可自定义
│    [⚙ 设置] v0.19 [☀] [▦] [◧]      │
├─────────────────────────────────────┤
│ ⑤ 拖拽手柄                           │  ❌ 不可自定义
└─────────────────────────────────────┘
```

## 可自定义区域

### ① 品牌区 — `branding`

```ts
interface WebShellSidebarBranding {
  render?: () => ReactNode; // 替换整个品牌行
  hideWhenCompact?: boolean; // 侧边栏折叠时隐藏（默认：true）
}
```

| 值                                 | 效果                                              |
| ---------------------------------- | ------------------------------------------------- |
| `undefined`（默认）                | Qwen logo + "Qwen Code" 文本                      |
| `false`                            | 完全隐藏品牌行                                    |
| `{ render: () => <MyHeader /> }`   | 使用自定义内容完全替换                            |
| `{ hideWhenCompact: false }`       | 在折叠的图标栏模式下保持品牌区可见                |

```tsx
sidebar={{
  branding: {
    render: () => (
      <div style={{ display: 'flex', gap: 8 }}>
        <img src="/my-logo.svg" alt="" width={24} />
        <span>My App</span>
      </div>
    ),
  },
}}
```

### ② 主导航 — `primaryNav`

```ts
type WebShellSidebarPrimaryNavItem =
  | 'newTask' // ✏️ 新任务按钮
  | 'plugins' // 🧩 插件按钮
  | 'scheduledTasks' // 📅 定时任务按钮
  | 'goals'; // 🎯 目标按钮

interface WebShellSidebarPrimaryNavOptions {
  items?: readonly WebShellSidebarPrimaryNavItem[]; // 显示哪些内置按钮（默认：全部）
  render?: () => ReactNode; // 内置按钮之后的额外自定义内容
}
```

主导航区域包含由 `items` 控制的内置按钮：

- 未指定 `items` 时默认显示所有按钮
- 提供 `items` 时仅显示列出的按钮
- 可通过 `render()` 在内置按钮之后添加自定义内容

| 值                                         | 效果                                   |
| ------------------------------------------ | -------------------------------------- |
| `undefined`（默认）                        | 显示所有内置按钮                       |
| `{ items: ['plugins'] }`                   | 仅插件按钮                             |
| `{ items: ['plugins', 'scheduledTasks'] }` | 插件 + 定时任务                        |
| `{ items: [], render: () => ... }`         | 隐藏所有内置按钮，仅显示自定义内容     |

```tsx
sidebar={{
  primaryNav: {
    items: ['plugins', 'scheduledTasks'],  // 隐藏 newTask 和 goals
    render: () => (
      <button onClick={() => console.log('custom action')}>
        🔗 数据同步
      </button>
    ),
  },
}}
```

### ④ 底部栏 — `footer`

```ts
type WebShellSidebarFooterItem =
  | 'settings' // ⚙ 设置面板
  | 'version' // 版本标签（例如 "v0.19.10"）
  | 'theme' // ☀/🌙 亮色/暗色切换
  | 'sessionsOverview' // ▦ 会话概览面板
  | 'splitView' // ◧ 分屏视图（仅大屏幕）
  | 'daemonStatus' // 📊 daemon 状态面板
  | 'collapse'; // ◁/▷ 折叠/展开切换

interface WebShellSidebarFooterOptions {
  items?: readonly WebShellSidebarFooterItem[]; // 显示哪些内置项（默认：全部）
  render?: () => ReactNode; // 在左侧、内置项之前渲染的自定义内容
}
```

| 值                                             | 效果                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `undefined`（默认）                            | 显示所有项                                                               |
| `false`                                        | 完全隐藏底部栏；移动端抽屉仅保留关闭控件                                 |
| `{ items: ['settings', 'theme', 'collapse'] }` | 仅显示列出的项；移动端抽屉始终保留关闭控件                               |

底部栏会自动适应窄宽度：标签会被隐藏，版本信息在某些阈值以下会被移除。

```tsx
sidebar={{
  footer: { items: ['theme', 'collapse'] },  // 极简底部栏
}}
```

通过 `render()` 添加的自定义内容出现在底部栏的左侧，在内置项之前：

```tsx
sidebar={{
  footer: {
    items: ['collapse'],
    render: () => (
      <button onClick={() => openHelpCenter()}>
        ❓ 帮助
      </button>
    ),
  },
}}
```

**注意：** `'scheduledTasks'` 和 `'goals'` 已移至主导航区域（②），默认显示。它们由 `primaryNav.items` 控制，而非 `footer.items`。

### 其他顶级选项

```ts
interface WebShellSidebarOptions {
  enabled?: boolean; // 显示/隐藏侧边栏（传入时为 true）
  defaultCollapsed?: boolean; // 初始折叠状态（持久化到 localStorage）
  showCompactToggle?: boolean; // 在聊天区域显示折叠按钮（默认：true）
  showSessionSourceSwitch?: boolean; // 显示 Tasks/Channels 切换（默认：true）
  branding?: false | WebShellSidebarBranding;
  primaryNav?: WebShellSidebarPrimaryNavOptions;
  hideProjectHeader?: boolean; // 隐藏"项目"头部行（默认：false = 显示）
  sessionActions?: WebShellSidebarSessionActionsOptions;
  footer?: false | WebShellSidebarFooterOptions;
}
```

### Session source switch — `showSessionSourceSwitch`

当嵌入宿主只需显示普通任务会话时，将 `showSessionSourceSwitch` 设为 `false`：

```tsx
sidebar={{
  showSessionSourceSwitch: false,
}}
```

这会移除 Tasks/Channels 切换，并将所有活跃、已归档、主会话和次级会话查询固定为 `sourceType: "default"`。省略该选项则保持当前的切换和 channel-session 访问不变。

### ③ 项目头部 — `hideProjectHeader`

控制"项目"头部行的可见性（包含折叠切换、搜索图标和添加 workspace 按钮的那一行）。默认为 `false`（显示）。

```tsx
sidebar={{
  hideProjectHeader: true,  // 隐藏"项目 ▼ [🔍] [＋]"行
}}
```

隐藏后，会话列表条目和已归档会话仍然显示——带有操作按钮的头部行和会话搜索栏会被移除。

### 会话行操作 — `sessionActions`

```ts
type WebShellSidebarSessionActionItem =
  | 'details' // 📝 详情（下拉子菜单）
  | 'rename' // ✏️ 重命名（下拉菜单）
  | 'group' // 📁 分组/移动到文件夹（下拉菜单）
  | 'export' // 📤 导出聊天记录（下拉菜单）
  | 'delete' // 🗑 删除会话（下拉菜单）
  | 'pin' // 📌 置顶/取消置顶（内联按钮）
  | 'archive'; // 📦 归档（下拉菜单）

/** Subset with working inline (hover-button) handlers. */
type WebShellSidebarSessionInlineActionItem =
  | 'pin'
  | 'rename'
  | 'export'
  | 'delete';

interface WebShellSidebarSessionActionsOptions {
  items?: readonly WebShellSidebarSessionActionItem[]; // 显示哪些操作（默认：全部）
  inlineItems?: readonly WebShellSidebarSessionInlineActionItem[]; // 哪些项作为内联按钮显示（默认：['pin']）
}
```

控制会话行上显示哪些操作按钮：

- **`items`**：所有操作的主控（包括内联和下拉）。如果某项不在 `items` 中，则在各处隐藏。
- **`inlineItems`**：控制哪些项作为**内联按钮**（hover 时）显示。默认为 `['pin']`。只有具有可用内联处理程序的项才能使用：`'pin'`、`'rename'`、`'export'`、`'delete'`。`'details'`、`'group'` 和 `'archive'` 仅支持下拉。

**可见性优先级**：`items` AND 该项的内置条件 AND `inlineItems` 三者都必须通过，内联按钮才会显示。例如，`delete` 作为内联按钮需要 `items` 包含 `'delete'` AND `inlineItems` 包含 `'delete'`。

| 值                                       | 效果                                       |
| ---------------------------------------- | ------------------------------------------ |
| `undefined`（默认）                      | 显示所有操作，仅 pin 作为内联按钮           |
| `{ inlineItems: ['pin', 'delete'] }`     | Pin + delete 作为内联按钮                  |
| `{ inlineItems: [] }`                    | 完全没有内联按钮                           |
| `{ inlineItems: ['rename', 'export'] }` | Rename + export 作为内联按钮 |

当没有启用下拉项时，下拉触发器（⋮）会自动隐藏。内联按钮仅在其能力条件和 `items` 都包含它们时才会显示。Archive 在当前会话以及任何正在运行实时轮次的会话上会被禁用，因为 daemon 在归档时会关闭实时会话。

```tsx
sidebar={{
  sessionActions: {
    items: ['details', 'rename', 'export', 'delete', 'pin'],  // 显示哪些操作（主控）
    inlineItems: ['pin', 'delete'],  // pin + delete 作为内联按钮
  },
}}
```

## 不可自定义区域

### 项目 / Workspaces（会话列表内部）

当会话列表可见时，以下子区域会被渲染但**不可单独自定义**：

| 方面               | 详情                                                              |
| ------------------ | ----------------------------------------------------------------- |
| 数据来源           | `useSessions()` hook → daemon API（`/sessions` 端点）             |
| 会话列表排序       | 按创建时间降序                                                    |
| 会话行渲染         | 内部 `renderSessionRow` `useCallback` — 不可注入                  |
| 搜索 / 过滤        | 内置搜索栏，客户端文本匹配                                        |
| 会话分组           | `SessionGroupSection` 组件，6 种预设颜色 + 自定义 hex             |
| Workspace 分区     | 每个 daemon workspace 一个 `WorkspaceSection`，不可替换           |
| 添加 workspace 对话框 | 内置 `AddWorkspaceDialog`                                      |

### ⑤ 拖拽手柄

- 右侧边缘的拖拽手柄，用于调整侧边栏宽度
- 宽度持久化到 localStorage
- 不可配置

## 运行时行为 props

这些 `WebShellProps` 间接影响侧边栏行为：

| Prop                              | 效果                               |
| --------------------------------- | ---------------------------------- |
| `onNewSession`                    | 覆盖新建会话处理程序               |
| `onLoadSession`                   | 覆盖会话加载逻辑                   |
| `onSessionIdChange`               | 响应会话切换                       |
| `splitSessionIds`                 | 从外部控制分屏会话                 |
| `theme` / `onThemeChange`         | 控制 / 观察主题                    |
| `language` / `onLanguageChange`   | 控制 / 观察 UI 语言                |

## 折叠和移动端状态

| 状态     | 行为                                               |
| -------- | -------------------------------------------------- |
| 展开     | 带有文本标签的完整侧边栏                           |
| 折叠     | 图标栏模式（仅 logo、笔图标、操作图标）            |
| 移动端   | 抽屉使用其容器的 70% 宽度，在宽度限制内，带有背景遮罩和底部栏关闭控件 |

折叠状态持久化在 `localStorage` 中，键名为 `qwen-code-web-shell-sidebar-collapsed`。

调整后的桌面端宽度仅在展开布局中恢复。打开或关闭移动端抽屉不会覆盖该宽度或持久化的桌面端折叠偏好。

## 源码位置

| 组件               | 文件                                                                        |
| ------------------ | --------------------------------------------------------------------------- |
| WebShellSidebar     | `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`        |
| SessionGroupSection | `packages/web-shell/client/components/sidebar/SessionGroupSection.tsx`    |
| WorkspaceSection    | `packages/web-shell/client/components/sidebar/WorkspaceSection.tsx`       |
| Sidebar styles      | `packages/web-shell/client/components/sidebar/WebShellSidebar.module.css` |
| App integration     | `packages/web-shell/client/App.tsx`（搜索 `WebShellSidebar`）             |
| Entry point (dev)   | `packages/web-shell/client/main.tsx`（`sidebar: true`）                   |
