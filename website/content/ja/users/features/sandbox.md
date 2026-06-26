# Sandbox

このドキュメントでは、ツールがシェルコマンドを実行したりファイルを変更したりする際のリスクを低減するために、Qwen Code をサンドボックス内で実行する方法について説明します。

## 前提条件

サンドボックスを使用する前に、Qwen Code をインストールしてセットアップする必要があります。

```bash
npm install -g @qwen-code/qwen-code
```

インストールを確認するには：

```bash
qwen --version
```

## サンドボックスの概要

サンドボックスは、危険な操作（シェルコマンドやファイルの変更など）をホストシステムから隔離し、CLI と環境の間にセキュリティの壁を提供します。

サンドボックスの利点は次のとおりです。

- **セキュリティ**: 偶発的なシステムの破損やデータの損失を防ぎます。
- **隔離**: ファイルシステムへのアクセスをプロジェクトディレクトリに制限します。
- **一貫性**: 異なるシステム間で再現可能な環境を保証します。
- **安全性**: 信頼できないコードや実験的なコマンドを扱う際のリスクを低減します。

> [!note]
>
> **名前に関する注意:** 一部のサンドボックス関連の環境変数は、歴史的に `GEMINI_*` プレフィックスを使用していた場合があります。新しい環境変数はすべて `QWEN_*` プレフィックスを使用します。

## サンドボックスの方法

最適なサンドボックス方法は、ご利用のプラットフォームやお好みのコンテナソリューションによって異なります。

### 1. macOS Seatbelt（macOS のみ）

`sandbox-exec` を使用した軽量で組み込みのサンドボックス機能です。

**デフォルトプロファイル**: `permissive-open` - プロジェクトディレクトリ外への書き込みを制限しますが、その他のほとんどの操作とアウトバウンドネットワークアクセスを許可します。

**最適な用途**: 高速、Docker 不要、ファイル書き込みに対する強力なガードレール。

### 2. コンテナベース（Docker/Podman）

完全なプロセス分離を備えたクロスプラットフォームのサンドボックス機能です。

デフォルトでは、Qwen Code は公開されているサンドボックスイメージ（CLI パッケージで設定）を使用し、必要に応じてプルします。

コンテナサンドボックスは、ワークスペースと `~/.qwen` ディレクトリをコンテナにマウントすることで、認証と設定が実行間で保持されます。

**最適な用途**: 任意の OS で強力な分離、既知のイメージ内での一貫したツール環境。

### 方法の選択

- **macOS の場合**:
  - 軽量なサンドボックスが必要な場合は Seatbelt を使用（ほとんどのユーザーに推奨）。
  - 完全な Linux ユーザーランドが必要な場合（Linux バイナリを必要とするツールなど）は Docker/Podman を使用。
- **Linux/Windows の場合**:
  - Docker または Podman を使用。

## クイックスタート

```bash
# コマンドフラグでサンドボックスを有効化
qwen -s -p "コード構造を分析"

# または、シェルセッションでサンドボックスを有効化（CI / スクリプトに推奨）
export QWEN_SANDBOX=true   # true はプロバイダを自動選択（下記の注を参照）
qwen -p "テストスイートを実行"

# settings.json で設定
{
  "tools": {
    "sandbox": true
  }
}
```

> [!tip]
>
> **プロバイダ選択に関する注意:**
>
> - **macOS** では、`QWEN_SANDBOX=true` は通常、利用可能な場合 `sandbox-exec`（Seatbelt）を選択します。
> - **Linux/Windows** では、`QWEN_SANDBOX=true` を使用するには `docker` または `podman` がインストールされている必要があります。
> - プロバイダを強制するには、`QWEN_SANDBOX=docker|podman|sandbox-exec` を設定します。

## 設定

### サンドボックスの有効化（優先順位順）

1. **環境変数**: `QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **コマンドフラグ / 引数**: `-s`、`--sandbox`、または `--sandbox=<provider>`
3. **設定ファイル**: `settings.json` の `tools.sandbox`（例: `{"tools": {"sandbox": true}}`）

> [!important]
>
> `QWEN_SANDBOX` が設定されている場合、CLI フラグと `settings.json` よりも**優先**されます。

### サンドボックスイメージの設定（Docker/Podman）

- **CLI フラグ**: `--sandbox-image <image>`
- **環境変数**: `QWEN_SANDBOX_IMAGE=<image>`
- **設定ファイル**: `settings.json` の `tools.sandboxImage`（例: `{"tools": {"sandboxImage": "ghcr.io/qwenlm/qwen-code:0.14.1"}}`）

優先順位（高い順）：

1. `--sandbox-image`
2. `QWEN_SANDBOX_IMAGE`
3. `tools.sandboxImage`
4. CLI パッケージに組み込まれたデフォルトイメージ（例: `ghcr.io/qwenlm/qwen-code:<version>`）

`settings.env.QWEN_SANDBOX_IMAGE` も、汎用的な env 注入メカニズムとして機能しますが、永続的な設定としては `tools.sandboxImage` が推奨されます。

### macOS Seatbelt プロファイル

組み込みプロファイル（`SEATBELT_PROFILE` 環境変数で設定）：

- `permissive-open`（デフォルト）: 書き込み制限、ネットワーク許可
- `permissive-closed`: 書き込み制限、ネットワークなし
- `permissive-proxied`: 書き込み制限、プロキシ経由のネットワーク
- `restrictive-open`: 厳格な制限、ネットワーク許可
- `restrictive-closed`: 最大の制限
- `restrictive-proxied`: 厳格な制限、プロキシ経由のネットワーク

> [!tip]
>
> 最初は `permissive-open` で始め、ワークフローが問題なく動作する場合は `restrictive-closed` に厳格化してください。

### カスタム Seatbelt プロファイル（macOS）

カスタム Seatbelt プロファイルを使用するには：

1. プロジェクトに `.qwen/sandbox-macos-<profile_name>.sb` という名前のファイルを作成します。
2. `SEATBELT_PROFILE=<profile_name>` を設定します。

### カスタムサンドボックスフラグ

コンテナベースのサンドボックスでは、`SANDBOX_FLAGS` 環境変数を使用して `docker` または `podman` コマンドにカスタムフラグを注入できます。これは、特定のユースケースのセキュリティ機能を無効にするなど、高度な設定に役立ちます。

**例（Podman）**:

ボリュームマウントの SELinux ラベリングを無効にするには、次のように設定します。

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

複数のフラグはスペース区切りの文字列として指定できます。

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### ネットワークプロキシ（すべてのサンドボックス方法）

アウトバウンドネットワークアクセスを許可リストに制限したい場合は、サンドボックスと一緒にローカルプロキシを実行できます。

- `QWEN_SANDBOX_PROXY_COMMAND=<command>` を設定します。
- コマンドは `:::8877` でリッスンするプロキシサーバーを起動する必要があります。

これは、`*-proxied` Seatbelt プロファイルと組み合わせて特に便利です。

動作する許可リスト形式のプロキシの例については、[プロキシスクリプトの例](../../developers/examples/proxy-script.md) を参照してください。

## Linux の UID/GID 処理

Linux では、Qwen Code はデフォルトで UID/GID マッピングを有効にして、サンドボックスがユーザーとして実行されるようにします（マウントされた `~/.qwen` を再利用します）。次のように上書きできます。

```bash
export SANDBOX_SET_UID_GID=true   # ホストの UID/GID を強制
export SANDBOX_SET_UID_GID=false  # UID/GID マッピングを無効化
```

## トラブルシューティング

### よくある問題

**"Operation not permitted"**

- 操作がサンドボックス外へのアクセスを必要としています。
- macOS Seatbelt の場合: より寛容な `SEATBELT_PROFILE` を試してください。
- Docker/Podman の場合: ワークスペースがマウントされていること、およびコマンドがプロジェクトディレクトリ外へのアクセスを必要としていないことを確認してください。

**コマンドが見つからない**

- コンテナサンドボックス: `.qwen/sandbox.Dockerfile` または `.qwen/sandbox.bashrc` を使用して追加します。
- Seatbelt: ホストのバイナリが使用されますが、サンドボックスによって一部のパスへのアクセスが制限される場合があります。

**Docker サンドボックスで Java が利用できない**

公式の Qwen Code Docker イメージは、イメージを小さく、安全に保ち、高速にプルできるように、意図的に最小限に構成されています。ユーザーによって必要な言語ランタイム（Java、Python、Node.js など）は異なり、すべての環境を1つのイメージにバンドルすることは現実的ではありません。したがって、Java は Docker サンドボックスには**デフォルトで含まれていません**。

ワークフローに Java が必要な場合は、プロジェクトに `.qwen/sandbox.Dockerfile` を作成してベースイメージを拡張できます。

```dockerfile
FROM ghcr.io/qwenlm/qwen-code:latest

RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

次に、サンドボックスイメージを再ビルドします。

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
```

サンドボックスのカスタマイズの詳細については、[サンドボックス環境のカスタマイズ](../../developers/tools/sandbox.md) を参照してください。

**ネットワークの問題**

- サンドボックスプロファイルがネットワークを許可していることを確認します。
- プロキシ設定を確認します。

### デバッグモード

```bash
DEBUG=1 qwen -s -p "デバッグコマンド"
```

**注意:** プロジェクトの `.env` ファイルに `DEBUG=true` がある場合、自動除外により CLI には影響しません。Qwen Code 固有のデバッグ設定には `.qwen/.env` ファイルを使用してください。

### サンドボックスの検査

```bash
# 環境の確認
qwen -s -p "シェルコマンドを実行: env | grep SANDBOX"

# マウントの表示
qwen -s -p "シェルコマンドを実行: mount | grep workspace"
```

## セキュリティに関する注意

- サンドボックスはリスクを低減しますが、すべてのリスクを排除するわけではありません。
- 作業が許可される最も制限の厳しいプロファイルを使用してください。
- 最初のプル/ビルド後は、コンテナのオーバーヘッドは最小限です。
- GUI アプリケーションはサンドボックス内で動作しない場合があります。

## 関連ドキュメント

- [設定](../configuration/settings): 設定オプションの全容。
- [コマンド](../features/commands): 利用可能なコマンド。
- [トラブルシューティング](../support/troubleshooting): 一般的なトラブルシューティング。