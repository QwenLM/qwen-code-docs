# Computer Use

Qwen Code には `computer-use` スキルが含まれており、別途インストールされる 2 つのパッケージを通じてデスクトップアプリケーションを操作する方法をモデルに指示します。

```text
bundled computer-use skill
  -> @qwen-code/node-repl-mcp
  -> @qwen-code/cua-sdk/computer-use
  -> native cua-driver accessibility backend
```

Qwen Code は MCP サーバー、SDK、またはネイティブドライバーをバンドルしていません。スキルは外部パッケージが不足している場合に自動的にインストールします。

> [!warning]
>
> Computer Use はアプリケーション UI を読み取り、マウスとキーボード入力を制御できます。信頼された環境でのみ使用し、MCP の承認を注意深くレビューしてください。

## 自動セットアップ

Node.js 22 以降と npm が必要です。

初回使用時に、スキルが以下のコマンドを自分で実行します。

```bash
qwen mcp add --scope user node-repl npx -y @qwen-code/node-repl-mcp@0.1.7
npm install --no-save --package-lock=false @qwen-code/cua-sdk@0.20.11
```

MCP サーバーが最初に追加された後、Qwen Code を再起動します。その後、スキルは `node_repl` を通じてデスクトップタスクを再開します。

SDK のインストールは `package.json` とロックファイルを変更しませんが、ワークスペースの `node_modules` に書き込みます。postinstall で現在のプラットフォームのネイティブペイロードをダウンロードして検証します。

MCP 設定またはワークスペースの SDK インストールを削除すると、実行パスが無効になります。レガシーなフォールバックはありません。

## 使用法

Qwen Code にデスクトップタスクで `$computer-use` を使用するよう指示します。ブートストラップ後、macOS ではアプリワークフローを使用します。

1. `computer.getApp(nameOrIdentifierOrPath)` でアプリケーションをバインドします。
2. `app.getState()` でコンパクトなアクセシビリティテキストを読み取り、その後自動増分更新が続きます。
3. そのテキスト内の短い要素 ID を使用して 1 つ以上のアクションを実行します。
4. 次に何をするか決定する前に最新の状態を取得します。
5. 他の永続状態が必要ない場合にのみ、SDK クライアントを閉じ、REPL をリセットします。

ドライバーのみが観測差分を計算するコンポーネントです。モデルコードは型付き SDK メソッドを使用し、任意のドライバーツール名をディスパッチしません。アプリハンドルは現在のウィンドウとダイアログを追跡し、ネイティブ要素 ID を内部で保持し、入力をネイティブドライバーに委任します。モデルコードはフォアグラウンド/バックグラウンドモードを選択しません。未確認のアクションはリプレイされません。`getState()` は検出された停止中のアプリを開くことができます。アクションがアプリを再起動することはありません。既存の正確なウィンドウ API は Windows と Linux でも引き続き利用可能です。

```js
const app = await computer.getApp('Microsoft Excel');
nodeRepl.write((await app.getState()).text);
// Use an element ID from the returned state.
await app.click(37);
await app.typeText('hello');
nodeRepl.write((await app.getState()).text);
```

要素 ID を再利用する前に、ダイアログを開いたり閉じたりした後は状態を更新してください。各アプリの状態更新時に内部で現在のスクリーンショットがキャプチャされます。デフォルトの戻り値ではスクリーンショットは非表示です。モデルが画像を必要とする場合は、`app.getState({ includeScreenshot: true })` で明示的にリクエストしてください。

## 権限

Node REPL は、モデルが作成した JavaScript を通常の Node.js 権限で実行する MCP サーバーです。その呼び出しは Qwen Code の通常の [MCP 承認フロー](./approval-mode.md) に従います。SDK もネイティブの認可を強制します。

macOS では、アクセシビリティの観測と入力に Accessibility 権限が必要です。スクリーンショットにはさらに Screen Recording 権限が必要です。macOS は Qwen Code を起動したターミナルまたは IDE に付与を帰属させる場合があります。Windows と Linux はプラットフォームのアクセシビリティおよび入力機能を使用します。

## リモートセッションから目の前のコンピューターを操作する

Qwen Code がヘッドレスマシン（開発ボックスやサーバー）で動作している場合でも、スキルはあなたが座っているデスクトップを操作できます。そのコンピューターは自身の `node_repl` を 1 つのリモートセッションに貸し出します。現在 macOS で動作します。

お使いのコンピューターで一度だけセットアップを行います。

```bash
npx -y @qwen-code/node-repl-mcp@0.1.7 desktop-relay install
```

これにより `~/.qwen/desktop-relay` 以下に `node_repl` と SDK がインストールされ、`127.0.0.1:47821` に launchd ソケットが登録されます。バックグラウンドで動作するものはありません。launchd は接続があったときにのみ短命のプロセスを起動します。

- **Web Shell から。** リモートデーモンは `QWEN_SERVE_CLIENT_MCP_OVER_WS=1` で実行する必要があります。また Web Shell はセキュアなページ（https、または SSH トンネル経由の `http://localhost`）である必要があります。セッション内で、サイドバーのフッターにある **このコンピューターを使用** を選択し、次に **このコンピューターを接続** を選択します。

お使いのコンピューターにダイアログが表示され、接続ごとに許可を求めるプロンプトが出ます。許可されたセッションは、ローカルの Computer Use と同様に、あなたの権限でコンピューター上でコードを実行し、画面を表示・制御できます。接続を解除するかセッションが終了するまで続きます。macOS では、初回時に Accessibility と Screen Recording の権限で `node` の許可を求められます。

## トラブルシューティング

- 自動セットアップ後も `node_repl` が利用できない場合は、Qwen Code を再起動し、`qwen mcp list` でサーバーを確認してください。
- 自動セットアップ後も SDK のインポートが失敗する場合は、Qwen Code がパッケージがインストールされたワークスペースから実行されていることを確認してください。
- タイムアウト、キャンセル、リセット、またはカーネルクラッシュ後は、SDK クライアントを再度ブートストラップし、新しい状態をリクエストしてください。

## 関連項目

- [Skills](./skills.md)
- [MCP サーバー](./mcp.md)
- [承認モード](./approval-mode.md)
- [サンドボックス化](./sandbox.md)
