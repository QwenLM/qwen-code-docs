# Computer Use

Computer Use はスタンドアロンの Node REPL MCP サーバーを通じて実行されます。最初の `js` 呼び出しでグローバル `cua` を読み込み、現在のプラットフォームのドキュメントを表示します。Computer Use と Browser Use はバンドルされたスキルを必要としなくなりました。

```text
Qwen Code / any MCP client
  -> @qwen-code/node-repl-mcp (js, js_reset)
  -> @qwen-code/cua-sdk/runtime
     -> native Qwen CUA Driver (desktop applications)
     -> @qwen-code/browser-use (Qwen browser extension)
```

## セットアップ

Node.js 22 以降と npm が必要です。MCP サーバーを登録し、Qwen Code を再起動してください。

```bash
qwen mcp add --scope user node-repl npx -y @qwen-code/node-repl-mcp@0.26.0
```

サーバーは対応する SDK とブラウザ SDK を依存関係としてインストールします。ネイティブ SDK ペイロードは現在のプラットフォーム向けにダウンロードされ、一致するリリースの SHA-256 チェックサムに対して検証されます。npm パッケージの外側にキャッシュされるため、ワークスペースの SDK ブートストラップコマンドは不要です。バージョン 0.26.0 はリリースが公開されるまでローカル開発ターゲットです。

## アプリケーションタスク

```js
var app = await cua.getApp('Microsoft Excel');
// Use a short ID from the automatically displayed AX state.
await app.click(37);
await app.typeText('hello');
await app.getAXState();
```

`getApp` は画像なしで完全な AX テキストを表示します。`getAXState` は後続の差分を表示します。`getScreenshot` は現在のウィンドウのみをキャプチャし、`getAXStateAndScreenshot` は両方をキャプチャします。観測結果は文字列を返し、自身を表示します。`{emit:false}` は出力を抑制します。`{x,y}` 座標を使用する前にスクリーンショットをリクエストしてください。これらはそのウィンドウの現在のスクリーンショット内のピクセルです。

ドライバーはアプリケーション/ウィンドウを解決し、現在の短い ID と座標を管理し、入力の配信方法を選択します。macOS はアクセシビリティとディレクトリイベントを使用します。Windows と Linux はまずバックグラウンド配信を試み、何も送信されなかったことを示す拒否があった後にフォアグラウンド入力を使用します。フォアグラウンド入力は物理的なユーザー操作が検出されると停止し、ユーザーが他に切り替えていない場合のみ前のアプリケーションを復元します。ディスパッチの応答は UI が変更されたことを証明しません。再試行する前に観測してください。

Linux は X11 をサポートし、XWayland 下の X11 アプリケーションも含まれます。ネイティブ Wayland アプリケーションはサポートされていません。DISPLAY、XAUTHORITY、およびデスクトップアクセシビリティセッションバスをサーバーに渡してください。

## デスクトップタスクとブラウザタスク

フルスクリーンタスクには明示的なデスクトップインターフェースを使用してください。

```js
await cua.desktop.getScreenshot();
await cua.desktop.click({ x: 300, y: 200 }, { key: 'shift' });
```

デスクトップ座標は最新のプライマリディスプレイのスクリーンショット内のピクセルです。デスクトップ入力は表示されているフォアグラウンドデスクトップを制御し、実際のポインタを移動できます。長押しされるキーには、常に `try/finally` で `cua.desktop.keyDown(key)` と `keyUp(key)` を使用してください。長押しされるキーは呼び出しセッションに属し、グレースフルリセット/終了時に解放されます。キーを長押ししている間は、コードとデスクトップポインタアクションに `keyDown/keyUp` を使用し、明示的な修飾キーは使用しないでください。テキスト、通常のショートカット、またはアプリケーション入力の前にそれらを解放してください。OS プロセスの急な終了はクリーンアップを保証できません。

```js
var browser = await cua.getBrowser('Chrome');
// Browser documentation and tabs are displayed on first selection.
var tab = await cua.getTab('TAB_ID', { browser: 'Chrome' });
await tab.playwright.domSnapshot();
```

`getBrowser`、`getTab`、`createBrowserTab` は既存のリポジトリの browser-use SDK ハンドルを返します。選択したブラウザのランタイムドキュメントに従い、Qwen ブラウザ拡張機能を以前と同様に接続してください。この統合はブラウザウィンドウ API、DOM 差分、または新しい Windows サポートを追加しません。

## 権限とライフサイクル

サーバーは通常の Node.js 権限で JavaScript を実行し、クライアントの MCP 承認フローに従います。macOS では、入力/AX 観測に Accessibility 権限が必要で、スクリーンショットには Screen Recording 権限が必要です。ドキュメントの保存/Finder の名前変更には Automation がリクエストされる場合があります。付与はホストプロセスの OS 責任チェーンに属します。Windows では、通常のインストール済みデーモンは既存の UAC/ログオンタスクパスを使用し、それが起動するアプリケーションは通常ユーザーの整合性で自身のトークンから派生したトークンを使用します。UIAccess はオプションです。`CUA_DRIVER_USE_UIACCESS=1` を明示的に設定するには Program Files 下の信頼された署名済みワーカーが必要で、利用できない場合は失敗します。デフォルトの npm インストールはそのワーカーをステージングせず、その署名も必要としません。

`js` は 1 回の呼び出しで完了し、デフォルトで 30 秒のタイムアウトがあります。タイムアウトは外部の影響を残す可能性があります。再試行する前に観測してください。`js_reset` はバインディングを破棄し、所有するネイティブ/ブラウザセッションをグレースフルに閉じます。コンパクション後は、続行する前に `cua.rewriteDocumentation()` を呼び出してください。

## リモートデスクトップリレー

既存の macOS デスクトップリレーセットアップには、対応するサーバーをインストールしてください。

```bash
npx -y @qwen-code/node-repl-mcp@0.26.0 desktop-relay install
```

これは `127.0.0.1:47821` の既存のローカル launchd ソケットを使用します。セキュアな Web Shell で、**このコンピューターを使用** を選択し、次に **このコンピューターを接続** を選択します。デスクトップは接続ごとにプロンプトを表示します。リモートデーモンは `QWEN_SERVE_CLIENT_MCP_OVER_WS=1` を有効にする必要があります。

## 直接 MCP とトラブルシューティング

`qwen-cua-driver mcp` は同じ 19 個のネイティブ Computer Use 操作を直接公開します。アプリ呼び出しは `app` を使用し、デスクトップ対応の呼び出しは `scope:"desktop"` を使用します。`key_down/key_up` はデスクトップ専用です。高度なネイティブツールはホストのオプトイン `CUA_DRIVER_EXTRA_TOOLS=1` を通じて引き続き利用可能です。

サーバーが利用できない場合は、`qwen mcp list` を確認し、追加後にクライアントを再起動してください。キャプチャが失敗した場合は、現在のデスクトップセッションと OS 権限を確認してください。ネイティブダウンロードが失敗した場合は、正確なリリースバージョン/チェックサムアセットを確認するか、`QWEN_CUA_SDK_NATIVE_DIR` を通じてローカルでビルドした一致するペイロードを提供してください。ロックされたデスクトップは GUI 受け入れ証拠を提供できません。

[MCP サーバー](./mcp.md)、[承認モード](./approval-mode.md)、[サンドボックス化](./sandbox.md) を参照してください。
