# WebShell 侧边栏 — 自定义指南

`WebShellSidebar` 是在 web-shell `App` 组件中渲染的会话列表和导航面板。本文档将每个可视区域映射到其当前的自定义能力，并标识没有外部注入点的区域。

## 启用侧边栏

侧边栏默认为**仅 Home**：一个 300px 的会话列，底部带有折叠控件。省略 `sidebar`、传递 `true` 或传递 `{}` 均使用此默认值。传递 `sidebar={false}` 或 `{ enabled: false }` 以隐藏它。

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://localhost:4170"
  sidebar={true} // Home-only 默认
  // 或使用细粒度选项：
  // sidebar={{ enabled: true, defaultCollapsed: false, ... }}
/>;
```

## 布局概览

仅 Home 的宿主在一个列中显示品牌区、新任务、项目、已归档会话和折叠控件。配置另一个可用的主入口或底部操作会在默认的 300px 次级列旁添加一个 56px 的图标栏。主入口位于图标栏中；底部操作和版本位于"更多"中。自定义渲染器仍保留在宽大的 Home 列中。没有公开的布局选项。

**破坏性变更：** 此前省略 `sidebar` 会隐藏侧边栏，并且在启用侧边栏时省略导航/底部项列表会暴露所有内置项。宿主现在必须传递 `sidebar={false}` 以保留以前的隐藏默认值，或显式列出所需的条目。独立 Web Shell 显式配置其完整菜单。`branding.hideWhenCompact` 现在默认为 `false`；将其设置为 `true` 以在紧凑抽屉中保留隐藏的品牌区。

## 可自定义区域

### ① 品牌区 — `branding`

```ts
interface WebShellSidebarBranding {
  render?: () => ReactNode; // 替换整个品牌行
  hideWhenCompact?: boolean; // 在紧凑抽屉中隐藏品牌区（默认：false）
}
```

| 值                                 | 效果                                              |
| ---------------------------------- | ------------------------------------------------- |
| `undefined`（默认）                | 已解析品牌：`brand` prop → daemon `GET /brand` → 内置 Qwen logo + "Qwen Code" 文本 |
| `false`                            | 完全隐藏品牌行                                    |
| `{ render: () => <MyHeader /> }`   | 使用自定义内容完全替换                            |
| `{ hideWhenCompact: false }`     | 在紧凑抽屉中保持品牌区可见（默认）                                  |

默认行是数据驱动的，而非固定不变：提供 `ui.brand` 配置的 daemon 会替换文本和标识，嵌入宿主可以通过 shell 组件的 `brand` prop 覆盖两者（`onBrandResolved` 会向宿主自身的 chrome 报告解析结果）。`branding.render` 仍然是最高优先级的覆盖——它优先于 prop 和 daemon 解析的值，与之前完全一致。

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
  | 'channels' // Channel 会话和设置
  | 'live' // Live 会话和设置；需要 showLive
  | 'workflows' // 需要 workflow 支持
  | 'managed' // 需要托管代理提供者
  | 'scheduledTasks' // 📅 定时任务按钮
  | 'goals'; // 🎯 目标按钮

interface WebShellSidebarPrimaryNavOptions {
  items?: readonly WebShellSidebarPrimaryNavItem[]; // 显示哪些内置按钮（默认：['newTask']）
  render?: () => ReactNode; // 内置按钮之后的额外自定义内容
}
```

主导航区域包含由 `items` 控制的内置按钮：

- 未指定 `items` 时仅显示新任务；Home 始终存在
- 提供 `items` 时仅显示列出的按钮
- 可通过 `render()` 在内置按钮之后添加自定义内容

| 值                                      | 效果                                                |
| ------------------------------------------ | ----------------------------------------------------- |
| `undefined`（默认）                      | Home 和新任务                                    |
| `{ items: ['plugins'] }`                   | Home 和插件；无新任务按钮                  |
| `{ items: ['plugins', 'scheduledTasks'] }` | Home + 插件 + 定时任务                      |
| `{ items: [], render: () => ... }`         | Home 和自定义内容；无内置主导航按钮 |

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
  | 'update' // 受支持时的更新操作
  | 'localFiles' // 可用时的本地文件桥接
  | 'desktopRelay' // 通过现有桌面 relay 使用此电脑
  | 'workspacesOverview' // 解锁时的 workspace 管理
  | 'version' // 版本标签（例如 "v0.19.10"）
  | 'theme' // ☀/🌙 亮色/暗色切换
  | 'sessionsOverview' // ▦ 会话概览面板
  | 'splitView' // ◧ 分屏视图（shell 容器至少 1024px 宽）
  | 'daemonStatus' // 📊 daemon 状态面板
  | 'collapse'; // ◁/▷ 折叠/展开切换

interface WebShellSidebarFooterOptions {
  items?: readonly WebShellSidebarFooterItem[]; // 显示哪些内置项（默认：['collapse']）
  render?: () => ReactNode; // Home 底部栏中的自定义内容
}
```

| 值                                          | 效果                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| `undefined`（默认）                          | 仅折叠/展开                                                      |
| `false`                                        | 底部栏隐藏；移动端抽屉仅保留关闭控件             |
| `{ items: ['settings', 'theme', 'collapse'] }` | 仅显示列出的项；移动端抽屉始终保留关闭控件 |

在图标栏布局中，底部操作和版本出现在"更多"中；仅折叠/展开控件保留在图标栏底部。仅 Home 模式保留现有的紧凑底部栏行为。

```tsx
sidebar={{
  footer: { items: ['theme', 'collapse'] },  // 极简底部栏
}}
```

通过 `render()` 添加的自定义内容出现在宽大的 Home 底部栏中：

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

**注意：** `'scheduledTasks'` 和 `'goals'` 已移至主导航区域（②），需要在嵌入宿主中显式配置。它们由 `primaryNav.items` 控制，而非 `footer.items`。

### 其他顶级选项

```ts
interface WebShellSidebarOptions {
  enabled?: boolean; // 显示/隐藏侧边栏（默认：true，包括省略 sidebar 时）
  defaultCollapsed?: boolean; // 初始折叠状态（持久化到 localStorage）
  showCompactToggle?: boolean; // 在聊天区域显示折叠按钮（默认：true）
  showSessionSourceSwitch?: boolean; // 显示 Tasks/Channels 切换（默认：true）
  showLive?: boolean; // 显示 daemon 拥有的 Live 会话（默认：false）
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

这会移除 Tasks/Channels 切换，并将所有活跃、已归档、主会话和次级会话查询固定为 `sourceType: "default"`。省略该选项则保留 channel-session 访问。当有专用的 Channels 图标栏入口时，它会替换来源标签页；否则标签页保留。

### Live 会话 — `showLive`

Live 会话默认对嵌入宿主隐藏。当宿主需要暴露 daemon 拥有的 Live 分组时，选择启用：

之前的版本在没有显式选项的情况下显示此分组，因此依赖它的宿主在升级时必须设置 `showLive: true`。

```tsx
sidebar={{
  showLive: true,
  primaryNav: { items: ['newTask', 'live'] },
}}
```

没有 `live` 主入口时，`showLive: true` 会在 Home 和"实验性"设置下保留现有的 Live 分组和设置。有该入口时，Live 会打开自己的会话列和设置页。

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

当没有启用下拉项时，下拉触发器（⋮）会自动隐藏。内联按钮仅在其能力条件和 `items` 都包含它们时才会显示。Archive 在当前会话以及任何正在运行轮次的会话上会被禁用，因为 daemon 在归档时会关闭实时会话。

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
- 宽度持久化到 localStorage 中，作为侧边栏总宽度。默认值为 300px（仅 Home）和 356px（有图标栏时）。恢复的宽度被限制为至少 220px（仅 Home）或 276px（有图标栏时）；旧值不会盲目增加 56px。拖拽到折叠阈值以下仍会折叠侧边栏。
- 环境面板的 dock 断点忽略图标栏的 56px（消息区域会让出这些空间），因此面板保持在仅 Home 侧边栏相同的窗口宽度处 dock——例如 1440px 的窗口。
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
| 展开  | 带有文本标签的完整侧边栏                                                                                        |
| 折叠 | 仅 Home：现有的 56px 条带和 hover 会话；有图标栏时：仅 56px 主图标栏                             |
| 移动端  | 抽屉使用其容器的 70%，在宽度限制内，带有背景遮罩和所属列底部的关闭控件 |

折叠状态持久化在 `localStorage` 中，键名为 `qwen-code-web-shell-sidebar-collapsed`。

侧边栏、其紧凑抽屉和空聊天欢迎界面遵循 shell 容器宽度（760px 时紧凑）；聊天消息内容保留基于视口的断点。分屏可用性使用 1024px，分屏侧边栏空间使用 1200px。键盘折叠会将焦点从隐藏的次级列移到图标栏控件。

调整后的桌面端宽度仅在展开布局中恢复。打开或关闭移动端抽屉不会覆盖该宽度或持久化的桌面端折叠偏好。

## 源码位置

| 组件               | 文件                                                                        |
| ------------------ | --------------------------------------------------------------------------- |
| WebShellSidebar     | `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`        |
| SessionGroupSection | `packages/web-shell/client/components/sidebar/SessionGroupSection.tsx`    |
| WorkspaceSection    | `packages/web-shell/client/components/sidebar/WorkspaceSection.tsx`       |
| Sidebar styles      | `packages/web-shell/client/components/sidebar/WebShellSidebar.module.css` |
| App integration     | `packages/web-shell/client/App.tsx`（搜索 `WebShellSidebar`）             |
| Entry point (dev)   | `packages/web-shell/client/main.tsx`（显式的主导航和底部项列表） |
