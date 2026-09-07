# WebShell サイドバー — カスタマイズガイド

`WebShellSidebar` は、web-shell の `App` コンポーネント内で描画されるセッションリストおよびナビゲーションパネルです。本文書では、各視覚領域を現在のカスタマイズ機能に対応させ、外部注入ポイントを持たない領域を特定します。

## サイドバーの有効化

サイドバーは**デフォルトで無効**です。`sidebar` prop を渡して有効化します。

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://localhost:4170"
  sidebar={true} // simple enable
  // or with fine-grained options:
  // sidebar={{ enabled: true, defaultCollapsed: false, ... }}
/>;
```

## レイアウト概要

```
┌─────────────────────────────────────┐
│ ① ブランディング (topRow)            │  ✅ カスタマイズ可
├─────────────────────────────────────┤
│ ② プライマリナビゲーション            │  ✅ カスタマイズ可
│    [＋ New task]  [🧩 Plugins]      │
│    [📅 Scheduled] [🎯 Goals]        │
│    [custom render...]               │
├─────────────────────────────────────┤
│ ③ プロジェクトヘッダー               │  ✅ 表示/非表示
│    📁 Projects ▼ [🔍] [＋]          │
│    Session list entries...          │
│    📦 Archived sessions             │
├─────────────────────────────────────┤
│ ④ フッターアクションバー             │  ✅ カスタマイズ可
│    [⚙ Settings] v0.19 [☀] [▦] [◧] │
├─────────────────────────────────────┤
│ ⑤ リサイズハンドル                   │  ❌ カスタマイズ不可
└─────────────────────────────────────┘
```

## カスタマイズ可能な領域

### ① ブランディング — `branding`

```ts
interface WebShellSidebarBranding {
  render?: () => ReactNode; // replace the entire branding row
  hideWhenCompact?: boolean; // hide when sidebar is collapsed (default: true)
}
```

| 値                               | 効果                                                      |
| -------------------------------- | --------------------------------------------------------- |
| `undefined`（デフォルト）         | Qwen ロゴ + "Qwen Code" テキスト                          |
| `false`                          | ブランディング行全体を非表示                                |
| `{ render: () => <MyHeader /> }` | カスタムコンテンツで全面置換                                |
| `{ hideWhenCompact: false }`     | 折りたたみアイコンレールモードでもブランディングを表示      |

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

### ② プライマリナビゲーション — `primaryNav`

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

プライマリナビゲーション領域には、`items` で制御される組み込みボタンが含まれます。

- `items` を指定しない場合、すべてのボタンが表示される
- `items` を指定した場合、リストされたボタンのみ表示される
- カスタムコンテンツは `render()` で組み込みボタンの後に追加できる

| 値                                         | 効果                                       |
| ------------------------------------------ | ------------------------------------------ |
| `undefined`（デフォルト）                   | すべての組み込みボタンを表示                |
| `{ items: ['plugins'] }`                   | Plugins ボタンのみ                          |
| `{ items: ['plugins', 'scheduledTasks'] }` | Plugins + Scheduled Tasks                  |
| `{ items: [], render: () => ... }`         | 組み込みをすべて非表示、カスタムコンテンツのみ |

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

### ④ フッター — `footer`

```ts
type WebShellSidebarFooterItem =
  | 'settings' // ⚙ Settings panel
  | 'version' // version label (e.g. "v0.19.10")
  | 'theme' // ☀/🌙 light/dark toggle
  | 'sessionsOverview' // ▦ session overview panel
  | 'splitView' // ◧ split view (large screens only)
  | 'daemonStatus' // 📊 daemon status panel
  | 'collapse'; // ◁/▷ collapse/expand toggle

interface WebShellSidebarFooterOptions {
  items?: readonly WebShellSidebarFooterItem[]; // which built-in items to show (default: all)
  render?: () => ReactNode; // custom content rendered on the left side, before built-in items
}
```

| 値                                           | 効果                    |
| -------------------------------------------- | ----------------------- |
| `undefined`（デフォルト）                     | すべてのアイテムを表示   |
| `false`                                      | フッターは非表示。モバイルドロワーはクローズコントロールのみ保持     |
| `{ items: ['settings', 'theme', 'collapse'] }` | リストされたアイテムのみ表示。モバイルドロワーは常にクローズコントロールを保持 |

フッターは狭い幅に自動適応します。一定の閾値以下ではラベルが非表示になり、バージョン表示も削除されます。

```tsx
sidebar={{
  footer: { items: ['theme', 'collapse'] },  // minimal footer
}}
```

`render()` によるカスタムコンテンツは、フッターの左側、組み込みアイテムより前に表示されます。

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

**注:** `'scheduledTasks'` と `'goals'` はプライマリナビゲーション領域（②）に移動されており、デフォルトで表示されます。これらは `footer.items` ではなく `primaryNav.items` で制御されます。

### その他のトップレベルオプション

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

### セッションソーススイッチ — `showSessionSourceSwitch`

埋め込みホストで通常のタスクセッションのみを表示する場合は、`showSessionSourceSwitch` を `false` に設定します。

```tsx
sidebar={{
  showSessionSourceSwitch: false,
}}
```

これにより Tasks/Channels スイッチが削除され、アクティブ、アーカイブ、プライマリ、セカンダリのすべてのセッションクエリが `sourceType: "default"` に固定されます。このオプションを省略すると、現在のスイッチとチャネルセッションへのアクセスは変更されません。

### ③ プロジェクトヘッダー — `hideProjectHeader`

「Projects」ヘッダー行（折りたたみトグル、検索アイコン、ワークスペース追加ボタンを含む行）の表示/非表示を制御します。デフォルトは `false`（表示）です。

```tsx
sidebar={{
  hideProjectHeader: true,  // hide the "项目 ▼ [🔍] [＋]" row
}}
```

非表示にしても、セッションリストエントリとアーカイブされたセッションは引き続き表示されます。アクションボタンとセッション検索バーを含むヘッダー行のみが削除されます。

### セッション行アクション — `sessionActions`

```ts
type WebShellSidebarSessionActionItem =
  | 'details' // 📝 Details (dropdown sub-menu)
  | 'rename' // ✏️ Rename (dropdown menu)
  | 'group' // 📁 Group/Move to folder (dropdown menu)
  | 'export' // 📤 Export chat history (dropdown menu)
  | 'delete' // 🗑 Delete session (dropdown menu)
  | 'pin' // 📌 Pin/Unpin (inline button)
  | 'archive'; // 📦 Archive (dropdown menu)

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

セッション行に表示されるアクションボタンを制御します。

- **`items`**: すべてのアクション（インラインおよびドロップダウン）のマスター制御。`items` に含まれないアイテムは全域で非表示になります。
- **`inlineItems`**: **インラインボタン**（ホバー時）として表示されるアイテムを制御します。デフォルトは `['pin']` です。インラインハンドラーが動作するアイテムのみ使用可能です: `'pin'`、`'rename'`、`'export'`、`'delete'`。`'details'`、`'group'`、`'archive'` はドロップダウン専用です。

**表示優先度**: インラインボタンを表示するには、`items` とアイテムの組み込み条件と `inlineItems` のすべてを満たす必要があります。たとえば、`delete` をインラインで表示するには、`items` に `'delete'` が含まれ、かつ `inlineItems` に `'delete'` が含まれている必要があります。

| 値                                       | 効果                                         |
| ---------------------------------------- | -------------------------------------------- |
| `undefined`（デフォルト）                 | すべてのアクションを表示、pin のみインライン |
| `{ inlineItems: ['pin', 'delete'] }`     | Pin + delete をインラインボタンとして表示       |
| `{ inlineItems: [] }`                    | インラインボタンをすべて非表示                  |
| `{ inlineItems: ['rename', 'export'] }` | Rename + export をインラインボタンとして表示    |

ドロップダウンアイテムが有効になっていない場合、ドロップダウントリガー（⋮）は自動的に非表示になります。インラインボタンは、ケーパビリティ条件と `items` の両方を満たす場合にのみ表示されます。アーカイブは、現在のセッションおよび実行中のターンを持つセッションでは無効になります。デーモンはアーカイブ時にライブセッションをクローズするためです。

```tsx
sidebar={{
  sessionActions: {
    items: ['details', 'rename', 'export', 'delete', 'pin'],  // which actions to show (master control)
    inlineItems: ['pin', 'delete'],  // pin + delete as inline buttons
  },
}}
```

## カスタマイズ不可の領域

### プロジェクト / ワークスペース（セッションリスト内）

セッションリストが表示されている場合、以下のサブ領域は描画されますが**個別にカスタマイズはできません**。

| 側面                   | 詳細                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| データソース            | `useSessions()` フック → デーモン API（`/sessions` エンドポイント）        |
| セッションリストのソート  | 作成時刻の降順                                                            |
| セッション行の描画      | 内部の `renderSessionRow` `useCallback` — 注入不可                         |
| 検索 / フィルタ         | クライアントサイドのテキストマッチングによる組み込み検索バー                |
| セッショングループ       | `SessionGroupSection` コンポーネント（6 色のプリセット + カスタム hex）    |
| ワークスペースセクション | デーモンワークスペースごとの `WorkspaceSection`、置換不可                  |
| ワークスペース追加ダイアログ | 組み込みの `AddWorkspaceDialog`                                      |

### ⑤ リサイズハンドル

- 右端のドラッグハンドルでサイドバー幅をリサイズ
- 幅は localStorage に永続化される
- 設定不可

## ランタイム動作 prop

以下の `WebShellProps` はサイドバーの動作に間接的に影響します。

| Prop                            | 効果                                   |
| ------------------------------- | -------------------------------------- |
| `onNewSession`                  | 新規セッションハンドラーをオーバーライド   |
| `onLoadSession`                 | セッション読み込みロジックをオーバーライド |
| `onSessionIdChange`             | セッション切替に反応する                 |
| `splitSessionIds`               | スプリットビューセッションを外部から制御   |
| `theme` / `onThemeChange`       | テーマの制御 / 監視                     |
| `language` / `onLanguageChange` | UI 言語の制御 / 監視                    |

## 折りたたみ状態とモバイル状態

| 状態       | 動作                                                    |
| ---------- | ------------------------------------------------------- |
| 展開状態    | テキストラベル付きの完全なサイドバー                       |
| 折りたたみ  | アイコンレールモード（ロゴ、ペンアイコン、アクションアイコンのみ） |
| モバイル    | ドロワーはコンテナの 70% を使用（幅制限あり）。バックドロップとフッターのクローズコントロール付き |

折りたたみ状態は `qwen-code-web-shell-sidebar-collapsed` キーで `localStorage` に永続化されます。

リサイズされたデスクトップ幅は展開レイアウトでのみ復元されます。モバイルドロワーを開閉しても、その幅や永続化されたデスクトップの折りたたみ設定は上書きされません。

## ソースコードの場所

| コンポーネント       | ファイル                                                                    |
| -------------------- | --------------------------------------------------------------------------- |
| WebShellSidebar      | `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`          |
| SessionGroupSection  | `packages/web-shell/client/components/sidebar/SessionGroupSection.tsx`      |
| WorkspaceSection     | `packages/web-shell/client/components/sidebar/WorkspaceSection.tsx`         |
| Sidebar styles       | `packages/web-shell/client/components/sidebar/WebShellSidebar.module.css`   |
| App integration      | `packages/web-shell/client/App.tsx`（`WebShellSidebar` を検索）              |
| Entry point (dev)    | `packages/web-shell/client/main.tsx`（`sidebar: true`）                      |

