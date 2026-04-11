# サンドボックス

本ドキュメントでは、ツールがシェルコマンドを実行したりファイルを変更したりする際のリスクを低減するため、Qwen Code をサンドボックス内で実行する方法について説明します。

## 前提条件

サンドボックス機能を使用する前に、Qwen Code をインストールしてセットアップする必要があります：

```bash
npm install -g @qwen-code/qwen-code
```

インストールを確認するには

```bash
qwen --version
```

## サンドボックス機能の概要

サンドボックス機能は、シェルコマンドやファイルの変更など、潜在的に危険な操作をホストシステムから隔離し、CLI と環境の間にセキュリティバリアを提供します。

サンドボックス機能の利点は次のとおりです：

- **セキュリティ**: システムの誤った破損やデータ損失を防ぎます。
- **隔離**: ファイルシステムへのアクセスをプロジェクトディレクトリに制限します。
- **一貫性**: 異なるシステム間で再現可能な環境を保証します。
- **安全性**: 信頼できないコードや実験的なコマンドを扱う際のリスクを低減します。

> [!note]
>
> **命名に関する注意:** 一部のサンドボックス関連環境変数は、歴史的に `GEMINI_*` プレフィックスを使用していた場合があります。すべての新しい環境変数は `QWEN_*` プレフィックスを使用します。

## サンドボックス化の方法

最適なサンドボックス化の方法は、プラットフォームや使用するコンテナソリューションによって異なります。

### 1. macOS Seatbelt（macOS のみ）

`sandbox-exec` を使用した軽量な組み込みサンドボックス機能です。

**デフォルトプロファイル**: `permissive-open` - プロジェクトディレクトリ外への書き込みを制限しますが、他のほとんどの操作と外向きのネットワークアクセスは許可します。

**推奨用途**: 高速、Docker 不要、ファイル書き込みに対する強力なガードレールが必要な場合。

### 2. コンテナベース（Docker/Podman）

完全なプロセス分離を提供するクロスプラットフォームのサンドボックス機能です。

デフォルトでは、Qwen Code は公開済みのサンドボックスイメージ（CLI パッケージで構成済み）を使用し、必要に応じてプルします。

コンテナサンドボックスはワークスペースと `~/.qwen` ディレクトリをコンテナ内にマウントするため、認証情報と設定は実行間で保持されます。

**推奨用途**: 任意の OS での強力な隔離、既知のイメージ内での一貫したツール環境が必要な場合。

### 方法の選択

- **macOS の場合**:
  - 軽量なサンドボックス機能が必要な場合は Seatbelt を使用します（ほとんどのユーザーに推奨）。
  - 完全な Linux ユーザーランド（Linux バイナリを必要とするツールなど）が必要な場合は Docker/Podman を使用します。
- **Linux/Windows の場合**:
  - Docker または Podman を使用します。

## クイックスタート

```bash
# Enable sandboxing with command flag
qwen -s -p "analyze the code structure"

# Or enable sandboxing for your shell session (recommended for CI / scripts)
export QWEN_SANDBOX=true   # true auto-picks a provider (see notes below)
qwen -p "run the test suite"

# Configure in settings.json
{
  "tools": {
    "sandbox": true
  }
}
```

> [!tip]
>
> **プロバイダー選択に関する注意:**
>
> - **macOS** では、利用可能な場合 `QWEN_SANDBOX=true` は通常 `sandbox-exec`（Seatbelt）を選択します。
> - **Linux/Windows** では、`QWEN_SANDBOX=true` を使用するには `docker` または `podman` がインストールされている必要があります。
> - プロバイダーを強制指定するには、`QWEN_SANDBOX=docker|podman|sandbox-exec` を設定します。

## 構成

### サンドボックスの有効化（優先順位順）

1. **環境変数**: `QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **コマンドフラグ / 引数**: `-s`、`--sandbox`、または `--sandbox=<provider>`
3. **設定ファイル**: `settings.json` 内の `tools.sandbox`（例: `{"tools": {"sandbox": true}}`）。

> [!important]
>
> `QWEN_SANDBOX` が設定されている場合、CLI フラグと `settings.json` の設定を**上書き**します。

### サンドボックスイメージの構成（Docker/Podman）

- **CLI フラグ**: `--sandbox-image <image>`
- **環境変数**: `QWEN_SANDBOX_IMAGE=<image>`

どちらも設定しない場合、Qwen Code は CLI パッケージで構成されたデフォルトイメージ（例: `ghcr.io/qwenlm/qwen-code:<version>`）を使用します。

### macOS Seatbelt プロファイル

組み込みプロファイル（`SEATBELT_PROFILE` 環境変数で設定）:

- `permissive-open`（デフォルト）: 書き込み制限あり、ネットワーク許可
- `permissive-closed`: 書き込み制限あり、ネットワーク不可
- `permissive-proxied`: 書き込み制限あり、プロキシ経由のネットワーク
- `restrictive-open`: 厳格な制限、ネットワーク許可
- `restrictive-closed`: 最大限の制限
- `restrictive-proxied`: 厳格な制限、プロキシ経由のネットワーク

> [!tip]
>
> `permissive-open` から開始し、ワークフローが正常に動作する場合は `restrictive-closed` に切り替えて制限を強化してください。

### カスタム Seatbelt プロファイル（macOS）

カスタム Seatbelt プロファイルを使用するには:

1. プロジェクト内に `.qwen/sandbox-macos-<profile_name>.sb` という名前のファイルを作成します。
2. `SEATBELT_PROFILE=<profile_name>` を設定します。

### カスタムサンドボックスフラグ

コンテナベースのサンドボックスでは、`SANDBOX_FLAGS` 環境変数を使用して `docker` または `podman` コマンドにカスタムフラグを注入できます。これは、特定のユースケースでセキュリティ機能を無効にするなどの高度な構成に役立ちます。

**例（Podman）**:

ボリュームマウントの SELinux ラベリングを無効にするには、以下を設定します:

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

複数のフラグはスペース区切りの文字列として指定できます:

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### ネットワークプロキシ（すべてのサンドボックス方法）

外向きのネットワークアクセスを許可リストに制限したい場合は、サンドボックスと並行してローカルプロキシを実行できます:

- `QWEN_SANDBOX_PROXY_COMMAND=<command>` を設定します
- コマンドは `:::8877` でリッスンするプロキシサーバーを起動する必要があります

これは `*-proxied` Seatbelt プロファイルと組み合わせて特に有用です。

動作する許可リスト形式のプロキシの例については、[Example Proxy Script](/developers/examples/proxy-script) を参照してください。

## Linux の UID/GID 処理

Linux では、Qwen Code はデフォルトで UID/GID マッピングを有効にし、サンドボックスがあなたのユーザーとして実行されるようにします（マウントされた `~/.qwen` を再利用します）。上書きするには:

```bash
export SANDBOX_SET_UID_GID=true   # Force host UID/GID
export SANDBOX_SET_UID_GID=false  # Disable UID/GID mapping
```

## トラブルシューティング

### よくある問題

**"Operation not permitted"**

- 操作にサンドボックス外のアクセスが必要です。
- macOS Seatbelt の場合: より許可的な `SEATBELT_PROFILE` を試してください。
- Docker/Podman の場合: ワークスペースがマウントされており、コマンドがプロジェクトディレクトリ外のアクセスを必要としていないことを確認してください。

**Missing commands**

- コンテナサンドボックス: `.qwen/sandbox.Dockerfile` または `.qwen/sandbox.bashrc` を介して追加します。
- Seatbelt: ホストのバイナリが使用されますが、サンドボックスが一部のパスへのアクセスを制限している可能性があります。

**Java not available in Docker sandbox**

公式の Qwen Code Docker イメージは、イメージを小さく、安全に、かつ高速にプルできるように意図的に最小限に構成されています。ユーザーによって必要な言語ランタイム（Java、Python、Node.js など）は異なり、すべての環境を単一のイメージにバンドルするのは現実的ではありません。そのため、Java は Docker サンドボックスに**デフォルトでは含まれていません**。

ワークフローで Java が必要な場合は、プロジェクト内に `.qwen/sandbox.Dockerfile` を作成してベースイメージを拡張できます:

```dockerfile
FROM ghcr.io/qwenlm/qwen-code:latest

RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

その後、サンドボックスイメージを再ビルドします:

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
```

サンドボックスのカスタマイズの詳細については、[Customizing the sandbox environment](/developers/tools/sandbox) を参照してください。

**Network issues**

- サンドボックスプロファイルがネットワークを許可しているか確認してください。
- プロキシ構成を確認してください。

### デバッグモード

```bash
DEBUG=1 qwen -s -p "debug command"
```

**注意:** プロジェクトの `.env` ファイルに `DEBUG=true` が設定されている場合、自動除外により CLI には影響しません。Qwen Code 固有のデバッグ設定には `.qwen/.env` ファイルを使用してください。

### サンドボックスの検査

```bash
# Check environment
qwen -s -p "run shell command: env | grep SANDBOX"

# List mounts
qwen -s -p "run shell command: mount | grep workspace"
```

## セキュリティに関する注意事項

- サンドボックス化はすべてのリスクを排除するものではありませんが、低減します。
- 作業を許可する中で最も制限の厳しいプロファイルを使用してください。
- コンテナのオーバーヘッドは、最初のプル/ビルド以降は最小限です。
- GUI アプリケーションはサンドボックス内で動作しない場合があります。

## 関連ドキュメント

- [Configuration](../configuration/settings): 完全な構成オプション。
- [Commands](../features/commands): 利用可能なコマンド。
- [Troubleshooting](../support/troubleshooting): 一般的なトラブルシューティング。