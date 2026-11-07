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

このチェックアウトは今後の CUA 0.27.0 リリースを説明するものです。以下のインストールコマンドはそのネイティブ GitHub Release (`cua-driver-rs-v0.27.0`) と対応する npm パッケージの公開を必要とします。これらのソースをマージしても公開にはなりません。公開前は、[ローカル開発セットアップ](https://github.com/QwenLM/qwen-code/blob/890cb0349a259761a571da889f4fe1cccc6ed108/packages/node-repl/README.md#local-development-and-environment)を使用してリポジトリビルドをテストしてください。

Node.js 22 以降と npm が必要です。リリースが公開されたら、MCP サーバーを登録し、Qwen Code を再起動してください。

```bash
qwen mcp add --scope user node-repl npx -y @qwen-code/node-repl-mcp@0.27.0
```

サーバーは対応する SDK とブラウザ SDK を依存関係としてインストールします。ネイティブ SDK ペイロードは現在のプラットフォーム向けにダウンロードされ、一致するリリースの SHA-256 チェックサムに対して検証されます。npm パッケージの外側にキャッシュされるため、ワークスペースの SDK ブートストラップコマンドは不要です。バージョン 0.27.0 はリリースが公開されるまでローカル開発ターゲットです。

Windows はデフォルトで通常の入力配信を使用し、UIAccess ワーカーをインストールしません。`CUA_DRIVER_USE_UIACCESS=1` で UIAccess をオプトインするには、`Program Files\Qwen\CuaDriver` に署名済みワーカーが必要です。その変数を設定した昇格ターミナルから SDK をインストールしてください。署名されていないワーカーでは UIAccess を有効にできません。署名チェックをバイパスしないでください。古い署名されていないリリースは、同じバージョンの再インストールではなく、UIAccess 用の新しい署名済みドライバーリリースを必要とします。

## アプリケーションタスク

```js
var app = await cua.getApp('Microsoft Excel');
// Use a short ID from the automatically displayed AX state.
await app.click(37);
await app.typeText('hello');
await app.getAXState();
```

`getApp` は画像なしで完全な AX テキストを表示します。`getAXState` は後続の差分を表示します。`getScreenshot` は現在のウィンドウのみをキャプチャし、`getAXStateAndScreenshot` は両方をキャプチャします。観測結果は文字列を返し、自身を表示します。`{emit:false}` は出力を抑制します。`{x,y}` 座標を使用する前にスクリーンショットをリクエストしてください。これらはそのウィンドウの現在のスクリーンショット内のピクセルです。

ドライバーはアプリケーション/ウィンドウを解決し、現在の短い ID と座標を管理し、入力の配信方法を選択します。macOS はアクセシビリティとダイレクテッドイベントを使用します。Windows と Linux はまずバックグラウンド配信を試み、何も送信されなかったことを示す拒否があった後にフォアグラウンド入力を使用します。フォアグラウンド入力は物理的なユーザー操作が検出されると停止し、ユーザーが他に切り替えていない場合のみ前のアプリケーションを復元します。ディスパッチの応答は UI が変更されたことを証明しません。再試行する前に観測してください。

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

ネイティブエージェントカーソルはデフォルトで有効です。macOS では、ローカルの PiP がアクション間でも、セッション直近に観測された許可済みの 2 つのウィンドウを更新します。枠なしウィンドウは右下付近に開始されます。カードまたはその移動プレビューハンドルをドラッグして位置を変更します。ホバーするとフローティングコントロールが表示され、後方のカードが前面に出ます。閉じるとそのプレビューが停止します。後の許可された観測で再度作成される場合があります。画像はターゲットに入力を転送しません。リセットすると所有カーソルとプレビューが閉じます。いずれかのサーフェスを無効にするには、サーバー引数に `--no-overlay` または `--no-pip` を追加してください。PiP は macOS 専用です。

MCP 登録を変更せずに PiP を無効にするには、`~/.cua-driver/config.json` に他のキーを保持したまま `"experimental_pip": false` を設定し、所有する MCP サーバーまたはランタイムを再起動してください。この既存のキーは互換性のために保持されています。サーバーの `--no-pip` 引数も PiP を無効にし、ファイルより優先されます。

デスクトップを共有または録画しているとき、特にフルスクリーンプレゼンテーション中は、プレビューが他の人に見える場合があります。恒久的なオプトアウトには、共有前に PiP を無効にして所有ランタイムを再起動してください。現在のパネルを閉じるだけでは、後の観測で再作成されるのを防げません。共有は自動的に検出されません。

## リモートデスクトップリレー

既存の macOS デスクトップリレーセットアップには、対応するサーバーをインストールしてください。

```bash
npx -y @qwen-code/node-repl-mcp@0.27.0 desktop-relay install
```

これは `127.0.0.1:47821` の既存のローカル launchd ソケットを使用します。セキュアな Web Shell で、**このコンピューターを使用** を選択し、次に **このコンピューターを接続** を選択します。デスクトップは接続ごとにプロンプトを表示します。リモートデーモンは `QWEN_SERVE_CLIENT_MCP_OVER_WS=1` を有効にする必要があります。

## 直接 MCP とトラブルシューティング

`qwen-cua-driver mcp` は同じ 19 個のネイティブ Computer Use 操作を直接公開します。アプリ呼び出しは `app` を使用し、デスクトップ対応の呼び出しは `scope:"desktop"` を使用します。`key_down/key_up` はデスクトップ専用です。高度なネイティブツールはホストのオプトイン `CUA_DRIVER_EXTRA_TOOLS=1` を通じて引き続き利用可能です。

サーバーが利用できない場合は、`qwen mcp list` を確認し、追加後にクライアントを再起動してください。キャプチャが失敗した場合は、現在のデスクトップセッションと OS 権限を確認してください。ネイティブダウンロードが失敗した場合は、正確なリリースバージョン/チェックサムアセットを確認するか、`QWEN_CUA_SDK_NATIVE_DIR` を通じてローカルでビルドした一致するペイロードを提供してください。ロックされたデスクトップは GUI 受け入れ証拠を提供できません。

[MCP サーバー](./mcp.md)、[承認モード](./approval-mode.md)、[サンドボックス化](./sandbox.md) を参照してください。
