# Qwen Code におけるサンドボックス

このドキュメントでは、Qwen Code でのサンドボックス機能について、前提条件、クイックスタート、設定方法を説明します。

## 前提条件

サンドボックス機能を使用する前に、Qwen Code をインストールしてセットアップする必要があります：

```bash
npm install -g @qwen-code/qwen-code
```

インストールの確認

```bash
qwen --version
```

## サンドボックスの概要

サンドボックスは、危険な可能性のある操作（シェルコマンドやファイルの変更など）をホストシステムから隔離し、AI の操作とあなたの環境との間にセキュリティバリアを提供します。

サンドボックスの主な利点：

- **セキュリティ**: 意図しないシステムへの損害やデータ損失を防ぎます。
- **分離性**: ファイルシステムへのアクセスをプロジェクトディレクトリ内に限定します。
- **一貫性**: 異なるシステム間でも再現可能な環境を確保します。
- **安全性**: 信頼できないコードや実験的なコマンドを扱う際のリスクを低減します。

## サンドボックス方法

プラットフォームや好みのコンテナソリューションによって、理想的なサンドボックス方法は異なる場合があります。

### 1. macOS Seatbelt (macOSのみ)

`sandbox-exec` を使用した軽量な組み込みサンドボックス。

**デフォルトプロファイル**: `permissive-open` - プロジェクトディレクトリ外への書き込みを制限しますが、他のほとんどの操作は許可されます。

### 2. コンテナベース (Docker/Podman)

完全なプロセス分離によるクロスプラットフォームのサンドボックス。

**注意**: サンドボックスイメージをローカルでビルドするか、組織のレジストリから公開されたイメージを使用する必要があります。

## クイックスタート

```bash

# コマンドフラグでサンドボックスを有効化
qwen -s -p "analyze the code structure"

# 環境変数を使用
export GEMINI_SANDBOX=true
qwen -p "run the test suite"

# settings.json で設定
{
  "tools": {
    "sandbox": "docker"
  }
}
```

## 設定

### サンドボックスの有効化（優先順位順）

1. **コマンドフラグ**: `-s` または `--sandbox`
2. **環境変数**: `GEMINI_SANDBOX=true|docker|podman|sandbox-exec`
3. **設定ファイル**: `settings.json` ファイルの `tools` オブジェクト内の `"sandbox": true`（例: `{"tools": {"sandbox": true}}`）

### macOS Seatbelt プロファイル

組み込みプロファイル（`SEATBELT_PROFILE` 環境変数で設定）:

- `permissive-open`（デフォルト）: 書き込み制限、ネットワーク許可
- `permissive-closed`: 書き込み制限、ネットワーク不可
- `permissive-proxied`: 書き込み制限、プロキシ経由でのネットワーク
- `restrictive-open`: 厳格な制限、ネットワーク許可
- `restrictive-closed`: 最大限の制限

### カスタム Sandbox フラグ

コンテナベースのサンドボックスでは、`SANDBOX_FLAGS` 環境変数を使って `docker` または `podman` コマンドにカスタムフラグを注入できます。これは、特定のユースケースでセキュリティ機能を無効化するなどの高度な設定を行う際に便利です。

**例 (Podman)**:

ボリュームマウント時の SELinux ラベリングを無効にするには、以下のように設定します:

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

複数のフラグはスペース区切りの文字列として指定できます:

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

## Linux UID/GID の取り扱い

サンドボックスは Linux 上で自動的にユーザー権限を処理します。以下の設定でこれらの権限を上書きできます:

```bash
export SANDBOX_SET_UID_GID=true   # ホストの UID/GID を強制的に使用
export SANDBOX_SET_UID_GID=false  # UID/GID マッピングを無効化
```

## トラブルシューティング

### よくある問題

**"Operation not permitted"**

- サンドボックス外へのアクセスが必要な操作です。
- より許可範囲の広いプロファイルを使用するか、マウントポイントを追加してください。

**コマンドが見つからない**

- 独自の Dockerfile に追加する。
- `sandbox.bashrc` 経由でインストールする。

**ネットワークに関する問題**

- サンドボックスプロファイルでネットワークアクセスが許可されているか確認してください。
- プロキシ設定を確認してください。

### デバッグモード

```bash
DEBUG=1 qwen -s -p "debug command"
```

**注意:** プロジェクトの `.env` ファイルに `DEBUG=true` を設定していても、CLI には影響しません（自動的に除外されるため）。Qwen Code 固有のデバッグ設定を行うには、`.qwen/.env` ファイルを使用してください。

### サンドボックスの調査

```bash

# 環境変数の確認
qwen -s -p "run shell command: env | grep SANDBOX"

# マウント一覧の表示
qwen -s -p "run shell command: mount | grep workspace"
```

## セキュリティに関する注意点

- サンドボックスはリスクを軽減しますが、すべてのリスクを排除するわけではありません。
- 作業に必要な範囲で最も制限の厳しいプロファイルを使用してください。
- 初回ビルド以降は、コンテナのオーバーヘッドは最小限に抑えられます。
- GUI アプリケーションはサンドボックス環境で動作しない場合があります。

## 関連ドキュメント

- [Configuration](./cli/configuration.md): 設定オプション一覧。
- [Commands](./cli/commands.md): 利用可能なコマンド。
- [Troubleshooting](./troubleshooting.md): 一般的なトラブルシューティング。