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
qwen mcp add --scope user node-repl npx -y @qwen-code/node-repl-mcp@0.1.2
npm install --no-save --package-lock=false @qwen-code/cua-sdk@0.20.3
```

MCP サーバーが最初に追加された後、Qwen Code を再起動します。その後、スキルは `node_repl` を通じてデスクトップタスクを再開します。

SDK のインストールは `package.json` とロックファイルを変更しませんが、ワークスペースの `node_modules` に書き込みます。postinstall で現在のプラットフォームのネイティブペイロードをダウンロードして検証します。

MCP 設定またはワークスペースの SDK インストールを削除すると、実行パスが無効になります。レガシーなフォールバックはありません。

## 使用法

Qwen Code にデスクトップタスクで `$computer-use` を使用するよう指示します。ブートストラップ後、標準の Computer Use ワークフローに従います。

1. 正確なアプリケーションとウィンドウを検出します。
2. 完全なアクセシビリティ状態を観測します。
3. 可能な場合は現在のセマンティック要素トークンを通じてアクションを実行します。
4. 変更ごとに新しい状態を取得します。
5. リクエストされた結果を検証します。
6. SDK クライアントを閉じ、REPL をリセットします。

ドライバーのみが観測差分を計算するコンポーネントです。モデルコードは型付き SDK メソッドを使用し、任意のドライバーツール名をディスパッチしません。

## 権限

Node REPL は、モデルが作成した JavaScript を通常の Node.js 権限で実行する MCP サーバーです。その呼び出しは Qwen Code の通常の [MCP 承認フロー](./approval-mode.md) に従います。SDK もネイティブの認可を強制します。

macOS では、アクセシビリティの観測と入力に Accessibility 権限が必要です。スクリーンショットにはさらに Screen Recording 権限が必要です。macOS は Qwen Code を起動したターミナルまたは IDE に付与を帰属させる場合があります。Windows と Linux はプラットフォームのアクセシビリティおよび入力機能を使用します。

## トラブルシューティング

- 自動セットアップ後も `node_repl` が利用できない場合は、Qwen Code を再起動し、`qwen mcp list` でサーバーを確認してください。
- 自動セットアップ後も SDK のインポートが失敗する場合は、Qwen Code がパッケージがインストールされたワークスペースから実行されていることを確認してください。
- タイムアウト、キャンセル、リセット、またはカーネルクラッシュ後は、SDK クライアントを再度ブートストラップし、新しい状態をリクエストしてください。

## 関連項目

- [Skills](./skills.md)
- [MCP サーバー](./mcp.md)
- [承認モード](./approval-mode.md)
- [サンドボックス化](./sandbox.md)
