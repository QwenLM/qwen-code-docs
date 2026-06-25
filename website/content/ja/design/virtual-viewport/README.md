# ink 7 における長い会話のための仮想ビューポート

ステータス: **実装済み**、PR #4146 に含まれる内容:
コアビューポート、自動非表示アニメーション付き ASCII スクロールバー、SGR マウスホイール、`ui.useTerminalBuffer` ゲート、キーボードスクロールキー。
スクロールバードラッグ / アプリ内検索 / alt バッファモード / ホストスクロールバックへのデュアルライトは V.3+ にスコープアウト（§7 参照）。
Author: 秦奇
Tracking branch: `feat/virtual-viewport-on-ink7` (base: `main`)

## 1. 問題

ユーザーから報告されたいくつかのちらつき / ラグの問題は、すべて同じアーキテクチャ上の事実に起因している: ink の `<Static>` は**追記専用**であり、qwen-code の `MainContent.tsx` はレンダリングのたびに `mergedHistory` **全体**をそれに渡している。1000 ターンの会話では、状態変更のたびに 1000 個の `HistoryItemDisplay` React レンダリングと ink レイアウトパスが発生する。

現在の症状:

| Issue           | 症状                                           | 現在の原因                                                    |
| --------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| #2950           | 長いセッションで上下スクロールが連続的に発生   | リフレッシュごとに Static が完全にリマウントされる            |
| #3118           | ウィンドウに戻るとちらつきが続く               | `clearTerminal` + `historyRemountKey++` が完全リマウントをトリガー |
| #3007           | 一般的なインターフェースのちらつき             | #3118 と同じ                                                  |
| #3838 (UI side) | スクロールバーが際限なく伸びる                 | 累積デルタレンダリングのたびに行が追加される；ビューポートの追い出しなし |
| #3899 → #3905   | Ctrl+O でターミナルが数秒フリーズ              | 部分的に修正済みのケース、`setImmediate` チャンキングで対処   |

PR #3905 には明示的に以下が記載されている:

> 代替案（シールドプレフィックス + ライブテール、**真のビューポート仮想化**、ANSI 出力キャッシュ）の議論が行われたが、それぞれ UX を変更するか、アーキテクチャの書き直しを必要とする。

このアーキテクチャの書き直しがこの設計の提案内容である。

## 2. 参考実装

同じ問題をすでに解決している（または回避している）オープンソースの ink ベース CLI を 2 つ調査した:

### 2.1 claude-code (`/Users/gawain/Documents/codebase/opensource/claude-code`)

`src/ink/` に**独自フォーク版 ink** を保持している:

- `ink.tsx` — 1722 LoC のカスタムメインループ
- `log-update.ts` — スクロール領域（`DECSTBM`）最適化付き 773 LoC のカスタム差分レンダラー、スクロールバックに触れる場合はフルフレームにフォールバック
- `screen.ts` / `frame.ts` — 明示的な Screen / Frame オブジェクト、`cellAt` / `diffEach` セルレベルの差分
- `render-to-screen.ts` — `renderToScreen(node)` を公開し、任意のノードツリーを帯域外で `Screen` オブジェクトにレンダリング。これが「一度レンダリング、キャッシュ、リプレイ」（仮想化）の基盤となる能力
- `screens/REPL.tsx`:
  - `visibleStreamingText = streamingText.substring(0, streamingText.lastIndexOf('\n') + 1) || null` — 完全な行のみをレンダラーに渡す
  - `scrollRef`、`cursorNavRef` 付きの `ScrollBox`
  - `Markdown.tsx` の `StreamingMarkdown` は最後のトップレベルブロック境界でコンテンツを分割し、安定したプレフィックスをメモ化し、不安定なサフィックスのみ再パース
- `Markdown.tsx` トークンキャッシュ（LRU-500）— アンマウント→リマウントを跨いで存続するため、仮想スクロールのリマウント時に再レキシングなしでキャッシュにヒット

**このアプローチを採用しない理由**: ink をまるごとフォークすることは維持不可能（`ink.tsx` だけで 1722 LoC、カスタムリコンサイラーも含む）。上流 ink の修正はすべて手動マージが必要になる。そのコストは claude-code の規模では正当化されるが、qwen-code には適さない。

### 2.2 gemini-cli (`/Users/gawain/Documents/codebase/opensource/gemini-cli`)

`@jrichman/ink@6.6.9`（`ResizeObserver` と `StaticRender` のエクスポートを追加した小規模フォーク）を使用し、**完全な仮想化リストをプレーンなコンポーネントとして**実装している:

| File                                    | LoC | Role                                                                   |
| --------------------------------------- | --- | ---------------------------------------------------------------------- |
| `components/shared/VirtualizedList.tsx` | 764 | コアビューポート + 計測 + スクロールアンカー + アイテムごとのリサイズ追跡 |
| `components/shared/ScrollableList.tsx`  | 278 | `VirtualizedList` をラップし、キーナビゲーション + スムーススクロール + スクロールバーを追加 |
| `contexts/ScrollProvider.tsx`           | 469 | マウスドラッグ、スクロールロック、フォーカスコンテキスト               |
| `hooks/useBatchedScroll.ts`             | 35  | 同一ティックのスクロール更新を統合                                     |
| `hooks/useAnimatedScrollbar.ts`         | 130 | スクロールバーのフェードイン/アウトアニメーション                      |

`MainContent.tsx` は `isAlternateBufferOrTerminalBuffer` フラグで 2 つのレンダリングパスを切り替える:

```tsx
if (isAlternateBufferOrTerminalBuffer) {
  return <ScrollableList data={virtualizedData} renderItem={renderItem} ... />;
}

return <Static items={[<AppHeader />, ...staticHistoryItems, ...lastResponseHistoryItems]}>...</Static>;
```

`HistoryItemDisplay` は `React.memo` でラップされているため、変更のないアイテムは再レンダリングされない。

**これが本番グレードのリファレンスである。**

## 3. ink 7 の機能確認

qwen-code は進行中の `chore/upgrade-ink-7` ブランチ上にある。`node_modules/ink/build/index.d.ts` のエクスポートを確認した:

- ✅ `useBoxMetrics(ref): {width, height, left, top, hasMeasured}` — レイアウト変更時に自動更新。**`ResizeObserver` の機能的等価物。**
- ✅ `measureElement(node)` — 単発の命令型計測
- ✅ `useWindowSize` — ターミナルリサイズ
- ✅ `useAnimation` — スクロールバーのフェード用
- ✅ `Static`、`Box`、`Text` など
- ❌ `ResizeObserver`（コンポーネント/クラス）— 適応が必要
- ❌ `StaticRender` — カスタム実装が必要

**結論**: ink 7 には必要なプリミティブがすべて揃っている。フォーク切り替えは不要。

## 4. 戦略的決定

**gemini-cli の `ScrollableList` + `VirtualizedList` + 補助フック/コンテキストを qwen-code に移植し、`ResizeObserver` → `useBoxMetrics` に適応させ、カスタム `StaticRender` を実装する。**

却下した代替案:

| 代替案                              | 却下理由                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| claude-code のように ink をフォーク | 維持不可能なメンテナンス負担                                                                                  |
| `@jrichman/ink` に切り替える        | 進行中の ink 7 アップグレードを元に戻す；ink 7 の React 19.2 + リコンサイラー 0.33 + 新しい差分レンダラーの改善を失う |
| 仮想化をゼロから構築                | 実績のある設計の ~1700 LoC を再発明することになる；gemini-cli のリファレンスが既に存在し動作している           |

## 5. アーキテクチャ

### PR #4146 後のファイルマップ

```
packages/cli/src/ui/
├── components/shared/
│   ├── VirtualizedList.tsx          [NEW] コアビューポート + ASCII スクロールバー
│   ├── ScrollableList.tsx           [NEW] キーボード + マウスホイールラッパー
│   └── StaticRender.tsx             [NEW] React.memo ラッパー（gemini-cli の ink フォークエクスポートを置換）
├── hooks/
│   ├── useBatchedScroll.ts          [NEW] 同一ティックのスクロール更新を統合
│   ├── useMouseEvents.ts            [NEW] SGR マウスモードの有効化 + stdin イベントのパース
│   └── useAnimatedScrollbar.ts      [NEW] スクロール時のサム点滅 + アイドル時の自動非表示
├── utils/
│   └── mouse.ts                     [NEW] SGR + X11 マウスイベントパーサー（gemini-cli から移植）
├── components/MainContent.tsx       [MOD] 仮想化ブランチ + 安定性 ref を追加
└── AppContainer.tsx                 [MOD] スクロール関連の UI 状態をコンテキストに渡す + refreshStatic のゲート
```

後続 PR に延期:

- **スクロールバードラッグ + 位置クリック** — 画面絶対座標が必要、stock-ink-7 の制限によりブロック（V.4 / V.7 参照）。
- **アプリ内 `/` 検索** — claude-code の `TranscriptSearchBar` パターン（V.5）。
- **Alternate バッファモード** — `contexts/ScrollProvider.tsx` スタイルのフォーカス / ロック、フル alt-screen テイクオーバー（V.6）。

### 設定 (V.2)

```ts
// settings schema
ui: {
  /**
   * 長い会話に対して仮想化された履歴レンダリングを有効にする。
   * true の場合、可視ビューポート内のアイテムのみが React 経由でレンダリングされる；
   * スクロールアウトしたアイテムはターミナルのスクロールバックバッファに残る。
   *
   * Default: false。長い会話での安定性が確認されるまではオプトイン。
   */
  useTerminalBuffer?: boolean;  // alias kept compat with gemini-cli
}
```

`MainContent.tsx` は設定を読み取ってパスを切り替える:

```tsx
const useTerminalBuffer = uiState.settings?.ui?.useTerminalBuffer ?? false;

if (useTerminalBuffer) {
  return <ScrollableList .../>; // 仮想化
}

return <Static .../>; // 既存パス、変更なし
```

レガシーの `<Static>` パスはそのまま維持される — オプトインしないユーザーへのリグレッションリスクなし。

## 6. gemini-cli ソースからの主要な適応

### 6.1 `ResizeObserver` → `useBoxMetrics`

gemini-cli のコンテナオブザーバー（命令型パターン）:

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

我々の適応（宣言的な ink 7 フック）:

```ts
const containerRef = useRef<DOMElement>(null);
const { width: containerWidth, height: containerHeight } =
  useBoxMetrics(containerRef);
```

`useBoxMetrics` はアタッチ/デタッチ + レイアウト変更のサブスクリプションをすでに処理しており、命令型の定型コードが消える。

### 6.2 アイテムごとのリサイズトラッカー（`itemsObserver`）

より難しい。gemini-cli は単一の `ResizeObserver` で N 個のアイテムノードを監視し、`WeakMap` でエントリーをキーにルーティングする:

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

`useBoxMetrics` は**シングルリフ per フック**のため、これを 1:1 で置き換えることはできない。2 つのオプションがある:

**オプション A — 計測を `VirtualizedListItem` にプッシュダウン**

各 `VirtualizedListItem` はすでに独自のコンポーネント（メモ化済み）として実行されている。その中に `useBoxMetrics` を追加し、コールバック prop で高さを上位に報告する:

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

**オプション B — 親で `measureElement` + `useLayoutEffect` を使用**

親が可視アイテムの ref を保持し、各レンダリング後にレイアウトエフェクトを実行して計測する。リアクティブ性は低いがシンプル:

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

**推奨: オプション A。** より明確な分離、ink 7 の組み込み変更検出を活用。すべてのレンダリングですべてを計測する「計測ストーム」リスクを回避。

### 6.3 `StaticRender` — カスタム実装

gemini-cli は `@jrichman/ink` から `StaticRender` をインポートしている。`VirtualizedList.tsx` での使用法:

```tsx
{shouldBeStatic ? (
  <StaticRender width={...} key={`${itemKey}-static-${width}`}>
    {content}
  </StaticRender>
) : (
  content
)}
```

セマンティクス: 指定された幅で `content` を一度レンダリングし、同じキーと幅での後続レンダリングはキャッシュされたレンダリングを返す。

ink 7 では、親が再レンダリングしないことを保証する安定したコンポーネントによるプレーンな `React.memo` が等価である。カスタム実装:

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

親の安定した `key` prop（`${itemKey}-static-${width}`）と組み合わせることで、children または width が変わると新しいマウントが発生し、そうでなければ React はレンダリングをスキップする。

これがコア機能である: 静的なアイテム（例: 完了した Gemini メッセージ）は一度計測・レンダリングされ、React を再度通ることがない。

### 6.4 `HistoryItemDisplay` のメモ化

gemini-cli では:

```ts
const MemoizedHistoryItemDisplay = memo(HistoryItemDisplay);
```

qwen-code でも同じパターンを使用する。仮想化が実際に再レンダリングをスキップするために必要。

## 7. PR シーケンス

| PR        | タイトル（ドラフト）                                                        | スコープ                                                                                                                                                                           | 行数              | 依存関係     | リスク                                         |
| --------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------ | ---------------------------------------------- |
| **#4146** | feat(cli): virtual viewport for long conversations on ink 7                 | コアプリミティブ + **自動非表示アニメーション**付き ASCII スクロールバー + SGR **マウスホイール** + `ui.useTerminalBuffer` ゲート + `MainContent`/`AppContainer` 配線 + テスト       | ~2800 LoC         | `main`       | ✅ **リリース済み** — 型チェッククリーン、vitest グリーン |
| **V.3**   | test(integration): capture-suite regressions for streaming / resize / shell | PR #3663 から 3 つのキャプチャスクリプトを移植                                                                                                                                    | ~2000（テストのみ） | #4146        | 保留中                                         |
| **V.4**   | feat(cli): scrollbar drag + click-to-position                               | スクロールバーカラムの SGR マウスヒットテスト。画面絶対座標が必要 — 上流 `getBoundingBox` を ink 7 に追加するか、独自の yoga ウォーカーを使用。自動非表示アニメーションは #4146 でリリース済み。 | ~400              | #4146        | 延期 — 座標ブロッカー                          |
| **V.5**   | feat(cli): in-app `/` search                                                | ビューポートバインドのハイライト + n/N ナビゲーション（claude-code の `TranscriptSearchBar` パターン）                                                                             | ~300              | #4146        | 延期                                           |
| **V.6**   | feat(cli): alternate-buffer mode (full alt-screen takeover)                 | 追加設定 `ui.useAlternateBuffer`                                                                                                                                                   | ~500              | #4146        | 延期 — 別途 UX 決定が必要                      |
| **V.7**   | research: preserve host terminal scrollback (dual-write)                    | `@jrichman/ink` の `overflowToBackbuffer` はフォーク専用。オプション: ink 7 への上流 PR、独自デュアルライト、または損失の受け入れ。調査。                                           | —                 | #4146        | stock ink 7 で構造的にブロック                 |

V.3（統合テスト）はデフォルトを切り替える前の残りのクリティカルパスアイテムである。V.4〜V.6 は残りの gemini-cli パリティギャップを埋める；V.7 は、必要な ink プロパティ（`overflowToBackbuffer`）が gemini-cli の `@jrichman/ink` フォークにのみ存在するため、オープンリサーチとなっている。

## 8. 検証計画

PR ごと（「レビュー準備完了」の前に必須）:

- `npm run typecheck --workspace=@qwen-code/qwen-code` — クリーン
- `npm run lint --workspace=@qwen-code/qwen-code` — クリーン
- `cd packages/cli && npx vitest run` — すべてグリーン
- プロジェクトワークフローに従ったマルチラウンド方向性監査

エンドツーエンド（V.3 後）:

- 長い会話のベンチマーク: 1000 ターンセッションで以下を計測
  - 初回描画時間（初期マウント + 描画）
  - Ctrl+O トグルレイテンシー
  - リサイズレイテンシー
  - ストリーミング中のフレームごとのレンダリング時間
- `useTerminalBuffer: false`（レガシー）vs `true`（仮想化）を比較

## 9. 未解決の質問 / 必要な決定

1. **設定名**: `ui.useTerminalBuffer`（gemini-cli 互換）vs `ui.virtualizedHistory`（より説明的）?
2. **デフォルト値**: `false`（オプトイン）でリリースするか、最初に環境変数でステージロールアウトするか?
3. **静的アイテムのヒューリスティック**: gemini-cli は `header` のみを静的とマークしている。完了した Gemini メッセージ、`pendingHistoryItems` に含まれなくなったツール結果なども静的とマークすべきか?
4. **マウスサポート**: gemini-cli の `ScrollProvider` にはスクロールバーのマウスドラッグが含まれる。今すぐ移植する価値があるか、それとも V.4 までスキップするか?
5. **#3905 との互換性**: ~~PR #3905（Ctrl+O フリーズ修正）はオープンで、同じ `MainContent.tsx` を変更している。マージ順序を調整 — おそらく V.2 が #3905 の上にリベースする。~~ **解決済み**: #3905 のプログレッシブリプレイは `main` に着地済みで、`MainContent.tsx` のレガシー `<Static>` ブランチで保持されている；VP ブランチはオプトインユーザーに対してそれを置き換える（フリーズのトリガーである Static の完全リマウントはもはや適用されない）。
6. **`chore/re-upgrade-ink-7-0-3` との互換性**: PR #4146 はその上にスタックされている。#4119（ink 7.0.3 再アップグレード PR）が `main` にマージされた後、PR #4146 のベースは `main` に再ターゲットされる。

## 10. リスク

| リスク                                                                        | 可能性 | 軽減策                                                                                                  |
| ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| アイテムごとの `useBoxMetrics` が長いリストで計測ストームを引き起こす         | 中     | §6.2 のオプション A はアイテムごとにすでにメモ化されており、レンダリングウィンドウ内のアイテムのみがコストを払う。V.3 でベンチマーク。 |
| `StaticRender` カスタム実装が @jrichman フォークが処理していたエッジケースを見逃す | 中     | 可能なら gemini-cli の StaticRender ソースを監査；それ以外は機能テスト + ベンチマークに依存。           |
| 新しいパスが進化するにつれて `<Static>` レガシーパスが乖離する               | 低     | フィーチャーフラグゲートが両パスをアクティブに保つ；CI は設定マトリックスで両方を実行。                 |
| ink 7 に上流での未解決のバグが残っている                                      | 低     | すでに `chore/upgrade-ink-7` で ink 7 を使用中；この PR は追加の ink リスクを導入しない。               |
| 長時間実行セッションで計測キャッシュにメモリが蓄積する                        | 中     | `heights` レコードのサイズが N×ビューポート（例: 5×）を超えたら LRU 追い出しを追加。V.3 でベンチマーク。 |

## 11. 承認チェックリスト

- [x] アーキテクチャの方向性承認済み — gemini-cli からの移植（§4）
- [x] 設定名 + デフォルト決定済み — `ui.useTerminalBuffer`、デフォルト `false`（オプトイン）
- [x] 静的アイテムのヒューリスティック — `isStaticItem={(item) => item.id > 0}`（完了した履歴アイテム）
- [x] マウスサポートのスコープ — V.4 に延期；#4146 ではキーボードのみのスクロール
- [x] #3905 とのマージ順序（§9.5） — #3905 はすでに `main` にある；#4146 はレガシープログレッシブリプレイパスを保持し、VP ユーザーに対してのみそれを置き換える
- [x] PR #4146 実装完了
