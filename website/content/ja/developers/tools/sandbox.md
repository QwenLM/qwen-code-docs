## サンドボックス環境のカスタマイズ (Docker/Podman)

### 現在、プロジェクトではnpmパッケージ経由でインストールした後にBUILD_SANDBOX機能を使用することはサポートされていません

1. カスタムサンドボックスを構築するには、ソースコードリポジトリ内のビルドスクリプト (scripts/build_sandbox.js) にアクセスする必要があります。
2. これらのビルドスクリプトは、npmによってリリースされるパッケージには含まれていません。
3. コードにはハードコードされたパスチェックが含まれており、ソースコード環境以外からのビルド要求を明示的に拒否します。

コンテナ内に追加のツール (例: `git`、`python`、`rg`) を必要とする場合は、カスタムDockerfileを作成してください。具体的な操作手順は以下の通りです。

#### 1. まずqwen codeプロジェクトをクローンします: https://github.com/QwenLM/qwen-code.git

#### 2. 以下の操作をソースコードリポジトリディレクトリ内で実行してください

```bash

# 1. まず、プロジェクトの依存関係をインストールします
npm install

# 2. Qwen Codeプロジェクトをビルドします
npm run build
```

# 3. distディレクトリが生成されたことを確認する
ls -la packages/cli/dist/

# 4. CLIパッケージディレクトリにグローバルリンクを作成する
cd packages/cli
npm link

# 5. リンクの検証（現在はソースコードを指しているはずです）
which qwen

# 期待される出力: /xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen

# または同様のパスですが、シンボリックリンクである必要があります

# 6. シンボリックリンクの詳細については、具体的なソースコードパスを確認できます
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code

# これはソースコードディレクトリを指すシンボリックリンクであることが表示されます

# 7. qwenのバージョンをテストする
qwen -v

# npm linkはグローバルのqwenを上書きします。同じバージョン番号で区別がつかなくなるのを避けるため、最初にグローバルCLIをアンインストールできます

#### 3. プロジェクトのルートディレクトリ配下に、独自のサンドボックス Dockerfile を作成する

- パス: `.qwen/sandbox.Dockerfile`

- 公式ミラーイメージアドレス: https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash

# 公式の Qwen サンドボックスイメージをベースにする（バージョンを明示的に指定することを推奨）
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43

# 追加のツールをここに追加
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

#### 4. プロジェクトのルートディレクトリ配下で最初のサンドボックスイメージを作成する

```bash
GEMINI_SANDBOX=docker BUILD_SANDBOX=1 qwen -s

# 起動したツールのサンドボックス版がカスタムイメージのバージョンと一致しているか確認してください。一致していれば起動は成功です。
```

これにより、デフォルトのサンドボックスイメージに基づいたプロジェクト固有のイメージが構築されます。

#### npm リンクの削除

- qwen の公式 CLI に戻したい場合は、npm リンクを削除してください

```bash
```

# 方法 1: グローバルにアンリンク
npm unlink -g @qwen-code/qwen-code

# 方法 2: packages/cli ディレクトリで削除
cd packages/cli
npm unlink

# 検証が解除されました
which qwen

# 「qwen not found」と表示されるはずです

# 必要に応じてグローバル版を再インストール
npm install -g @qwen-code/qwen-code

# 検証の復元
which qwen
qwen --version
```