# IDE 統合

Qwen Code は IDE と統合することで、よりシームレスでコンテキストを認識したエクスペリエンスを提供します。この統合により、CLI はワークスペースをより深く理解できるようになり、エディタネイティブの差分表示などの強力な機能が有効になります。

現在サポートされている IDE は [Visual Studio Code](https://code.visualstudio.com/) および VS Code 拡張機能をサポートするその他のエディタのみです。他のエディタのサポートを構築するには、[IDE Companion Extension Spec](../ide-integration/ide-companion-spec) を参照してください。

## 機能

- **ワークスペースコンテキスト:** CLI はワークスペースを自動的に認識し、より関連性が高く正確な応答を提供します。このコンテキストには以下の情報が含まれます。
  - ワークスペース内で**最近アクセスされた 10 個のファイル**。
  - 現在のカーソル位置。
  - 選択したテキスト（上限 16KB。これより長い選択範囲は切り詰められます）。

- **ネイティブ差分表示:** Qwen がコードの変更を提案すると、IDE のネイティブ差分ビューアで直接変更内容を確認できます。これにより、提案された変更をシームレスに確認、編集、承認、または拒否できます。

- **VS Code コマンド:** VS Code のコマンドパレット（`Cmd+Shift+P` または `Ctrl+Shift+P`）から Qwen Code の機能に直接アクセスできます。
  - `Qwen Code: Run`: 統合ターミナルで新しい Qwen Code セッションを開始します。
  - `Qwen Code: Accept Diff`: アクティブな差分エディタの変更を承認します。
  - `Qwen Code: Close Diff Editor`: 変更を拒否してアクティブな差分エディタを閉じます。
  - `Qwen Code: View Third-Party Notices`: 拡張機能のサードパーティ通知を表示します。

## インストールとセットアップ

IDE 統合をセットアップするには、次の 3 つの方法があります。

### 1. 自動プロンプト（推奨）

サポートされているエディタ内で Qwen Code を実行すると、環境が自動的に検出され、接続を促すプロンプトが表示されます。「Yes」と答えると、Companion 拡張機能のインストールと接続の有効化を含む必要なセットアップが自動的に実行されます。

### 2. CLI からの手動インストール

以前にプロンプトを閉じた場合、または拡張機能を手動でインストールする場合は、Qwen Code 内で次のコマンドを実行できます。

```
/ide install
```

これにより、IDE に適した拡張機能が検索され、インストールされます。

### 3. マーケットプレイスからの手動インストール

マーケットプレイスから直接拡張機能をインストールすることもできます。

- **Visual Studio Code の場合:** [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) からインストールします。
- **VS Code フォークの場合:** VS Code のフォークをサポートするため、この拡張機能は [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion) にも公開されています。このレジストリから拡張機能をインストールするには、お使いのエディタの手順に従ってください。

> NOTE:
> "Qwen Code Companion" 拡張機能は検索結果の下の方に表示される場合があります。すぐに表示されない場合は、スクロールダウンするか、「Newly Published」で並べ替えてみてください。
>
> 拡張機能を手動でインストールした後、CLI で `/ide enable` を実行して統合をアクティブ化する必要があります。

## 使い方

### 有効化と無効化

CLI 内から IDE 統合を制御できます。

- IDE への接続を有効にするには、次のコマンドを実行します。
  ```
  /ide enable
  ```
- 接続を無効にするには、次のコマンドを実行します。
  ```
  /ide disable
  ```

有効にすると、Qwen Code は自動的に IDE Companion 拡張機能への接続を試みます。

### ステータスの確認

接続ステータスを確認し、CLI が IDE から受け取ったコンテキストを確認するには、次のコマンドを実行します。

```
/ide status
```

接続されている場合、このコマンドは接続先の IDE と、認識している最近開いたファイルのリストを表示します。

（注: ファイルリストはワークスペース内で最近アクセスされた 10 個のファイルに限定され、ディスク上のローカルファイルのみが含まれます。）

### 差分の操作

Qwen モデルにファイルの変更を依頼すると、エディタで直接差分ビューを開くことができます。

**差分を承認するには**、次のいずれかの操作を行います。

- 差分エディタのタイトルバーにある**チェックマークアイコン**をクリックします。
- ファイルを保存します（例: `Cmd+S` または `Ctrl+S`）。
- コマンドパレットを開き、**Qwen Code: Accept Diff** を実行します。
- プロンプトが表示されたら、CLI で `yes` と応答します。

**差分を拒否するには**、次の操作を行います。

- 差分エディタのタイトルバーにある **'x' アイコン**をクリックします。
- 差分エディタのタブを閉じます。
- コマンドパレットを開き、**Qwen Code: Close Diff Editor** を実行します。
- プロンプトが表示されたら、CLI で `no` と応答します。

承認する前に、差分ビューで直接**提案された変更を修正**することもできます。

CLI で「Yes, allow always」を選択すると、変更は自動的に承認されるため、IDE に表示されなくなります。

## サンドボックスでの使用

サンドボックス内で Qwen Code を使用している場合は、次の点に注意してください。

- **macOS の場合:** IDE 統合には、IDE Companion 拡張機能と通信するためのネットワークアクセスが必要です。ネットワークアクセスを許可する Seatbelt プロファイルを使用する必要があります。
- **Docker コンテナ内の場合:** Docker（または Podman）コンテナ内で Qwen Code を実行する場合でも、IDE 統合はホストマシンで実行されている VS Code 拡張機能に接続できます。CLI は `host.docker.internal` 上の IDE サーバーを自動的に検出するように構成されています。通常、特別な構成は必要ありませんが、Docker のネットワーク設定でコンテナからホストへの接続が許可されていることを確認する必要がある場合があります。

## トラブルシューティング

IDE 統合で問題が発生した場合の一般的なエラーメッセージと、その解決方法を以下に示します。

### 接続エラー

- **メッセージ:** `● Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **原因:** Qwen Code が IDE への接続に必要な環境変数（`QWEN_CODE_IDE_WORKSPACE_PATH` または `QWEN_CODE_IDE_SERVER_PORT`）を見つけられませんでした。これは通常、IDE Companion 拡張機能が実行されていないか、正しく初期化されていないことを意味します。
  - **解決策:**
    1.  IDE に **Qwen Code Companion** 拡張機能がインストールされており、有効になっていることを確認します。
    2.  IDE で新しいターミナルウィンドウを開き、正しい環境が読み込まれるようにします。

- **メッセージ:** `● Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **原因:** IDE Companion への接続が失われました。
  - **解決策:** `/ide enable` を実行して再接続を試みます。問題が解決しない場合は、新しいターミナルウィンドウを開くか、IDE を再起動してください。

### 設定エラー

- **メッセージ:** `● Disconnected: Directory mismatch. Qwen Code is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **原因:** CLI の現在の作業ディレクトリが、IDE で開いているフォルダまたはワークスペースの外にあります。
  - **解決策:** IDE で開いているのと同じディレクトリに `cd` で移動し、CLI を再起動します。

- **メッセージ:** `● Disconnected: To use this feature, please open a workspace folder in [IDE Name] and try again.`
  - **原因:** IDE でワークスペースが開かれていません。
  - **解決策:** IDE でワークスペースを開き、CLI を再起動します。

### 一般的なエラー

- **メッセージ:** `IDE integration is not supported in your current environment. To use this feature, run Qwen Code in one of these supported IDEs: [List of IDEs]`
  - **原因:** サポートされていない IDE のターミナルまたは環境で Qwen Code を実行しています。
  - **解決策:** VS Code などのサポートされている IDE の統合ターミナルから Qwen Code を実行します。

- **メッセージ:** `No installer is available for IDE. Please install the Qwen Code Companion extension manually from the marketplace.`
  - **原因:** `/ide install` を実行しましたが、CLI にお使いの IDE 用の自動インストーラーがありません。
  - **解決策:** IDE の拡張機能マーケットプレイスを開き、「Qwen Code Companion」を検索して手動でインストールします。