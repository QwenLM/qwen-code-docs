# IDE Integration

Gemini CLI は、IDE との連携により、よりシームレスでコンテキストを意識した体験を提供できます。この連携により、CLI はワークスペースをより適切に理解し、エディタ内でのネイティブな diff 機能などの強力な機能が利用可能になります。

現在サポートされている IDE は [Visual Studio Code](https://code.visualstudio.com/) のみで、VS Code 拡張機能に対応する他のエディタも含まれます。

## 機能

- **ワークスペースコンテキスト:** CLI は自動的にワークスペースの状況を把握し、より関連性が高く正確なレスポンスを提供します。このコンテキストには以下が含まれます：
  - ワークスペース内で**最近アクセスした上位 10 個のファイル**
  - 現在のカーソル位置
  - 選択中のテキスト（最大 16KB。それ以上は切り捨てられます）

- **ネイティブな差分表示:** Gemini がコード変更を提案する際、IDE のネイティブな diff ビューア内で直接変更内容を確認できます。これにより、提案された変更をシームレスにレビュー、編集、承認または拒否することが可能になります。

- **VS Code コマンド:** VS Code のコマンドパレット（`Cmd+Shift+P` または `Ctrl+Shift+P`）から直接 Gemini CLI の機能にアクセスできます：
  - `Gemini CLI: Run`: 統合ターミナルで新しい Gemini CLI セッションを開始します。
  - `Gemini CLI: Accept Diff`: アクティブな diff エディタ内の変更を承認します。
  - `Gemini CLI: Close Diff Editor`: 変更を拒否し、アクティブな diff エディタを閉じます。
  - `Gemini CLI: View Third-Party Notices`: 拡張機能のサードパーティ通知を表示します。

## インストールとセットアップ

IDE連携のセットアップには3つの方法があります：

### 1. 自動案内（推奨）

サポートされているエディタ内でGemini CLIを実行すると、環境が自動的に検出され、接続を促す案内が表示されます。「Yes」と答えることで、必要なセットアップが自動的に実行され、関連するextensionのインストールと接続の有効化が行われます。

### 2. CLIからの手動インストール

以前に案内を-dismissした場合や、手動でextensionをインストールしたい場合は、Gemini CLI内で以下のコマンドを実行できます：

```
/ide install
```

このコマンドは、使用しているIDEに適したextensionを見つけ出してインストールします。

### 3. マーケットプレイスからの手動インストール

エクステンションは、マーケットプレイスから直接インストールすることもできます。

- **Visual Studio Code 向け:** [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=google.gemini-cli-vscode-ide-companion) からインストールしてください。
- **VS Code フォーク向け:** VS Code のフォークをサポートするため、このエクステンションは [Open VSX Registry](https://open-vsx.org/extension/google/gemini-cli-vscode-ide-companion) にも公開されています。お使いのエディタの手順に従って、このレジストリからエクステンションをインストールしてください。

どのインストール方法を選んでも、インテグレーションが正しく有効化されるように、新しいターミナルウィンドウを開くことをおすすめします。インストールが完了したら、`/ide enable` を使って接続できます。

## 使い方

### 有効化と無効化

CLI から IDE 連携をコントロールできます：

- IDE への接続を有効にするには、以下を実行します：
  ```
  /ide enable
  ```
- 接続を無効にするには、以下を実行します：
  ```
  /ide disable
  ```

有効化すると、Gemini CLI は自動的に IDE companion extension への接続を試みます。

### ステータスの確認

接続ステータスを確認し、CLI が IDE から受け取ったコンテキストを表示するには、以下を実行します：

```
/ide status
```

接続されている場合、このコマンドは接続先の IDE と、認識している最近開いたファイルのリストを表示します。

（注：ファイルリストはワークスペース内の最近アクセスした 10 個のファイルに制限されており、ローカルディスク上のファイルのみが含まれます。）

### Diff との連携

Gemini にファイルの変更を依頼すると、エディタ内で直接 diff ビューを開くことができます。

**diff を受け入れるには**、以下のいずれかの操作を行います：

- diff エディタのタイトルバーにある**チェックマークアイコン**をクリックする
- ファイルを保存する（例：`Cmd+S` または `Ctrl+S`）
- Command Palette を開き、**Gemini CLI: Accept Diff** を実行する
- CLI でプロンプトが表示されたら `yes` と応答する

**diff を拒否するには**、以下の操作を行います：

- diff エディタのタイトルバーにある**'x' アイコン**をクリックする
- diff エディタのタブを閉じる
- Command Palette を開き、**Gemini CLI: Close Diff Editor** を実行する
- CLI でプロンプトが表示されたら `no` と応答する

また、受け入れる前に diff ビュー内で**提案された変更を直接編集する**こともできます。

CLI で「Yes, allow always」を選択すると、変更は IDE に表示されなくなり、自動的に受け入れられるようになります。

## サンドボックス環境での使用

Gemini CLIをサンドボックス内で使用する場合、以下の点に注意してください：

- **macOSの場合：** IDE連携機能は、IDE companion extensionと通信するためにネットワークアクセスを必要とします。ネットワークアクセスを許可するSeatbeltプロファイルを使用する必要があります。
- **Dockerコンテナ内の場合：** Docker（またはPodman）コンテナ内でGemini CLIを実行する場合でも、ホストマシン上で動作しているVS Code extensionにIDE連携機能は接続できます。CLIは自動的に`host.docker.internal`上のIDEサーバーを見つけるように設定されています。通常、特別な設定は必要ありませんが、コンテナからホストへの接続を許可するようにDockerのネットワーク設定を確認する必要があるかもしれません。

## トラブルシューティング

IDE連携機能で問題が発生した場合、以下によくあるエラーメッセージとその解決方法を示します。

### 接続エラー

- **メッセージ:** `🔴 Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **原因:** Gemini CLI が IDE に接続するために必要な環境変数（`GEMINI_CLI_IDE_WORKSPACE_PATH` または `GEMINI_CLI_IDE_SERVER_PORT`）を見つけられませんでした。これは通常、IDE companion extension が起動していないか、正しく初期化されていないことを意味します。
  - **解決方法:**
    1. IDE に **Gemini CLI Companion** extension がインストールされていて、有効になっていることを確認してください。
    2. 新しい terminal window を IDE で開き、正しい環境変数が読み込まれるようにしてください。

- **メッセージ:** `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **原因:** IDE companion への接続が失われました。
  - **解決方法:** `/ide enable` を実行して再接続を試みてください。問題が続く場合は、新しい terminal window を開くか、IDE を再起動してください。

### 設定エラー

- **メッセージ:** `🔴 Disconnected: Directory mismatch. Gemini CLI is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **原因:** CLIの現在の作業ディレクトリが、IDEで開いているフォルダまたはワークスペースとは異なる場所にある。
  - **解決方法:** IDEで開いているのと同じディレクトリに`cd`して、CLIを再起動してください。

- **メッセージ:** `🔴 Disconnected: To use this feature, please open a single workspace folder in [IDE Name] and try again.`
  - **原因:** IDEで複数のワークスペースフォルダが開いている、またはフォルダがまったく開かれていない。IDE連携機能が正しく動作するには、単一のルートワークスペースフォルダが必要です。
  - **解決方法:** IDEで単一のプロジェクトフォルダを開いて、CLIを再起動してください。

### 一般的なエラー

- **メッセージ:** `IDE integration is not supported in your current environment. To use this feature, run Gemini CLI in one of these supported IDEs: [List of IDEs]`
  - **原因:** サポートされている IDE 以外のターミナルまたは環境で Gemini CLI を実行しています。
  - **解決方法:** VS Code などのサポートされている IDE の統合ターミナルから Gemini CLI を実行してください。

- **メッセージ:** `No installer is available for [IDE Name]. Please install the IDE companion manually from its marketplace.`
  - **原因:** `/ide install` を実行しましたが、CLI に該当の IDE 用の自動インストーラーが用意されていません。
  - **解決方法:** ご利用の IDE の拡張機能マーケットプレイスを開き、「Gemini CLI Companion」を検索して手動でインストールしてください。