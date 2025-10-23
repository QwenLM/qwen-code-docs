# IDE Integration

Qwen Code は、IDE との連携により、よりシームレスでコンテキストを意識した体験を提供できます。この連携により、CLI がワークスペースをより適切に理解できるようになり、エディタ内での diff 表示といった強力な機能が利用可能になります。

現在サポートされている IDE は [Visual Studio Code](https://code.visualstudio.com/) および VS Code 拡張機能に対応する他のエディタのみです。他のエディタのサポートを構築するには、[IDE Companion Extension Spec](./ide-companion-spec.md) を参照してください。

## 機能

- **ワークスペースコンテキスト:** CLIは自動的にワークスペースの状況を把握し、より関連性が高く正確なレスポンスを提供します。このコンテキストには以下が含まれます：
  - ワークスペース内で**最近アクセスした上位10ファイル**
  - 現在のカーソル位置
  - 選択中のテキスト（最大16KBまで。それ以上は切り捨てられます）

- **ネイティブDiff表示:** Qwenがコード変更を提案する際、IDEのネイティブdiffビューア内で直接変更内容を確認できます。これにより、提案された変更をシームレスにレビュー・編集・承認または拒否することが可能になります。

- **VS Codeコマンド:** VS CodeのCommand Palette（`Cmd+Shift+P` または `Ctrl+Shift+P`）から直接Qwen Codeの機能にアクセスできます：
  - `Qwen Code: Run`: 統合ターミナルで新しいQwen Codeセッションを開始します。
  - `Qwen Code: Accept Diff`: アクティブなdiffエディタ内の変更を承認します。
  - `Qwen Code: Close Diff Editor`: 変更を拒否してアクティブなdiffエディタを閉じます。
  - `Qwen Code: View Third-Party Notices`: 拡張機能のサードパーティ通知を表示します。

## インストールとセットアップ

IDE連携のセットアップには3つの方法があります：

### 1. 自動案内（推奨）

サポートされているエディタ内でQwen Codeを実行すると、環境を自動的に検出し、接続を促す案内が表示されます。"Yes"と答えることで、必要なセットアップ（コンパニオン拡張機能のインストールと接続の有効化）が自動的に実行されます。

### 2. CLIからの手動インストール

以前に案内を閉じてしまった場合や、拡張機能を手動でインストールしたい場合は、Qwen Code内で以下のコマンドを実行できます：

```
/ide install
```

このコマンドは、お使いのIDEに適した拡張機能を見つけてインストールします。

### 3. マーケットプレイスからの手動インストール

エクステンションは、マーケットプレイスから直接インストールすることもできます。

- **Visual Studio Code 向け:** [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) からインストールしてください。
- **VS Code フォーク向け:** VS Code のフォークをサポートするため、このエクステンションは [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion) にも公開されています。お使いのエディタの指示に従って、このレジストリからエクステンションをインストールしてください。

> NOTE:
> 「Qwen Code Companion」エクステンションは検索結果の下の方に表示されることがあります。すぐに見つからない場合は、スクロールダウンするか、「Newly Published」でソートしてみてください。
>
> エクステンションを手動でインストールした後、CLI で `/ide enable` を実行して連携機能を有効化する必要があります。

## 使用方法

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

有効にすると、Qwen Code は自動的に IDE の companion extension への接続を試みます。

### ステータスの確認

接続ステータスを確認し、CLI が IDE から受け取ったコンテキストを表示するには、以下を実行してください：

```
/ide status
```

接続されている場合、このコマンドは接続中の IDE と、認識している最近開いたファイルのリストを表示します。

（注：ファイルリストはワークスペース内で最近アクセスした 10 個のファイルに限定され、ローカルディスク上のファイルのみが含まれます。）

### Diff との連携

Qwen モデルにファイルの変更を依頼すると、エディタ内で直接 diff ビューを開くことができます。

**Diff を適用するには**、以下のいずれかの操作を行ってください：

- diff エディタのタイトルバーにある **チェックマークアイコン** をクリックします。
- ファイルを保存します（例：`Cmd+S` または `Ctrl+S`）。
- Command Palette を開き、**Qwen Code: Accept Diff** を実行します。
- CLI でプロンプトが表示されたら `yes` と応答します。

**Diff を拒否するには**、以下の操作を行います：

- diff エディタのタイトルバーにある **'x' アイコン** をクリックします。
- diff エディタのタブを閉じます。
- Command Palette を開き、**Qwen Code: Close Diff Editor** を実行します。
- CLI でプロンプトが表示されたら `no` と応答します。

また、適用前に diff ビュー内で **提案された変更を直接編集することも可能です**。

CLI で「Yes, allow always」を選択すると、変更は IDE 上で表示されなくなり、自動的に適用されるようになります。

## サンドボックス環境での使用

Qwen Codeをサンドボックス内で使用する場合、以下の点に注意してください：

- **macOSの場合：** IDE連携機能は、IDE用コンパニオン拡張機能と通信するためにネットワークアクセスが必要です。ネットワークアクセスを許可するSeatbeltプロファイルを使用する必要があります。
- **Dockerコンテナ内の場合：** Docker（またはPodman）コンテナ内でQwen Codeを実行する場合でも、IDE連携機能はホストマシン上で動作しているVS Code拡張機能に接続できます。CLIは自動的に`host.docker.internal`上のIDEサーバーを見つけるように設定されています。通常は特別な設定は必要ありませんが、コンテナからホストへの接続を許可するようにDockerのネットワーク設定を確認する必要があるかもしれません。

## トラブルシューティング

IDE連携機能で問題が発生した場合、以下によくあるエラーメッセージとその解決方法を示します。

### 接続エラー

- **メッセージ:** `🔴 Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **原因:** Qwen Code が IDE に接続するために必要な環境変数（`QWEN_CODE_IDE_WORKSPACE_PATH` または `QWEN_CODE_IDE_SERVER_PORT`）を見つけられませんでした。これは通常、IDE companion extension が実行されていないか、正しく初期化されていないことを意味します。
  - **解決方法:**
    1. IDE に **Qwen Code Companion** extension がインストールされており、有効になっていることを確認してください。
    2. 正しい環境変数を取得するために、IDE 内で新しい terminal window を開いてください。

- **メッセージ:** `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **原因:** IDE companion への接続が失われました。
  - **解決方法:** `/ide enable` を実行して再接続を試みてください。問題が続く場合は、新しい terminal window を開くか、IDE を再起動してください。

### 設定エラー

- **メッセージ:** `🔴 Disconnected: Directory mismatch. Qwen Code is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **原因:** CLIの現在の作業ディレクトリが、IDEで開いているフォルダまたはワークスペースとは異なる場所にある。
  - **解決方法:** IDEで開いているのと同じディレクトリに`cd`してから、CLIを再起動してください。

- **メッセージ:** `🔴 Disconnected: To use this feature, please open a workspace folder in [IDE Name] and try again.`
  - **原因:** IDEにワークスペースが開かれていない。
  - **解決方法:** IDEでワークスペースを開いてから、CLIを再起動してください。

### 一般的なエラー

- **メッセージ:** `IDE integration is not supported in your current environment. To use this feature, run Qwen Code in one of these supported IDEs: [List of IDEs]`
  - **原因:** 現在の環境（ターミナルなど）は、サポートされている IDE ではないため、Qwen Code の IDE 連携機能が利用できません。
  - **解決方法:** VS Code などの対応 IDE に内蔵されているターミナルから Qwen Code を実行してください。

- **メッセージ:** `No installer is available for IDE. Please install the Qwen Code Companion extension manually from the marketplace.`
  - **原因:** `/ide install` を実行しましたが、ご利用の IDE に対する自動インストーラが CLI に用意されていません。
  - **解決方法:** ご利用の IDE にある拡張機能マーケットプレイスを開き、「Qwen Code Companion」を検索して手動でインストールしてください。