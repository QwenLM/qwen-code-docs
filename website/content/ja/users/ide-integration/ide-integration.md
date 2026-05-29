---
description: "Qwen Code を VS Code に数分で接続。ワークスペース文脈、ネイティブ Diff 確認、IDE コマンドで安全に AI コーディングできます。"
---

# IDE 統合

Qwen Code は IDE と統合することで、よりシームレスでコンテキストを認識した体験を提供します。この統合により、CLI がワークスペースをより深く理解できるようになり、エディターネイティブの差分表示などの強力な機能が利用可能になります。

現在サポートされている IDE は [Visual Studio Code](https://code.visualstudio.com/) および VS Code 拡張機能をサポートするその他のエディターのみです。他のエディターへのサポートを構築する方法については、[IDE Companion Extension Spec](../ide-integration/ide-companion-spec) を参照してください。

## 機能

- **ワークスペースコンテキスト:** CLI はワークスペースを自動的に認識し、より関連性が高く正確な応答を提供します。このコンテキストには以下が含まれます：
  - ワークスペース内で**最後にアクセスした 10 個のファイル**。
  - 現在のカーソル位置。
  - 選択中のテキスト（最大 16KB まで。それを超える場合は切り捨てられます）。

- **ネイティブ差分表示:** Qwen がコードの変更を提案すると、IDE のネイティブな差分ビューアーで変更を直接確認できます。これにより、提案された変更をシームレスにレビュー、編集、承認または却下できます。

- **VS Code コマンド:** VS Code コマンドパレット（`Cmd+Shift+P` または `Ctrl+Shift+P`）から Qwen Code の機能に直接アクセスできます：
  - `Qwen Code: Run`: 統合ターミナルで新しい Qwen Code セッションを開始します。
  - `Qwen Code: Accept Diff`: アクティブな差分エディターで変更を承認します。
  - `Qwen Code: Close Diff Editor`: 変更を却下し、アクティブな差分エディターを閉じます。
  - `Qwen Code: ViewThird-Party Notices`: 拡張機能のサードパーティ通知を表示します。

## インストールとセットアップ

IDE 統合を設定する方法は 3 つあります：

### 1. 自動プロンプト（推奨）

サポートされているエディター内で Qwen Code を実行すると、環境が自動的に検出され、接続を促すプロンプトが表示されます。「Yes」と回答すると、コンパニオン拡張機能のインストールと接続の有効化を含む必要なセットアップが自動的に実行されます。

### 2. CLI からの手動インストール

以前にプロンプトを閉じた場合や、拡張機能を手動でインストールしたい場合は、Qwen Code 内で次のコマンドを実行してください：

```
/ide install
```

これにより、お使いの IDE に適した拡張機能が検索され、インストールされます。

### 3. マーケットプレイスからの手動インストール

マーケットプレイスから直接拡張機能をインストールすることもできます。

- **Visual Studio Code 向け:** [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) からインストールします。
- **VS Code フォーク向け:** VS Code のフォークをサポートするため、この拡張機能は [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion) にも公開されています。このレジストリから拡張機能をインストールする手順については、お使いのエディターの指示に従ってください。

> NOTE:
> 「Qwen Code Companion」拡張機能は検索結果の下の方に表示される場合があります。すぐに見つからない場合は、下にスクロールするか、「新規公開順」で並べ替えてみてください。
>
> 拡張機能を手動でインストールした後、統合を有効にするために CLI で `/ide enable` を実行する必要があります。

## 使用方法

### 有効化と無効化

CLI 内から IDE 統合を制御できます：

- IDE への接続を有効にするには、次を実行します：
  ```
  /ide enable
  ```
- 接続を無効にするには、次を実行します：
  ```
  /ide disable
  ```

有効にすると、Qwen Code は IDE コンパニオン拡張機能への接続を自動的に試みます。

### ステータスの確認

接続ステータスを確認し、CLI が IDE から受け取ったコンテキストを表示するには、次を実行します：

```
/ide status
```

接続されている場合、このコマンドは接続先の IDE と、認識している最近開いたファイルのリストを表示します。

（注：ファイルリストはワークスペース内で最後にアクセスした 10 個のファイルに限定され、ディスク上のローカルファイルのみが含まれます。）

### 差分の操作

Qwen モデルにファイルの変更を依頼すると、エディター内で直接差分ビューを開くことができます。

**差分を承認するには**、次のいずれかの操作を行います：

- 差分エディターのタイトルバーにある**チェックマークアイコン**をクリックします。
- ファイルを保存します（例：`Cmd+S` または `Ctrl+S`）。
- コマンドパレットを開き、**Qwen Code: Accept Diff** を実行します。
- プロンプトが表示されたら、CLI で `yes` と応答します。

**差分を却下するには**、次の操作を行います：

- 差分エディターのタイトルバーにある**「x」アイコン**をクリックします。
- 差分エディターのタブを閉じます。
- コマンドパレットを開き、**Qwen Code: Close Diff Editor** を実行します。
- プロンプトが表示されたら、CLI で `no` と応答します。

承認前に、差分ビュー内で**提案された変更を直接編集**することもできます。

CLI で「Yes, allow always」を選択すると、変更は自動的に承認されるため、IDE には表示されなくなります。

## サンドボックスでの使用

サンドボックス内で Qwen Code を使用する場合は、以下の点に注意してください：

- **macOS 上:** IDE 統合は IDE コンパニオン拡張機能と通信するためにネットワークアクセスを必要とします。ネットワークアクセスを許可する Seatbelt プロファイルを使用する必要があります。
- **Docker コンテナ内:** Docker（または Podman）コンテナ内で Qwen Code を実行する場合でも、IDE 統合はホストマシン上で実行されている VS Code 拡張機能に接続できます。CLI は `host.docker.internal` 上の IDE サーバーを自動的に検索するように構成されています。通常は特別な設定は不要ですが、Docker のネットワーク設定でコンテナからホストへの接続が許可されていることを確認する必要がある場合があります。

## トラブルシューティング

IDE 統合で問題が発生した場合は、以下の一般的なエラーメッセージと解決方法を参照してください。

### 接続エラー

- **メッセージ:** `🔴 Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **原因:** Qwen Code が IDE への接続に必要な環境変数（`QWEN_CODE_IDE_WORKSPACE_PATH` または `QWEN_CODE_IDE_SERVER_PORT`）を見つけられませんでした。通常、これは IDE コンパニオン拡張機能が実行されていないか、正しく初期化されていないことを意味します。
  - **解決方法:**
    1.  IDE に **Qwen Code Companion** 拡張機能がインストールされ、有効になっていることを確認します。
    2.  正しい環境が読み込まれるように、IDE で新しいターミナルウィンドウを開きます。

- **メッセージ:** `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **原因:** IDE コンパニオンへの接続が切断されました。
  - **解決方法:** `/ide enable` を実行して再接続を試みます。問題が解決しない場合は、新しいターミナルウィンドウを開くか、IDE を再起動してください。

### 設定エラー

- **メッセージ:** `🔴 Disconnected: Directory mismatch. Qwen Code is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **原因:** CLI の現在の作業ディレクトリが、IDE で開いているフォルダーまたはワークスペースの外にあります。
  - **解決方法:** IDE で開いているのと同じディレクトリに `cd` で移動し、CLI を再起動します。

- **メッセージ:** `🔴 Disconnected: To use this feature, please open a workspace folder in [IDE Name] and try again.`
  - **原因:** IDE でワークスペースが開かれていません。
  - **解決方法:** IDE でワークスペースを開き、CLI を再起動します。

### 一般的なエラー

- **メッセージ:** `IDE integration is not supported in your current environment. To use this feature, run Qwen Code in one of these supported IDEs: [List of IDEs]`
  - **原因:** サポートされていない IDE のターミナルまたは環境で Qwen Code を実行しています。
  - **解決方法:** VS Code などのサポートされている IDE の統合ターミナルから Qwen Code を実行します。

- **メッセージ:** `No installer is available for IDE. Please install the Qwen Code Companion extension manually from the marketplace.`
  - **原因:** `/ide install` を実行しましたが、CLI にお使いの特定の IDE 用の自動インストーラーがありません。
  - **解決方法:** IDE の拡張機能マーケットプレイスを開き、「Qwen Code Companion」を検索して手動でインストールします。