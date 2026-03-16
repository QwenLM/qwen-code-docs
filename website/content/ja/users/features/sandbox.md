# サンドボックス

このドキュメントでは、ツールがシェルコマンドを実行したりファイルを変更したりする際のリスクを軽減するために、Qwen Code をサンドボックス内で実行する方法について説明します。

## 前提条件

サンドボックス機能を使用する前に、Qwen Code をインストールして設定する必要があります。

```bash
npm install -g @qwen-code/qwen-code
```

インストールを確認するには、以下のコマンドを実行します。

```bash
qwen --version
```

## サンドボックス化の概要

サンドボックス化は、シェルコマンドやファイルの変更など、潜在的に危険な操作をホストシステムから分離し、CLI とご自身の環境の間にセキュリティバリアを提供します。

サンドボックス化のメリットには以下が含まれます：

- **セキュリティ**: 意図しないシステムへの損傷やデータ損失を防止します。
- **分離**: ファイルシステムへのアクセスをプロジェクトディレクトリに限定します。
- **一貫性**: 異なるシステム間で再現可能な環境を保証します。
- **安全性**: 信頼できないコードや実験的なコマンドを扱う際のリスクを低減します。

> [!note]
>
> **命名に関する注意**: サンドボックス関連の環境変数のうち、一部は過去に `GEMINI_*` 接頭辞を使用していた場合があります。すべての新規環境変数は `QWEN_*` 接頭辞を使用します。

## サンドボックス化の方法

最適なサンドボックス化手法は、使用しているプラットフォームおよび推奨するコンテナソリューションによって異なります。

### 1. macOS Seatbelt（macOS 専用）

`sandbox-exec` を使用した軽量で組み込みのサンドボックス機能。

**デフォルトプロファイル**: `permissive-open` — プロジェクトディレクトリ外への書き込みを制限しますが、その他のほとんどの操作およびアウトバウンドネットワークアクセスは許可されます。

**推奨用途**: Docker を必要とせず高速に実行でき、ファイル書き込みに対して堅牢なガードレールを提供します。

### 2. コンテナベース（Docker / Podman）

完全なプロセス分離を実現するクロスプラットフォーム対応のサンドボックス機能。

デフォルトでは、Qwen Code が公開済みのサンドボックスイメージ（CLI パッケージ内で設定）を使用し、必要に応じて自動的にプルします。

コンテナベースのサンドボックスでは、ワークスペースおよび `~/.qwen` ディレクトリがコンテナ内にマウントされるため、認証情報や設定が実行間で保持されます。

**推奨用途**: 任意の OS 上での強力な分離、および既知のイメージ内における一貫性のあるツール環境。

### 方法の選択

- **macOS の場合**:
  - 軽量なサンドボックス化が必要な場合（ほとんどのユーザーに推奨）は、Seatbelt を使用します。
  - 完全な Linux ユーザーランドが必要な場合（例：Linux バイナリを必要とするツール）は、Docker / Podman を使用します。
- **Linux / Windows の場合**:
  - Docker または Podman を使用します。

## クイックスタート

```bash

# コマンドフラグでサンドボックス化を有効化
qwen -s -p "コード構造を分析する"

# または、シェルセッション全体でサンドボックス化を有効化（CI / スクリプト向けに推奨）
export QWEN_SANDBOX=true   # true を指定すると、プロバイダーが自動的に選択されます（下記の注意事項を参照）
qwen -p "テストスイートを実行する"

# settings.json で設定
{
  "tools": {
    "sandbox": true
  }
}
```

> [!tip]
>
> **プロバイダー選択に関する注意事項**:
>
> - **macOS** では、`QWEN_SANDBOX=true` を指定すると、利用可能な場合に通常 `sandbox-exec`（Seatbelt）が選択されます。
> - **Linux / Windows** では、`QWEN_SANDBOX=true` を指定するには、`docker` または `podman` のインストールが必要です。
> - 特定のプロバイダーを強制的に選択するには、`QWEN_SANDBOX=docker|podman|sandbox-exec` を設定します。

## 設定

### サンドボックス化の有効化（優先順位順）

1. **環境変数**: `QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **コマンドフラグ／引数**: `-s`、`--sandbox`、または `--sandbox=<プロバイダー>`
3. **設定ファイル**: `settings.json` 内の `tools.sandbox`（例: `{"tools": {"sandbox": true}}`）

> [!important]
>
> `QWEN_SANDBOX` が設定されている場合、CLI フラグおよび `settings.json` の設定は**無視されます**。

### サンドボックスイメージの設定（Docker／Podman）

- **CLI フラグ**: `--sandbox-image <イメージ>`
- **環境変数**: `QWEN_SANDBOX_IMAGE=<イメージ>`

いずれも設定されていない場合、Qwen Code は CLI パッケージで定義されたデフォルトのイメージ（例: `ghcr.io/qwenlm/qwen-code:<version>`）を使用します。

### macOS Seatbelt プロファイル

組み込みプロファイル（`SEATBELT_PROFILE` 環境変数で設定）:

- `permissive-open`（デフォルト）：書き込み制限あり、ネットワーク接続可
- `permissive-closed`：書き込み制限あり、ネットワーク接続不可
- `permissive-proxied`：書き込み制限あり、ネットワーク接続はプロキシ経由のみ
- `restrictive-open`：厳格な制限、ネットワーク接続可
- `restrictive-closed`：最大限の制限
- `restrictive-proxied`：厳格な制限、ネットワーク接続はプロキシ経由のみ

> [!tip]
>
> まず `permissive-open` を使用し、ワークフローが引き続き正常に動作する場合は、`restrictive-closed` へと段階的に制限を強化してください。

### カスタム Seatbelt プロファイル（macOS）

カスタム Seatbelt プロファイルを使用するには：

1. プロジェクト内に `.qwen/sandbox-macos-<profile_name>.sb` という名前のファイルを作成します。
2. `SEATBELT_PROFILE=<profile_name>` を設定します。

### カスタムサンドボックスフラグ

コンテナベースのサンドボックス化では、`SANDBOX_FLAGS` 環境変数を使用して、`docker` または `podman` コマンドにカスタムフラグを挿入できます。これは、特定のユースケース向けにセキュリティ機能を無効化するなど、高度な設定を行う際に便利です。

**例（Podman）**:

ボリュームマウントに対する SELinux ラベル付けを無効化するには、以下のように設定します：

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

複数のフラグは、スペースで区切られた文字列として指定できます：

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### ネットワークプロキシ（すべてのサンドボックス方式）

アウトバウンドネットワークアクセスを許可リストに制限したい場合、サンドボックスと並行してローカルプロキシを実行できます。

- `QWEN_SANDBOX_PROXY_COMMAND=<command>` を設定します。
- 指定したコマンドは、`:::8877` でリッスンするプロキシサーバーを起動する必要があります。

これは特に `*-proxied` Seatbelt プロファイルと組み合わせて使用すると有効です。

許可リスト形式のプロキシの動作例については、こちらをご覧ください：[プロキシスクリプトの例](/developers/examples/proxy-script)。

## Linux における UID/GID の処理

Linux 上では、Qwen Code はデフォルトで UID/GID マッピングを有効化し、サンドボックスがユーザーとして実行されるようになっています（また、マウントされた `~/.qwen` を再利用します）。以下の環境変数で上書きできます：

```bash
export SANDBOX_SET_UID_GID=true   # ホストの UID/GID を強制的に使用
export SANDBOX_SET_UID_GID=false  # UID/GID マッピングを無効化
```

## トラブルシューティング

### よくある問題

**「操作が許可されていません」**

- この操作では、サンドボックス外へのアクセスが必要です。
- macOS Seatbelt の場合：より許容範囲の広い `SEATBELT_PROFILE` を試してください。
- Docker/Podman の場合：ワークスペースが正しくマウントされていること、および実行コマンドがプロジェクトディレクトリ外へのアクセスを必要としないことを確認してください。

**コマンドが見つからない**

- コンテナサンドボックスの場合：`.qwen/sandbox.Dockerfile` または `.qwen/sandbox.bashrc` を使って追加してください。
- Seatbelt の場合：ホスト上のバイナリが使用されますが、サンドボックスによって一部のパスへのアクセスが制限される可能性があります。

**Docker サンドボックスで Java が利用できない**

公式の Qwen Code Docker イメージは、イメージのサイズを小さく保ち、セキュリティとプル速度を最適化するために意図的に最小構成になっています。ユーザーによって必要な言語ランタイム（Java、Python、Node.js など）は異なり、すべての実行環境を単一のイメージにバンドルするのは現実的ではありません。そのため、Java は **Docker サンドボックスにはデフォルトで含まれていません**。

ワークフローで Java を必要とする場合は、プロジェクト内に `.qwen/sandbox.Dockerfile` を作成してベースイメージを拡張できます：

```dockerfile
FROM ghcr.io/qwenlm/qwen-code:latest

RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

その後、サンドボックスイメージを再構築します：

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
```

サンドボックスのカスタマイズについて詳しくは、[サンドボックス環境のカスタマイズ](/developers/tools/sandbox) を参照してください。

**ネットワーク関連の問題**

- サンドボックスプロファイルがネットワークアクセスを許可しているか確認してください。
- プロキシ設定を確認してください。

### デバッグモード

```bash
DEBUG=1 qwen -s -p "debug command"
```

**注意:** プロジェクトの `.env` ファイルに `DEBUG=true` が設定されていても、自動的に除外されるため CLI には影響しません。Qwen Code 固有のデバッグ設定には、`.qwen/.env` ファイルを使用してください。

### サンドボックスの検査

```bash

# 環境の確認
qwen -s -p "run shell command: env | grep SANDBOX"

# マウントの一覧表示
qwen -s -p "run shell command: mount | grep workspace"
```

## セキュリティに関する注意点

- サンドボックス化はリスクを低減しますが、すべてのリスクを完全に排除するものではありません。
- 作業を実行できる最も制限の厳しいプロファイルを使用してください。
- コンテナのオーバーヘッドは、初回のプル／ビルド後は最小限です。
- GUI アプリケーションはサンドボックス内で動作しない場合があります。

## 関連ドキュメント

- [設定](../configuration/settings): 設定可能なオプションの全一覧。
- [コマンド](../features/commands): 利用可能なコマンド。
- [トラブルシューティング](../support/troubleshooting): 一般的なトラブルシューティング手順。