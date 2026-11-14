# WebShell Sidebar — Руководство по кастомизации

`WebShellSidebar` — это панель списка сессий и навигации, отрисовываемая внутри
компонента `App` web-shell. Этот документ сопоставляет каждую визуальную область
с её текущей возможностью кастомизации и указывает области без внешней точки внедрения.

## Включение sidebar

Sidebar по умолчанию показывает только **Home**: колонку сессий шириной 300px с кнопкой сворачивания внизу. Если `sidebar` не указан, передан `true` или передан `{}`, используется это значение по умолчанию. Передайте `sidebar={false}` или `{ enabled: false }`, чтобы скрыть sidebar.

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://localhost:4170"
  sidebar={true} // Home-only default
  // or with fine-grained options:
  // sidebar={{ enabled: true, defaultCollapsed: false, ... }}
/>;
```

## Обзор структуры

Home-only хосты показывают брендинг, New session, рабочие пространства, архивные сессии и кнопку сворачивания в одной колонке. Настройка другого доступного первичного элемента или действия footer добавляет икончатую панель шириной 56px рядом с обычной вторичной колонкой 300px. Первичные элементы находятся в панели; действия footer и версия находятся в More. Пользовательские рендереры остаются в широкой колонке Home. Публичной опции макета нет.

**Критическое изменение:** ранее отсутствующий `sidebar` скрывал sidebar, а отсутствующие списки элементов навигации/footer показывали все встроенные элементы при включённом sidebar. Теперь хосты должны передавать `sidebar={false}`, чтобы сохранить прежнее скрытое поведение по умолчанию, или явно перечислить нужные элементы. Standalone Web Shell явно настраивает своё полное меню. `branding.hideWhenCompact` теперь по умолчанию `false`; установите `true`, чтобы сохранить скрытый бренд в компактном drawer.

## Настраиваемые области

### ① Branding — `branding`

```ts
interface WebShellSidebarBranding {
  render?: () => ReactNode; // replace the entire branding row
  hideWhenCompact?: boolean; // hide branding in the compact drawer (default: false)
}
```

| Значение                         | Эффект                                          |
| -------------------------------- | ----------------------------------------------- |
| `undefined` (по умолчанию)       | Разрешённый бренд: проп `brand` → daemon `GET /brand` → встроенный логотип Qwen + текст "Qwen Code" |
| `false`                          | Строка брендинга полностью скрыта               |
| `{ render: () => <MyHeader /> }` | Полная замена на пользовательский контент       |
| `{ hideWhenCompact: false }`     | Оставить брендинг видимым в компактном drawer (по умолчанию)                                  |

Строка по умолчанию управляется данными, а не жёстко зашита: демон, отдающий конфигурацию `ui.brand`, переименовывает текст и заменяет логотип, а встраивающий хост может переопределить и то, и другое через проп `brand` shell-компонента (`onBrandResolved` сообщает результат для собственного chrome хоста). `branding.render` остаётся переопределением с наивысшим приоритетом — оно побеждает и проп, и значение, разрешённое демоном, как и раньше.

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

Область основной навигации содержит встроенные кнопки, управляемые через `items`:

- Только New session показывается, когда `items` не указан; Home существует всегда
- Только перечисленные кнопки показываются, когда `items` указан
- Пользовательский контент можно добавить через `render()` после встроенных кнопок

| Значение                                   | Эффект                                                |
| ------------------------------------------ | ----------------------------------------------------- |
| `undefined` (по умолчанию)                 | Home с New session                                    |
| `{ items: ['plugins'] }`                   | Home и Plugins; без кнопки New session                |
| `{ items: ['plugins', 'scheduledTasks'] }` | Home + Plugins + Scheduled Tasks                      |
| `{ items: [], render: () => ... }`         | Home с пользовательским контентом; без встроенных первичных кнопок |

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

| Значение                                       | Эффект                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| `undefined` (по умолчанию)                     | Только collapse/expand                                                    |
| `false`                                        | Footer скрыт; мобильный drawer сохраняет только кнопку закрытия           |
| `{ items: ['settings', 'theme', 'collapse'] }` | Показаны только указанные элементы; мобильный drawer всегда сохраняет кнопку закрытия |

В макете с панелью действия footer и версия появляются в More; только кнопка collapse/expand остаётся внизу панели. Режим Home-only сохраняет существующее поведение компактного footer.

```tsx
sidebar={{
  footer: { items: ['theme', 'collapse'] },  // minimal footer
}}
```

Пользовательский контент через `render()` появляется в широком footer Home:

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
навигации (②) и требуют явной настройки во встраиваемых хостах. Они управляются через `primaryNav.items`, а не
через `footer.items`.

### Другие параметры верхнего уровня

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

### Переключатель источника сессий — `showSessionSourceSwitch`

Установите `showSessionSourceSwitch` в `false`, если встроенный хост должен показывать только
обычные сессии задач:

```tsx
sidebar={{
  showSessionSourceSwitch: false,
}}
```

Это удаляет переключатель Tasks/Channels и фиксирует все запросы активных, архивных, первичных
и вторичных сессий на `sourceType: "default"`. Если опция не указана, сохраняется доступ к сессиям каналов. Когда доступен специальный элемент панели Channels, он заменяет вкладки источника; иначе вкладки остаются.

### Live conversations — `showLive`

Live conversations скрыты от встроенных хостов по умолчанию. Включите явно, если
хост должен предоставлять группу Live, принадлежащую демону:

Предыдущие версии отображали эту группу без явной опции, поэтому хосты,
которые зависят от неё, должны установить `showLive: true` при обновлении.

```tsx
sidebar={{
  showLive: true,
  primaryNav: { items: ['newTask', 'live'] },
}}
```

Без первичного элемента `live`, `showLive: true` сохраняет существующую группу Live в Home и настройки в Experimental. С этим элементом Live открывает собственную колонку сессий и страницу настроек.

### ③ Workspace Header — `hideProjectHeader`

Управляет видимостью строки заголовка "Workspaces" (строка с кнопкой сворачивания,
иконкой поиска и кнопкой добавления рабочего пространства). По умолчанию `false` (показывается).

```tsx
sidebar={{
  hideProjectHeader: true,  // hide the "工作区 ▼ [🔍] [＋]" row
}}
```

При скрытии записи списка сессий и архивные сессии продолжают отображаться —
удаляется строка заголовка с кнопками действий и панель поиска сессий.

### Действия над строками сессий — `sessionActions`

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

Управляет тем, какие кнопки действий отображаются в строках сессий:

- **`items`**: Главный переключатель всех действий (и inline, и dropdown). Если элемента нет в `items`, он скрыт везде.
- **`inlineItems`**: Управляет тем, какие элементы отображаются как **inline-кнопки** (при наведении) на стандартных строках сессий. По умолчанию `['pin']`. Можно использовать только элементы с работающими inline-обработчиками: `'pin'`, `'rename'`, `'export'`, `'delete'`. `'details'`, `'bindPr'`, `'group'`, `'archive'` и `'split'` доступны только через dropdown на стандартных строках.
- **Встроенное условие `bindPr`**: показывается только когда сессия поддерживает мутацию метаданных — текущая сессия в первичном или заблокированном рабочем пространстве, или любая другая сессия с возможностью (capability) `workspace_session_metadata` (плюс `workspace_qualified_rest_core`, если эта сессия находится в заблокированном или ограниченном вторичном рабочем пространстве) — и строка не является отдельной сессией (включая строки недавних) — отдельные маршруты метаданных принимают только отображаемое имя. Это не зависит от элемента `rename`: хост может разрешить `bindPr` без `rename`.

Архивные строки в Settings используют Export conversation и Restore как inline-кнопки, а Rename и Delete в More. Их действия по-прежнему подчиняются `items` и встроенным ограничениям доступности; `inlineItems` не меняет этот макет. Существующие стили показывают эти кнопки при наведении или фокусе клавиатурой и держат их видимыми на сенсорных устройствах.

**Приоритет видимости на стандартных строках**: И `items`, И встроенное условие элемента, И `inlineItems` должны все сработать, чтобы inline-кнопка отобразилась. Например, `delete` как inline требует, чтобы `items` включал `'delete'` И `inlineItems` включал `'delete'`.

| Значение                                  | Эффект                             |
| --------------------------------------- | ---------------------------------- |
| `undefined` (по умолчанию)              | Все действия показаны, pin как inline   |
| `{ inlineItems: ['pin', 'delete'] }`    | Pin + delete как inline-кнопки     |
| `{ inlineItems: [] }`                   | Никаких inline-кнопок на стандартных строках |
| `{ inlineItems: ['rename', 'export'] }` | Rename + export как inline-кнопки  |

Триггер dropdown (⋮) автоматически скрывается, когда ни один dropdown-элемент
не включён. Inline-кнопки показываются только когда и их условие capability,
и `items` их включают. Archive отключён для текущей сессии и для
любой сессии с запущенным ходом, потому что демон закрывает живую
сессию при архивации.

`'split'` по умолчанию включён, как и другие элементы, но действует только
когда хост подключает `onAddSessionToSplitView`. Sidebar также читает свой
проп `splitSessionIds` для определения ёмкости: сессия, уже открытая в
split, показывает элемент отключённым с пояснительным заголовком, как и
случай с лимитом панелей и текущая сессия, пока split закрыт.

`'split'` по умолчанию включён, как и другие элементы, но действует только
когда хост подключает `onAddSessionToSplitView`. Sidebar также читает свой
проп `splitSessionIds` для определения ёмкости: сессия, уже открытая в
split, показывает элемент отключённым с пояснительным заголовком, как и
случай с лимитом панелей и текущая сессия, пока split закрыт.

```tsx
sidebar={{
  sessionActions: {
    items: ['details', 'rename', 'export', 'delete', 'pin'],  // какие действия показывать (главный переключатель)
    inlineItems: ['pin', 'delete'],  // pin + delete как inline-кнопки
  },
}}
```

## Области без кастомизации

### Workspaces (внутри списка сессий)

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
- Ширина сохраняется в localStorage как общая ширина sidebar. По умолчанию 300px для Home-only и 356px с панелью. Восстановленные ширины ограничиваются минимум 220px для Home-only или 276px с панелью; старые значения не увеличиваются слепо на 56px. Перетаскивание ниже порога сворачивания всё равно складывает sidebar.
- Breakpoint дока панели среды игнорирует 56px панели (область сообщений уступает их), поэтому панель продолжает доковаться на тех же ширинах окна, что и sidebar Home-only — например, окно 1440px.
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

| Состояние   | Поведение                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Expanded    | Полный sidebar с текстовыми подписями                                                                                |
| Collapsed   | Home-only: существующая полоса 56px и сессии при наведении; с панелью: только первичная панель 56px                  |
| Mobile      | Drawer использует 70% своего контейнера, в пределах ограничений ширины, с backdrop и кнопкой закрытия внизу owning колонки |

Состояние сворачивания сохраняется в `localStorage` под ключом
`qwen-code-web-shell-sidebar-collapsed`.

Sidebar, его компактный drawer и welcome-элементы пустого чата следуют ширине контейнера shell (компактный режим при 760px); содержимое сообщений чата сохраняет breakpoints на основе viewport. Доступность split использует 1024px, а место для split-sidebar — 1200px. Сворачивание клавиатурой перемещает фокус из скрытой вторичной колонки на элемент управления панели.

Изменённая ширина десктопа восстанавливается только в развёрнутых макетах. Открытие или
закрытие мобильного drawer не перезаписывает эту ширину или сохранённое
предпочтение сворачивания на десктопе.

## Расположения исходников

| Компонент           | Файл                                                                      |
| ------------------- | ------------------------------------------------------------------------- |
| WebShellSidebar     | `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`        |
| SessionGroupSection | `packages/web-shell/client/components/sidebar/SessionGroupSection.tsx`    |
| WorkspaceSection    | `packages/web-shell/client/components/sidebar/WorkspaceSection.tsx`       |
| Sidebar styles      | `packages/web-shell/client/components/sidebar/WebShellSidebar.module.css` |
| App integration     | `packages/web-shell/client/App.tsx` (search `WebShellSidebar`)            |
| Entry point (dev)   | `packages/web-shell/client/main.tsx` (явные списки первичных элементов и элементов footer) |
