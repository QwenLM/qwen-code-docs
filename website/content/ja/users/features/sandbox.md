# サンドボックス

このドキュメントでは、ツールがシェルコマンドを実行したりファイルを変更したりする際のリスクを軽減するために、Qwen Codeをサンドボックス内で実行する方法について説明します。

## 前提条件

サンドボックスを使用する前に、Qwen Codeをインストールして設定する必要があります：

```bash
npm install -g @qwen-code/qwen-code
```

インストールを確認するには

```bash
qwen --version
```

## サンドボックスの概要

サンドボックスは、シェルコマンドやファイル変更などの危険な可能性のある操作をホストシステムから隔離し、CLIと環境との間にセキュリティバリアを提供します。

サンドボックスの利点には以下が含まれます：

- **セキュリティ**: 意図しないシステム損傷やデータ損失を防ぐ。
- **分離**: ファイルシステムへのアクセスをプロジェクトディレクトリに限定する。
- **一貫性**: 異なるシステム間で再現可能な環境を確保する。
- **安全性**: 信頼できないコードや実験的なコマンドを扱う際のリスクを軽減する。

> [!note]
>
> **命名に関する注意**: 下位互換性のために、一部のサンドボックス関連の環境変数はまだ`GEMINI_*`プレフィックスを使用しています。

## サンドボックス方法

理想的なサンドボックス方法は、プラットフォームや好みのコンテナソリューションによって異なる場合があります。

### 1. macOS Seatbelt (macOSのみ)

`sandbox-exec` を使用した軽量な組み込みサンドボックス。

**デフォルトプロファイル**: `permissive-open` - プロジェクトディレクトリ外への書き込みを制限しますが、その他の操作および外部ネットワークアクセスは許可されます。

**最適な用途**: 高速で、Docker不要、ファイル書き込みに対する堅牢なガードレールが必要な場合。

### 2. コンテナベース (Docker/Podman)

完全なプロセス分離によるクロスプラットフォームのサンドボックス。

デフォルトでは、Qwen Codeは公開されたサンドボックスイメージ（CLIパッケージ内で設定）を使用し、必要に応じてプルします。

**最適な用途**: 任意のOSでの強力な分離、既知のイメージ内での一貫したツール利用。

### 方法の選択

- **macOSの場合**:
  - 軽量なサンドボックスが必要な場合はSeatbeltを使用してください（ほとんどのユーザーにお勧め）。
  - 完全なLinuxユーザーランドが必要な場合（例：Linuxバイナリを必要とするツール）はDocker/Podmanを使用してください。
- **Linux/Windowsの場合**:
  - DockerまたはPodmanを使用してください。

## クイックスタート

```bash

# コマンドフラグでサンドボックスを有効化
qwen -s -p "コード構造を分析する"
```

```markdown
# シェルセッションでサンドボックスを有効にする（CI／スクリプト向けに推奨）
export GEMINI_SANDBOX=true   # true にするとプロバイダを自動選択（下記の注意事項を参照）
qwen -p "run the test suite"

# settings.json で設定する場合
{
  "tools": {
    "sandbox": true
  }
}
```

> [!tip]
>
> **プロバイダ選択に関する注意事項：**
>
> - **macOS** では、`GEMINI_SANDBOX=true` は通常、利用可能な場合 `sandbox-exec`（Seatbelt）を選択します。
> - **Linux／Windows** では、`GEMINI_SANDBOX=true` を使用するには `docker` または `podman` がインストールされている必要があります。
> - 特定のプロバイダを強制的に使用するには、`GEMINI_SANDBOX=docker|podman|sandbox-exec` のように設定してください。

## 設定

### サンドボックスの有効化（優先順位順）

1. **環境変数**: `GEMINI_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **コマンドフラグ／引数**: `-s`、`--sandbox`、または `--sandbox=<provider>`
3. **設定ファイル**: `settings.json` 内の `tools.sandbox`（例：`{"tools": {"sandbox": true}}`）。

> [!important]
>
> `GEMINI_SANDBOX` が設定されている場合、それは CLI フラグおよび `settings.json` よりも**優先されます**。
```

### サンドボックスイメージの設定（Docker/Podman）

- **CLIフラグ**: `--sandbox-image <image>`
- **環境変数**: `GEMINI_SANDBOX_IMAGE=<image>`

どちらも設定しない場合、Qwen CodeはCLIパッケージで設定されたデフォルトイメージを使用します（例：`ghcr.io/qwenlm/qwen-code:<version>`）。

### macOSシートベルトプロファイル

組み込みプロファイル（`SEATBELT_PROFILE` 環境変数で設定）：

- `permissive-open`（デフォルト）：書き込み制限あり、ネットワーク許可
- `permissive-closed`：書き込み制限あり、ネットワーク不可
- `permissive-proxied`：書き込み制限あり、プロキシ経由ネットワーク
- `restrictive-open`：厳格な制限、ネットワーク許可
- `restrictive-closed`：最大限の制限
- `restrictive-proxied`：厳格な制限、プロキシ経由ネットワーク

> [!tip]
>
> `permissive-open`から始め、ワークフローが正常に動作するなら`restrictive-closed`に厳しくしてください。

### カスタム Seatbelt プロファイル (macOS)

カスタム Seatbelt プロファイルを使用するには：

1. プロジェクト内に `.qwen/sandbox-macos-<profile_name>.sb` という名前のファイルを作成します。
2. `SEATBELT_PROFILE=<profile_name>` を設定します。

### カスタム サンドボックス フラグ

コンテナベースのサンドボックスでは、`SANDBOX_FLAGS` 環境変数を使って `docker` または `podman` コマンドにカスタムフラグを注入できます。これは、特定のユースケースでセキュリティ機能を無効にするなど、高度な設定を行う際に便利です。

**例 (Podman)**：

ボリュームマウント時の SELinux ラベリングを無効にするには、以下のように設定します：

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

複数のフラグはスペース区切りの文字列として指定できます：

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### ネットワークプロキシ（すべてのサンドボックスメソッド）

アウトバウンドネットワークアクセスを許可リストに制限したい場合は、サンドボックスと一緒にローカルプロキシを実行できます：

- `GEMINI_SANDBOX_PROXY_COMMAND=<command>` を設定
- コマンドは `:::8877` でリッスンするプロキシサーバーを起動する必要があります

これは `*-proxied` シートベルトプロファイルと組み合わせて特に有用です。

動作する許可リスト形式のプロキシ例については、こちらをご参照ください：[プロキシスクリプト例](/developers/examples/proxy-script)。

## Linux UID/GID の処理

サンドボックスは Linux 上でのユーザー権限を自動的に処理します。これらの権限を上書きするには以下を使用してください：

```bash
export SANDBOX_SET_UID_GID=true   # ホストの UID/GID を強制
export SANDBOX_SET_UID_GID=false  # UID/GID マッピングを無効化
```

## サンドボックス環境のカスタマイズ (Docker/Podman)

コンテナ内で追加のツールが必要な場合（例: `git`, `python`, `rg`）、カスタム Dockerfile を作成してください：

- パス: `.qwen/sandbox.Dockerfile`
- 実行方法: `BUILD_SANDBOX=1 qwen -s ...`

これにより、デフォルトのサンドボックスイメージをベースにプロジェクト固有のイメージがビルドされます。

## トラブルシューティング

### よくある問題

**「Operation not permitted」**

- 操作にサンドボックス外へのアクセスが必要です。
- macOS Seatbelt の場合: より許可の多い `SEATBELT_PROFILE` を試してください。
- Docker/Podman の場合: ワークスペースが正しくマウントされているか、またコマンドがプロジェクトディレクトリ外へのアクセスを必要としていないか確認してください。

**コマンドが見つからない**

- コンテナサンドボックスの場合: `.qwen/sandbox.Dockerfile` または `.qwen/sandbox.bashrc` で追加してください。
- Seatbelt の場合: ホストのバイナリが使用されますが、サンドボックスによって一部のパスへのアクセスが制限されることがあります。

**ネットワークに関する問題**

- サンドボックスプロファイルでネットワークアクセスが許可されているか確認してください。
- プロキシ設定が正しいか検証してください。

### デバッグモード

```bash
DEBUG=1 qwen -s -p "debug command"
```

**注意:** プロジェクトの `.env` ファイルに `DEBUG=true` が設定されていても、自動的に除外されるため CLI には影響しません。Qwen Code 固有のデバッグ設定には `.qwen/.env` ファイルを使用してください。

### サンドボックスの検査

```bash

# 環境を確認
qwen -s -p "run shell command: env | grep SANDBOX"

# マウントを一覧表示
qwen -s -p "run shell command: mount | grep workspace"
```

## セキュリティに関する注意事項

- サンドボックスはリスクを軽減しますが、すべてのリスクを排除するわけではありません。
- 作業を可能にする最も制限の厳しいプロファイルを使用してください。
- 最初のプル／ビルド以降はコンテナのオーバーヘッドは最小限です。
- GUI アプリケーションはサンドボックスでは動作しない場合があります。

## 関連ドキュメント

- [設定](../users/configuration/settings): 設定オプション全般。
- [コマンド](../users/reference/cli-reference): 利用可能なコマンド。
- [トラブルシューティング](../users/support/troubleshooting): 一般的なトラブルシューティング。