## サンドボックス環境のカスタマイズ（Docker/Podman）

### 現在、npm パッケージ経由でインストールした後では、`BUILD_SANDBOX` 関数の使用はサポートされていません

1. カスタムサンドボックスをビルドするには、ソースコードリポジトリ内のビルドスクリプト（`scripts/build_sandbox.js`）にアクセスする必要があります。
2. これらのビルドスクリプトは、npm で公開されているパッケージには含まれていません。
3. コード内にはハードコードされたパスチェックが存在し、ソースコード環境以外からのビルド要求を明示的に拒否します。

コンテナ内に追加のツール（例：`git`、`python`、`rg`）が必要な場合は、カスタム Dockerfile を作成してください。具体的な手順は以下の通りです。

#### 1. まず、Qwen Code プロジェクトをクローンします：https://github.com/QwenLM/qwen-code.git

#### 2. ソースコードリポジトリのディレクトリ内で、以下の操作を実行していることを確認してください

```bash

# 1. まず、プロジェクトの依存関係をインストールします
npm install

# 2. Qwen Code プロジェクトをビルドします
npm run build

# 3. `dist` ディレクトリが生成されたことを確認する
ls -la packages/cli/dist/

# 4. CLI パッケージディレクトリ内でグローバルリンクを作成する
cd packages/cli
npm link

# 5. リンクの確認（現在はソースコードを指しているはずです）
which qwen

# 期待される出力: /xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen

# または同様のパスですが、シンボリックリンクである必要があります

# 6. シンボリックリンクの詳細については、具体的なソースコードパスを確認できます
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code

# これは、あなたのソースコードディレクトリを指すシンボリックリンクであることが表示されるはずです

# 7. `qwen` のバージョンをテストする
qwen -v

# `npm link` はグローバルな `qwen` を上書きします。同じバージョン番号で区別がつかなくなるのを避けるため、事前にグローバル CLI をアンインストールすることを推奨します

#### 3. 自分のプロジェクトのルートディレクトリにサンドボックス用の Dockerfile を作成します

- パス: `.qwen/sandbox.Dockerfile`

- 公式ミラーイメージのアドレス: https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash
# 公式 Qwen サンドボックスイメージをベースにします（バージョンを明示的に指定することを推奨）
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43

# ここに追加のツールをインストールします
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

#### 4. プロジェクトのルートディレクトリで最初のサンドボックスイメージを作成します

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s

# 起動したツールのサンドボックス版のバージョンが、カスタムイメージのバージョンと一致しているか確認してください。一致していれば、起動は成功です。
```

これは、デフォルトのサンドボックスイメージをベースとして、プロジェクト固有のイメージを構築します。

#### npm link の削除

- `qwen` の公式 CLI に戻したい場合は、npm link を削除してください

```bash

# 方法 1: グローバルにリンクを解除する
npm unlink -g @qwen-code/qwen-code

# 方法 2: packages/cli ディレクトリで削除する
cd packages/cli
npm unlink

# リンク解除の確認
which qwen

# 「qwen not found」と表示されるはずです

# 必要に応じてグローバル版を再インストールする
npm install -g @qwen-code/qwen-code

# リンク復元の確認
which qwen
qwen --version