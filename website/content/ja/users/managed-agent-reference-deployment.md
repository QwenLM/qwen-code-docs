# Managed Agent リファレンスデプロイメント


Managed Agent リファレンス配布は実験的なものです。受け入れられる初期トポロジは、1つの信頼された Linux ホスト上で 1つの Java コントロールプレーンとその組み込み Runtime Broker、1つの MySQL データベース、そして 1つの互換性のある Qwen Hosted Harness です。各リリースの互換性マニフェストが、そのリリースにおいて正式な情報源となります。

## 階層の選択

各階層は前の階層に追加されます：

| 階層                         | 実行内容                                                                                | 追加内容                                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. テキストのみの Hosted Session | Java コントロールプレーン、1つの Hosted Harness と MySQL を 1つの信頼された Linux ホスト上で実行           | —                                                                                                                                               |
| 2. ローカルプロセスツール       | ワークスペース上の Hosted ツール（ファイルアクセスや、有効化時のフォアグラウンド Shell など） | 組み込み Runtime Broker、同じホスト上の Runtime ワーカー、Runtime 認証キー、Runtime 状態ディレクトリ、登録されたワークスペース |
| 3. Kubernetes                | クラスター内の API、Harness、MySQL                                              | ソースからビルドされたコンテナイメージ、Helm チャートでインストール、この配布の受け入れ範囲外                                   |

ツールが目標であっても階層 1 から開始します。ツールなしのターンを完了するセッションは、コントロールプレーン、Harness、モデル、データベースをまとめて証明し、その後階層 2 で同じデプロイメント上でツールを有効化します。

## Tier 1: テキストのみの Hosted Session

1つのコントロールプレーン、1つの Harness と MySQL を 1つのホスト上で。ステップは順に実行されます：アーカイブの検証、認証情報の生成、Harness の起動、設定の確認、コントロールプレーンの起動、そして最初のセッションの完了です。

### 検証と展開

同じ GitHub プレリリースからアーカイブ、分離されたマニフェスト、および `SHA256SUMS.txt` をダウンロードします。展開前にそれらを検証します。

```bash
sha256sum --check SHA256SUMS.txt
tar -xzf qwen-managed-agent-reference-<version>.tar.gz
cd qwen-managed-agent-reference-<version>
sha256sum --check SHA256SUMS
```

`manifest.json` を検査します。`source.revision` がレビュー済みのリビジョンであること、`compatibility.qwenCodeVersion` が CLI/Harness のインストールと一致すること、および `compatibility.databaseSchema.latestMigrationVersion` がターゲットデータベースに対して受け入れ可能であることを確認します。チェックサムまたは互換性チェックのいずれかが失敗した場合、リリースは無効です。

### 前提条件

- 信頼されたアプリケーションホスト上の Linux。
- JDK 21 以降。
- `compatibility.node` に一致する Node.js と `compatibility.qwenCodeVersion` に一致する Qwen Code。
- MySQL 8 と、空のデータベース、または古い互換性のあるリファレンス配布によって以前に管理されていたデータベース。
- Harness 用のモデルエンドポイント（OpenAI 互換のモデル ID と API キーなど）。
- プライベートで永続的な ワークスペース ディレクトリ、および Tier 2 の場合は Runtime 状態ディレクトリ。
- 安定したデータベース認証情報と Harness トークン、および Tier 2 の場合はアーカイブの外部に保存された Runtime 認証キーリング。

Java アーカイブには npm CLI が含まれていません。互換性のある正確な Qwen Code リビジョンを別途インストールまたはビルドしてください。Harness はそれを `qwen serve` として実行し、Tier 2 の Runtime ワーカーはその `dist/cli.js` を実行します。

### 認証情報のブートストラップ

`bin/qwen-managed-agent-bootstrap` は、共有 Harness トークンとケイパビリティダイジェスト、broker トークン、Runtime 認証キー、およびデータベースパスワードを生成します。モード 0600 で `config/harness.env`、`config/server.env`、`config/application.yml`、および `config/mysql-setup.sql` を書き込み、`--force` が指定されない限り既存ファイルの上書きを拒否し、パスのみを出力します。

```bash
bin/qwen-managed-agent-bootstrap
```

トークンとダイジェスト、およびツールパス用の Broker URL とトークンは `harness.env` にのみ書き込まれます。`server.env` は `QWEN_MANAGED_AGENT_HARNESS_CREDENTIALS_FILE` を通じてそのファイルを参照し、コントロールプレーンはそこからそれらを読み取ります。そのファイルが `QWEN_MANAGED_AGENT_HARNESS_TOKEN` または `QWEN_MANAGED_AGENT_CAPABILITY_DIGEST` と同時に設定されている場合、またはファイルの Broker トークンが `QWEN_MANAGED_AGENT_RUNTIME_BROKER_TOKEN` と同時に設定されている場合に起動を拒否するため、ローテーションでは 1つのファイルのみを変更します。生成された `harness.env` と `server.env` はシェルでソース可能であり、systemd の `EnvironmentFile` としても有効です。

`server.env` は `QWEN_MANAGED_AGENT_WORKSPACE_CWD` 内の `/srv/qwen-workspace` を ワークスペース ディレクトリとして指定します。それを作成するか、既存のディレクトリを指すように変数を設定します。Session Store はそのディレクトリから workspace ID を派生するため、セッションが存在するようになったらそれを保持します。

`mysql-setup.sql` は `qwen_managed_agent` データベースと、`server.env` が参照する `qwen` アカウントを `localhost` と `127.0.0.1` の両方に対して作成し、Flyway が必要とする `performance_schema` グラントを付与します。MySQL 管理者として一度だけ実行します（例: `mysql -u root < config/mysql-setup.sql`）。実行後に削除してください。`server.env` はパスワードを保持します。失敗する最初のステートメントで停止するため、既存のデータベースやアカウントを変更することはありません。コンテナ内の MySQL は `127.0.0.1` ではなくゲートウェイアドレスを参照します。そのホスト用にアカウントを作成してください。

systemd レイアウトの場合は、root として `--directory /etc/qwen-managed-agent --service-user qwen-managed-agent` を指定して実行します。そのアカウントが `harness.env` と `application.yml` を所有し、`server.env` は `0640 root:qwen-managed-agent`、新しいディレクトリは `0750 root:qwen-managed-agent` となり、`mysql-setup.sql` は root のままです。ブートストラップは存在しないアカウントやアカウントがアクセスできないディレクトリを拒否します。`server.env` は `QWEN_MANAGED_AGENT_SERVICE_USER` も記録するため、プレフライトはそのアカウントとしてファイルアクセスをチェックします（root として実行されている場合でも）。

### Hosted Harness の起動

`config/harness.env` を使用して Harness を起動します。これにはトークン、ケイパビリティダイジェスト、Broker ペア、および呼び出すモデルが保持されています。Qwen Code は `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` から OpenAI 互換プロバイダーを読み取ります。その他のプロバイダーについては[認証ガイド](https://github.com/QwenLM/qwen-code/blob/main/docs/users/configuration/auth.md)を参照してください。

```bash
set -a; . config/harness.env; set +a
export OPENAI_API_KEY='<model-api-key>'
export OPENAI_BASE_URL='https://<openai-compatible-endpoint>/v1'
export OPENAI_MODEL='<model-id>'
qwen serve --profile hosted-harness --port 4170 --hostname 127.0.0.1 --no-web
```

systemd レイアウトの場合は、3つのモデル変数を `harness.env` 内のプレーンな `KEY=value` 行として記述します。

Harness をループバック上に保持します。Hosted Harness プロファイルは別のポートに移動しません。`--port` が使用中の場合、Harness は起動に失敗し、そのポート名を出力します。

ブートストラップのファイルがない場合は、1つのトークンとケイパビリティダイジェストを選択し、Harness と Java コントロールプレーンに同じ値を指定します。

```bash
export QWEN_MANAGED_AGENT_HARNESS_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_CAPABILITY_DIGEST='sha256:<64-hex-digest>'

QWEN_SERVER_TOKEN="$QWEN_MANAGED_AGENT_HARNESS_TOKEN" \
QWEN_HOSTED_HARNESS_CAPABILITY_DIGEST="$QWEN_MANAGED_AGENT_CAPABILITY_DIGEST" \
qwen serve --profile hosted-harness --port 4170 --hostname 127.0.0.1 --no-web
```

### 起動前チェック

2つ目のターミナルで、`config/server.env` をロードするか、ブートストラップのファイルがない場合は以下のコントロールプレーンに記載されている変数をエクスポートします。Harness が実行されている状態で、初回起動前および各新しいアーティファクトのインストール後に、バンドルされたランチャーを `--check` で実行します。これはサーバーと同じ方法で設定を読み取るため、配布のルート、つまりサーバーの作業ディレクトリから実行します。`SPRING_CONFIG_ADDITIONAL_LOCATION` が指定するファイル、作業ディレクトリ内の `application.yml` と `config/application.yml`、それらがインポートするファイルとそのプロファイルバリアント、および環境変数です。systemd がサーバーを実行する場所では、代わりに `systemd/README.md` が示す方法で、ユニットのサンドボックス内で実行します。これにより `/home`、`/root`、`/run/user`、およびホストの `/tmp` と `/var/tmp` がサーバーから隠されます。チェックはリスナーを起動せず、入力ごとに行を 1つ出力します。読み取ったファイルごとに `config` 行、またはサーバーがそれらで起動できない理由を示す 1つだけの行を出力します。

```bash
set -a; . config/server.env; set +a
bin/qwen-managed-agent-server --check
```

これは JDK、サービスアカウント、各設定ファイルとそのパーミッション、またはそれらでサーバーが起動できない理由（存在しない名前付きファイル、サービスアカウントが読み取れないファイル、行番号付きの YAML エラー、および別のファイル内のインポートがそれを指していない限りそのファイル）、チェックが読み取れないまたは調べられないファイルまたはディレクトリ（サービスアカウントが読み取れる場合、そのアカウントとしてまたは root として実行するように指示）、認証キーリング、起動プロパティの検証、認証/バインドの組み合わせ、Harness、ワークスペース ファイルと Shell のクロス設定（マウント、作成ルートまたは SSH ノードの要件を含む）、broker 認証情報とディレクトリ、ワークスペース `cwd`、空きポート、以前の実行で残された存続中の Runtime ワーカー、および MySQL 接続性、`performance_schema` グラント、`manifest.json` に対する Flyway バージョンをカバーします。秘密を保持する設定ファイルでグループまたは他者が読み取れるものは `WARN` です。`WARN` と `SKIP` は失敗になりません。`FAIL` は終了コード 1 で終了します。

`harness` 行は最初のセッションと同じ方法で単一の設定済み Harness とネゴシエートします。Harness プールでは、Session Store がバインディングキーで有効化されるとプールのエンドポイントをスキップし、それまでは失敗します。ケイパビリティダイジェストが異なる場合、プロトコルまたは必須機能が不足している場合、または Harness が設定された ワークスペース プロファイルに必要なライフサイクルを持っていない場合に失敗します。Harness が `manifest.json` が指定するものとは異なる Qwen Code バージョンを実行している場合、またはどれを実行しているか示していない場合に警告します。ポートチェックはサーバーと同じ方法で設定されたアドレスをバインドするため、停止したサーバーが `TIME_WAIT` に残したポートは空きとしてカウントされ、`workers` 行は Runtime 状態ディレクトリにまだ実行中のワーカーについて警告するため、最初にサービスを停止します。実行中に `--online` を追加すると、ポート行は何かがリッスンしていることをチェックし、`workers` 行は停止したサーバーが残したワーカーのみを報告するか、それらを採用する永続的な Broker の場合はスキップされます。このコマンドはネイティブ ワークスペース ストレージ登録を検証しません。

初回起動前、データベースは空です。`database` 行はまだマイグレーションされていないとしてスキーマを報告し、`capacity` 行はテーブルが存在しないと警告します。初回起動時にそれらが作成され、その後両方の行がパスします。

`database` 行はデータベースの Flyway バージョンが `manifest.json` が指定するものより古い場合に警告します。これは、新しいリリースの初回起動前のアップグレードされたデータベースであり、それをマイグレーションします。データベースが新しい場合は失敗します。`manifest.json` が指定するバージョンでは、サーバーが起動時に行う方法でスキーマを検証し、データベースが一致しない場合は失敗します。実験的リリースがスキーマベースラインをインプレースで変更した場合などです。

### Java コントロールプレーンの起動

同じターミナルで、コントロールプレーンを起動します。

```bash
bin/qwen-managed-agent-server
```

ブートストラップのファイルがない場合は、同じ Harness、データベース、および既存の ワークスペース ディレクトリを設定します。

```bash
export SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:3306/qwen_managed_agent'
export SPRING_DATASOURCE_USERNAME='qwen'
export SPRING_DATASOURCE_PASSWORD='<private-password>'
export QWEN_MANAGED_AGENT_HARNESS_ENABLED='true'
export QWEN_MANAGED_AGENT_HARNESS_BASE_URL='http://127.0.0.1:4170'
export QWEN_MANAGED_AGENT_HARNESS_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_CAPABILITY_DIGEST='sha256:<64-hex-digest>'
export QWEN_MANAGED_AGENT_WORKSPACE_CWD='/srv/qwen-workspace'

bin/qwen-managed-agent-server
```

環境変数として表現できない設定（Runtime 認証キーリングなど）は `config/application.yml` に記述します。ブートストラップがそれを書き込みます。ない場合はバンドルされたテンプレートから開始し、ファイルをプライベートに保ちます。

```bash
cp config/application.example.yml config/application.yml
chmod 600 config/application.yml
```

両方のランチャーは、そのファイルが存在する場合に自動的にロードします。ランチャーはこのアーカイブ内のサーバー JAR を使用します。Spring Flyway は、サービスが準備完了になる前にフォワードデータベースマイグレーションを適用します。以下を待ちます。

```bash
curl --fail http://127.0.0.1:8080/actuator/health
```

有効化された Harness は Managed Session Store をオンにします。Store のベース URL はデフォルトでこのサーバーのプレーンテキストループバックリスナーになります。その workspace ID はデフォルトで Runtime Broker が `QWEN_MANAGED_AGENT_WORKSPACE_CWD` から派生するものになるため、Tier 2 がツールパスを有効化しても ID は同じままになります。すでに `QWEN_MANAGED_AGENT_WORKSPACE_ID` を設定しているデプロイメントはそれを保持する必要があります。未バインドのセッションはその ID から Store スコープを解決します。`QWEN_MANAGED_AGENT_SESSION_STORE_BASE_URL` は、Harness が別のアドレスを通じてこのサーバーに到達する場合、またはリスナーが TLS を提供する場合にのみ設定します。

この基本構成はテキストのみの Hosted Session をサポートします。署名付きまたは認証されたイングレスが設定されていない限り、リスナーをループバック上に保持します。すべての設定とその変数、デフォルトは[設定リファレンス](./managed-agent-configuration-reference.md)にリストされており、`docs/configuration.md` としてバンドルされています。完全な認証、API、およびケイパビリティ設定は `docs/server-reference.md` としてバンドルされています。

### 最初のセッションの実行

デフォルトのループバックリスナーでは、API は `X-Qwen-Tenant-Id` ヘッダーからテナントを取得します。最初のターンでモデルに質問をするセッションを作成します。

```bash
key="first-session-$(date +%s)"
curl --fail -X POST http://127.0.0.1:8080/v1/agents/sessions \
  -H 'X-Qwen-Tenant-Id: default' -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $key" \
  -d '{"agent_id":"qwen-code","input":[{"type":"input_text","text":"Say hello."}]}'
```

`Idempotency-Key` ヘッダーは必須です。各チェックに新しいキーを使用し、同じキーを再送信するのはそのリトライのみです。同じキーは別のセッションを作成するのではなく同じセッションを返すため、古いキーを使った後のチェックは古いセッションとその古い結果をリプレイします。レスポンスはセッションの `id` を持ちます。`after=0` から始めてイベントを読み取ります。

```bash
curl --fail -H 'X-Qwen-Tenant-Id: default' \
  'http://127.0.0.1:8080/v1/agents/sessions/<id>/events?after=<after>&limit=100'
```

ページは `sequence` 順で最大 `limit` 個のイベントを保持します。`after` を受信した最後のイベントの `sequence` に設定し、ページが空で返ってきた場合はそれを保持し、`"terminal": true` のイベントがあるまで再びポーリングします。

成功したターンは `turn.completed` で終了し、モデルの返信はその前の `item.output_text.delta` イベントの `text` です。終端の `turn.failed`、またはターンの期限までの none は、Harness またはモデルを指します。Harness ログが原因を特定します。このセッションはデプロイメントの最初の証明です。systemd レイアウトで `verify --turn` が行うように、アップグレードごとにそれを繰り返します。

### systemd





### systemd

この配布には、受け入れられたシングルホストトポロジ用の `systemd/` ユニットと環境テンプレートが含まれています。コントロールプレーンユニットは `KillMode=process` を使用するため、Runtime ワーカーは Broker の再起動後も生存します。Harness ユニットは `KillMode=mixed` を使用するため、そのツールプロセスは Harness とともに終了します。それらをインストールするには `systemd/README.md` に従ってください。

## Tier 2: ローカルプロセスツール

Tier 2 は動作する Tier 1 デプロイメントに Hosted ツールを追加します。組み込み Runtime Broker は Runtime ワーカー、つまりワークスペース上でツールを実行する同じホスト上の Node.js プロセスを配置します。ツール実行には、既存の fail closed Runtime と ワークスペース 設定が必要です。Tier 1 の設定に加えて、最低限、以下を設定します。

```bash
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_ENABLED='true'
# Omit when harness.env carries QWEN_MANAGED_RUNTIME_BROKER_TOKEN, as the bootstrap's does.
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY_ID='reference-v1'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY='<base64-encoded-32-byte-key>'
export QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY='/var/lib/qwen-managed-agent/runtime'
export QWEN_MANAGED_AGENT_NODE_EXECUTABLE='/usr/bin/node'
export QWEN_MANAGED_AGENT_RUNTIME_WORKER_ENTRY='/opt/qwen-code/dist/cli.js'
export QWEN_MANAGED_AGENT_RUNTIME_VERIFIED_WORKSPACE_RECOVERY_ENABLED='true'
```

Hosted Harness は、コマンドラインでも上記のコントロールプレーンの変数でもない、自身の環境を通じて同じ Broker に到達します。`QWEN_MANAGED_RUNTIME_BROKER_URL='http://127.0.0.1:4182'` と `QWEN_MANAGED_RUNTIME_BROKER_TOKEN` を `harness.env` の Broker トークン、または Harness を起動する任意の環境に設定します。`qwen serve` は読み取り後に両方を環境から削除するため、Harness が起動するプロセスはトークンを継承せず、コントロールプレーンは `QWEN_MANAGED_RUNTIME_BROKER_` 変数を Runtime ワーカーから除外します。ブートストラップのファイルでは、`harness.env` がすでに両方を保持しており、コントロールプレーンはそのファイルから Broker トークンを取得するため、`QWEN_MANAGED_AGENT_RUNTIME_BROKER_TOKEN` は未設定のままにします。両方を設定すると起動が拒否されます。2つの Harness 行は一緒に設定するか、まったく設定しないかのいずれかであり、それぞれプレーンな `KEY=value` 行として記述します。起動は、どちらか一方のみが含まれる行、どちらかが空の行、systemd が無視する `export KEY=value` のような行を含むファイルを拒否します。Harness も同様に拒否します。プレフライトの `broker-url` 行は Harness の URL パーサーと同じ方法でファイルの URL を読み取るため、`http://127.1:4182` は `http://127.0.0.1:4182` としてカウントされます。その URL が Broker 自身の `http` 上のリスナーを参照している場合にパスします。Harness が URL を拒否する場合（`http` または `https` オリジンである必要があり、プレーンな `http` はループバックインターフェースでのみ使用可能）、および `https` 上のリスナーを参照している場合（プレーン HTTP の Broker は受け入れ不可）に失敗します。URL が別のアドレスまたはポートを参照している場合に警告します。これはプロキシのみがフォワードできます。ループバック外の特定のアドレスにバインドされた Broker（`QWEN_MANAGED_AGENT_RUNTIME_BROKER_ALLOW_NON_LOOPBACK=true` が必要）は常にその方法で到達されます。`0.0.0.0` にバインドされた Broker もその設定が必要ですが、ループバックも提供するため、Harness は `http://127.0.0.1:4182` で直接ダイヤルし、行はパスします。`http://[::1]:4182` のような IPv6 URL はそこで警告します。そのバインドはコントロールプレーンの JVM が両方のファミリーでリッスンしている場合にのみ IPv6 を取りますが、`-Djava.net.preferIPv4Stack=true` の下ではそうではないためです。ファイルに Broker URL がない場合にも警告します。これは、自身の環境またはコマンドラインを通じてペアを与えられた Harness がプレフライトに表示するものです。そこでは警告は予想されており、ペアをファイルに移動するには `server.env` から `QWEN_MANAGED_AGENT_RUNTIME_BROKER_TOKEN` を削除することを意味します。

ファイル、Shell、または子 Git ワークを受け入れる前に、`docs/server-reference.md` の「Verified physical Workspace recovery」で説明されているネイティブストレージ登録とマウントID検証を完了します。未登録または曖昧なマウントは利用できないままである必要があります。Public Shell の実行はデフォルトで無効のままです。Shell ライフサイクル v2 はデフォルトでアドバタイズされます。明示的なライフサイクルリストがデフォルトを置き換え、空のリストはそれを無効にします。MCP ライフサイクルには引き続き明示的な包含が必要です。ケイパビリティのアドバタイズメントはデプロイメントの適格性を確立するものではありません。

## Tier 3: Kubernetes

[Helm チャート](https://github.com/QwenLM/qwen-code/tree/main/deploy/kubernetes)は、レビュー済みのソースリビジョンでビルドしたイメージから、署名付き Managed Agent API とプライベート Hosted Harness を 1つの Pod に、MySQL 8.4 を永続ボリューム上にインストールします。デフォルトではテキストセッションを実行し、オプションの設定で信頼されたシングルノードの ワークスペース ファイルとフォアグラウンド Shell、および Managed WebShell ゲートウェイを追加します。これはアーカイブからではなくソースからインストールされ、独自のガイドに従い、この配布の受け入れ範囲を拡張しません。K2 CSI 常駐ワークスペースは別のデプロイメントであり、[`deploy/k2-resident`](https://github.com/QwenLM/qwen-code/tree/main/deploy/k2-resident) で説明されています。

## アップグレード

1. 新しいアーカイブをダウンロードして検証し、両方のマニフェストを読みます。実行中のデプロイメントに触れる前に、新しい Qwen Code/Harness、Java、プロトコル、およびデータベースの要件を確認します。
2. 新しいイングレスを停止します。デプロイメントの既存の drain 手順に従って、受け入れられたワークが落ち着くのを待ちます。
3. MySQL、`QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY`、Runtime 認証キーリング全体、オペレーターが所有する `server.env` と `harness.env`、および正確な古い配布をバックアップします。アップグレード中に認証キーをローテーションしないでください。
4. Java サービスと Hosted Harness を停止します。ワークスペース と永続的な Runtime 状態を保持します。同梱のコントロールプレーンユニットは `KillMode=process` を使用するため、`systemctl stop` では Runtime ワーカーが実行中のままになります。新しいバージョンを起動する前に、`systemctl kill --kill-whom=all -s TERM qwen-managed-agent-server` でそれらを回収します。
5. マニフェスト互換の Qwen Code/Harness をインストールし、既存のトークンとケイパビリティダイジェストで起動します。ツールパスホストでは、まず `harness.env` の `QWEN_HOSTED_HARNESS_BROKER_ARGS` 行を `QWEN_MANAGED_RUNTIME_BROKER_URL` と `QWEN_MANAGED_RUNTIME_BROKER_TOKEN` で置き換えます。その行を読むものはもういないため、これらがないと Harness は Broker なしで起動します。`server.env` が Harness を有効にし、`harness.env` を認証情報ファイルとして参照している場合（ブートストラップのファイルと同様）、`server.env` から `QWEN_MANAGED_AGENT_RUNTIME_BROKER_TOKEN` も削除します。コントロールプレーンは `harness.env` からトークンを取得し、両方のコピーを保持すると起動が拒否されます。以前の配布は新しい行のどちらも読まず、削除されたトークンなしで Broker を起動することを拒否するため、そこへのロールバックはステップ 3 のバックアップから両方のファイルを復元します。
6. 同じデータベースと永続的な設定で新しい `bin/qwen-managed-agent-server` を起動します。Flyway がスキーマをフォワードマイグレーションします。
7. 正常な actuator レスポンスを要求し、既存の Session と履歴を読み取り、イングレスを再開する前に新しいツールなしの Turn を 1つ完了します。オプションのツールケイパビリティは、有効化する前に再審査します。

データベースのダウングレードはサポートされていません。トラフィックが再開される前に起動または検証が失敗した場合、設定を修正して同じアーティファクトを再試行します。マニフェストが古いスキーマ範囲を持つバージョンに戻るには、新しい書き込みを受け入れる前に、アップグレード前のデータベースと Runtime 状態のバックアップを一緒に復元します。移行されたデータベースに対して古いサーバーを決して想定で実行しないでください。以前の配布への復帰は、同じバックアップから `server.env` と `harness.env` も復元します。ステップ 5 がそれらを新しいバージョン用に書き換えるためです。

## Runtime 認証キーのローテーション

配布のアップグレードとは別に認証キーをローテーションします。データベースと現在のキーをバックアップし、新しいアクティブなペアを設定して、古いペアを `previous-credential-keys` の下に保持します。

```yaml
qwen:
  managed-agent:
    runtime-broker:
      credential-key-id: reference-v2
      credential-key: <base64-encoded-32-byte-v2-key>
      previous-credential-keys:
        '[reference-v1]': <base64-encoded-32-byte-v1-key>
```

すべてのマップキーを `[ ... ]` で囲みます。Spring の relaxed binder はプレーンなキーを正規化します — `legacy/v1`、`legacy:v1`、`legacy v1` などの ID は、YAML で引用符で囲まれているかどうかに関係なく `legacyv1` としてバインドされます — そのため、キーリングは永続化されたキー ID と決して一致せず、その ID で書き込まれた行はキーが設定されていても読み取り不能なままになります。ブラケット形式は正確な ID を保持します。

単一の Java コントロールプレーンを再起動し、既存のバインディングがロードされることを確認し、新しいバインディング行に `reference-v2` が記録されることを確認します。新しいシークレットはアクティブなキーのみを使用します。古い行は記録されたキー ID の下で暗号化されたままです。サーバーは読み取り時に古い行を再暗号化せず、まだ参照されているキーを削除すると、それらの行が読み取り不能になります。

`reference-v1` の廃止は、永続化された行がそれを参照しなくなった時点でのみ行います。`ma_runtime_binding.credential_key_id` と `ma_runtime_binding.runtime_credential_key_id` が唯一の永続化された参照であり、両方とも UTF-8 バイトを格納します。`CONVERT` なしでそれらを選択します。これにより、キー選択と同じ方法で、デデュプリケーションがバイト単位で正確に保たれます。変換された値は文字セットのデフォルトの照合順序を持ち、大文字と小文字またはアクセントのみが異なる 2 つの ID をマージして、行がまだ参照しているキーを隠してしまう可能性があります。

```sql
SELECT DISTINCT credential_key_id AS key_id
FROM ma_runtime_binding WHERE credential_key_id IS NOT NULL
UNION
SELECT DISTINCT runtime_credential_key_id AS key_id
FROM ma_runtime_binding WHERE runtime_credential_key_id IS NOT NULL;
```

結果は、永続化された行がまだ必要としているキー ID を一覧表示します。アクティブな ID (`reference-v2`) のみを期待します。`reference-v1` が表示されている間、そのキーは設定されたままにする必要があります。

キーリングはマップであり、`QWEN_MANAGED_AGENT_*` 環境変数を通じて提供することはできません。relaxed binding は環境変数形式を空または誤ったキーのリングにサイレントに解決し、起動エラーは発生しません。`previous-credential-keys` は `config/application.yml` で設定します。この配布には `config/application.example.yml` が同梱されており、両方のランチャーはそのファイルが存在する場合に `SPRING_CONFIG_ADDITIONAL_LOCATION=file:<distribution-root>/config/application.yml` をエクスポートするため、場所はプロセスの作業ディレクトリに依存せず、コマンドの位置引数にオプションが追加されることもありません。変数が既に設定されている場合、ランチャーは代わりにそれを有効にします。環境変数のみに依存するデプロイメントは空のリングで起動するため、前のキーの設定なしに `credential-key-id` をローテーションすると、その ID で書き込まれた行が読み取り不能になります。明示的な `--spring.config.additional-location` コマンドライン引数はこの環境変数のデフォルトより優先されます。両方が存在する場合、コマンドラインの値が勝ち、バンドルされた `config/application.yml` はロードされません。

オペレーターリカバリーエントリーは、サーバーと同じアクティブなペアと `previous-credential-keys` マップを読み取ります。そのランチャーも同じ方法で `config/application.yml` をロードします。ファイルが別の場所にある場合は、`SPRING_CONFIG_ADDITIONAL_LOCATION=file:<absolute-path>/application.yml` を設定します。バインディングでまだ参照されているすべてのキーを保持しつつ、新しいキーをアクティブなままにします。CSI/マイグレーションメンテナンスメイン（CSI Hosted プローブを含む）は引き続き単一の認証キーペアを読み取ります。それらのエントリーを起動する際は、ターゲットのバインディングを暗号化したキーをアクティブなペアとして使用します。

キーリングの設定が成功した後、サーバーとリカバリーエントリーは、プロテクターインスタンスごとに 1回、解決されたアクティブ ID と設定済み ID をログに出力します。これらの ID は ciphertext の傍らに既に保存されている非秘密の識別子です。診断では非 ASCII 文字と制御文字を JSON エスケープし、スペースと大文字小文字を保持しますが、キーマテリアル、ciphertext、トークンは決して含まれません。設定済み ID を廃止クエリが返す正確な ID と比較してから、ローテーション済みのデプロイメントを使用します。利用不可キーのエラーは、要求された ID、アクティブな ID、および設定済み ID を表示するため、サイレントに正規化されたマップやタイプミスのあるマップを秘密を露呈させることなく特定できます。この診断は、保存済みのすべての行を復号できることを証明するものではありません。

## オペレーターリカバリー

`bin/qwen-managed-agent-operator-recovery` は、別途パッケージ化されたリカバリーエントリーポイントを起動します。これは、リカバリー固有の環境が設定されていない限り無効であり、HTTP サービスやワーカーを起動しません。`docs/hosted-workspace-recovery.md` に従ってください。安全フェンスをクリアするために物理的停止を推測したり、永続的な行を削除したりしないでください。

## 範囲の境界

この配布は、複数の Java コントロールプレーン、クロスホストテイクオーバー、パブリック CSI、Kubernetes retirement、パブリック Shell、v2 アドバタイズメント、または安定した本番サポートを保証するものではありません。それらのケイパビリティには、別のリリースエビデンスが必要です。