# WebShell サイドバー — カスタマイズガイド

`WebShellSidebar` は、web-shell の `App` コンポーネント内で描画されるセッションリストおよびナビゲーションパネルです。本文書では、各視覚領域を現在のカスタマイズ機能に対応させ、外部注入ポイントを持たない領域を特定します。

## サイドバーの有効化

サイドバーはデフォルトで**Homeのみ**です: 下部に折りたたみコントロール付きの300pxセッションカラムです。`sidebar` を省略するか、`true` または `{}` を渡すとこのデフォルトが使用されます。非表示にするには `sidebar={false}` または `{ enabled: false }` を渡します。

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://localhost:4170"
  sidebar={true} // Home-only default
  // or with fine-grained options:
  // sidebar={{ enabled: true, defaultCollapsed: false, ... }}
/>;
```

## レイアウト概要

Homeのみのホストでは、ブランディング、New task、プロジェクト、アーカイブされたセッション、折りたたみコントロールが1つのカラムに表示されます。利用可能な別のプライマリエントリまたはフッターアクションを設定すると、デフォルトの300pxセカンダリカラムの横に56pxのアイコンレールが追加されます。プライマリエントリはレールに配置され、フッターアクションとバージョンは More に表示されます。カスタムレンダラーは広いHomeカラムに残ります。公開のレイアウトオプションはありません。

**破壊的変更:** 以前は、`sidebar` を省略するとサイドバーが非表示になり、サイドバーが有効な状態でナビゲーション/フッターのアイテムリストを省略するとすべての組み込みアイテムが公開されていました。ホストは以前の非表示デフォルトを維持するために `sidebar={false}` を渡すか、必要なエントリを明示的にリストする必要があります。スタンドアロンWeb Shellはフルメニューを明示的に設定します。`branding.hideWhenCompact` のデフォルトは `false` になりました。コンパクトドロワーで非表示のブランドを維持するには `true` に設定します。

## カスタマイズ可能な領域

### ① ブランディング — `branding`

```ts
interface WebShellSidebarBranding {
  render?: () => ReactNode; // replace the entire branding row
  hideWhenCompact?: boolean; // hide branding in the compact drawer (default: false)
}
```

| 値                               | 効果                                                      |
| -------------------------------- | --------------------------------------------------------- |
| `undefined`（デフォルト）         | 解決されたブランド: `brand` prop → デーモン `GET /brand` → 組み込みの Qwen ロゴ + "Qwen Code" テキスト |
| `false`                          | ブランディング行全体を非表示                                |
| `{ render: () => <MyHeader /> }` | カスタムコンテンツで全面置換                                |
| `{ hideWhenCompact: false }`     | コンパクトドロワーでもブランディングを表示（デフォルト）    |

デフォルト行はデータ駆動であり、固定ではありません。`ui.brand` 設定を配信するデーモンはテキストを変更し、マークを差し替えます。また、埋め込みホストはシェルコンポーネントの `brand` prop で両方をオーバーライドできます（`onBrandResolved` はホスト自身のクローム用の結果を報告します）。`branding.render` は引き続き最高優先度のオーバーライドであり、prop やデーモンで解決された値に優先します（以前と同様です）。

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

プライマリナビゲーション領域には、`items` で制御される組み込みボタンが含まれます。

- `items` を指定しない場合は New task のみ表示されます。Home は常に存在します
- `items` を指定した場合、リストされたボタンのみ表示されます
- カスタムコンテンツは `render()` で組み込みボタンの後に追加できます

| 値                                         | 効果                                                |
| ------------------------------------------ | --------------------------------------------------- |
| `undefined`（デフォルト）                   | New task を含む Home                                 |
| `{ items: ['plugins'] }`                   | Home と Plugins。New task ボタンなし                 |
| `{ items: ['plugins', 'scheduledTasks'] }` | Home + Plugins + Scheduled Tasks                     |
| `{ items: [], render: () => ... }`         | カスタムコンテンツを含む Home。組み込みプライマリボタンなし |

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

| 値                                           | 効果                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `undefined`（デフォルト）                     | 折りたたみ/展開のみ                                                      |
| `false`                                      | フッター非表示。モバイルドロワーはクローズコントロールのみ保持            |
| `{ items: ['settings', 'theme', 'collapse'] }` | リストされたアイテムのみ表示。モバイルドロワーは常にクローズコントロールを保持 |

レールレイアウトでは、フッターアクションとバージョンは More に表示され、折りたたみ/展開コントロールのみがレール下部に残ります。Homeのみのモードでは、既存のコンパクトフッター動作が維持されます。

```tsx
sidebar={{
  footer: { items: ['theme', 'collapse'] },  // minimal footer
}}
```

`render()` によるカスタムコンテンツは、広いHomeフッターに表示されます。

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

**注:** `'scheduledTasks'` と `'goals'` はプライマリナビゲーション領域（②）に移動されており、埋め込みホストでは明示的な設定が必要です。これらは `footer.items` ではなく `primaryNav.items` で制御されます。

### その他のトップレベルオプション

```ts
interface WebShellSidebarOptions {
  enabled?: boolean; // show/hide sidebar (default: true, including when sidebar is omitted)
  defaultCollapsed?: boolean; // initial collapsed state (persisted in localStorage)
  showCompactToggle?: boolean; // show the collapse button in the chat area (default: true)
  showSessionSourceSwitch?: boolean; // show the Tasks/Channels switch (default: true)
  showLive?: boolean; // show daemon-owned Live conversations (default: false)
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

これにより Tasks/Channels スイッチが削除され、アクティブ、アーカイブ、プライマリ、セカンダリのすべてのセッションクエリが `sourceType: "default"` に固定されます。このオプションを省略すると、チャネルセッションへのアクセスが維持されます。専用 Channels レールエントリが利用可能な場合、それはソースタブを置き換えます。そうでない場合、タブは残ります。

### Live コンバセーション — `showLive`

Live コンバセーションは、デフォルトでは埋め込みホストから非表示です。ホストがデーモン所有の Live グループを公開する必要がある場合はオプトインしてください。

以前のリリースでは明示的なオプションなしでこのグループが表示されていたため、これに依存するホストはアップグレード時に `showLive: true` を設定する必要があります。

```tsx
sidebar={{
  showLive: true,
  primaryNav: { items: ['newTask', 'live'] },
}}
```

`live` プライマリエントリがない場合、`showLive: true` は Home の既存 Live グループと Experimental 配下の設定を保持します。エントリがある場合、Live は独自のセッションカラムと設定ページを開きます。

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

- サイドバー幅をリサイズするための右端のドラッグハンドル
- 幅は localStorage にサイドバーの合計幅として永続化されます。デフォルトは Homeのみで300px、レール付きで356pxです。復元された幅は Homeのみで最小220px、レール付きで276pxにクランプされます。古い値が56px blindly 増加されることはありません。折りたたみ閾値以下にドラッグしてもサイドバーは折りたたまれます。
- 環境パネルのドックブレークポイントはレールの56pxを無視します（メッセージ領域がそれらを譲るため）、パネルは Homeのみのサイドバーと同じウィンドウ幅でドッキングを続けます（例: 1440pxウィンドウ）。
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

| 状態       | 動作                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| 展開状態    | テキストラベル付きの完全なサイドバー                                                                                |
| 折りたたみ  | Homeのみ: 既存の56pxストリップとホバーセッション。レール付き: 56pxプライマリレールのみ                              |
| モバイル    | ドロワーは幅制限内でコンテナの70%を使用し、バックドロップと所有カラム下部のクローズコントロール付き                   |

折りたたみ状態は `qwen-code-web-shell-sidebar-collapsed` キーで `localStorage` に永続化されます。

サイドバー、そのコンパクトドロワー、および空のチャットのウェルカムクロームはシェルコンテナ幅（760pxでコンパクト）に従います。チャットメッセージコンテンツはビューポートベースのブレークポイントを保持します。スプリット可用性は1024pxを使用し、スプリットサイドバールームは1200pxを使用します。キーボード折りたたみは、非表示のセカンダリカラムからフォーカスをレールコントロールに移動します。

リサイズされたデスクトップ幅は展開レイアウトでのみ復元されます。モバイルドロワーを開閉しても、その幅や永続化されたデスクトップの折りたたみ設定は上書きされません。

## ソースコードの場所

| コンポーネント       | ファイル                                                                    |
| -------------------- | --------------------------------------------------------------------------- |
| WebShellSidebar      | `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`          |
| SessionGroupSection  | `packages/web-shell/client/components/sidebar/SessionGroupSection.tsx`      |
| WorkspaceSection     | `packages/web-shell/client/components/sidebar/WorkspaceSection.tsx`         |
| Sidebar styles       | `packages/web-shell/client/components/sidebar/WebShellSidebar.module.css`   |
| App integration      | `packages/web-shell/client/App.tsx`（`WebShellSidebar` を検索）              |
| Entry point (dev)    | `packages/web-shell/client/main.tsx`（明示的なプライマリおよびフッターアイテムリスト） |

