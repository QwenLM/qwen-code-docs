# Managed Agent リファレンスデプロイメント


Managed Agent リファレンス配布は実験的なものです。受け入れられる初期トポロジは、1つの信頼された Linux ホスト上で 1つの Java コントロールプレーンとその組み込み Runtime Broker、1つの MySQL データベース、そして 1つの互換性のある Qwen Hosted Harness です。各リリースの互換性マニフェストが、そのリリースにおいて正式な情報源となります。

## 検証と展開

同じ GitHub プレリリースからアーカイブ、分離されたマニフェスト、および `SHA256SUMS.txt` をダウンロードします。展開前にそれらを検証します。

```bash
sha256sum --check SHA256SUMS.txt
tar -xzf qwen-managed-agent-reference-<version>.tar.gz
cd qwen-managed-agent-reference-<version>
sha256sum --check SHA256SUMS
```

`manifest.json` を検査します。`source.revision` がレビュー済みのリビジョンであること、`compatibility.qwenCodeVersion` が CLI/Harness のインストールと一致すること、および `compatibility.databaseSchema.latestMigrationVersion` がターゲットデータベースに対して受け入れ可能であることを確認します。チェックサムまたは互換性チェックのいずれかが失敗した場合、リリースは無効です。

## 前提条件

- 信頼されたアプリケーションホスト上の Linux。
- JDK 21 以降。
- `compatibility.node` に一致する Node.js と `compatibility.qwenCodeVersion` に一致する Qwen Code。
- MySQL 8 と、空のデータベース、または古い互換性のあるリファレンス配布によって以前に管理されていたデータベース。
- Runtime 状態および認可された ワークスペース 用のプライベートで永続的なディレクトリ。
- アーカイブの外部に保存された、安定したデータベース認証情報、Runtime 認証キーリング、および Harness トークン。

Java アーカイブには npm CLI が含まれていません。互換性のある正確な Qwen Code リビジョンを別途インストールまたはビルドし、Runtime ワーカー用にその `dist/cli.js` を特定します。

## Hosted Harness の起動

1つのトークンとケイパビリティダイジェストを選択し、Harness と Java サービスに同じ値を指定します。

```bash
export QWEN_MANAGED_AGENT_HARNESS_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_CAPABILITY_DIGEST='sha256:<64-hex-digest>'

QWEN_SERVER_TOKEN="$QWEN_MANAGED_AGENT_HARNESS_TOKEN" \
QWEN_HOSTED_HARNESS_CAPABILITY_DIGEST="$QWEN_MANAGED_AGENT_CAPABILITY_DIGEST" \
qwen serve --profile hosted-harness --port 4170 --hostname 127.0.0.1 --no-web
```

Harness をループバック上に保持します。レポートされるポートを記録します。要求されたポートが既に占有されている場合、`--port` はずれることがあります。

## Java コントロールプレーンの起動

別のターミナルで、同じ Harness、データベース、および既存の Workspace ディレクトリを設定します。

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

環境変数として表現できない設定（Runtime 認証キーリングなど）は `config/application.yml` に記述します。バンドルされたテンプレートから開始し、ファイルをプライベートに保ちます。

```bash
cp config/application.example.yml config/application.yml
chmod 600 config/application.yml
```

両方のランチャーは、そのファイルが存在する場合に自動的にロードします。ランチャーはこのアーカイブ内のサーバー JAR を使用します。Spring Flyway は、サービスが準備完了になる前にフォワードデータベースマイグレーションを適用します。以下を待ちます。

```bash
curl --fail http://127.0.0.1:8080/actuator/health
```

有効化された Harness は Managed Session Store をオンにします。Store のベース URL はデフォルトでこのサーバーのプレーンテキストループバックリスナーになります。その workspace ID はデフォルトで Runtime Broker が `QWEN_MANAGED_AGENT_WORKSPACE_CWD` から派生するものになるため、以下のツールパスが有効化されても ID は同じままになります。すでに `QWEN_MANAGED_AGENT_WORKSPACE_ID` を設定しているデプロイメントはそれを保持する必要があります。未バインドの Session はその ID から Store スコープを解決します。`QWEN_MANAGED_AGENT_SESSION_STORE_BASE_URL` は、Harness が別のアドレスを通じてこのサーバーに到達する場合、またはリスナーが TLS を提供する場合にのみ設定します。

この基本構成はテキストのみの Hosted Session をサポートします。署名付きまたは認証されたイングレスが設定されていない限り、リスナーをループバック上に保持します。完全な認証、API、およびケイパビリティ設定は `docs/server-reference.md` としてバンドルされています。

## 認証のブートストラップ

`bin/qwen-managed-agent-bootstrap` は、共有 Harness トークンとケイパビリティダイジェスト、broker トークン、Runtime 認証キーを生成します。モード 0600 で `config/harness.env`、`config/server.env`、`config/application.yml` を書き込み、`--force` が指定されない限り既存ファイルの上書きを拒否し、パスのみを出力します。

```bash
bin/qwen-managed-agent-bootstrap
```

トークンとダイジェストは `harness.env` にのみ書き込まれます。`server.env` は `QWEN_MANAGED_AGENT_HARNESS_CREDENTIALS_FILE` を通じてそのファイルを参照し、コントロールプレーンは両方の値をそこから読み取ります。そのファイルが `QWEN_MANAGED_AGENT_HARNESS_TOKEN` または `QWEN_MANAGED_AGENT_CAPABILITY_DIGEST` と同時に設定されている場合、起動を拒否するため、ローテーションでは 1つのファイルのみを変更します。生成された `harness.env` と `server.env` はシェルでソース可能であり、systemd の `EnvironmentFile` としても有効です。systemd レイアウト用に `--directory /etc/qwen-managed-agent` を渡し、`SPRING_DATASOURCE_PASSWORD` を入力し、所有権をサービスアカウントに調整します。

## 起動前チェック

初回起動前および各新しいアーティファクトのインストール後に、バンドルされたランチャーを `--check` で実行します。これは同じ設定（`config/application.yml` と環境変数）をバインドし、リスナーを起動せず、入力ごとに行を 1つ出力します。

```bash
bin/qwen-managed-agent-server --check
```

これは JDK、設定ファイルとそのパーミッション、認証キーリング、起動プロパティの検証、認証/バインドの組み合わせ、Harness の到達可能性、ワークスペース ファイルと Shell のクロス設定（マウント、作成ルートまたは SSH ノードの要件を含む）、broker 認証情報とディレクトリ、ワークスペース `cwd`、空きポート、MySQL 接続性、`performance_schema` グラント、および `manifest.json` に対する Flyway バージョンをカバーします。`WARN` と `SKIP` は失敗になりません。`FAIL` は終了コード 1 で終了します。ポートチェックは設定されたアドレスをバインドするため、事前にサービスを停止します。このコマンドは Harness ケイパビリティダイジェストまたはネイティブワークスペース ストレージ登録を検証しません。

## systemd

この配布には、受け入れられたシングルホストトポロジ用の `systemd/` ユニットと環境テンプレートが含まれています。コントロールプレーンユニットは `KillMode=process` を使用するため、Runtime ワーカーは Broker の再起動後も生存します。Harness ユニットは `KillMode=mixed` を使用するため、そのツールプロセスは Harness とともに終了します。それらをインストールするには `systemd/README.md` に従ってください。

## 受け入れられたローカルプロセスのツールパスの有効化

ツール実行には、既存の fail closed（失敗時は拒否） Runtime と ワークスペース 設定が必要です。最低限、以下を設定します。

```bash
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_ENABLED='true'
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY_ID='reference-v1'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY='<base64-encoded-32-byte-key>'
export QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY='/var/lib/qwen-managed-agent/runtime'
export QWEN_MANAGED_AGENT_NODE_EXECUTABLE='/usr/bin/node'
export QWEN_MANAGED_AGENT_RUNTIME_WORKER_ENTRY='/opt/qwen-code/dist/cli.js'
export QWEN_MANAGED_AGENT_RUNTIME_VERIFIED_WORKSPACE_RECOVERY_ENABLED='true'
```

ファイル、Shell、または子 Git ワークを受け入れる前に、`docs/server-reference.md` の「Verified physical Workspace recovery」で説明されているネイティブストレージ登録とマウントID検証を完了します。未登録または曖昧なマウントは利用できないままである必要があります。Public Shell の実行はデフォルトで無効のままです。Shell ライフサイクル v2 はデフォルトでアドバタイズされます。明示的なライフサイクルリストがデフォルトを置き換え、空のリストはそれを無効にします。MCP ライフサイクルには引き続き明示的な包含が必要です。ケイパビリティのアドバタイズメントはデプロイメントの適格性を確立するものではありません。

## アップグレード

1. 新しいアーカイブをダウンロードして検証し、両方のマニフェストを読みます。実行中のデプロイメントに触れる前に、新しい Qwen Code/Harness、Java、プロトコル、およびデータベースの要件を確認します。
2. 新しいイングレスを停止します。デプロイメントの既存の drain 手順に従って、受け入れられたワークが落ち着くのを待ちます。
3. MySQL、`QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY`、Runtime 認証キーリング全体、および正確な古い配布をバックアップします。アップグレード中に認証キーをローテーションしないでください。
4. Java サービスと Hosted Harness を停止します。ワークスペース と永続的な Runtime 状態を保持します。同梱のコントロールプレーンユニットは `KillMode=process` を使用するため、`systemctl stop` では Runtime ワーカーが実行中のままになります。新しいバージョンを起動する前に、`systemctl kill --kill-whom=all -s TERM qwen-managed-agent-server` でそれらを回収します。
5. マニフェスト互換の Qwen Code/Harness をインストールし、既存のトークンとケイパビリティダイジェストで起動します。
6. 同じデータベースと永続的な設定で新しい `bin/qwen-managed-agent-server` を起動します。Flyway がスキーマをフォワードマイグレーションします。
7. 正常な actuator レスポンスを要求し、既存の Session と履歴を読み取り、イングレスを再開する前に新しいツールなしの Turn を 1つ完了します。オプションのツールケイパビリティは、有効化する前に再審査します。

データベースのダウングレードはサポートされていません。トラフィックが再開される前に起動または検証が失敗した場合、設定を修正して同じアーティファクトを再試行します。マニフェストが古いスキーマ範囲を持つバージョンに戻るには、新しい書き込みを受け入れる前に、アップグレード前のデータベースと Runtime 状態のバックアップを一緒に復元します。移行されたデータベースに対して古いサーバーを決して想定で実行しないでください。

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