# トラブルシューティング

このガイドでは、一般的な問題の解決策とデバッグのヒントを提供します。以下のトピックを扱います。

- 認証またはログインエラー
- よくある質問（FAQ）
- デバッグのヒント
- 類似の既存の GitHub Issue、または新しい Issue の作成

## 認証またはログインエラー

- **エラー: `Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **原因:** Qwen OAuth は 2026 年 4 月 15 日をもって利用できなくなりました。
  - **解決策:** 別の認証方法に切り替えてください。`qwen` → `/auth` を実行し、以下のいずれかを選択します。
    - **API Key**: Alibaba Cloud Model Studio（[北京](https://bailian.console.aliyun.com/) / [海外](https://modelstudio.console.alibabacloud.com/)）の API キーを使用します。API 設定ガイド（[北京](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [海外](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)）を参照してください。
    - **Alibaba Cloud Coding Plan**: 一定の月額料金でより高い割り当てを提供するサブスクリプションです。Coding Plan ガイド（[北京](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [海外](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）を参照してください。

- **エラー: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`、`UNABLE_TO_VERIFY_LEAF_SIGNATURE`、または `unable to get local issuer certificate`**
  - **原因:** 企業ネットワーク上で、ファイアウォールが SSL/TLS トラフィックを傍受・検査している可能性があります。この場合、Node.js がカスタムルート CA 証明書を信頼するように設定する必要があります。
  - **解決策:** `NODE_EXTRA_CA_CERTS` 環境変数に、企業のルート CA 証明書ファイルの絶対パスを設定します。
    - 例: `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **エラー: `Device authorization flow failed: fetch failed`**
  - **原因:** Node.js が Qwen OAuth エンドポイントに到達できませんでした（多くの場合、プロキシまたは SSL/TLS 信頼の問題が原因です）。利用可能な場合、Qwen Code は根本的なエラー原因（例：`UNABLE_TO_VERIFY_LEAF_SIGNATURE`）も表示します。注意：このエラーはレガシーな Qwen OAuth フローに固有のものです。
  - **解決策:**
    - まだ Qwen OAuth を使用している場合は、`/auth` で API Key または Coding Plan に切り替えてください。
    - プロキシ環境下にある場合は、`qwen --proxy <url>` （または `settings.json` の `proxy` 設定）でプロキシを設定してください。
    - ネットワークが企業の TLS 検査 CA を使用している場合は、上記の説明に従って `NODE_EXTRA_CA_CERTS` を設定してください。

- **問題: 認証失敗後に UI が表示されない**
  - **原因:** 認証タイプを選択した後に認証に失敗した場合、`security.auth.selectedType` 設定が `settings.json` に保持されることがあります。再起動時に、CLI は失敗した認証タイプで認証を試み続け、UI が表示されなくなる可能性があります。
  - **解決策:** `settings.json` ファイルから `security.auth.selectedType` 設定項目を削除します。
    - `~/.qwen/settings.json`（またはプロジェクト固有の設定として `./.qwen/settings.json`）を開きます。
    - `security.auth.selectedType` フィールドを削除します。
    - CLI を再起動すると、認証の入力を再度求められるようになります。

## よくある質問（FAQ）

- **Q: Qwen Code を最新バージョンに更新するにはどうすればいいですか？**
  - A: スタンドアロンインストーラで Qwen Code をインストールした場合は、スタンドアロンインストールコマンドを再実行してください。`npm` でグローバルインストールした場合は、`npm install -g @qwen-code/qwen-code@latest` コマンドで更新してください。ソースからビルドした場合は、リポジトリから最新の変更をプルし、`npm run build` コマンドで再ビルドしてください。

- **Q: Qwen Code の設定ファイルはどこに保存されますか？**
  - A: Qwen Code の設定は、2 つの `settings.json` ファイルに保存されます。
    1. ホームディレクトリ: `~/.qwen/settings.json`
    2. プロジェクトのルートディレクトリ: `./.qwen/settings.json`
    
    詳細は [Qwen Code 設定](../configuration/settings) を参照してください。

- **Q: 統計出力にキャッシュされたトークン数が表示されないのはなぜですか？**
  - A: キャッシュされたトークン情報は、キャッシュされたトークンが使用されている場合にのみ表示されます。この機能は API キーユーザー（例：Alibaba Cloud Model Studio API キーや Google Cloud Vertex AI）が利用できます。トークンの総使用量は `/stats` コマンドで確認できます。

## よくあるエラーメッセージと解決策

- **エラー: MCP サーバー起動時の `EADDRINUSE`（Address already in use）**
  - **原因:** MCP サーバーがバインドしようとしているポートを別のプロセスが既に使用しています。
  - **解決策:**
    そのポートを使用している他のプロセスを停止するか、MCP サーバーを別のポートを使用するように設定してください。

- **エラー: コマンドが見つかりません（`qwen` で Qwen Code を実行しようとした場合）**
  - **原因:** CLI が正しくインストールされていないか、システムの `PATH` に含まれていません。
  - **解決策:**
    更新方法はインストール方法によって異なります。
    - スタンドアロンインストーラで `qwen` をインストールした場合は、スタンドアロンインストールコマンドを再実行し、新しいターミナルを開いてください。
    - `qwen` をグローバルインストールした場合は、`npm` のグローバルバイナリディレクトリが `PATH` に含まれていることを確認し、`npm install -g @qwen-code/qwen-code@latest` コマンドで更新できます。
    - ソースから `qwen` を実行している場合は、正しいコマンドで呼び出しているか確認してください（例：`node packages/cli/dist/index.js ...`）。更新するには、リポジトリから最新の変更をプルし、`npm run build` で再ビルドしてください。

- **エラー: `MODULE_NOT_FOUND` またはインポートエラー**
  - **原因:** 依存関係が正しくインストールされていないか、プロジェクトがビルドされていません。
  - **解決策:**
    1. `npm install` を実行してすべての依存関係が存在することを確認します。
    2. `npm run build` を実行してプロジェクトをビルドします。
    3. `npm run start` でビルドが成功したことを確認します。

- **エラー: "Operation not permitted"、"Permission denied" または類似のエラー**
  - **原因:** サンドボックスが有効な場合、Qwen Code がサンドボックス設定で制限された操作（プロジェクトディレクトリやシステムの一時ディレクトリ以外への書き込みなど）を実行しようとする可能性があります。
  - **解決策:** サンドボックス設定のカスタマイズ方法を含め、[設定：サンドボックス](../features/sandbox) のドキュメントを参照してください。

- **"CI" 環境で Qwen Code がインタラクティブモードで動作しない**
  - **問題:** `CI_` で始まる環境変数（例：`CI_TOKEN`）が設定されている場合、Qwen Code はインタラクティブモードに入りません（プロンプトが表示されません）。これは、基盤となる UI フレームワークが使用する `is-in-ci` パッケージがこれらの変数を検出し、非インタラクティブな CI 環境とみなすためです。
  - **原因:** `is-in-ci` パッケージは、`CI`、`CONTINUOUS_INTEGRATION`、または `CI_` プレフィックスを持つ任意の環境変数の存在をチェックします。これらのいずれかが見つかると、環境は非インタラクティブであると判断され、CLI がインタラクティブモードで起動しなくなります。
  - **解決策:** CLI の動作に `CI_` プレフィックスの変数が不要な場合は、コマンド実行時に一時的にその変数を解除できます。例: `env -u CI_TOKEN qwen`

- **プロジェクトの .env ファイルからの DEBUG モードが機能しない**
  - **問題:** プロジェクトの `.env` ファイルで `DEBUG=true` を設定しても、CLI のデバッグモードが有効になりません。
  - **原因:** CLI の動作への干渉を防ぐため、`DEBUG` および `DEBUG_MODE` 変数はプロジェクトの `.env` ファイルから自動的に除外されます。
  - **解決策:** 代わりに `.qwen/.env` ファイルを使用するか、`settings.json` の `advanced.excludedEnvVars` 設定で除外する変数を減らすように設定してください。

- **tmux でのトラックパッドスクロールが会話スクロールではなくプロンプト履歴を変更する**
  - **問題:** tmux セッション内では、トラックパッドやホイールスクロールが以前のプロンプトを循環させることがあり、`上矢印` や `下矢印` を押したのと同じ動作になります。
  - **原因:** tmux はホイールジェスチャを単純な矢印キーシーケンスに変換することがあります。これらのシーケンスは、qwen-code が受信する時点では実際の矢印キー押下と区別できません。
  - **解決策:** `ui.useTerminalBuffer` を有効にしてください。その後、`Shift+上` / `Shift+下` を使用するか、tmux がホイールイベントをアプリに転送する場合はマウスホイールを使用してください。ホストのスクロールバックを優先する場合は、tmux のマウスバインディングをホイールイベント用に調整してください。

## IDE Companion が接続しない

- VS Code で単一のワークスペースフォルダが開いていることを確認してください。
- 拡張機能インストール後、統合ターミナルを再起動して、以下の環境変数が継承されるようにしてください。
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- コンテナ内で実行している場合は、`host.docker.internal` が解決可能か確認してください。解決できない場合は、ホストを適切にマッピングしてください。
- `/ide install` で Companion を再インストールし、コマンドパレットで "Qwen Code: Run" を使用して起動を確認してください。

## 終了コード

Qwen Code は、終了理由を示す特定の終了コードを使用します。これはスクリプトや自動化で特に便利です。

| 終了コード | エラータイプ              | 説明                                                                   |
| --------- | ------------------------ | --------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError` | 認証処理中にエラーが発生しました。                                      |
| 42        | `FatalInputError`          | CLI に無効または欠落した入力が提供されました。（非インタラクティブモードのみ）  |
| 44        | `FatalSandboxError`        | サンドボックス環境（Docker、Podman、Seatbelt など）でエラーが発生しました。 |
| 52        | `FatalConfigError`         | 設定ファイル (`settings.json`) が無効か、エラーを含んでいます。           |
| 53        | `FatalTurnLimitedError`    | セッションの最大会話ターン数に達しました。（非インタラクティブモードのみ）    |

## デバッグのヒント

- **CLI のデバッグ:**
  - 利用可能な場合は、CLI コマンドに `--verbose` フラグを使用して、より詳細な出力を取得します。
  - CLI のログを確認します。多くの場合、ユーザー固有の構成ディレクトリまたはキャッシュディレクトリにあります。

- **コアのデバッグ:**
  - サーバーのコンソール出力でエラーメッセージやスタックトレースを確認します。
  - ログの冗長性を設定可能な場合は増やします。
  - Node.js のデバッグツール（例：`node --inspect`）を使用して、サーバーサイドのコードをステップ実行します。

- **ツールの問題:**
  - 特定のツールが失敗している場合は、ツールが実行するコマンドや操作の最も単純なバージョンを実行して問題を切り分けてみてください。
  - `run_shell_command` の場合、コマンドがシェルで直接動作するか確認してください。
  - ファイルシステムツールの場合、パスが正しいことと権限を確認してください。

- **事前チェック:**
  - コードをコミットする前に常に `npm run preflight` を実行してください。これにより、フォーマット、リンター、型エラーに関連する多くの一般的な問題を検出できます。

## 類似の既存の GitHub Issue、または新しい Issue の作成

このトラブルシューティングガイドでカバーされていない問題に遭遇した場合は、Qwen Code の [GitHub 上の Issue トラッカー](https://github.com/QwenLM/qwen-code/issues) を検索することを検討してください。類似の Issue が見つからない場合は、詳細な説明を含む新しい GitHub Issue を作成することを検討してください。プルリクエストも歓迎します！