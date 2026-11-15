# WebShell 侧边栏 — 自定义指南

`WebShellSidebar` 是在 web-shell `App` 组件中渲染的会话列表和导航面板。本文档将每个可视区域映射到其当前的自定义能力，并标识没有外部注入点的区域。

## 启用侧边栏

侧边栏默认为**仅 Home**：一个 300px 的会话列，底部带有折叠控件。省略 `sidebar`、传递 `true` 或传递 `{}` 均使用此默认值。传递 `sidebar={false}` 或 `{ enabled: false }` 以隐藏它。

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://localhost:4170"
  sidebar={true} // Home-only default
  // or with fine-grained options:
  // sidebar={{ enabled: true, defaultCollapsed: false, ... }}
/>;
```

## 布局概览

仅 Home 的宿主在一个列中显示品牌区、New session、workspaces、已归档会话和折叠控件。配置另一个可用的主入口或底部操作会在默认的 300px 次级列旁添加一个 56px 的图标栏。主入口位于图标栏中；底部操作和版本位于"更多"中。自定义渲染器仍保留在宽大的 Home 列中。没有公开的布局选项。

**破坏性变更：** 此前省略 `sidebar` 会隐藏侧边栏，并且在启用侧边栏时省略导航/底部项列表会暴露所有内置项。宿主现在必须传递 `sidebar={false}` 以保留以前的隐藏默认值，或显式列出所需的条目。独立 Web Shell 显式配置其完整菜单。`branding.hideWhenCompact` 现在默认为 `false`；将其设置为 `true` 以在紧凑抽屉中保留隐藏的品牌区。

## 可自定义区域

### ① 品牌区 — `branding`

```ts
interface WebShellSidebarBranding {
  render?: () => ReactNode; // replace the entire branding row
  hideWhenCompact?: boolean; // hide branding in the compact drawer (default: false)
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
  | 'newTask' // ✏️ New session button
  | 'plugins' // 🧩 Plugins button
  | 'channels' // Channel sessions and settings
  | 'live' // Live sessions and settings; requires showLive
  | 'workflows' // Requires workflow support
  | 'managed' // Requires a managed-agent provider
  | 'scheduledTasks' // 📅 Scheduled Tasks button
  | 'goals'; // 🎯 Goals button

interface WebShellSidebarPrimaryNavOptions {
  items?: readonly WebShellSidebarPrimaryNavItem[]; // which built-in buttons to show (default: ['newTask'])
  render?: () => ReactNode; // additional custom content after built-in buttons
}
```

主导航区域包含由 `items` 控制的内置按钮：

- 未指定 `items` 时仅显示 New session；Home 始终存在
- 提供 `items` 时仅显示列出的按钮
- 可通过 `render()` 在内置按钮之后添加自定义内容

| 值                                      | 效果                                                |
| ------------------------------------------ | ----------------------------------------------------- |
| `undefined`（默认）                      | Home 和 New session                                 |
| `{ items: ['plugins'] }`                   | Home 和 Plugins；无 New session 按钮               |
| `{ items: ['plugins', 'scheduledTasks'] }` | Home + Plugins + Scheduled Tasks                      |
| `{ items: [], render: () => ... }`         | Home 和自定义内容；无内置主导航按钮 |

```tsx
sidebar={{
  primaryNav: {
    items: ['plugins', 'scheduledTasks'],  // hide newTask and goals
    render: () => (
      <button onClick={() => console.log('custom action')}>
        🔗 Data Sync
      </button>
    ),
  },
}}
```

### ④ 底部栏 — `footer`

```ts
type WebShellSidebarFooterItem =
  | 'settings' // ⚙ Settings panel
  | 'update' // Update action when supported
  | 'localFiles' // Local-files bridge when available
  | 'desktopRelay' // Use this computer through the existing desktop relay
  | 'workspacesOverview' // Workspace management when unlocked
  | 'version' // version label (e.g. "v0.19.10")
  | 'theme' // ☀/🌙 light/dark toggle
  | 'sessionsOverview' // ▦ session overview panel
  | 'splitView' // ◧ split view (shell containers at least 1024px wide)
  | 'daemonStatus' // 📊 daemon status panel
  | 'collapse'; // ◁/▷ collapse/expand toggle

interface WebShellSidebarFooterOptions {
  items?: readonly WebShellSidebarFooterItem[]; // which built-in items to show (default: ['collapse'])
  render?: () => ReactNode; // custom content in the Home footer
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
  footer: { items: ['theme', 'collapse'] },  // minimal footer
}}
```

通过 `render()` 添加的自定义内容出现在宽大的 Home 底部栏中：

```tsx
sidebar={{
  footer: {
    items: ['collapse'],
    render: () => (
      <button onClick={() => openHelpCenter()}>
        ❓ Help
      </button>
    ),
  },
}}
```

**注意：** `'scheduledTasks'` 和 `'goals'` 已移至主导航区域（②），需要在嵌入宿主中显式配置。它们由 `primaryNav.items` 控制，而非 `footer.items`。

### 其他顶级选项

```ts
interface WebShellSidebarOptions {
  enabled?: boolean; // show/hide sidebar (default: true, including when sidebar is omitted)
  defaultCollapsed?: boolean; // initial collapsed state (persisted in localStorage)
  showCompactToggle?: boolean; // show the collapse button in the chat area (default: true)
  showSessionSourceSwitch?: boolean; // show the Tasks/Channels switch (default: true)
  showLive?: boolean; // show daemon-owned Live conversations (default: false)
  branding?: false | WebShellSidebarBranding;
  primaryNav?: WebShellSidebarPrimaryNavOptions;
  hideProjectHeader?: boolean; // hide "Workspaces" header row (default: false = shown)
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

### ③ Workspace Header — `hideProjectHeader`

控制 "Workspaces" 头部行的可见性（包含折叠切换、搜索图标和添加 workspace 按钮的那一行）。默认为 `false`（显示）。

```tsx
sidebar={{
  hideProjectHeader: true,  // hide the "工作区 ▼ [🔍] [＋]" row
}}
```

隐藏后，会话列表条目和已归档会话仍然显示——带有操作按钮的头部行和会话搜索栏会被移除。

### 会话行操作 — `sessionActions`

```ts
type WebShellSidebarSessionActionItem =
  | 'details' // 📝 Details (dropdown sub-menu)
  | 'rename' // ✏️ Rename (dropdown menu)
  | 'bindPr' // 🔗 Bind a GitHub PR (dropdown menu)
  | 'group' // 📁 Group/Move to folder (dropdown menu)
  | 'export' // 📤 Export chat history (dropdown menu)
  | 'delete' // 🗑 Delete session (dropdown menu)
  | 'pin' // 📌 Pin/Unpin (inline button)
  | 'archive' // 📦 Archive (dropdown menu)
  | 'split'; // ◫ Add to Split View (dropdown menu)

/** Subset with working inline (hover-button) handlers. */
type WebShellSidebarSessionInlineActionItem =
  | 'pin'
  | 'rename'
  | 'export'
  | 'delete';

interface WebShellSidebarSessionActionsOptions {
  items?: readonly WebShellSidebarSessionActionItem[]; // which actions to show (default: all)
  inlineItems?: readonly WebShellSidebarSessionInlineActionItem[]; // which items appear as inline buttons (default: ['pin'])
}
```

控制会话行上显示哪些操作按钮：

- **`items`**：所有操作的主控（包括内联和下拉）。如果某项不在 `items` 中，则在各处隐藏。
- **`inlineItems`**：控制哪些项作为**内联按钮**（hover 时）显示。默认为 `['pin']`。只有具有可用内联处理程序的项才能使用：`'pin'`、`'rename'`、`'export'`、`'delete'`。`'details'`、`'bindPr'`、`'group'`、`'archive'` 和 `'split'` 在标准行上仅支持下拉。
- **`bindPr` 内置条件**：仅当会话支持元数据变更时显示——主 workspace 或已锁定 workspace 中的当前会话，或任何其他具有 `workspace_session_metadata` 能力的会话（如果该会话位于已锁定或受限的次级 workspace 中，还需 `workspace_qualified_rest_core`）——并且该行不是独立会话（包括最近会话行）——独立元数据路由仅接受显示名称。它独立于 `rename` 项：宿主可以在不包含 `rename` 的情况下白名单 `bindPr`。

设置中的已归档行使用 Export conversation 和 Restore 作为内联按钮，Rename 和 Delete 在 More 中。它们的操作仍遵循 `items` 和内置可用性限制；`inlineItems` 不会改变此布局。现有样式在 hover 或键盘焦点时显示这些按钮，并在触摸设备上保持可见。

**标准行上的可见性优先级**：`items` AND 该项的内置条件 AND `inlineItems` 三者都必须通过，内联按钮才会显示。例如，`delete` 作为内联按钮需要 `items` 包含 `'delete'` AND `inlineItems` 包含 `'delete'`。

| 值                                       | 效果                                       |
| ---------------------------------------- | ------------------------------------------ |
| `undefined`（默认）                      | 显示所有操作，仅 pin 作为内联按钮           |
| `{ inlineItems: ['pin', 'delete'] }`     | Pin + delete 作为内联按钮                  |
| `{ inlineItems: [] }`                    | 标准行上无内联按钮                         |
| `{ inlineItems: ['rename', 'export'] }` | Rename + export 作为内联按钮 |

当没有启用下拉项时，下拉触发器（⋮）会自动隐藏。内联按钮仅在其能力条件和 `items` 都包含它们时才会显示。Archive 在当前会话以及任何正在运行轮次的会话上会被禁用，因为 daemon 在归档时会关闭实时会话。

`'split'` 与其他项一样默认启用，但仅在宿主连接了 `onAddSessionToSplitView` 时生效。侧边栏还会读取其 `splitSessionIds` prop 来判断容量：已在分屏中打开的会话会将该项渲染为禁用状态并附带说明性标题，面板数量达到上限时以及分屏关闭时的当前会话也是如此。

```tsx
sidebar={{
  sessionActions: {
    items: ['details', 'rename', 'export', 'delete', 'pin'],  // which actions to show (master control)
    inlineItems: ['pin', 'delete'],  // pin + delete as inline buttons
  },
}}
```

## 不可自定义区域

### Workspaces（会话列表内部）

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
