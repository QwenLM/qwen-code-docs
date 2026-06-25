# サンドボックス

このドキュメントでは、ツールがシェルコマンドを実行したりファイルを変更したりする際のリスクを低減するために、Qwen Code をサンドボックス内で実行する方法を説明します。

## 前提条件

サンドボックスを使用する前に、Qwen Code をインストールしてセットアップする必要があります：

```bash
npm install -g @qwen-code/qwen-code
```

インストールの確認：

```bash
qwen --version
```

## サンドボックスの概要

サンドボックスは、シェルコマンドやファイル変更などの潜在的に危険な操作をホストシステムから分離し、CLI と環境の間にセキュリティバリアを提供します。

サンドボックスの利点：

- **セキュリティ**: システムへの意図しない損害やデータ損失を防ぐ。
- **分離**: ファイルシステムへのアクセスをプロジェクトディレクトリに限定する。
- **一貫性**: 異なるシステム間で再現可能な環境を確保する。
- **安全性**: 信頼されていないコードや実験的なコマンドを扱う際のリスクを低減する。

> [!note]
>
> **命名に関する注記:** 一部のサンドボックス関連の環境変数は、過去に `GEMINI_*` プレフィックスを使用していた場合があります。新しい環境変数はすべて `QWEN_*` プレフィックスを使用します。

## サンドボックスの方式

最適なサンドボックス方式は、プラットフォームと好みのコンテナソリューションによって異なります。

### 1. macOS Seatbelt（macOS のみ）

`sandbox-exec` を使用した軽量な組み込みサンドボックス。

**デフォルトプロファイル**: `permissive-open` - プロジェクトディレクトリ外への書き込みを制限しますが、ほとんどの操作とアウトバウンドネットワークアクセスは許可します。

**適している場面**: Docker 不要で高速、ファイル書き込みに対する強力なガードレール。

### 2. コンテナベース（Docker/Podman）

完全なプロセス分離によるクロスプラットフォームサンドボックス。

デフォルトでは、Qwen Code は（CLI パッケージで設定された）公開済みサンドボックスイメージを使用し、必要に応じてプルします。

コンテナサンドボックスは、認証と設定を実行間で維持できるよう、ワークスペースと `~/.qwen` ディレクトリをコンテナにマウントします。

**適している場面**: 任意の OS での強力な分離、既知のイメージ内での一貫したツール環境。

### 方式の選択

- **macOS の場合**:
  - 軽量なサンドボックスが必要な場合は Seatbelt を使用します（ほとんどのユーザーに推奨）。
  - 完全な Linux ユーザーランドが必要な場合（例：Linux バイナリを必要とするツール）は Docker/Podman を使用します。
- **Linux/Windows の場合**:
  - Docker または Podman を使用します。

## クイックスタート

```bash
# コマンドフラグでサンドボックスを有効化
qwen -s -p "analyze the code structure"

# またはシェルセッションでサンドボックスを有効化（CI/スクリプトに推奨）
export QWEN_SANDBOX=true   # true は自動的にプロバイダーを選択（以下の注記を参照）
qwen -p "run the test suite"

# settings.json で設定
{
  "tools": {
    "sandbox": true
  }
}
```

> [!tip]
>
> **プロバイダー選択の注記:**
>
> - **macOS** では、`QWEN_SANDBOX=true` は利用可能な場合に通常 `sandbox-exec`（Seatbelt）を選択します。
> - **Linux/Windows** では、`QWEN_SANDBOX=true` には `docker` または `podman` のインストールが必要です。
> - プロバイダーを強制するには、`QWEN_SANDBOX=docker|podman|sandbox-exec` を設定します。

## 設定

### サンドボックスの有効化（優先順位順）

1. **環境変数**: `QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **コマンドフラグ / 引数**: `-s`、`--sandbox`、または `--sandbox=<provider>`
3. **設定ファイル**: `settings.json` の `tools.sandbox`（例：`{"tools": {"sandbox": true}}`）。

> [!important]
>
> `QWEN_SANDBOX` が設定されている場合、CLI フラグと `settings.json` を**上書き**します。

### サンドボックスイメージの設定（Docker/Podman）

- **CLI フラグ**: `--sandbox-image <image>`
- **環境変数**: `QWEN_SANDBOX_IMAGE=<image>`
- **設定ファイル**: `settings.json` の `tools.sandboxImage`（例：`{"tools": {"sandboxImage": "ghcr.io/qwenlm/qwen-code:0.14.1"}}`）

優先順位（高い順）：

1. `--sandbox-image`
2. `QWEN_SANDBOX_IMAGE`
3. `tools.sandboxImage`
4. CLI パッケージの組み込みデフォルトイメージ（例：`ghcr.io/qwenlm/qwen-code:<version>`）

`settings.env.QWEN_SANDBOX_IMAGE` も汎用的な環境変数注入メカニズムとして機能しますが、永続的な設定には `tools.sandboxImage` が推奨されます。

### macOS Seatbelt プロファイル

組み込みプロファイル（`SEATBELT_PROFILE` 環境変数で設定）：

- `permissive-open`（デフォルト）: 書き込み制限、ネットワーク許可
- `permissive-closed`: 書き込み制限、ネットワーク不可
- `permissive-proxied`: 書き込み制限、プロキシ経由のネットワーク
- `restrictive-open`: 厳格な制限、ネットワーク許可
- `restrictive-closed`: 最大制限
- `restrictive-proxied`: 厳格な制限、プロキシ経由のネットワーク

> [!tip]
>
> まず `permissive-open` から始め、ワークフローが正常に動作する場合は `restrictive-closed` に段階的に制限を強めてください。

### カスタム Seatbelt プロファイル（macOS）

カスタム Seatbelt プロファイルを使用するには：

1. プロジェクト内に `.qwen/sandbox-macos-<profile_name>.sb` というファイルを作成します。
2. `SEATBELT_PROFILE=<profile_name>` を設定します。

### カスタムサンドボックスフラグ

コンテナベースのサンドボックスでは、`SANDBOX_FLAGS` 環境変数を使用して `docker` または `podman` コマンドにカスタムフラグを注入できます。これは、特定のユースケースでセキュリティ機能を無効にするなど、高度な設定に便利です。

**例（Podman）**:

ボリュームマウントの SELinux ラベリングを無効にするには、次のように設定します：

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

複数のフラグはスペース区切りの文字列として指定できます：

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### ネットワークプロキシ（すべてのサンドボックス方式）

アウトバウンドネットワークアクセスを許可リストに制限したい場合は、サンドボックスと並行してローカルプロキシを実行できます：

- `QWEN_SANDBOX_PROXY_COMMAND=<command>` を設定します
- コマンドは `:::8877` でリッスンするプロキシサーバーを起動する必要があります

これは `*-proxied` Seatbelt プロファイルと組み合わせると特に便利です。

動作する許可リスト形式のプロキシの例については、[プロキシスクリプトの例](../../developers/examples/proxy-script.md)を参照してください。

## Linux の UID/GID 処理

Linux では、Qwen Code はデフォルトで UID/GID マッピングを有効にし、サンドボックスがユーザーとして実行される（マウントされた `~/.qwen` を再利用する）ようにします。上書きするには：

```bash
export SANDBOX_SET_UID_GID=true   # ホストの UID/GID を強制
export SANDBOX_SET_UID_GID=false  # UID/GID マッピングを無効化
```

## トラブルシューティング

### よくある問題

**「Operation not permitted」**

- 操作がサンドボックス外へのアクセスを必要としています。
- macOS Seatbelt の場合：より許可度の高い `SEATBELT_PROFILE` を試してください。
- Docker/Podman の場合：ワークスペースがマウントされており、コマンドがプロジェクトディレクトリ外へのアクセスを必要としていないことを確認してください。

**コマンドが見つからない**

- コンテナサンドボックス：`.qwen/sandbox.Dockerfile` または `.qwen/sandbox.bashrc` で追加してください。
- Seatbelt：ホストのバイナリが使用されますが、サンドボックスが一部のパスへのアクセスを制限する場合があります。

**Docker サンドボックスで Java が利用できない**

公式の Qwen Code Docker イメージは、イメージを小さく、安全で、高速にプルできるよう意図的に最小限の構成になっています。ユーザーによって必要な言語ランタイム（Java、Python、Node.js など）は異なり、すべての環境を単一のイメージにバンドルすることは現実的ではありません。そのため、Java は Docker サンドボックスに**デフォルトでは含まれていません**。

ワークフローで Java が必要な場合は、プロジェクトに `.qwen/sandbox.Dockerfile` を作成してベースイメージを拡張できます：

```dockerfile
FROM ghcr.io/qwenlm/qwen-code:latest

RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

その後、サンドボックスイメージを再ビルドします：

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
```

サンドボックスのカスタマイズの詳細については、[サンドボックス環境のカスタマイズ](../../developers/tools/sandbox.md)を参照してください。

**ネットワークの問題**

- サンドボックスプロファイルがネットワークを許可しているか確認してください。
- プロキシの設定を確認してください。

### デバッグモード

```bash
DEBUG=1 qwen -s -p "debug command"
```

**注記:** プロジェクトの `.env` ファイルに `DEBUG=true` がある場合、自動除外により CLI には影響しません。Qwen Code 固有のデバッグ設定には `.qwen/.env` ファイルを使用してください。

### サンドボックスの検査

```bash
# 環境の確認
qwen -s -p "run shell command: env | grep SANDBOX"

# マウントの一覧表示
qwen -s -p "run shell command: mount | grep workspace"
```

## セキュリティに関する注記

- サンドボックスはリスクを低減しますが、すべてのリスクを排除するわけではありません。
- 作業が可能な範囲で最も制限の厳しいプロファイルを使用してください。
- コンテナのオーバーヘッドは最初のプル/ビルド後は最小限です。
- GUI アプリケーションはサンドボックス内で動作しない場合があります。

## 関連ドキュメント

- [設定](../configuration/settings): 完全な設定オプション。
- [コマンド](../features/commands): 利用可能なコマンド。
- [トラブルシューティング](../support/troubleshooting): 一般的なトラブルシューティング。
