# トラブルシューティング

本ガイドでは、一般的な問題の解決策とデバッグのヒントを提供します。対象となるトピックは以下の通りです：

- 認証またはログインエラー
- よくある質問（FAQ）
- デバッグのヒント
- 類似の既存 GitHub Issue の検索や、新規 Issue の作成

## 認証またはログインエラー

- **エラー: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`、`UNABLE_TO_VERIFY_LEAF_SIGNATURE`、または `unable to get local issuer certificate`**
  - **原因:** ファイアウォールが SSL/TLS トラフィックを傍受・検査している企業ネットワークに接続している可能性があります。この場合、Node.js がカスタムルート CA 証明書を信頼するように設定する必要があります。
  - **解決策:** 企業ルート CA 証明書ファイルの絶対パスを `NODE_EXTRA_CA_CERTS` 環境変数に設定します。
    - 例: `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **エラー: `Device authorization flow failed: fetch failed`**
  - **原因:** Node.js が Qwen OAuth エンドポイントに到達できませんでした（プロキシまたは SSL/TLS 信頼の問題であることが多いです）。利用可能な場合、Qwen Code は根本的なエラー原因も出力します（例: `UNABLE_TO_VERIFY_LEAF_SIGNATURE`）。
  - **解決策:**
    - 同じマシン/ネットワークから `https://chat.qwen.ai` にアクセスできるか確認します。
    - プロキシ環境下にいる場合は、`qwen --proxy <url>`（または `settings.json` の `proxy` 設定）で設定します。
    - ネットワークで企業 TLS 検査 CA を使用している場合は、上記の通り `NODE_EXTRA_CA_CERTS` を設定します。

- **問題: 認証失敗後に UI が表示されない**
  - **原因:** 認証タイプを選択した後に認証が失敗した場合、`security.auth.selectedType` 設定が `settings.json` に保存されたままになっている可能性があります。再起動時、CLI が失敗した認証タイプでの認証を試みてスタックし、UI の表示に失敗することがあります。
  - **解決策:** `settings.json` ファイルから `security.auth.selectedType` 設定項目を削除します：
    - `~/.qwen/settings.json`（プロジェクト固有の設定の場合は `./.qwen/settings.json`）を開きます
    - `security.auth.selectedType` フィールドを削除します
    - CLI を再起動し、再度認証プロンプトが表示されるようにします

## よくある質問（FAQ）

- **Q: Qwen Code を最新バージョンに更新するにはどうすればよいですか？**
  - A: `npm` でグローバルにインストールした場合は、`npm install -g @qwen-code/qwen-code@latest` コマンドで更新します。ソースからコンパイルした場合は、リポジトリから最新の変更を pull し、`npm run build` コマンドで再ビルドします。

- **Q: Qwen Code の設定ファイルはどこに保存されますか？**
  - A: Qwen Code の設定は、以下の 2 つの `settings.json` ファイルに保存されます：
    1. ホームディレクトリ: `~/.qwen/settings.json`
    2. プロジェクトのルートディレクトリ: `./.qwen/settings.json`

    詳細は [Qwen Code Configuration](../configuration/settings) を参照してください。

- **Q: stats 出力にキャッシュされたトークン数が表示されないのはなぜですか？**
  - A: キャッシュされたトークン情報は、キャッシュトークンが実際に使用されている場合のみ表示されます。この機能は API キーユーザー（Qwen API キーまたは Google Cloud Vertex AI）では利用できますが、OAuth ユーザー（Google Gmail や Google Workspace などの Google パーソナル/エンタープライズアカウント）では利用できません。これは、Qwen Code Assist API がキャッシュされたコンテンツの作成をサポートしていないためです。`/stats` コマンドを使用すれば、トークンの総使用量は引き続き確認できます。

## 一般的なエラーメッセージと解決策

- **エラー: MCP サーバー起動時の `EADDRINUSE`（Address already in use）**
  - **原因:** MCP サーバーがバインドしようとしているポートを、別のプロセスがすでに使用しています。
  - **解決策:**
    ポートを使用している別のプロセスを停止するか、MCP サーバーが別のポートを使用するように設定します。

- **エラー: Command not found（`qwen` で Qwen Code を実行しようとした場合）**
  - **原因:** CLI が正しくインストールされていないか、システムの `PATH` に含まれていません。
  - **解決策:**
    更新方法は Qwen Code のインストール方法によって異なります：
    - `qwen` をグローバルにインストールした場合は、`npm` のグローバルバイナリディレクトリが `PATH` に含まれているか確認します。`npm install -g @qwen-code/qwen-code@latest` コマンドで更新できます。
    - ソースから `qwen` を実行している場合は、正しい起動コマンドを使用しているか確認します（例: `node packages/cli/dist/index.js ...`）。更新するには、リポジトリから最新の変更を pull し、`npm run build` コマンドで再ビルドします。

- **エラー: `MODULE_NOT_FOUND` または import エラー**
  - **原因:** 依存関係が正しくインストールされていないか、プロジェクトがビルドされていません。
  - **解決策:**
    1. `npm install` を実行し、すべての依存関係がインストールされていることを確認します。
    2. `npm run build` を実行してプロジェクトをコンパイルします。
    3. `npm run start` でビルドが正常に完了したことを確認します。

- **エラー: "Operation not permitted"、"Permission denied" など**
  - **原因:** サンドボックスが有効な場合、Qwen Code がプロジェクトディレクトリやシステム一時ディレクトリ外への書き込みなど、サンドボックス設定で制限されている操作を試みることがあります。
  - **解決策:** サンドボックス設定のカスタマイズ方法を含む詳細については、[Configuration: Sandboxing](../features/sandbox) ドキュメントを参照してください。

- **"CI" 環境で Qwen Code がインタラクティブモードで実行されない**
  - **問題:** `CI_` で始まる環境変数（例: `CI_TOKEN`）が設定されている場合、Qwen Code はインタラクティブモードに入りません（プロンプトが表示されません）。これは、基盤となる UI フレームワークが使用する `is-in-ci` パッケージがこれらの変数を検出し、非インタラクティブな CI 環境であると判断するためです。
  - **原因:** `is-in-ci` パッケージは、`CI`、`CONTINUOUS_INTEGRATION`、または `CI_` プレフィックスを持つ環境変数の存在をチェックします。いずれかが検出されると、環境が非インタラクティブであると判断され、CLI がインタラクティブモードで起動するのを防ぎます。
  - **解決策:** CLI の動作に `CI_` プレフィックスの変数が必要ない場合は、コマンド実行時に一時的に解除できます。例: `env -u CI_TOKEN qwen`

- **プロジェクトの .env ファイルから DEBUG モードが有効にならない**
  - **問題:** プロジェクトの `.env` ファイルで `DEBUG=true` を設定しても、CLI のデバッグモードは有効になりません。
  - **原因:** CLI の動作への干渉を防ぐため、`DEBUG` および `DEBUG_MODE` 変数はプロジェクトの `.env` ファイルから自動的に除外されます。
  - **解決策:** 代わりに `.qwen/.env` ファイルを使用するか、`settings.json` の `advanced.excludedEnvVars` 設定を構成して除外する変数を減らします。

## IDE Companion が接続されない

- VS Code でワークスペースフォルダが 1 つだけ開かれていることを確認します。
- 拡張機能をインストールした後、統合ターミナルを再起動して以下の変数を継承させます：
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- コンテナ内で実行している場合は、`host.docker.internal` が解決されるか確認します。解決されない場合は、ホストを適切にマッピングします。
- `/ide install` でコンパニオンを再インストールし、コマンドパレットで「Qwen Code: Run」を使用して起動するか確認します。

## 終了コード

Qwen Code は、終了理由を示すために特定の終了コードを使用します。これはスクリプトや自動化において特に有用です。

| 終了コード | エラータイプ                 | 説明                                                                                         |
| --------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError` | 認証プロセス中にエラーが発生しました。                                                |
| 42        | `FatalInputError`          | CLI に無効な入力、または入力が提供されませんでした。（非インタラクティブモードのみ）                       |
| 44        | `FatalSandboxError`        | サンドボックス環境（例: Docker、Podman、または Seatbelt）でエラーが発生しました。               |
| 52        | `FatalConfigError`         | 設定ファイル（`settings.json`）が無効であるか、エラーを含んでいます。                               |
| 53        | `FatalTurnLimitedError`    | セッションの最大会話ターン数に達しました。（非インタラクティブモードのみ） |

## デバッグのヒント

- **CLI のデバッグ:**
  - CLI コマンドに `--verbose` フラグ（利用可能な場合）を付けて、より詳細な出力を取得します。
  - CLI ログを確認します。通常はユーザー固有の設定ディレクトリまたはキャッシュディレクトリにあります。

- **コアのデバッグ:**
  - サーバーのコンソール出力でエラーメッセージやスタックトレースを確認します。
  - 設定可能な場合は、ログの詳細度を上げます。
  - サーバーサイドのコードをステップ実行する必要がある場合は、Node.js デバッグツール（例: `node --inspect`）を使用します。

- **ツールの問題:**
  - 特定のツールが失敗する場合は、そのツールが実行するコマンドや操作の最も単純なバージョンを実行して、問題を切り分けます。
  - `run_shell_command` の場合は、まずコマンドがシェルで直接動作するか確認します。
  - _ファイルシステムツール_ の場合は、パスが正しいか確認し、権限をチェックします。

- **プリフライトチェック:**
  - コードをコミットする前に、必ず `npm run preflight` を実行します。これにより、フォーマット、リンティング、型エラーに関連する多くの一般的な問題を事前に検出できます。

## 類似の既存 GitHub Issue の検索や、新規 Issue の作成

この_トラブルシューティングガイド_でカバーされていない問題に遭遇した場合は、Qwen Code の [GitHub Issue トラッカー](https://github.com/QwenLM/qwen-code/issues) を検索することを検討してください。類似の Issue が見つからない場合は、詳細な説明を添えて新しい GitHub Issue を作成してください。Pull Request も歓迎します！