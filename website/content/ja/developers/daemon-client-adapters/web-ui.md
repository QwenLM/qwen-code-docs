# デーモンWeb UIアダプター

## 目標

WebチャットおよびWebターミナルクライアントは、デーモンのHTTP/SSE APIを通じて`qwen serve`を使用し、クライアントサイドのトランスクリプトをレンダリングする必要があります。ネイティブのローカルTUI、チャンネル、IDE統合は、当面は既存のデフォルトパスを維持します。

## 共有UI契約

TypeScript SDKのデーモンUIエクスポートを共通境界として使用します：

```ts
import {
  DaemonClient,
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
} from '@qwen-code/sdk/daemon';
```

分割は以下の通りです：

- `DaemonClient`はデーモンのHTTPルートを処理します。
- `DaemonSessionClient`はセッションの作成/アタッチとSSEリプレイを担当します。
- `normalizeDaemonEvent()`はデーモンのワイヤーイベントをUIイベントに変換します。
- `createDaemonTranscriptStore()`はUIイベントをトランスクリプトブロックに集約します。

Reactクライアントはオプションの`@qwen-code/webui`バインディングを使用できます：

```tsx
import {
  DaemonSessionProvider,
  useDaemonActions,
  useDaemonConnection,
  useDaemonPendingPermissions,
  useDaemonTranscriptBlocks,
} from '@qwen-code/webui';
```

最小限のReactの形状：

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

このプロバイダーはデーモンセッションを作成またはアタッチし、SSEを購読し、`DaemonSessionClient`に最後のイベントIDを保持し、デフォルトでストリームを再接続します。呼び出し元は、テストやカスタム接続管理のために`autoReconnect={false}`でこれを無効にできます。

## ブラウザデプロイメントの形状

### 同一オリジンのローカルPOC

デーモンが提供するページは、ページとAPIが同一オリジンを共有するため、デーモンを直接呼び出すことができます。これは、ローカルWebチャットとWebターミナルの検証における初期の推奨POCの形状です。

### リモートWebチャット / Webターミナル

本番環境のリモートWebアプリは通常、バックエンド・フォー・フロントエンドと通信する必要があります。BFFはデーモンのURL、トークン、ワークスペースルーティング、セッションメタデータを管理し、ブラウザセーフなアプリイベントをブラウザに転送します。これにより、ベアラートークンがブラウザストレージに保存されるのを防ぎ、デプロイメントがユーザーに到達を許可するデーモン/ワークスペースを決定できるようになります。

### ローカルブラウザとローカルデーモンの組み合わせ

別のローカル開発サーバーは`qwen serve`とはクロスオリジンになります。そのため、デーモンのルートを同一オリジン経由でプロキシするか、デーモンによって提供される必要があります。デーモンは任意のブラウザ`Origin`リクエストを意図的に拒否します。

## レンダリングの責任

共有トランスクリプトモデルはセマンティックであり、視覚的ではありません。UIクライアントはレンダリング方法を決定します：

- ユーザーとアシスタントのメッセージブロック
- 折りたたまれた思考ブロック
- ツールステータスカード
- シェル出力ブロック
- 権限要求コントロール
- ステータス/エラー/デバッグブロック

Webターミナルはブラウザネイティブのセマンティックレンダラーです。等幅レイアウト、スクロールバック、プロンプト入力、ショートカット、ストリーミングブロックを備え、ターミナルらしい外観と操作感を持つべきですが、生のPTYプロキシではなく、サーバーサイドのInkレンダリングも必要としません。

## マージの安全性

- ネイティブの`qwen` TUIはそのままで変更されません。
- `--acp`、チャンネル、IDEのパスはデフォルトでは変更されません。
- SDK UIコアは追加的なものです。
- WebUI Reactバインディングはオプションであり、それをインポートするクライアントでのみ実行されます。
- 削除されたデーモンTUIのスパイクコードは、製品の移行として扱われるべきではありません。

## 今後の課題

- デーモンが提供するローカル`/web` POCまたは同等の同一オリジンWebアプリを追加する。
- トランスクリプトブロック上にファーストクラスのチャットおよびターミナルレンダラーを構築する。
- 既存のデーモンイベントが安定したブラウザUIの動作には低レベルすぎる場合にのみ、よりリッチな型付きイベントを追加する。
- SDK以外のコンシューマーが独立した依存関係としてUIコアを必要とする場合は、専用の`@qwen-code/daemon-ui-core`パッケージを検討する。