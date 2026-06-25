# トラブルシューティング

このガイドでは、よくある問題の解決策とデバッグのヒントを提供します。以下のトピックを含みます：

- 認証・ログインエラー
- よくある質問（FAQ）
- デバッグのヒント
- 類似した GitHub Issue の検索または新規 Issue の作成

## 認証・ログインエラー

- **エラー: `Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **原因:** Qwen OAuth は 2026年4月15日をもって利用できなくなりました。
  - **解決策:** 別の認証方法に切り替えてください。`qwen` を実行し、`/auth` から以下のいずれかを選択します：
    - **API Key**: Alibaba Cloud Model Studio の API キーを使用します（[北京](https://bailian.console.aliyun.com/) / [国際](https://modelstudio.console.alibabacloud.com/)）。API セットアップガイドを参照してください（[北京](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [国際](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)）。
    - **Alibaba Cloud Coding Plan**: より高いクォータで月額固定料金のサブスクリプションです。Coding Plan ガイドを参照してください（[北京](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [国際](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）。

- **エラー: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`、`UNABLE_TO_VERIFY_LEAF_SIGNATURE`、または `unable to get local issuer certificate`**
  - **原因:** SSL/TLS トラフィックをインターセプトして検査するファイアウォールを持つ企業ネットワーク上にいる可能性があります。この場合、Node.js がカスタムのルート CA 証明書を信頼する必要があります。
  - **解決策:** `NODE_EXTRA_CA_CERTS` 環境変数に、企業のルート CA 証明書ファイルの絶対パスを設定してください。
    - 例: `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **エラー: `Device authorization flow failed: fetch failed`**
  - **原因:** Node.js が Qwen OAuth エンドポイントに到達できませんでした（プロキシや SSL/TLS 信頼の問題が多い）。利用可能な場合、Qwen Code は根本的なエラー原因も表示します（例: `UNABLE_TO_VERIFY_LEAF_SIGNATURE`）。このエラーは旧来の Qwen OAuth フローに固有のものです。
  - **解決策:**
    - まだ Qwen OAuth を使用している場合は、`/auth` で API Key または Coding Plan に切り替えてください。
    - プロキシ環境下の場合は、`qwen --proxy <url>`（または `settings.json` の `proxy` 設定）で設定してください。
    - ネットワークが企業の TLS インスペクション CA を使用している場合は、上記の手順で `NODE_EXTRA_CA_CERTS` を設定してください。

- **問題: 認証失敗後に UI が表示されない**
  - **原因:** 認証タイプを選択後に認証が失敗すると、`security.auth.selectedType` 設定が `settings.json` に保存されたままになることがあります。再起動時に CLI が失敗した認証タイプで認証しようとして UI が表示されなくなる場合があります。
  - **解決策:** `settings.json` ファイルから `security.auth.selectedType` 設定項目を削除してください：
    - `~/.qwen/settings.json`（またはプロジェクト固有の設定の場合は `./.qwen/settings.json`）を開く
    - `security.auth.selectedType` フィールドを削除する
    - CLI を再起動して認証プロンプトを再表示させる

## よくある質問（FAQ）

- **Q: Qwen Code を最新バージョンに更新するにはどうすればよいですか？**
  - A: スタンドアロンインストーラーでインストールした場合は、スタンドアロンインストールコマンドを再実行してください。`npm` でグローバルインストールした場合は、`npm install -g @qwen-code/qwen-code@latest` コマンドで更新できます。ソースからビルドした場合は、リポジトリから最新の変更を pull し、`npm run build` コマンドで再ビルドしてください。

- **Q: Qwen Code の設定ファイルはどこに保存されますか？**
  - A: Qwen Code の設定は 2 つの `settings.json` ファイルに保存されます：
    1. ホームディレクトリ: `~/.qwen/settings.json`
    2. プロジェクトのルートディレクトリ: `./.qwen/settings.json`

    詳細は [Qwen Code Configuration](../configuration/settings) を参照してください。

- **Q: 統計出力にキャッシュされたトークン数が表示されないのはなぜですか？**
  - A: キャッシュされたトークン情報は、キャッシュトークンが実際に使用されている場合にのみ表示されます。この機能は API キーユーザー（例: Alibaba Cloud Model Studio API キーまたは Google Cloud Vertex AI）が利用できます。`/stats` コマンドで総トークン使用量は引き続き確認できます。

## よくあるエラーメッセージと解決策

- **エラー: MCP サーバー起動時の `EADDRINUSE`（Address already in use）**
  - **原因:** MCP サーバーがバインドしようとしているポートを別のプロセスがすでに使用しています。
  - **解決策:**
    そのポートを使用している別のプロセスを停止するか、MCP サーバーが別のポートを使用するよう設定してください。

- **エラー: コマンドが見つからない（`qwen` で Qwen Code を実行しようとした場合）**
  - **原因:** CLI が正しくインストールされていないか、システムの `PATH` に含まれていません。
  - **解決策:**
    インストール方法によって対応が異なります：
    - スタンドアロンインストーラーで `qwen` をインストールした場合は、スタンドアロンインストールコマンドを再実行し、新しいターミナルを開いてください。
    - グローバルインストールした場合は、`npm` のグローバルバイナリディレクトリが `PATH` に含まれているか確認してください。`npm install -g @qwen-code/qwen-code@latest` で更新できます。
    - ソースから `qwen` を実行している場合は、正しいコマンドで起動していることを確認してください（例: `node packages/cli/dist/index.js ...`）。更新するには、リポジトリから最新の変更を pull し、`npm run build` で再ビルドしてください。

- **エラー: `MODULE_NOT_FOUND` またはインポートエラー**
  - **原因:** 依存関係が正しくインストールされていないか、プロジェクトがビルドされていません。
  - **解決策:**
    1.  `npm install` を実行して全依存関係が揃っていることを確認する。
    2.  `npm run build` を実行してプロジェクトをコンパイルする。
    3.  `npm run start` でビルドが正常に完了したことを確認する。

- **エラー: "Operation not permitted"、"Permission denied"、またはそれに類するもの**
  - **原因:** サンドボックスが有効な場合、Qwen Code がサンドボックス設定によって制限されている操作（プロジェクトディレクトリやシステム一時ディレクトリ外への書き込みなど）を実行しようとすることがあります。
  - **解決策:** [Configuration: Sandboxing](../features/sandbox) のドキュメントを参照してください。サンドボックス設定のカスタマイズ方法も記載されています。

- **"CI" 環境で Qwen Code がインタラクティブモードで起動しない**
  - **問題:** `CI_` で始まる環境変数（例: `CI_TOKEN`）が設定されていると、Qwen Code はインタラクティブモードに入りません（プロンプトが表示されません）。これは、基盤となる UI フレームワークが使用する `is-in-ci` パッケージがこれらの変数を検出し、非インタラクティブな CI 環境と判断するためです。
  - **原因:** `is-in-ci` パッケージは `CI`、`CONTINUOUS_INTEGRATION`、または `CI_` プレフィックスを持つ環境変数の存在を確認します。これらのいずれかが見つかると、環境が非インタラクティブであると判断し、CLI のインタラクティブモードの起動を防ぎます。
  - **解決策:** CLI の動作に `CI_` プレフィックスの変数が不要な場合は、コマンド実行時に一時的にその変数を解除できます。例: `env -u CI_TOKEN qwen`

- **プロジェクトの .env ファイルから DEBUG モードが有効にならない**
  - **問題:** プロジェクトの `.env` ファイルに `DEBUG=true` を設定しても、CLI のデバッグモードが有効になりません。
  - **原因:** `DEBUG` および `DEBUG_MODE` 変数は、CLI の動作への干渉を防ぐため、プロジェクトの `.env` ファイルから自動的に除外されます。
  - **解決策:** 代わりに `.qwen/.env` ファイルを使用するか、`settings.json` の `advanced.excludedEnvVars` 設定を変更して除外する変数を減らしてください。

- **tmux でのトラックパッドスクロールがコンバセーションのスクロールではなくプロンプト履歴を変更してしまう**
  - **問題:** tmux セッション内でトラックパッドやホイールのスクロールが、`Up Arrow` や `Down Arrow` を押したときと同様に過去のプロンプトを循環してしまうことがあります。
  - **原因:** tmux がホイールのジェスチャーを通常の矢印キーシーケンスに変換することがあります。そのシーケンスは qwen-code が受け取る時点では実際の矢印キー操作と区別がつきません。
  - **解決策:** `ui.useTerminalBuffer` を有効にしてください。その後、`Shift+Up` / `Shift+Down`、または tmux がアプリにホイールイベントを転送している場合はマウスホイールを使用してください。ホストのスクロールバックを好む場合は、ホイールイベント用の tmux マウスバインディングを調整してください。

## IDE Companion が接続されない

- VS Code でワークスペースフォルダーが 1 つだけ開かれていることを確認してください。
- 拡張機能インストール後に統合ターミナルを再起動して、以下の変数を継承させてください：
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- コンテナ内で実行している場合は、`host.docker.internal` が解決できることを確認してください。解決できない場合は、ホストを適切にマッピングしてください。
- `/ide install` でコンパニオンを再インストールし、コマンドパレットから "Qwen Code: Run" を使用して正常に起動するか確認してください。

## 終了コード

Qwen Code は終了理由を示すための固有の終了コードを使用します。スクリプティングや自動化に特に役立ちます。

| 終了コード | エラータイプ               | 説明                                                                                        |
| --------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError` | 認証プロセス中にエラーが発生しました。                                                                |
| 42        | `FatalInputError`          | CLI に無効または欠落した入力が提供されました。（非インタラクティブモードのみ）                        |
| 44        | `FatalSandboxError`        | サンドボックス環境（例: Docker、Podman、または Seatbelt）でエラーが発生しました。                     |
| 52        | `FatalConfigError`         | 設定ファイル（`settings.json`）が無効またはエラーを含んでいます。                                    |
| 53        | `FatalTurnLimitedError`    | セッションの最大会話ターン数に達しました。（非インタラクティブモードのみ）                            |

## デバッグのヒント

- **CLI のデバッグ:**
  - CLI コマンドで `--verbose` フラグ（利用可能な場合）を使用して、より詳細な出力を確認します。
  - ユーザー固有の設定やキャッシュディレクトリにある CLI ログを確認します。

- **コアのデバッグ:**
  - エラーメッセージやスタックトレースをサーバーコンソール出力で確認します。
  - 設定可能な場合はログの詳細レベルを上げます。
  - サーバーサイドのコードをステップ実行する必要がある場合は、Node.js のデバッグツール（例: `node --inspect`）を使用します。

- **ツールの問題:**
  - 特定のツールが失敗している場合は、そのツールが実行するコマンドや操作の最もシンプルなバージョンを実行して問題を切り分けてみます。
  - `run_shell_command` の場合は、まずシェルで直接コマンドが動作することを確認します。
  - _ファイルシステムツール_ の場合は、パスが正しいことを確認し、パーミッションを確認します。

- **事前確認:**
  - コードをコミットする前に必ず `npm run preflight` を実行してください。フォーマット、リント、型エラーに関する多くの一般的な問題を事前に検出できます。

## 類似した GitHub Issue の検索または新規 Issue の作成

この _トラブルシューティングガイド_ で解決策が見つからない問題が発生した場合は、Qwen Code の [GitHub Issue トラッカー](https://github.com/QwenLM/qwen-code/issues) を検索することを検討してください。類似した Issue が見つからない場合は、詳細な説明とともに新しい GitHub Issue を作成することを検討してください。プルリクエストも歓迎しています！
