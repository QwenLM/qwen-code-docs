# Virtual viewport for long conversations on ink 7

Status: **実装済み**、PR #4146 に含まれるもの：
コアビューポート、自動非表示アニメーション付きASCIIスクロールバー、SGRマウスホイール、`ui.useTerminalBuffer` ゲート、キーボードスクロールキー。
スクロールバードラッグ / アプリ内検索 / 代替バッファモード / ホストスクロールバックへの二重書き込みは V.3+ にスコープアウト（§7参照）。
著者: 秦奇
追跡ブランチ: `feat/virtual-viewport-on-ink7`（ベース: `main`）

## 1. 問題

いくつかのユーザー報告のちらつき/遅延問題は、すべて同じアーキテクチャ上の事実に帰着する： ink の `<Static>` は **追記専用** であり、qwen-code の `MainContent.tsx` はすべてのレンダリングで _全体_ の `mergedHistory` をそれに渡している。1000ターンの会話の場合、状態変更ごとに1000個の `HistoryItemDisplay` React レンダリング + ink レイアウトパスが発生する。

これによって生じる現在の症状：

| 問題             | 症状                                                  | 現在の原因                                                     |
| --------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| #2950           | 長いセッションで上下のスクロールストームが継続          | リフレッシュのたびに完全な Static の再マウント                    |
| #3118           | ウィンドウに戻るとちらつきが続く                        | `clearTerminal` + `historyRemountKey++` が完全な再マウントを引き起こす |
| #3007           | 一般的なインターフェースのちらつき                      | #3118 と同じ                                                  |
| #3838（UI側）    | スクロールバーが無制限に伸びる                          | 累積差分レンダリングが行を追加；ビューポートの排除なし            |
| #3899 → #3905   | Ctrl+O でターミナルが数秒間フリーズ                     | 部分的に修正されたケース、`setImmediate` チャンキングで封印      |

PR #3905 は明示的に次のように述べている：

> 代替案（封印されたプレフィックス＋ライブテール、**真のビューポート仮想化**、ANSI出力キャッシュ）の議論は行われたが、それぞれUXを変更するか、アーキテクチャの書き換えが必要。

このアーキテクチャの書き換えこそ、本設計が提案するものである。

## 2. 参考実装

同じ問題をすでに解決（または回避）している、オープンソースの ink ベース CLI を2つ調査した：

### 2.1 claude-code (`/Users/gawain/Documents/codebase/opensource/claude-code`)

**独自の** ink フォークを `src/ink/` で維持：

- `ink.tsx` — 1722 LoC のカスタムメインループ
- `log-update.ts` — 773 LoC のカスタム差分レンダリング、スクロール領域 (`DECSTBM`) 最適化、スクロールバックに影響が出る場合は全フレームフォールバック
- `screen.ts` / `frame.ts` — 明示的な Screen / Frame オブジェクト、`cellAt` / `diffEach` によるセルレベル差分
- `render-to-screen.ts` — `renderToScreen(node)` を公開し、任意の React ノードツリーを帯域外で `Screen` オブジェクトにレンダリング。これが「一度レンダリングしてキャッシュし、再生する」— つまり仮想化の基盤能力
- `screens/REPL.tsx`:
  - `visibleStreamingText = streamingText.substring(0, streamingText.lastIndexOf('\n') + 1) || null` — 完全な行のみをレンダラーに公開
  - `ScrollBox`（`scrollRef`, `cursorNavRef` 付き）
  - `Markdown.tsx` の `StreamingMarkdown` は、最後のトップレベルブロック境界でコンテンツを分割し、安定したプレフィックスをメモ化し、不安定なサフィックスのみ再パース
- `Markdown.tsx` のトークンキャッシュ（LRU-500）— アンマウント→再マウントを生き残るため、仮想スクロールの再マウント時にキャッシュヒットし、再レクシング不要

**このアプローチを採用しない理由**：ink 全体をフォークするのは持続不可能なメンテナンス（1722 LoC の `ink.tsx` 単体、さらにカスタムレコンサイラー）。すべてのアップストリームの ink 修正を手動でマージする必要がある。そのコストは claude-code の規模では正当化されるが、qwen-code では正当化されない。

### 2.2 gemini-cli (`/Users/gawain/Documents/codebase/opensource/gemini-cli`)

`@jrichman/ink@6.6.9`（`ResizeObserver` と `StaticRender` エクスポートを追加した小規模フォーク）を使用し、**完全な仮想化リストをプレーンコンポーネントとして**提供：

| ファイル                                   | LoC | 役割                                                                   |
| ----------------------------------------- | --- | ------------------------------------------------------------------------ |
| `components/shared/VirtualizedList.tsx`   | 764 | コアビューポート＋測定＋スクロールアンカー＋アイテムごとのリサイズ追跡     |
| `components/shared/ScrollableList.tsx`    | 278 | `VirtualizedList` をラップし、キー操作ナビゲーション＋スムーズスクロール＋スクロールバー追加 |
| `contexts/ScrollProvider.tsx`             | 469 | マウスドラッグ、スクロールロック、フォーカスコンテキスト                   |
| `hooks/useBatchedScroll.ts`              | 35  | 同一ティックのスクロール更新を合体                                     |
| `hooks/useAnimatedScrollbar.ts`          | 130 | スクロールバーのフェードイン/アウトアニメーション                         |

`MainContent.tsx` は `isAlternateBufferOrTerminalBuffer` フラグで2つのレンダリングパスを切り替える：

```tsx
if (isAlternateBufferOrTerminalBuffer) {
  return <ScrollableList data={virtualizedData} renderItem={renderItem} ... />;
}

return <Static items={[<AppHeader />, ...staticHistoryItems, ...lastResponseHistoryItems]}>...</Static>;
```

`HistoryItemDisplay` は `React.memo` でラップされているため、変更のないアイテムは再レンダリングされない。

**これがプロダクション級の参考実装である。**

## 3. ink 7 の能力確認

qwen-code は進行中の `chore/upgrade-ink-7` ブランチ上にある。`node_modules/ink/build/index.d.ts` のエクスポートを検査：

- ✅ `useBoxMetrics(ref): {width, height, left, top, hasMeasured}` — レイアウト変更時に自動更新。**`ResizeObserver` の機能的同等物。**
- ✅ `measureElement(node)` — 単発の命令的測定
- ✅ `useWindowSize` — ターミナルリサイズ
- ✅ `useAnimation` — スクロールバーフェード用
- ✅ `Static`, `Box`, `Text` など
- ❌ `ResizeObserver`（コンポーネント/クラス）— 適応が必要
- ❌ `StaticRender` — カスタム実装が必要

**結論**: ink 7 は必要なすべての基本機能を備えている。フォークの交換は不要。

## 4. 戦略的决定

**gemini-cli の `ScrollableList` + `VirtualizedList` + サポートフック/コンテキストを qwen-code に移植し、`ResizeObserver` を `useBoxMetrics` に適応させ、カスタム `StaticRender` を実装する。**

却下された代替案：

| 代替案                             | 却下理由                                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| claude-code のように ink をフォーク | 持続不可能なメンテナンス負担                                                                                         |
| `@jrichman/ink` に切り替え        | 進行中の ink 7 アップグレードを元に戻す；ink 7 の React 19.2 + レコンサイラー 0.33 + 新しい差分レンダリング改善を失う |
| 仮想化をゼロから構築              | 約1700 LoC の実績ある設計を再発明；gemini-cli の参考実装が存在し、動作している                                        |

## 5. アーキテクチャ

### PR #4146 後のファイルマップ

```
packages/cli/src/ui/
├── components/shared/
│   ├── VirtualizedList.tsx          [NEW] コアビューポート + ASCII スクロールバー
│   ├── ScrollableList.tsx           [NEW] キーボード + マウスホイールラッパー
│   └── StaticRender.tsx             [NEW] React.memo ラッパー（gemini-cli の ink フォークエクスポートを置き換え）
├── hooks/
│   ├── useBatchedScroll.ts          [NEW] 同一ティックのスクロール更新を合体
│   ├── useMouseEvents.ts            [NEW] SGR マウスモードを有効化 + stdin イベントを解析
│   └── useAnimatedScrollbar.ts      [NEW] スクロール時にサムを点滅 + アイドル時に自動非表示
├── utils/
│   └── mouse.ts                     [NEW] SGR + X11 マウスイベントパーサー（gemini-cli から移植）
├── components/MainContent.tsx       [MOD] 仮想化ブランチ + 安定性参照を追加
└── AppContainer.tsx                 [MOD] スクロール関連 UI 状態をコンテキストに供給 + refreshStatic をゲート
```

後続の PR に延期：

- **スクロールバードラッグ + クリック位置指定** — 画面絶対要素座標が必要で、ストック ink 7 の制限によるブロック（V.4 / V.7 参照）。
- **アプリ内 `/` 検索** — claude-code の `TranscriptSearchBar` パターン（V.5）。
- **代替バッファモード** — `contexts/ScrollProvider.tsx` スタイルのフォーカス/ロック、完全な代替画面乗っ取り（V.6）。

### 設定（V.2）

```ts
// settings schema
ui: {
  /**
   * 長い会話のために仮想化された履歴レンダリングを有効にします。
   * true の場合、表示可能なビューポート内のアイテムのみが React を通じてレンダリングされ、
   * スクロールアウトされたアイテムはターミナルのスクロールバックバッファに残ります。
   *
   * デフォルト: false。長い会話で安定性が確認されるまでオプトイン。
   */
  useTerminalBuffer?: boolean;  // gemini-cli との互換性のためにエイリアスを維持
}
```

`MainContent.tsx` は設定を読み取り、パスを切り替える：

```tsx
const useTerminalBuffer = uiState.settings?.ui?.useTerminalBuffer ?? false;

if (useTerminalBuffer) {
  return <ScrollableList .../>; // 仮想化
}

return <Static .../>; // 既存パス、そのまま
```

レガシー `<Static>` パスはそのまま維持 — オプトインしないユーザーには回帰リスクなし。

## 6. gemini-cli ソースからの主要な適応

### 6.1 `ResizeObserver` → `useBoxMetrics`

gemini-cli のコンテナオブザーバー（命令的パターン）：

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

私たちの適応（宣言的 ink 7 フック）：

```ts
const containerRef = useRef<DOMElement>(null);
const { width: containerWidth, height: containerHeight } =
  useBoxMetrics(containerRef);
```

`useBoxMetrics` はアタッチ/デタッチとレイアウト変更のサブスクリプションをすでに処理；命令的な簿記が消える。

### 6.2 アイテムごとのリサイズトラッカー（`itemsObserver`）

より難しい。gemini-cli は単一の `ResizeObserver` で N 個のアイテムノードを監視し、`WeakMap` を介してエントリ→キーをルーティングする：

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

`useBoxMetrics` は **フックごとに単一の参照** であるため、これを1:1で置き換えることはできない。2つの選択肢：

**オプションA — 測定を `VirtualizedListItem` にプッシュダウン**

各 `VirtualizedListItem` は既に独自のコンポーネントとして実行されている（メモ化）。内部で `useBoxMetrics` を追加し、コールバックプロップを介して高さを報告する：

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

**オプションB — 親で `measureElement` + `useLayoutEffect` を使用**

親は表示されているアイテムの参照を保存し、各レンダリング後にレイアウトエフェクトを実行して測定する。反応性は劣るがよりシンプル：

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

**推奨: オプションA。** よりクリーンな分離、ink 7 の組み込み変更検出を活用。すべてのレンダリングですべてを測定する「測定ストーム」のリスクを回避。

### 6.3 `StaticRender` — カスタム実装

gemini-cli は `@jrichman/ink` から `StaticRender` をインポート。`VirtualizedList.tsx` での使用箇所を見ると：

```tsx
{shouldBeStatic ? (
  <StaticRender width={...} key={`${itemKey}-static-${width}`}>
    {content}
  </StaticRender>
) : (
  content
)}
```

セマンティクス：`content` を指定された幅で一度だけレンダリング；同じキー＋幅での後続のレンダリングはキャッシュされたレンダリングを返す。

ink 7 の場合、同等のものは、親が再レンダリングしないことを保証する安定コンポーネントを備えたプレーンな `React.memo`。カスタム実装：

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

親の安定した `key` プロップ（`${itemKey}-static-${width}`）と組み合わせることで、children または width が変更された場合に新しいマウントが発生；そうでなければ React は再レンダリングをスキップする。

これがコア機能：静的であるアイテム（例：完了した Gemini メッセージ）は一度測定＋レンダリングされ、React を再ウォークすることがない。

### 6.4 `HistoryItemDisplay` のメモ化

gemini-cli は以下を行う：

```ts
const MemoizedHistoryItemDisplay = memo(HistoryItemDisplay);
```

qwen-code でも同じパターン。仮想化が実際に再レンダリングをスキップするために必要。

## 7. PR シーケンス

| PR          | タイトル（仮）                                                                  | スコープ                                                                                                                                                                    | 行数               | 依存関係    | リスク                                           |
| ----------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------- | ------------------------------------------------ |
| **#4146**   | feat(cli): long conversations 向け ink 7 仮想ビューポート                        | コアプリミティブ + **自動非表示アニメーション**付き ASCII スクロールバー + SGR **マウスホイール** + `ui.useTerminalBuffer` ゲート + `MainContent`/`AppContainer` 配線 + テスト | ~2800 LoC         | `main`      | ✅ **出荷済み** — 型チェッククリア、vitest グリーン |
| **V.3**     | test(integration): ストリーミング/リサイズ/シェルのキャプチャスイート回帰テスト | PR #3663 から3つのキャプチャスクリプトを移植                                                                                                                                | ~2000（テストのみ） | #4146       | 保留中                                          |
| **V.4**     | feat(cli): スクロールバードラッグ＋クリック位置指定                              | スクロールバー列の SGR マウスヒットテスト。画面絶対座標が必要 —  ink 7 へのアップストリーム `getBoundingBox` または独自の yoga ウォーカー。自動非表示アニメーションは #4146 で出荷済み。 | ~400              | #4146       | 延期 — 座標ブロッカー                             |
| **V.5**     | feat(cli): アプリ内 `/` 検索                                                    | ビューポート範囲のハイライト + n/N ナビゲーション（claude-code の `TranscriptSearchBar` パターン）                                                                          | ~300              | #4146       | 延期                                            |
| **V.6**     | feat(cli): 代替バッファモード（完全代替画面乗っ取り）                           | 追加設定 `ui.useAlternateBuffer`                                                                                                                                           | ~500              | #4146       | 延期 — 別途 UX 判断が必要                         |
| **V.7**     | research: ホスト端末スクロールバック保存（二重書き込み）                        | `@jrichman/ink` の `overflowToBackbuffer` はフォークのみ。選択肢： ink 7 へのアップストリーム PR、独自二重書き込み、または損失を受け入れる。調査。 | —                 | #4146       | 構造的にストック ink 7 でブロック                   |

V.3（統合テスト）はデフォルトを切り替える前に残る重要なクリティカルパス項目。V.4–V.6 は残りの gemini-cli パリティギャップを埋める；V.7 は、必要な基礎 ink プロパティ（`overflowToBackbuffer`）が gemini-cli の `@jrichman/ink` フォークにのみ存在するため、未解決の研究課題。

## 8. 検証計画

PR ごと（「レビュー準備完了」の前に必須）：

- `npm run typecheck --workspace=@qwen-code/qwen-code` — クリーン
- `npm run lint --workspace=@qwen-code/qwen-code` — クリーン
- `cd packages/cli && npx vitest run` — すべてグリーン
- プロジェクトワークフローに従った複数ラウンドの方向性監査

エンドツーエンド（V.3 後）：

- 長い会話ベンチマーク：1000ターンセッション、以下を測定
  - 初回描画時間（初期マウント＋描画）
  - Ctrl+O トグルレイテンシ
  - リサイズレイテンシ
  - ストリーミング中のフレームあたりレンダリング時間
- `useTerminalBuffer: false`（レガシー）と `true`（仮想化）を比較

## 9. 未解決の質問/必要な決定

1. **設定名**: `ui.useTerminalBuffer`（gemini-cli 互換） vs `ui.virtualizedHistory`（より説明的）？
2. **デフォルト値**: `false`（オプトイン）として出荷するか、最初に環境変数を使って段階的にロールアウトするか？
3. **静的アイテムヒューリスティック**: gemini-cli は `header` のみを静的としてマーク。完了した Gemini メッセージ、`pendingHistoryItems` に含まれなくなったツール結果などもマークすべきか？
4. **マウスサポート**: gemini-cli の `ScrollProvider` にはスクロールバーのマウスドラッグが含まれる。今移植する価値があるか、V.4 までスキップするか？
5. **#3905 との互換性**: ~~PR #3905（Ctrl+O フリーズ修正）はオープンで、同じ `MainContent.tsx` を変更する。マージ順序を調整 — おそらく V.2 は #3905 の上にリベースする。~~ **解決済み**: #3905 のプログレッシブリプレイは `main` にマージされ、`MainContent.tsx` のレガシー `<Static>` ブランチで保持される；VP ブランチはオプトインユーザーにとってそれを置き換える。フリーズのトリガー（完全な Static 再マウント）がもはや適用されないため。
6. **`chore/re-upgrade-ink-7-0-3` との互換性**: PR #4146 はその上に積み重なる。#4119（ink 7.0.3 再アップグレード PR）が `main` にマージされた後、PR #4146 のベースは `main` に再ターゲットされる。

## 10. リスク

| リスク                                                                                       | 可能性   | 軽減策                                                                                                  |
| -------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| アイテムごとの `useBoxMetrics` が長いリストで測定ストームを発生させる                         | 中       | §6.2 のオプション A は既にアイテムごとにメモ化；レンダリングウィンドウ内のアイテムのみがコストを負担。V.3 でベンチマーク。 |
| カスタム `StaticRender` 実装が @jrichman フォークが処理していたエッジケースを逃す             | 中       | 可能であれば gemini-cli の StaticRender ソースを監査；そうでなければ機能テスト＋ベンチマークに依存。 |
| レガシー `<Static>` パスが新しいパスの進化とともにドリフトする                              | 低       | フィーチャーフラグゲートにより両方のパスがアクティブに保たれる；CI は設定マトリックスを通じて両方を実行。 |
| ink 7 にまだ未解決のアップストリームバグがある                                                | 低       | `chore/upgrade-ink-7` により既に ink 7 上；この PR は追加の ink リスクを導入しない。                    |
| 長時間実行セッションで測定キャッシュにメモリが蓄積される                                      | 中       | サイズが N×ビューポート（例：5×）を超えたら、`heights` Record に LRU 排除を追加。V.3 でベンチマーク。   |
## 11. 承認チェックリスト

- [x] アーキテクチャの方向性を承認 — gemini-cli からの移植 (§4)
- [x] 設定名 + デフォルトを決定 — `ui.useTerminalBuffer`、デフォルトは `false`（オプトイン）
- [x] 静的アイテムのヒューリスティック — `isStaticItem={(item) => item.id > 0}`（完了した履歴アイテム）
- [x] マウスサポートのスコープ — V.4 に延期、#4146 ではキーボードのみのスクロール
- [x] #3905 とのマージ順序 (§9.5) — #3905 はすでに `main` にマージ済み。 #4146 は従来の progressive-replay パスを保持し、VP ユーザーのみそのパスを置き換える
- [x] PR #4146 の実装完了