# サンドボックス

このドキュメントでは、ツールがシェルコマンドを実行したりファイルを変更したりする際のリスクを軽減するために、サンドボックス内で Qwen Code を実行する方法について説明します。

## 前提条件

サンドボックス機能を使用する前に、Qwen Code をインストールしてセットアップしておく必要があります。

```bash
npm install -g @qwen-code/qwen-code
```

インストールを確認するには

```bash
qwen --version
```

## サンドボックス化の概要

サンドボックス化は、シェルコマンドやファイル変更などの潜在的に危険な操作をホストシステムから分離し、CLI と環境の間にセキュリティバリアを提供します。

サンドボックス化の利点には以下が含まれます：

- **セキュリティ**: 意図しないシステム破損やデータ損失を防止します。
- **分離**: ファイルシステムアクセスをプロジェクトディレクトリに限定します。
- **一貫性**: 異なるシステム間で再現可能な環境を保証します。
- **安全性**: 信頼できないコードや実験的なコマンドを扱う際のリスクを軽減します。

> [!note]
>
> **名称に関する注意**: サンドボックス関連の一部環境変数は、下位互換性のために依然として `GEMINI_*` 接頭辞を使用しています。

## サンドボックス化の方法

理想的なサンドボックス化の方法は、プラットフォームや使用するコンテナソリューションによって異なります。

### 1. macOS Seatbelt (macOS 専用)

`sandbox-exec` を使用した軽量な組み込みサンドボックス機能。

**デフォルトプロファイル**: `permissive-open` - プロジェクトディレクトリ外への書き込みを制限しますが、その他のほとんどの操作とアウトバウンドネットワークアクセスを許可します。

**最適な用途**: 高速で Docker 不要、ファイル書き込みに対する強力なガードレールが必要な場合。

### 2. コンテナベース (Docker/Podman)

完全なプロセス分離を実現するクロスプラットフォームのサンドボックス。

デフォルトでは、Qwen Code は公開されているサンドボックスイメージ (CLI パッケージで設定済み) を使用し、必要に応じてプルします。

コンテナサンドボックスは、ワークスペースと `~/.qwen` ディレクトリをコンテナ内にマウントするため、認証情報や設定が実行間で保持されます。

**最適な用途**: 任意の OS での強固な分離、既知のイメージ内で一貫性のあるツール群を使用する場合。

### メソッドの選択

- **macOSの場合**:
  - 軽量なサンドボックス化が必要な場合はSeatbeltを使用してください（ほとんどのユーザーにおすすめ）。
  - 完全なLinuxユーザーランドが必要な場合はDocker/Podmanを使用してください（例：Linuxバイナリを必要とするツール）。
- **Linux/Windowsの場合**:
  - DockerまたはPodmanを使用してください。

## クイックスタート

```bash

# コマンドフラグでサンドボックス化を有効にする
qwen -s -p "コード構造を分析する"

# またはシェルセッション全体でサンドボックス化を有効にする（CI/スクリプトでの使用に推奨）
export GEMINI_SANDBOX=true   # trueはプロバイダを自動選択します（下記の注意事項を参照）
qwen -p "テストスイートを実行する"

# settings.jsonで設定
{
  "tools": {
    "sandbox": true
  }
}
```

> [!tip]
>
> **プロバイダ選択に関する注意事項:**
>
> - **macOS**では、`GEMINI_SANDBOX=true`は通常、利用可能な場合`sandbox-exec`（Seatbelt）を選択します。
> - **Linux/Windows**では、`GEMINI_SANDBOX=true`には`docker`または`podman`がインストールされている必要があります。
> - プロバイダを強制的に指定するには、`GEMINI_SANDBOX=docker|podman|sandbox-exec`を設定してください。

## 設定

### サンドボックスの有効化（優先順位順）

1. **環境変数**: `GEMINI_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **コマンドフラグ/引数**: `-s`、`--sandbox`、または `--sandbox=<provider>`
3. **設定ファイル**: `settings.json` 内の `tools.sandbox`（例: `{"tools": {"sandbox": true}}`）。

> [!important]
>
> `GEMINI_SANDBOX` が設定されている場合、CLI フラグと `settings.json` の設定を**上書きします**。

### サンドボックスイメージの設定（Docker/Podman）

- **CLI フラグ**: `--sandbox-image <image>`
- **環境変数**: `GEMINI_SANDBOX_IMAGE=<image>`

いずれも設定しない場合、Qwen Code は CLI パッケージで構成されたデフォルトのイメージを使用します（例: `ghcr.io/qwenlm/qwen-code:<version>`）。

### macOS Seatbelt プロファイル

組み込みプロファイル（`SEATBELT_PROFILE` 環境変数で設定）：

- `permissive-open`（デフォルト）：書き込み制限あり、ネットワーク許可
- `permissive-closed`：書き込み制限あり、ネットワークなし
- `permissive-proxied`：書き込み制限あり、プロキシ経由でネットワーク接続
- `restrictive-open`：厳格な制限、ネットワーク許可
- `restrictive-closed`：最大限の制限
- `restrictive-proxied`：厳格な制限、プロキシ経由でネットワーク接続

> [!tip]
>
> `permissive-open` から始め、ワークフローが引き続き動作する場合は `restrictive-closed` に tightened してください。

### カスタム Seatbelt プロファイル（macOS）

カスタム Seatbelt プロファイルを使用するには：

1. プロジェクト内に `.qwen/sandbox-macos-<profile_name>.sb` という名前のファイルを作成します。
2. `SEATBELT_PROFILE=<profile_name>` を設定します。

### カスタムサンドボックスフラグ

コンテナベースのサンドボックス機能を使用する場合、`SANDBOX_FLAGS` 環境変数を使用して `docker` または `podman` コマンドにカスタムフラグを注入できます。これは、特定のユースケース向けにセキュリティ機能を無効にするなどの高度な設定に役立ちます。

**例 (Podman)**:

ボリュームマウントに対するSELinuxラベリングを無効にするには、以下のように設定します。

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

複数のフラグはスペース区切りの文字列として指定できます。

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### ネットワークプロキシ（すべてのサンドボックスメソッド）

送信するネットワークアクセスを許可リストに制限したい場合は、サンドボックスと共にローカルプロキシを実行できます。

- `GEMINI_SANDBOX_PROXY_COMMAND=<command>` を設定します。
- コマンドは `:::8877` でリッスンするプロキシサーバーを起動する必要があります。

これは特に `*-proxied` Seatbelt プロファイルと組み合わせて有効です。

動作する許可リスト形式のプロキシの例については、[Example Proxy Script](/developers/examples/proxy-script) を参照してください。

## Linux UID/GID の処理

Linux では、Qwen Code はデフォルトで UID/GID マッピングを有効にして、サンドボックスがユーザーとして実行されるようにし（マウントされた `~/.qwen` を再利用します）。以下で上書きできます。

```bash
export SANDBOX_SET_UID_GID=true   # ホストの UID/GID を強制
export SANDBOX_SET_UID_GID=false  # UID/GID マッピングを無効化
```

## トラブルシューティング

### 一般的な問題

**「Operation not permitted」**

- 操作にサンドボックス外へのアクセスが必要です。
- macOS Seatbelt の場合: より許可的な `SEATBELT_PROFILE` を試してください。
- Docker/Podman の場合: ワークスペースがマウントされており、コマンドがプロジェクトディレクトリ外へのアクセスを必要としていないことを確認してください。

**コマンドが見つからない**

- コンテナサンドボックスの場合: `.qwen/sandbox.Dockerfile` または `.qwen/sandbox.bashrc` 経由で追加してください。
- Seatbelt の場合: ホストのバイナリが使用されますが、サンドボックスが一部のパスへのアクセスを制限している可能性があります。

**ネットワークの問題**

- サンドボックスプロファイルがネットワークを許可しているか確認してください。
- プロキシ設定を確認してください。

### デバッグモード

```bash
DEBUG=1 qwen -s -p "debug command"
```

**注意:** プロジェクトの `.env` ファイルに `DEBUG=true` が含まれている場合、自動除外されるため CLI には影響しません。Qwen Code 固有のデバッグ設定には `.qwen/.env` ファイルを使用してください。

### サンドボックスの調査

```bash

# 環境を確認
qwen -s -p "run shell command: env | grep SANDBOX"

# マウントを一覧表示
qwen -s -p "run shell command: mount | grep workspace"
```

## セキュリティに関する注意事項

- サンドボックス化はリスクを軽減しますが、すべてのリスクを完全に排除するものではありません。
- 作業を許可する中で最も制限の厳しいプロファイルを使用してください。
- コンテナのオーバーヘッドは、最初のプル／ビルド後は最小限になります。
- GUI アプリケーションはサンドボックス内で動作しない場合があります。

## 関連ドキュメント

- [設定](../configuration/settings)：全設定オプション。
- [コマンド](../features/commands)：利用可能なコマンド。
- [トラブルシューティング](../support/troubleshooting)：一般的なトラブルシューティング。