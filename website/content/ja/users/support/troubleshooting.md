# トラブルシューティング

本ガイドでは、よくある問題の解決策とデバッグのヒントを提供します。主なトピックは以下の通りです：

- 認証またはログインエラー
- よくある質問（FAQ）
- デバッグのヒント
- 類似の GitHub Issue の検索と新規 Issue の作成

## 認証またはログインエラー

- **エラー: `Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **原因:** Qwen OAuth は 2026年4月15日をもって提供終了となりました。
  - **解決策:** 別の認証方法に切り替えてください。`qwen` を実行し、`/auth` コマンドを実行して、以下のいずれかを選択します：
    - **API Key**: Alibaba Cloud Model Studio の API key を使用します（[北京リージョン](https://bailian.console.aliyun.com/) / [国際版](https://modelstudio.console.alibabacloud.com/)）。API 設定ガイドも参照してください（[北京リージョン](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [国際版](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)）。
    - **Alibaba Cloud Coding Plan**: 固定月額料金でより高いクォータを利用できます。Coding Plan ガイドを参照してください（[北京リージョン](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [国際版](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）。

- **エラー: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`、`UNABLE_TO_VERIFY_LEAF_SIGNATURE`、または `unable to get local issuer certificate`**
  - **原因:** SSL/TLS トラフィックを傍受・検査するファイアウォールが設定された企業ネットワークに接続している可能性があります。この場合、Node.js がカスタムのルート CA 証明書を信頼するように設定する必要があります。
  - **解決策:** `NODE_EXTRA_CA_CERTS` 環境変数に、企業ルート CA 証明書ファイルの絶対パスを設定します。
    - 例: `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **エラー: `Device authorization flow failed: fetch failed`**
  - **原因:** Node.js が Qwen OAuth エンドポイントに到達できませんでした（プロキシ設定や SSL/TLS 信頼関係の問題である場合が多いです）。可能な場合、Qwen Code は根本的なエラー原因（例: `UNABLE_TO_VERIFY_LEAF_SIGNATURE`）も出力します。注: このエラーはレガシーな Qwen OAuth フローに固有のものです。
  - **解決策:**
    - Qwen OAuth を引き続き使用している場合は、`/auth` を介して API Key または Coding Plan に切り替えてください。
    - プロキシ環境下にいる場合は、`qwen --proxy <url>`（または `settings.json` の `proxy` 設定）で設定してください。
    - ネットワークで企業 TLS 検査 CA を使用している場合は、前述の通り `NODE_EXTRA_CA_CERTS` を設定してください。

- **問題: 認証失敗後に UI が表示されない**
  - **原因:** 認証タイプを選択した後に認証が失敗すると、`security.auth.selectedType` 設定が `settings.json` に保存されたままになる場合があります。再起動時、CLI が失敗した認証タイプでの認証を試みてスタックし、UI が表示されなくなることがあります。
  - **解決策:** `settings.json` ファイル内の `security.auth.selectedType` 設定項目をクリアしてください：
    - `~/.qwen/settings.json`（プロジェクト固有の設定の場合は `./.qwen/settings.json`）を開く
    - `security.auth.selectedType` フィールドを削除する
    - CLI を再起動し、再度認証プロンプトが表示されるようにする

## よくある質問（FAQ）

- **Q: Qwen Code を最新バージョンに更新するには？**
  - A: `npm` でグローバルにインストールした場合は、`npm install -g @qwen-code/qwen-code@latest` コマンドで更新します。ソースからコンパイルした場合は、リポジトリから最新の変更を pull し、`npm run build` コマンドで再ビルドしてください。

- **Q: Qwen Code の設定ファイルはどこに保存されますか？**
  - A: Qwen Code の設定は、以下の 2 つの `settings.json` ファイルに保存されます：
    1. ホームディレクトリ: `~/.qwen/settings.json`
    2. プロジェクトのルートディレクトリ: `./.qwen/settings.json`

    詳細は [Qwen Code Configuration](../configuration/settings) を参照してください。

- **Q: stats 出力にキャッシュされたトークン数が表示されないのはなぜですか？**
  - A: キャッシュされたトークン情報は、キャッシュトークンが実際に使用されている場合にのみ表示されます。この機能は API key ユーザー（例: Alibaba Cloud Model Studio API key または Google Cloud Vertex AI）で利用可能です。`/stats` コマンドを使用すれば、トークンの総使用量は引き続き確認できます。

## よくあるエラーメッセージと解決策

- **エラー: MCP サーバー起動時に `EADDRINUSE` (Address already in use)**
  - **原因:** MCP サーバーがバインドしようとしているポートを、別のプロセスがすでに使用しています。
  - **解決策:**
    ポートを使用している別のプロセスを停止するか、MCP サーバーが別のポートを使用するように設定してください。

- **エラー: Command not found（`qwen` で Qwen Code を実行しようとした場合）**
  - **原因:** CLI が正しくインストールされていないか、システムの `PATH` に含まれていません。
  - **解決策:**
    更新方法は Qwen Code のインストール方法によって異なります：
    - `qwen` をグローバルにインストールした場合は、`npm` のグローバルバイナリディレクトリが `PATH` に含まれているか確認してください。`npm install -g @qwen-code/qwen-code@latest` コマンドで更新できます。
    - ソースから `qwen` を実行している場合は、正しい起動コマンドを使用しているか確認してください（例: `node packages/cli/dist/index.js ...`）。更新するには、リポジトリから最新の変更を pull し、`npm run build` コマンドで再ビルドしてください。

- **エラー: `MODULE_NOT_FOUND` または import エラー**
  - **原因:** 依存関係が正しくインストールされていないか、プロジェクトがビルドされていません。
  - **解決策:**
    1. `npm install` を実行し、すべての依存関係がインストールされていることを確認します。
    2. `npm run build` を実行してプロジェクトをコンパイルします。
    3. `npm run start` でビルドが正常に完了したことを確認します。

- **エラー: "Operation not permitted"、"Permission denied" など**
  - **原因:** サンドボックスが有効な場合、Qwen Code がプロジェクトディレクトリやシステム一時ディレクトリ外への書き込みなど、サンドボックス設定で制限されている操作を試みる可能性があります。
  - **解決策:** サンドボックス設定のカスタマイズ方法など、詳細は [Configuration: Sandboxing](../features/sandbox) ドキュメントを参照してください。

- **Qwen Code が "CI" 環境でインタラクティブモードで実行されない**
  - **問題:** `CI_` で始まる環境変数（例: `CI_TOKEN`）が設定されている場合、Qwen Code はインタラクティブモードに入りません（プロンプトが表示されません）。これは、基盤の UI フレームワークが使用する `is-in-ci` パッケージがこれらの変数を検出し、非インタラクティブな CI 環境であると判断するためです。
  - **原因:** `is-in-ci` パッケージは、`CI`、`CONTINUOUS_INTEGRATION`、または `CI_` プレフィックスを持つ環境変数の存在をチェックします。いずれかが検出されると、環境が非インタラクティブであると判断され、CLI がインタラクティブモードで起動するのを防ぎます。
  - **解決策:** CLI の動作に `CI_` プレフィックスの変数が必要ない場合は、コマンド実行時に一時的に解除できます。例: `env -u CI_TOKEN qwen`

- **プロジェクトの .env ファイルから DEBUG モードが有効にならない**
  - **問題:** プロジェクトの `.env` ファイルで `DEBUG=true` を設定しても、CLI のデバッグモードが有効になりません。
  - **原因:** CLI の動作への干渉を防ぐため、`DEBUG` および `DEBUG_MODE` 変数はプロジェクトの `.env` ファイルから自動的に除外されます。
  - **解決策:** 代わりに `.qwen/.env` ファイルを使用するか、`settings.json` の `advanced.excludedEnvVars` 設定を調整して除外する変数を減らしてください。

## IDE Companion が接続されない

- VS Code でワークスペースフォルダが 1 つだけ開いていることを確認してください。
- 拡張機能をインストールした後、統合ターミナルを再起動して、以下の環境変数を継承させてください：
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- コンテナ内で実行している場合は、`host.docker.internal` が解決されるか確認してください。解決されない場合は、適切にホストをマッピングしてください。
- `/ide install` で Companion を再インストールし、コマンドパレットで「Qwen Code: Run」を実行して正常に起動するか確認してください。

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

- **ツールに関する問題:**
  - 特定のツールが失敗する場合は、そのツールが実行するコマンドや操作の最も単純なバージョンを実行して、問題を切り分けてみてください。
  - `run_shell_command` の場合は、まずシェル上で直接コマンドが動作するか確認してください。
  - _ファイルシステムツール_ の場合は、パスが正しいか確認し、権限をチェックしてください。

- **プリフライトチェック:**
  - コードをコミットする前に、必ず `npm run preflight` を実行してください。フォーマット、リンティング、型エラーに関連する多くの一般的な問題を事前に検出できます。

## 類似の GitHub Issue の検索と新規 Issue の作成

この _トラブルシューティングガイド_ でカバーされていない問題に遭遇した場合は、Qwen Code の [GitHub Issue トラッカー](https://github.com/QwenLM/qwen-code/issues) を検索してください。類似の Issue が見つからない場合は、詳細な説明を添えて新しい GitHub Issue を作成することを検討してください。Pull Request も歓迎します！