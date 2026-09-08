# Web Shell デーモンアダプター

## 目標

Web チャットと Web ターミナルクライアントは、デーモンの HTTP/SSE API を通じて `qwen serve` を利用し、クライアント側でトランスクリプトを描画する必要があります。ネイティブのローカル TUI、チャネル、IDE 統合は、当面は既存のデフォルトパスを維持します。

## 共有 UI 契約

TypeScript SDK のデーモン UI エクスポートを共通の境界として使用します。

```ts
import {
  DaemonClient,
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
} from ' @qwen-code/sdk/daemon';
```

役割は次のように分割されます。

- `DaemonClient` はデーモンの HTTP ルートを処理します。
- `DaemonSessionClient` はセッションの作成・アタッチと SSE リプレイを管理します。
- `normalizeDaemonEvent()` はデーモンのワイヤイベントを UI イベントに変換します。
- `createDaemonTranscriptStore()` は UI イベントをトランスクリプトブロックに集約します。

React クライアントでは、Web Shell がエクスポートするバインディングを使用できます。

```tsx
import {
  DaemonSessionProvider,
  useActions,
  useConnection,
  usePendingPermissions,
  useTranscriptBlocks,
} from ' @qwen-code/web-shell/daemon-react-sdk';
```

最小限の React 構成。

```tsx
function App() {
  return (
    <DaemonSessionProvider baseUrl="http://127.0.0.1:4170">
      <Transcript />
      <PromptBox />
    </DaemonSessionProvider>
  );
}

function Transcript() {
  const blocks = useTranscriptBlocks();
  return blocks.map((block) => <RenderBlock key={block.id} block={block} />);
}
```

プロバイダーはデーモンセッションの作成またはアタッチを行い、SSE を購読し、`DaemonSessionClient` に最後のイベント ID を保持し、デフォルトでストリームを再接続します。呼び出し側は、テストやカスタム接続管理のために `autoReconnect={false}` でこれを無効にできます。

## ブラウザデプロイ形態

### 同じオリジンのローカル POC

デーモンが提供するページは、ページと API が同じオリジンを共有するため、デーモンを直接呼び出せます。これはローカルの Web チャットと Web ターミナルの検証において、初期の POC として推奨される形態です。

### リモート Web チャット / Web ターミナル

本番環境のリモート Web アプリは、通常 backend-for-frontend と通信する必要があります。BFF はデーモン URL、トークン、ワークスペースルーティング、セッションメタデータを管理し、ブラウザセーフなアプリイベントをブラウザに転送します。これにより、bearer トークンをブラウザストレージに保存せず、デプロイメントごとにユーザーがアクセスできるデーモンとワークスペースを制御できます。

### ローカルデーモンに対するローカルブラウザ

別のローカル開発サーバーは `qwen serve` とクロスオリジンになるため、デーモンルートを同じオリジンでプロキシするか、デーモンから配信される必要があります。デーモンは任意のブラウザ `Origin` リクエストを意図的に拒否します。

## 描画の責務

共有トランスクリプトモデルはセマンティックであり、ビジュアルではありません。UI クライアントが描画方法を決定します。

- ユーザーとアシスタントのメッセージブロック
- 折りたたまれた思考ブロック
- ツールステータスカード
- シェル出力ブロック
- 権限リクエストコントロール
- ステータス・エラー・デバッグブロック

Web ターミナルはブラウザネイティブのセマンティックレンダラーです。モノスペースレイアウト、スクロールバック、プロンプト入力、ショートカット、ストリーミングブロックによりターミナルのような見た目と操作性を提供しますが、生の PTY プロキシではなく、サーバー側の Ink 描画も必要としません。

## マージの安全性

- ネイティブの `qwen` TUI は直接動作のまま変更されません。
- `--acp`、チャネル、IDE パスはデフォルトで変更されません。
- SDK UI コアは追加のみです。
- Web Shell React バインディングはオプションであり、それをインポートするクライアントでのみ動作します。
- 削除されたデーモン TUI のスパイクコードは、プロダクト移行として扱うべきではありません。

## 今後の対応

- デーモンが提供する Web Shell と埋め込み IDE ホストの動作を整合させてください。
- トランスクリプトブロック上にファーストクラスのチャットとターミナルレンダラーの構築を継続してください。
- 既存のデーモンイベントが安定したブラウザ UI 動作には低すぎる場合にのみ、より豊富な型付きイベントを追加してください。
- SDK 以外の利用者が UI コアを独立した依存関係として必要とする場合、専用の `@qwen-code/daemon-ui-core` パッケージを検討してください。