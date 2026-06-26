# IDE 連携

Qwen Code は IDE と連携することで、よりシームレスでコンテキストを認識したエクスペリエンスを提供します。この連携により、CLI がワークスペースをより深く理解できるようになり、エディタ内でのネイティブな差分表示などの強力な機能が有効になります。

現在サポートされている IDE は [Visual Studio Code](https://code.visualstudio.com/) と、VS Code 拡張機能をサポートするその他のエディタです。他のエディタのサポートを構築する方法については、[IDE Companion Extension 仕様](../ide-integration/ide-companion-spec) を参照してください。

## 機能

- **ワークスペースコンテキスト:** CLI が自動的にワークスペースを認識し、より関連性の高い正確な応答を提供します。このコンテキストには以下が含まれます:
  - ワークスペース内で **直近にアクセスした 10 個のファイル**。
  - アクティブなカーソル位置。
  - 選択したテキスト（16KB の制限あり。それより長い選択は切り捨てられます）。

- **ネイティブ差分表示:** Qwen がコードの修正を提案した際、変更内容を IDE のネイティブな差分ビューアで直接確認できます。これにより、提案された変更をシームレスにレビュー、編集、承認、または拒否できます。

- **VS Code コマンド:** VS Code のコマンドパレット (`Cmd+Shift+P` または `Ctrl+Shift+P`) から Qwen Code の機能に直接アクセスできます:
  - `Qwen Code: Run`: 統合ターミナルで新しい Qwen Code セッションを開始します。
  - `Qwen Code: Accept Diff`: アクティブな差分エディタの変更を受け入れます。
  - `Qwen Code: Close Diff Editor`: 変更を拒否し、アクティブな差分エディタを閉じます。
  - `Qwen Code: View Third-Party Notices`: 拡張機能のサードパーティ通知を表示します。

## インストールとセットアップ

IDE 連携を設定する方法は 3 つあります。

### 1. 自動プロンプト（推奨）

サポートされているエディタ内で Qwen Code を実行すると、環境が自動的に検出され、接続を促すプロンプトが表示されます。「はい」と答えると、コンパニオン拡張機能のインストールと接続の有効化を含む、必要なセットアップが自動的に実行されます。

### 2. CLI からの手動インストール

以前にプロンプトを却下した場合や、拡張機能を手動でインストールする場合は、Qwen Code 内で次のコマンドを実行できます。

```
/ide install
```

これにより、IDE に適した拡張機能が検索され、インストールされます。

### 3. マーケットプレイスからの手動インストール

拡張機能をマーケットプレイスから直接インストールすることもできます。

- **Visual Studio Code の場合:** [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) からインストールします。
- **VS Code フォークの場合:** VS Code のフォークをサポートするため、拡張機能は [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion) にも公開されています。エディタの指示に従って、このレジストリから拡張機能をインストールしてください。

> 注意:
> 「Qwen Code Companion」拡張機能は、検索結果の下部に表示される場合があります。すぐに見つからない場合は、下にスクロールするか、「新着順」で並べ替えてみてください。
>
> 拡張機能を手動でインストールした後は、CLI で `/ide enable` を実行して連携を有効化する必要があります。

## 使い方

### 有効化と無効化

CLI から IDE 連携の制御が可能です。

- 接続を有効にするには、次を実行します:
  ```
  /ide enable
  ```
- 接続を無効にするには、次を実行します:
  ```
  /ide disable
  ```

有効にすると、Qwen Code は自動的に IDE Companion 拡張機能への接続を試みます。

### ステータスの確認

接続ステータスと、CLI が IDE から受け取ったコンテキストを確認するには、次を実行します:

```
/ide status
```

接続されている場合、このコマンドは接続先の IDE と、認識している最近開いたファイルのリストを表示します。

（注: ファイルリストはワークスペース内で直近にアクセスした 10 個のファイルに制限され、ディスク上のローカルファイルのみが含まれます。）

### 差分の操作

Qwen モデルにファイルの修正を依頼すると、エディタに直接差分ビューが開かれます。

**差分を受け入れるには**、次のいずれかを実行します:

- 差分エディタのタイトルバーにある **チェックマークアイコン** をクリックする。
- ファイルを保存する（`Cmd+S` または `Ctrl+S` など）。
- コマンドパレットを開き、**Qwen Code: Accept Diff** を実行する。
- CLI でプロンプトが表示されたら `yes` と答える。

**差分を拒否するには**、次のいずれかを実行します:

- 差分エディタのタイトルバーにある **'x' アイコン** をクリックする。
- 差分エディタのタブを閉じる。
- コマンドパレットを開き、**Qwen Code: Close Diff Editor** を実行する。
- CLI でプロンプトが表示されたら `no` と答える。

また、承認する前に差分ビューで **提案された変更を直接編集** することもできます。

CLI で「はい、常に許可する」を選択すると、変更は自動承認されるため、IDE に差分は表示されなくなります。

## サンドボックス環境での使用

サンドボックス内で Qwen Code を使用する場合は、以下の点に注意してください。

- **macOS の場合:** IDE 連携では、IDE Companion 拡張機能と通信するためにネットワークアクセスが必要です。ネットワークアクセスを許可する Seatbelt プロファイルを使用する必要があります。
- **Docker コンテナ内の場合:** Docker（または Podman）コンテナ内で Qwen Code を実行する場合でも、IDE 連携はホストマシン上で実行されている VS Code 拡張機能に接続できます。CLI は自動的に `host.docker.internal` 上の IDE サーバーを見つけるように設定されています。通常は特別な設定は不要ですが、Docker ネットワーク設定でコンテナからホストへの接続が許可されていることを確認する必要がある場合があります。

## トラブルシューティング

IDE 連携で問題が発生した場合は、よくあるエラーメッセージとその解決方法を以下に示します。

### 接続エラー

- **メッセージ:** `🔴 Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **原因:** Qwen Code が IDE に接続するために必要な環境変数（`QWEN_CODE_IDE_WORKSPACE_PATH` または `QWEN_CODE_IDE_SERVER_PORT`）を見つけられませんでした。これは通常、IDE Companion 拡張機能が実行されていないか、正しく初期化されていないことを意味します。
  - **解決方法:**
    1.  IDE に **Qwen Code Companion** 拡張機能がインストールされ、有効になっていることを確認してください。
    2.  IDE で新しいターミナルウィンドウを開き、正しい環境が読み込まれるようにしてください。

- **メッセージ:** `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **原因:** IDE Companion への接続が失われました。
  - **解決方法:** `/ide enable` を実行して再接続を試みてください。問題が続く場合は、新しいターミナルウィンドウを開くか、IDE を再起動してください。

### 設定エラー

- **メッセージ:** `🔴 Disconnected: Directory mismatch. Qwen Code is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **原因:** CLI のカレントワーキングディレクトリが、IDE で開いているフォルダまたはワークスペースの外にあります。
  - **解決方法:** IDE で開いているディレクトリに `cd` で移動し、CLI を再起動してください。

- **メッセージ:** `🔴 Disconnected: To use this feature, please open a workspace folder in [IDE Name] and try again.`
  - **原因:** IDE にワークスペースが開かれていません。
  - **解決方法:** IDE でワークスペースを開き、CLI を再起動してください。

### 一般的なエラー

- **メッセージ:** `IDE integration is not supported in your current environment. To use this feature, run Qwen Code in one of these supported IDEs: [List of IDEs]`
  - **原因:** サポートされていない IDE または環境で Qwen Code を実行しています。
  - **解決方法:** VS Code などのサポートされている IDE の統合ターミナルから Qwen Code を実行してください。

- **メッセージ:** `No installer is available for IDE. Please install the Qwen Code Companion extension manually from the marketplace.`
  - **原因:** `/ide install` を実行しましたが、CLI に特定の IDE 用の自動インストーラーがありません。
  - **解決方法:** IDE の拡張機能マーケットプレイスを開き、「Qwen Code Companion」を検索して手動でインストールしてください。