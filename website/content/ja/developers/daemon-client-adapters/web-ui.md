# Daemon Web UI アダプター

## 目的

Web チャットおよび Web ターミナルクライアントは、daemon HTTP/SSE API を通じて `qwen serve` を利用し、クライアント側でトランスクリプトをレンダリングする必要があります。ネイティブのローカル TUI、チャンネル、IDE 統合は、現時点では既存のデフォルトパスを維持します。

## 共有 UI コントラクト

共通の境界として TypeScript SDK の daemon UI エクスポートを使用します:

```ts
import {
  DaemonClient,
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
} from '@qwen-code/sdk/daemon';
```

役割の分担は以下の通りです:

- `DaemonClient` は daemon の HTTP ルートを担当します。
- `DaemonSessionClient` はセッションの作成/アタッチおよび SSE リプレイを管理します。
- `normalizeDaemonEvent()` は daemon のワイヤーイベントを UI イベントに変換します。
- `createDaemonTranscriptStore()` は UI イベントをトランスクリプトブロックに集約します。

React クライアントは、オプションの `@qwen-code/webui` バインディングを使用できます:

```tsx
import {
  DaemonSessionProvider,
  useDaemonActions,
  useDaemonConnection,
  useDaemonPendingPermissions,
  useDaemonTranscriptBlocks,
} from '@qwen-code/webui';
```

最小限の React 構成:

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
  const blocks = useDaemonTranscriptBlocks();
  return blocks.map((block) => <RenderBlock key={block.id} block={block} />);
}
```

プロバイダーは daemon セッションを作成またはアタッチし、SSE を購読し、最後のイベント ID を `DaemonSessionClient` に保持して、デフォルトでストリームを再接続します。テストやカスタムの接続管理のために、`autoReconnect={false}` を指定して自動再接続を無効化できます。

## ブラウザーデプロイ形態

### 同一オリジンのローカル POC

daemon が配信するページは、ページと API が同一オリジンを共有するため、daemon を直接呼び出せます。これはローカルの Web チャットおよび Web ターミナルの検証に適した、初期 POC として推奨される形態です。

### リモート Web チャット / Web ターミナル

本番のリモート Web アプリは通常、バックエンドフォーフロントエンド (BFF) を介して通信する必要があります。BFF は daemon の URL、トークン、ワークスペースルーティング、セッションメタデータを管理し、ブラウザーセーフなアプリイベントをブラウザーに転送します。これにより、ベアラートークンがブラウザーストレージに保存されることを防ぎ、デプロイ側がユーザーがアクセスできる daemon/ワークスペースを制御できます。

### ローカルブラウザーとローカル daemon の組み合わせ

別途起動したローカル開発サーバーは `qwen serve` とクロスオリジンになるため、daemon ルートを同一オリジン経由でプロキシするか、daemon によって配信される必要があります。daemon は意図的に任意のブラウザー `Origin` リクエストを拒否します。

## レンダリングの責務

共有トランスクリプトモデルはセマンティックであり、ビジュアルではありません。UI クライアントはレンダリング方法を決定します:

- ユーザーおよびアシスタントのメッセージブロック
- 折りたたまれた思考ブロック
- ツールステータスカード
- シェル出力ブロック
- 権限リクエストコントロール
- ステータス/エラー/デバッグブロック

Web ターミナルはブラウザーネイティブのセマンティックレンダラーです。等幅レイアウト、スクロールバック、プロンプト入力、ショートカット、ストリーミングブロックを備えたターミナルのような外観と操作感を提供しますが、raw PTY プロキシではなく、サーバー側の Ink レンダリングも必要としません。

## マージ安全性

- ネイティブの `qwen` TUI はそのまま直接変更されません。
- `--acp`、チャンネル、IDE パスはデフォルトで変更されません。
- SDK UI コアは追加的です。
- WebUI React バインディングはオプションであり、インポートしたクライアントでのみ動作します。
- 削除された daemon TUI スパイクコードは、製品移行として扱うべきではありません。

## 今後の課題

- daemon が配信するローカル `/web` POC または同等の同一オリジン Web アプリを追加する。
- トランスクリプトブロック上にファーストクラスのチャットおよびターミナルレンダラーを構築する。
- 既存の daemon イベントがブラウザー UI の安定した動作に対して粒度が細かすぎる箇所にのみ、より豊富な型付きイベントを追加する。
- SDK 以外のコンシューマーが UI コアを独立した依存関係として必要とする場合、専用の `@qwen-code/daemon-ui-core` パッケージの導入を検討する。
