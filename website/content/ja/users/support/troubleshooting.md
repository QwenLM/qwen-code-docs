# トラブルシューティング

このガイドでは、一般的な問題の解決策とデバッグのヒントについて、以下のトピックを含めて説明します。

- 認証またはログインエラー
- よくある質問 (FAQ)
- デバッグのヒント
- 既存の GitHub Issues の検索または新しい Issue の作成

## 認証またはログインエラー

- **エラー: `Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **原因:** Qwen OAuth は 2026 年 4 月 15 日をもって利用できなくなりました。
  - **解決策:** 別の認証方法に切り替えてください。`qwen` → `/auth` を実行し、以下のいずれかを選択します。
    - **API Key**: Alibaba Cloud Model Studio の API key を使用します（[北京](https://bailian.console.aliyun.com/) / [国際](https://modelstudio.console.alibabacloud.com/)）。API セットアップガイド（[北京](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [国際](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)）を参照してください。
    - **Alibaba Cloud Coding Plan**: 月額固定料金でより多くのクォータを利用できるサブスクリプションです。Coding Plan ガイド（[北京](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [国際](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）を参照してください。

- **エラー: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`、`UNABLE_TO_VERIFY_LEAF_SIGNATURE`、または `unable to get local issuer certificate`**
  - **原因:** SSL/TLS トラフィックを傍受・検査するファイアウォールを備えた企業ネットワーク上にいる可能性があります。この場合、Node.js がカスタムルート CA 証明書を信頼するように設定する必要がよくあります。
  - **解決策:** `NODE_EXTRA_CA_CERTS` 環境変数に、企業ルート CA 証明書ファイルの絶対パスを設定します。
    - 例: `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **エラー: 自己署名エンドポイントに対する `Connection error. (cause: fetch failed)`**
  - **原因:** Qwen Code を自己ホスト型サーバー（例: `https://` 配下のローカルモデル）に向けており、その TLS 証明書が自己署名であるため、Node.js に拒否されています。
  - **解決策:** 上記の `NODE_EXTRA_CA_CERTS` を介して証明書を信頼させる方法を推奨します。信頼された研究所やプライベートネットワークでそれが現実的でない場合は、`--insecure` フラグ（または `QWEN_TLS_INSECURE=1`）を使用して検証をスキップします。
    - 例: `qwen --insecure --openaiBaseUrl https://192.168.1.10:8080 ...`
    - **警告:** 検証を無効にすると、中間者攻撃に対する保護が失われます。完全に信頼できるエンドポイントにのみ使用してください。

- **エラー: `Device authorization flow failed: fetch failed`**
  - **原因:** Node.js が Qwen OAuth エンドポイントに到達できませんでした（多くの場合、プロキシまたは SSL/TLS 信頼の問題です）。利用可能な場合、Qwen Code は根本的なエラーの原因も出力します（例: `UNABLE_TO_VERIFY_LEAF_SIGNATURE`）。注: このエラーはレガシーな Qwen OAuth フローに固有のものです。
  - **解決策:**
    - Qwen OAuth を引き続き使用している場合は、`/auth` を介して API Key または Coding Plan に切り替えてください。
    - プロキシを使用している場合は、`qwen --proxy <url>`（または `settings.json` の `proxy` 設定）で設定します。
    - ネットワークで企業 TLS 検査 CA を使用している場合は、上記のように `NODE_EXTRA_CA_CERTS` を設定します。

- **問題: 認証失敗後に UI が表示されない**
  - **原因:** 認証タイプを選択した後に認証が失敗すると、`security.auth.selectedType` 設定が `settings.json` に永続化される場合があります。再起動時、CLI は失敗した認証タイプで認証を試み続け、UI の表示に失敗する可能性があります。
  - **解決策:** `settings.json` ファイルの `security.auth.selectedType` 設定項目をクリアします。
    - `~/.qwen/settings.json`（プロジェクト固有の設定の場合は `./.qwen/settings.json`）を開きます。
    - `security.auth.selectedType` フィールドを削除します。
    - CLI を再起動して、再度認証を促すようにします。

## よくある質問 (FAQ)

- **Q: Qwen Code を最新バージョンに更新するにはどうすればよいですか？**
  - A: スタンドアロンインストーラーで Qwen Code をインストールした場合は、スタンドアロンインストールコマンドを再実行します。`npm` でグローバルにインストールした場合は、`npm install -g @qwen-code/qwen-code@latest` コマンドを使用して更新します。ソースからコンパイルした場合は、リポジトリから最新の変更をプルし、`npm run build` コマンドを使用して再ビルドします。

- **Q: Qwen Code の構成または設定ファイルはどこに保存されていますか？**
  - A: Qwen Code の構成は、2 つの `settings.json` ファイルに保存されます。
    1. ホームディレクトリ: `~/.qwen/settings.json`。
    2. プロジェクトのルートディレクトリ: `./.qwen/settings.json`。

    詳細については、[Qwen Code Configuration](../configuration/settings) を参照してください。

- **Q: stats 出力にキャッシュされたトークン数が表示されないのはなぜですか？**
  - A: キャッシュされたトークン情報は、キャッシュされたトークンが使用されている場合にのみ表示されます。この機能は API key ユーザー（例: Alibaba Cloud Model Studio API key または Google Cloud Vertex AI）で利用可能です。`/stats` コマンドを使用して、合計トークン使用量を確認することもできます。

- **Q: カスタマイズ（extension、hook、skill、MCP server、または subagent）が Qwen Code を壊しているようです。どのように切り分ければよいですか？**
  - A: `--safe-mode` フラグを付けて Qwen Code を起動し、セッション中のすべてのカスタマイズ（コンテキストファイル、hook、extension、skill、MCP server、カスタム subagent（組み込み subagent のみ読み込み）、権限ルール、設定由来の承認モードオーバーライド、メモリ機能、サンドボックス設定）を無効にします。注: CLI フラグ `--yolo` と `--approval-mode` はセーフモードでも有効のままです。セーフモードで問題が解消する場合は、カスタマイズを 1 つずつ再度有効にして、原因を特定します。
    - 例: `qwen --safe-mode`
    - 代替案: CLI がフラグを受け付けられない場合は、環境変数 `QWEN_CODE_SAFE_MODE=true` を設定します。

## 一般的なエラーメッセージと解決策

- **エラー: MCP server の起動時に `EADDRINUSE` (Address already in use) が発生する。**
  - **原因:** MCP server がバインドしようとしているポートを、別のプロセスがすでに使用しています。
  - **解決策:**
    ポートを使用している別のプロセスを停止するか、MCP server が異なるポートを使用するように構成します。

- **エラー: Command not found（`qwen` で Qwen Code を実行しようとした場合）。**
  - **原因:** CLI が正しくインストールされていないか、システムの `PATH` に含まれていません。
  - **解決策:**
    更新方法は、Qwen Code のインストール方法によって異なります。
    - `qwen` をスタンドアロンインストーラーでインストールした場合は、スタンドアロンインストールコマンドを再実行し、新しいターミナルを開きます。
    - `qwen` をグローバルにインストールした場合は、`npm` のグローバルバイナリディレクトリが `PATH` に含まれていることを確認します。`npm install -g @qwen-code/qwen-code@latest` コマンドを使用して更新できます。
    - ソースから `qwen` を実行している場合は、正しいコマンド（例: `node packages/cli/dist/index.js ...`）を使用して呼び出していることを確認します。更新するには、リポジトリから最新の変更をプルし、`npm run build` コマンドを使用して再ビルドします。

- **エラー: `MODULE_NOT_FOUND` またはインポートエラー。**
  - **原因:** 依存関係が正しくインストールされていないか、プロジェクトがビルドされていません。
  - **解決策:**
    1.  `npm install` を実行して、すべての依存関係が存在することを確認します。
    2.  `npm run build` を実行してプロジェクトをコンパイルします。
    3.  `npm run start` でビルドが正常に完了したことを確認します。

- **エラー: "Operation not permitted"、"Permission denied" など。**
  - **原因:** サンドボックスが有効になっている場合、Qwen Code はプロジェクトディレクトリやシステムの一時ディレクトリ外への書き込みなど、サンドボックス構成によって制限されている操作を試みる可能性があります。
  - **解決策:** サンドボックス構成のカスタマイズ方法など、詳細については [Configuration: Sandboxing](../features/sandbox) ドキュメントを参照してください。

- **"CI" 環境で Qwen Code がインタラクティブモードで実行されない**
  - **問題:** `CI_` で始まる環境変数（例: `CI_TOKEN`）が設定されていると、Qwen Code はインタラクティブモードに入りません（プロンプトが表示されません）。これは、基盤となる UI フレームワークで使用されている `is-in-ci` パッケージがこれらの変数を検出し、非インタラクティブな CI 環境であると想定するためです。
  - **原因:** `is-in-ci` パッケージは、`CI`、`CONTINUOUS_INTEGRATION`、または `CI_` プレフィックスを持つ環境変数の存在をチェックします。これらのいずれかが見つかった場合、環境が非インタラクティブであることを通知し、CLI がインタラクティブモードで起動するのを防ぎます。
  - **解決策:** CLI の動作に `CI_` プレフィックスの変数が必要ない場合は、コマンドに対して一時的に設定を解除できます。例: `env -u CI_TOKEN qwen`

- **プロジェクトの .env ファイルから DEBUG モードが機能しない**
  - **問題:** プロジェクトの `.env` ファイルで `DEBUG=true` を設定しても、CLI のデバッグモードは有効になりません。
  - **原因:** CLI の動作への干渉を防ぐため、`DEBUG` および `DEBUG_MODE` 変数はプロジェクトの `.env` ファイルから自動的に除外されます。
  - **解決策:** 代わりに `.qwen/.env` ファイルを使用するか、`settings.json` の `advanced.excludedEnvVars` 設定を構成して、除外される変数を減らします。

- **tmux でのトラックパッドスクロールが会話のスクロールではなくプロンプト履歴を変更する**
  - **問題:** tmux セッションでは、トラックパッドやホイールのスクロールが、`Up Arrow` または `Down Arrow` を押した場合と同様に、以前のプロンプトを循環させることがあります。
  - **原因:** tmux はホイールジェスチャを単純な矢印キーシーケンスに変換することがあります。qwen-code がそれらを受け取る時点では、実際の矢印キーの押下と区別が付きません。
  - **解決策:** `ui.useTerminalBuffer` を有効にします。その後、`Shift+Up` / `Shift+Down` を使用するか、tmux がホイールイベントをアプリに転送するときにマウスホイールを使用します。ホストのスクロールバックを優先する場合は、ホイールイベントに対する tmux のマウスバインディングを調整します。

## IDE Companion が接続されない

- VS Code で単一のワークスペースフォルダが開いていることを確認します。
- 拡張機能をインストールした後、統合ターミナルを再起動して、以下を継承させます。
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- コンテナ内で実行している場合は、`host.docker.internal` が解決されることを確認します。そうでない場合は、適切にホストをマッピングします。
- `/ide install` で companion を再インストールし、コマンドパレットで「Qwen Code: Run」を使用して起動することを確認します。

## 終了コード

Qwen Code は、終了の理由を示すために特定の終了コードを使用します。これは、スクリプティングや自動化に特に役立ちます。

| 終了コード | エラータイプ                 | 説明                                                                                         |
| --------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError` | 認証プロセス中にエラーが発生しました。                                                |
| 42        | `FatalInputError`          | CLI に無効または欠落した入力が提供されました（非インタラクティブモードのみ）。                       |
| 44        | `FatalSandboxError`        | サンドボックス環境（例: Docker、Podman、または Seatbelt）でエラーが発生しました。               |
| 52        | `FatalConfigError`         | 構成ファイル（`settings.json`）が無効であるか、エラーが含まれています。                               |
| 53        | `FatalTurnLimitedError`    | セッションの最大会話ターン数に達しました（非インタラクティブモードのみ）。 |

## デバッグのヒント

- **CLI デバッグ:**
  - CLI コマンドで `--verbose` フラグ（利用可能な場合）を使用して、より詳細な出力を得ます。
  - CLI ログを確認します。これは多くの場合、ユーザー固有の構成ディレクトリまたはキャッシュディレクトリにあります。

- **コアデバッグ:**
  - サーバーコンソール出力でエラーメッセージやスタックトレースを確認します。
  - 設定可能な場合は、ログの詳細度を上げます。
  - サーバーサイドコードをステップ実行する必要がある場合は、Node.js デバッグツール（例: `node --inspect`）を使用します。

- **ツールに関する問題:**
  - 特定のツールが失敗している場合は、そのツールが実行するコマンドや操作の可能な限りシンプルなバージョンを実行して、問題を切り分けてみてください。
  - `run_shell_command` の場合は、まずシェルで直接コマンドが機能することを確認します。
  - _ファイルシステムツール_ の場合は、パスが正しいことを確認し、権限をチェックします。

- **プレフライトチェック:**
  - コードをコミットする前に、常に `npm run preflight` を実行します。これにより、フォーマット、リンティング、および型エラーに関連する多くの一般的な問題を検出できます。

## 既存の GitHub Issues の検索または新しい Issue の作成

この _トラブルシューティングガイド_ でカバーされていない問題に遭遇した場合は、Qwen Code の [GitHub の Issue トラッカー](https://github.com/QwenLM/qwen-code/issues) を検索してみてください。類似の Issue が見つからない場合は、詳細な説明を含めた新しい GitHub Issue の作成を検討してください。プルリクエストも歓迎します！