# WebShell Sidebar — Руководство по кастомизации

`WebShellSidebar` — это панель списка сессий и навигации, отрисовываемая внутри
компонента `App` web-shell. Этот документ сопоставляет каждую визуальную область
с её текущей возможностью кастомизации и указывает области без внешней точки внедрения.

## Включение sidebar

Sidebar **отключён по умолчанию**. Передайте проп `sidebar` для включения:

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://localhost:4170"
  sidebar={true} // simple enable
  // or with fine-grained options:
  // sidebar={{ enabled: true, defaultCollapsed: false, ... }}
/>;
```

## Обзор структуры

```
┌─────────────────────────────────────┐
│ ① Branding (topRow)                 │  ✅ customizable
├─────────────────────────────────────┤
│ ② Primary navigation                │  ✅ customizable
│    [＋ New task]  [🧩 Plugins]      │
│    [📅 Scheduled] [🎯 Goals]        │
│    [custom render...]               │
├─────────────────────────────────────┤
│ ③ Project header                    │  ✅ show/hide
│    📁 Projects ▼ [🔍] [＋]          │
│    Session list entries...          │
│    📦 Archived sessions             │
├─────────────────────────────────────┤
│ ④ Footer action bar                 │  ✅ customizable
│    [⚙ Settings] v0.19 [☀] [▦] [◧] │
├─────────────────────────────────────┤
│ ⑤ Resize handle                     │  ❌ not customizable
└─────────────────────────────────────┘
```

## Настраиваемые области

### ① Branding — `branding`

```ts
interface WebShellSidebarBranding {
  render?: () => ReactNode; // replace the entire branding row
  hideWhenCompact?: boolean; // hide when sidebar is collapsed (default: true)
}
```

| Значение                         | Эффект                                          |
| -------------------------------- | ----------------------------------------------- |
| `undefined` (по умолчанию)       | Логотип Qwen + текст "Qwen Code"                |
| `false`                          | Строка брендинга полностью скрыта               |
| `{ render: () => <MyHeader /> }` | Полная замена на пользовательский контент       |
| `{ hideWhenCompact: false }`     | Показывать брендинг в свёрнутом режиме icon-rail |

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

### ② Primary Navigation — `primaryNav`

```ts
type WebShellSidebarPrimaryNavItem =
  | 'newTask' // ✏️ New Task button
  | 'plugins' // 🧩 Plugins button
  | 'scheduledTasks' // 📅 Scheduled Tasks button
  | 'goals'; // 🎯 Goals button

interface WebShellSidebarPrimaryNavOptions {
  items?: readonly WebShellSidebarPrimaryNavItem[]; // which built-in buttons to show (default: all)
  render?: () => ReactNode; // additional custom content after built-in buttons
}
```

Область основной навигации содержит встроенные кнопки, управляемые через `items`:

- Все кнопки показываются по умолчанию, если `items` не задан
- Показываются только перечисленные кнопки, если `items` задан
- Пользовательский контент можно добавить через `render()` после встроенных кнопок

| Значение                                   | Эффект                                   |
| ------------------------------------------ | ---------------------------------------- |
| `undefined` (по умолчанию)                 | Все встроенные кнопки показаны           |
| `{ items: ['plugins'] }`                   | Только кнопка Plugins                    |
| `{ items: ['plugins', 'scheduledTasks'] }` | Plugins + Scheduled Tasks                |
| `{ items: [], render: () => ... }`         | Скрыть все встроенные, только свой контент |

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

### ④ Footer — `footer`

```ts
type WebShellSidebarFooterItem =
  | 'settings' // ⚙ Settings panel
  | 'version' // version label (e.g. "v0.19.10")
  | 'theme' // ☀/🌙 light/dark toggle
  | 'sessionsOverview' // ▦ session overview panel (large screens only)
  | 'splitView' // ◧ split view (large screens only)
  | 'daemonStatus' // 📊 daemon status panel
  | 'collapse'; // ◁/▷ collapse/expand toggle

interface WebShellSidebarFooterOptions {
  items?: readonly WebShellSidebarFooterItem[]; // which built-in items to show (default: all)
  render?: () => ReactNode; // custom content rendered on the left side, before built-in items
}
```

| Значение                                       | Эффект                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `undefined` (по умолчанию)                     | Все элементы показаны                                                                      |
| `false`                                        | Footer скрыт; мобильный drawer сохраняет только кнопку закрытия                            |
| `{ items: ['settings', 'theme', 'collapse'] }` | Показаны только указанные элементы; мобильный drawer всегда сохраняет кнопку закрытия      |

Footer автоматически адаптируется к узкой ширине: подписи скрываются, а версия
убирается ниже определённых порогов.

```tsx
sidebar={{
  footer: { items: ['theme', 'collapse'] },  // minimal footer
}}
```

Пользовательский контент через `render()` отображается в левой части footer,
перед встроенными элементами:

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

**Примечание:** `'scheduledTasks'` и `'goals'` перенесены в область основной
навигации (②) и показываются по умолчанию. Они управляются через `primaryNav.items`, а не
через `footer.items`.

### Другие параметры верхнего уровня

```ts
interface WebShellSidebarOptions {
  enabled?: boolean; // show/hide sidebar (default: true when passed)
  defaultCollapsed?: boolean; // initial collapsed state (persisted in localStorage)
  showCompactToggle?: boolean; // show the collapse button in the chat area (default: true)
  showSessionSourceSwitch?: boolean; // show the Tasks/Channels switch (default: true)
  branding?: false | WebShellSidebarBranding;
  primaryNav?: WebShellSidebarPrimaryNavOptions;
  hideProjectHeader?: boolean; // hide "Projects" header row (default: false = shown)
  sessionActions?: WebShellSidebarSessionActionsOptions;
  footer?: false | WebShellSidebarFooterOptions;
}
```

### Переключатель источника сессий — `showSessionSourceSwitch`

Установите `showSessionSourceSwitch` в `false`, если встроенный хост должен показывать только
обычные сессии задач:

```tsx
sidebar={{
  showSessionSourceSwitch: false,
}}
```

Это удаляет переключатель Tasks/Channels и фиксирует все запросы активных, архивных, первичных
и вторичных сессий на `sourceType: "default"`. Если опция не указана, текущий переключатель
и доступ к сессиям каналов остаются без изменений.

### ③ Project Header — `hideProjectHeader`

Управляет видимостью строки заголовка "Projects" (строка с кнопкой сворачивания,
иконкой поиска и кнопкой добавления рабочего пространства). По умолчанию `false` (показывается).

```tsx
sidebar={{
  hideProjectHeader: true,  // hide the "项目 ▼ [🔍] [＋]" row
}}
```

При скрытии записи списка сессий и архивные сессии продолжают отображаться —
удаляется строка заголовка с кнопками действий и панель поиска сессий.

### Действия над строками сессий — `sessionActions`

```ts
type WebShellSidebarSessionActionItem =
  | 'details' // 📝 Details (dropdown sub-menu)
  | 'rename' // ✏️ Rename (dropdown menu)
  | 'group' // 📁 Group/Move to folder (dropdown menu)
  | 'export' // 📤 Export chat history (dropdown menu)
  | 'delete' // 🗑 Delete session (dropdown menu)
  | 'pin' // 📌 Pin/Unpin (inline button)
  | 'archive'; // 📦 Archive (inline button)

/** Subset with working inline (hover-button) handlers. */
type WebShellSidebarSessionInlineActionItem =
  | 'pin'
  | 'archive'
  | 'rename'
  | 'export'
  | 'delete';

interface WebShellSidebarSessionActionsOptions {
  items?: readonly WebShellSidebarSessionActionItem[]; // which actions to show (default: all)
  inlineItems?: readonly WebShellSidebarSessionInlineActionItem[]; // which items appear as inline buttons (default: ['pin', 'archive'])
}
```

Управляет тем, какие кнопки действий отображаются в строках сессий:

- **`items`**: Главный переключатель всех действий (и inline, и dropdown). Если элемента нет в `items`, он скрыт везде.
- **`inlineItems`**: Управляет тем, какие элементы отображаются как **inline-кнопки** (при наведении). По умолчанию `['pin', 'archive']`. Можно использовать только элементы с работающими inline-обработчиками: `'pin'`, `'archive'`, `'rename'`, `'export'`, `'delete'`. `'details'` и `'group'` доступны только через dropdown.

**Приоритет видимости**: И `items`, И встроенное условие элемента, И `inlineItems` должны все сработать, чтобы inline-кнопка отобразилась. Например, `delete` как inline требует, чтобы `'delete'` был и в `items`, и в `inlineItems`.

| Значение                                 | Эффект                                      |
| ---------------------------------------- | ------------------------------------------- |
| `undefined` (по умолчанию)               | Все действия показаны, pin + archive как inline |
| `{ inlineItems: ['pin', 'delete'] }`     | Pin + delete как inline-кнопки              |
| `{ inlineItems: [] }`                    | Никаких inline-кнопок                       |
| `{ inlineItems: ['archive', 'export'] }` | Archive + export как inline-кнопки          |

Триггер dropdown (⋮) автоматически скрывается, когда ни один dropdown-элемент
не включён. Inline-кнопки (`pin`, `archive`) показываются только когда и их
условие capability, и `items` их включают.

```tsx
sidebar={{
  sessionActions: {
    items: ['details', 'rename', 'export', 'delete', 'pin'],  // which actions to show (master control)
    inlineItems: ['pin', 'delete'],  // pin + delete as inline buttons
  },
}}
```

## Области без кастомизации

### Projects / Workspaces (внутри списка сессий)

Когда список сессий виден, следующие подобласти отрисовываются, но
**не настраиваются индивидуально**:

| Аспект                | Детали                                                            |
| --------------------- | ----------------------------------------------------------------- |
| Источник данных       | Хук `useSessions()` → daemon API (эндпоинт `/sessions`)           |
| Сортировка списка сессий | По времени создания, по убыванию                               |
| Отрисовка строки сессии | Внутренний `renderSessionRow` `useCallback` — не инъектируется  |
| Поиск / фильтрация    | Встроенная панель поиска с клиентским текстовым сопоставлением    |
| Группы сессий         | Компонент `SessionGroupSection` с 6 предустановленными цветами + custom hex |
| Секции рабочих пространств | `WorkspaceSection` для каждого daemon рабочего пространства, не заменяема |
| Диалог добавления рабочего пространства | Встроенный `AddWorkspaceDialog`                 |

### ⑤ Resize handle

- Ручка перетаскивания на правом краю для изменения ширины sidebar
- Ширина сохраняется в localStorage
- Не настраивается

## Пропы поведения в runtime

Эти `WebShellProps` влияют на поведение sidebar косвенно:

| Проп                            | Эффект                                 |
| ------------------------------- | -------------------------------------- |
| `onNewSession`                  | Переопределить обработчик новой сессии |
| `onLoadSession`                 | Переопределить логику загрузки сессии  |
| `onSessionIdChange`             | Реагировать на переключение сессий     |
| `splitSessionIds`               | Управлять сессиями split-view внешне   |
| `theme` / `onThemeChange`       | Управлять / отслеживать тему           |
| `language` / `onLanguageChange` | Управлять / отслеживать язык UI        |

## Свёрнутое и мобильное состояния

| Состояние  | Поведение                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| Expanded   | Полный sidebar с текстовыми подписями                                                                  |
| Collapsed  | Режим icon-rail (только логотип, иконка пера, иконки действий)                                         |
| Mobile     | Drawer занимает 70% контейнера, в пределах ограничений ширины, с backdrop и кнопкой закрытия в footer  |

Состояние сворачивания сохраняется в `localStorage` под ключом
`qwen-code-web-shell-sidebar-collapsed`.

Изменённая ширина sidebar на десктопе восстанавливается только в развёрнутом макете. Открытие или закрытие мобильного drawer не перезаписывает эту ширину или сохранённое предпочтение сворачивания на десктопе.

## Расположения исходников

| Компонент           | Файл                                                                      |
| ------------------- | ------------------------------------------------------------------------- |
| WebShellSidebar     | `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`        |
| SessionGroupSection | `packages/web-shell/client/components/sidebar/SessionGroupSection.tsx`    |
| WorkspaceSection    | `packages/web-shell/client/components/sidebar/WorkspaceSection.tsx`       |
| Sidebar styles      | `packages/web-shell/client/components/sidebar/WebShellSidebar.module.css` |
| App integration     | `packages/web-shell/client/App.tsx` (search `WebShellSidebar`)            |
| Entry point (dev)   | `packages/web-shell/client/main.tsx` (`sidebar: true`)                    |
