# Managed Agent リファレンスデプロイメント


Managed Agent リファレンス配布は実験的なものです。受け入れられる初期トポロジは、1つの信頼された Linux ホスト上で 1つの Java コントロールプレーンとその組み込み Runtime Broker、1つの MySQL データベース、そして 1つの互換性のある Qwen Hosted Harness です。各リリースの互換性マニフェストが、そのリリースに対して権限を持ちます。

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
- アーカイブの外部に保存された、安定したデータベース認証情報、Runtime 認証キー、および Harness トークン。

Java アーカイブには npm CLI が含まれていません。互換性のある正確な Qwen Code リビジョンを別途インストールまたはビルドし、Runtime ワーカー用にその `dist/cli.js` を配置します。

## Hosted Harness の起動

1つのトークンとケイパビリティダイジェストを選択し、Harness と Java サービスに同じ値を指定します。

```bash
export QWEN_MANAGED_AGENT_HARNESS_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_CAPABILITY_DIGEST='sha256:<64-hex-digest>'

QWEN_SERVER_TOKEN="$QWEN_MANAGED_AGENT_HARNESS_TOKEN" \
QWEN_HOSTED_HARNESS_CAPABILITY_DIGEST="$QWEN_MANAGED_AGENT_CAPABILITY_DIGEST" \
qwen serve --profile hosted-harness --port 4170 --hostname 127.0.0.1 --no-web
```

Harness をループバック上に保持します。レポートされるポートを記録します。要求されたポートが既に占有されている場合、`--port` は前進することがあります。

## Java コントロールプレーンの起動

別のターミナルで、同じ Harness とデータベースを設定します。

```bash
export SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:3306/qwen_managed_agent'
export SPRING_DATASOURCE_USERNAME='qwen'
export SPRING_DATASOURCE_PASSWORD='<private-password>'
export QWEN_MANAGED_AGENT_HARNESS_ENABLED='true'
export QWEN_MANAGED_AGENT_HARNESS_BASE_URL='http://127.0.0.1:4170'
export QWEN_MANAGED_AGENT_HARNESS_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_CAPABILITY_DIGEST='sha256:<64-hex-digest>'

bin/qwen-managed-agent-server
```

ランチャーはこのアーカイブ内のサーバー JAR を使用します。Spring Flyway は、サービスが準備完了になる前にフォワードデータベースマイグレーションを適用します。以下を待ちます。

```bash
curl --fail http://127.0.0.1:8080/actuator/health
```

この基本構成はテキストのみの Hosted Session をサポートします。署名付きまたは認証されたイングレスが設定されていない限り、リスナーをループバック上に保持します。完全な認証、API、およびケイパビリティ設定は `docs/server-reference.md` としてバンドルされています。

## 受け入れられたローカルプロセストーンパスの有効化

ツール実行には、既存の fail closed（失敗時は拒否） Runtime と ワークスペース 設定が必要です。最低限、以下を設定します。

```bash
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_ENABLED='true'
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY_ID='reference-v1'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY='<base64-encoded-32-byte-key>'
export QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY='/var/lib/qwen-managed-agent/runtime'
export QWEN_MANAGED_AGENT_NODE_EXECUTABLE='/usr/bin/node'
export QWEN_MANAGED_AGENT_RUNTIME_WORKER_ENTRY='/opt/qwen-code/dist/cli.js'
export QWEN_MANAGED_AGENT_WORKSPACE_ID='reference-workspace'
export QWEN_MANAGED_AGENT_WORKSPACE_CWD='/srv/qwen-workspace'
export QWEN_MANAGED_AGENT_RUNTIME_VERIFIED_WORKSPACE_RECOVERY_ENABLED='true'
```

ファイル、Shell、または子 Git ワークを受け入れる前に、`docs/server-reference.md` の「Verified physical Workspace recovery」で説明されているネイティブストレージ登録とマウントID検証を完了します。未登録または曖昧なマウントは利用できないままである必要があります。Public Shell と v2 ケイパビリティアドバタイズメントは、それぞれの個別 qualification が完了するまで無効のままです。

## アップグレード

1. 新しいアーカイブをダウンロードして検証し、両方のマニフェストを読みます。実行中のデプロイメントに触れる前に、新しい Qwen Code/Harness、Java、プロトコル、およびデータベースの要件を確認します。
2. 新しいイングレスを停止します。デプロイメントの既存の drain 手順に従って、受け入れられたワークが落ち着くのを待ちます。
3. MySQL、`QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY`、Runtime 認証キー、および正確な古い配布をバックアップします。アップグレード中に認証キーをローテーションしないでください。
4. Java サービスと Hosted Harness を停止します。ワークスペース と永続的な Runtime 状態を保持します。
5. マニフェスト互換の Qwen Code/Harness をインストールし、既存のトークンとケイパビリティダイジェストで起動します。
6. 同じデータベースと永続的な設定で新しい `bin/qwen-managed-agent-server` を起動します。Flyway がスキーマをフォワードマイグレーションします。
7. 正常な actuator レスポンスを要求し、既存の Session と履歴を読み取り、イングレスを再開する前に新しいツールなしの Turn を 1つ完了します。オプションのツールケイパビリティは、有効化する前に再 qualification します。

データベースのダウングレードはサポートされていません。トラフィックが再開される前に起動または検証が失敗した場合、設定を修正して同じアーティファクトを再試行します。マニフェストが古いスキーマ範囲を持つバージョンに戻るには、新しい書き込みを受け入れる前に、アップグレード前のデータベースと Runtime 状態のバックアップを一緒に復元します。移行されたデータベースに対して古いサーバーを決して想定で実行しないでください。

## オペレーターリカバリー

`bin/qwen-managed-agent-operator-recovery` は、別途パッケージ化されたリカバリーエントリーポイントを起動します。これは、リカバリー固有の環境が設定されていない限り無効であり、HTTP サービスやワーカーを起動しません。`docs/hosted-workspace-recovery.md` に従ってください。安全フェンスをクリアするために物理的停止を推測したり、永続的な行を削除したりしないでください。

## 範囲の境界

この配布は、複数の Java コントロールプレーン、クロスホストテイクオーバー、パブリック CSI、Kubernetes retirement、パブリック Shell、v2 アドバタイズメント、または安定した本番サポートを保証するものではありません。それらのケイパビリティには、別のリリースエビデンスが必要です。