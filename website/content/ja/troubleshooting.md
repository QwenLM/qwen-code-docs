# トラブルシューティングガイド

このガイドでは、以下のような一般的な問題への対処方法とデバッグのヒントを提供します：

- 認証またはログインエラー
- よくある質問（FAQs）
- デバッグのヒント
- あなたの問題に類似した既存の GitHub Issues、または新しい Issue の作成方法

## 認証またはログインエラー

- **エラー: `Failed to login. Message: Request contains an invalid argument`**
  - Gmail アカウントに関連付けられている Google Workspace アカウントまたは Google Cloud アカウントのユーザーは、Google Code Assist プランの無料ティアをアクティベートできない場合があります。
  - Google Cloud アカウントの場合、`GOOGLE_CLOUD_PROJECT` をプロジェクト ID に設定することで回避できます。
  - または、[Google AI Studio](http://aistudio.google.com/app/apikey) から Gemini API key を取得することもできます。こちらも別途無料ティアが用意されています。

- **エラー: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` または `unable to get local issuer certificate`**
  - **原因:** SSL/TLS 通信を傍受・検査するファイアウォールがある企業ネットワークにいる可能性があります。このような環境では、Node.js が信頼するカスタムルート CA 証明書が必要になることがよくあります。
  - **解決方法:** `NODE_EXTRA_CA_CERTS` 環境変数に、企業のルート CA 証明書ファイルの絶対パスを設定してください。
    - 例: `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

## よくある質問 (FAQ)

- **Q: Qwen Code を最新バージョンに更新するには？**
  - A: `npm` でグローバルにインストールした場合は、`npm install -g @qwen-code/qwen-code@latest` コマンドで更新してください。ソースからビルドした場合は、リポジトリから最新の変更を pull して、`npm run build` コマンドで再ビルドしてください。

- **Q: Qwen Code の設定ファイルや設定情報はどこに保存されますか？**
  - A: Qwen Code の設定は以下の2つの `settings.json` ファイルに保存されます：
    1. ホームディレクトリ内: `~/.qwen/settings.json`
    2. プロジェクトのルートディレクトリ内: `./.qwen/settings.json`

    詳細については [Qwen Code Configuration](./cli/configuration.md) を参照してください。

- **Q: なぜ統計出力にキャッシュされたトークン数が表示されないのですか？**
  - A: キャッシュされたトークン情報は、キャッシュされたトークンが使用されている場合にのみ表示されます。この機能は API キーのユーザー（Gemini API キーまたは Google Cloud Vertex AI）向けに提供されていますが、OAuth ユーザー（Google Gmail や Google Workspace などの Google 個人/エンタープライズアカウント）には提供されていません。これは、Gemini Code Assist API がキャッシュされたコンテンツの作成をサポートしていないためです。`/stats` コマンドを使用して、引き続き合計トークン使用量を確認できます。

## よくあるエラーメッセージと解決方法

- **エラー: MCP サーバー起動時に `EADDRINUSE` (Address already in use) が発生する**
  - **原因:** 別のプロセスが、MCP サーバーがバインドしようとしているポートをすでに使用しています。
  - **解決方法:**
    そのポートを使用している別のプロセスを停止するか、MCP サーバーが使用するポートを変更するように設定してください。

- **エラー: `qwen` コマンドで Qwen Code を実行しようとしたときに "Command not found" が表示される**
  - **原因:** CLI が正しくインストールされていないか、システムの `PATH` に含まれていません。
  - **解決方法:**
    Qwen Code のインストール方法に応じて対応してください：
    - `qwen` をグローバルにインストールした場合、`npm` のグローバルバイナリディレクトリが `PATH` に含まれていることを確認してください。更新はコマンド `npm install -g @qwen-code/qwen-code@latest` で行えます。
    - ソースコードから `qwen` を実行している場合、正しいコマンドで起動しているか確認してください（例: `node packages/cli/dist/index.js ...`）。更新するには、リポジトリから最新の変更を取得し、`npm run build` コマンドで再ビルドしてください。

- **エラー: `MODULE_NOT_FOUND` や import エラーが発生する**
  - **原因:** 依存関係が正しくインストールされていないか、プロジェクトがビルドされていません。
  - **解決方法:**
    1. `npm install` を実行して、すべての依存関係が揃っていることを確認してください。
    2. `npm run build` を実行して、プロジェクトをコンパイルしてください。
    3. `npm run start` を実行して、ビルドが正常に完了したことを確認してください。

- **エラー: "Operation not permitted"、"Permission denied" などの類似エラー**
  - **原因:** サンドボックスが有効な場合、Qwen Code がプロジェクトディレクトリやシステムの一時ディレクトリ以外に書き込もうとするなど、サンドボックス設定によって制限されている操作を試みることがあります。
  - **解決方法:** サンドボックス設定のカスタマイズ方法など詳細については、[Configuration: Sandboxing](./cli/configuration.md#sandboxing) のドキュメントを参照してください。

- **CI 環境で Qwen Code がインタラクティブモードで動作しない**
  - **問題:** `CI_` で始まる環境変数（例: `CI_TOKEN`）が設定されている場合、Qwen Code はインタラクティブモードに入らず（プロンプトが表示されない）、これは内部で使用している UI フレームワークが利用している `is-in-ci` パッケージが、CI 環境と判断するためです。
  - **原因:** `is-in-ci` パッケージは、`CI`、`CONTINUOUS_INTEGRATION`、または `CI_` プレフィックス付きの環境変数が存在するかどうかをチェックします。これらのいずれかが見つかると、環境が非インタラクティブであると判断され、CLI はインタラクティブモードで起動しません。
  - **解決方法:** CLI の動作に `CI_` プレフィックス付きの変数が必要でない場合、コマンド実行時に一時的にその変数を解除できます。例: `env -u CI_TOKEN qwen`

- **プロジェクトの .env ファイルから DEBUG モードが有効にならない**
  - **問題:** プロジェクトの `.env` ファイルに `DEBUG=true` を設定しても、CLI のデバッグモードが有効になりません。
  - **原因:** CLI の動作に干渉するのを防ぐため、`DEBUG` および `DEBUG_MODE` 変数はプロジェクトの `.env` ファイルから自動的に除外されます。
  - **解決方法:** 代わりに `.qwen/.env` ファイルを使用するか、`settings.json` の `excludedProjectEnvVars` 設定で除外する変数を減らすように設定してください。

## IDE Companion が接続されない

- VS Code で単一のワークスペースフォルダが開いていることを確認してください。
- 拡張機能をインストールした後、統合ターミナルを再起動して、以下の環境変数が継承されるようにしてください：
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- コンテナ内で実行している場合は、`host.docker.internal` が正しく解決されることを確認してください。そうでない場合は、適切にホストをマッピングしてください。
- `/ide install` で Companion を再インストールし、Command Palette で「Qwen Code: Run」を使用して、正しく起動するか確認してください。

## デバッグのヒント

- **CLI デバッグ:**
  - 詳細な出力が必要な場合は、CLI コマンドで `--verbose` フラグ（利用可能な場合）を使用してください。
  - CLI のログを確認してください。ログは多くの場合、ユーザー固有の設定ディレクトリやキャッシュディレクトリに保存されています。

- **Core デバッグ:**
  - サーバーのコンソール出力を確認し、エラーメッセージやスタックトレースがないかチェックしてください。
  - 設定可能な場合は、ログの詳細レベルを上げてください。
  - サーバーサイドのコードをステップ実行する必要がある場合は、Node.js のデバッグツール（例: `node --inspect`）を使用してください。

- **ツールの問題:**
  - 特定のツールが失敗する場合は、そのツールが実行するコマンドや操作を最もシンプルな形で実行し、問題を切り分けてみてください。
  - `run_shell_command` の場合は、まず直接シェルでコマンドが動作するか確認してください。
  - _ファイルシステムツール_ の場合は、パスが正しいことを確認し、パーミッションもチェックしてください。

- **プレフライトチェック:**
  - コードをコミットする前には、必ず `npm run preflight` を実行してください。これにより、フォーマット、リンティング、型エラーなど、多くの一般的な問題を事前に検出できます。

## 既存の GitHub Issues または新しい Issues の作成

ここで取り上げられていない問題に遭遇した場合は、Qwen Code の [GitHub の Issue トラッカー](https://github.com/QwenLM/qwen-code/issues) を検索してみてください。同様の問題が見つからない場合は、詳細な説明を添えて新しい GitHub Issue を作成することを検討してください。Pull Request も歓迎します！