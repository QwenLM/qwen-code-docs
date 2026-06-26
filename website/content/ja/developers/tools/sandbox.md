## サンドボックス環境のカスタマイズ (Docker/Podman)

### 現在、プロジェクトはnpmパッケージ経由でのインストール後にBUILD_SANDBOX機能の使用をサポートしていません

1. カスタムサンドボックスを構築するには、ソースコードリポジトリ内のビルドスクリプト（scripts/build_sandbox.js）にアクセスする必要があります。
2. これらのビルドスクリプトは、npmでリリースされたパッケージには含まれていません。
3. コードにはハードコードされたパスチェックが含まれており、ソースコード環境以外からのビルドリクエストを明示的に拒否します。

コンテナ内に追加のツール（例：`git`、`python`、`rg`）が必要な場合は、カスタムDockerfileを作成してください。具体的な手順は以下の通りです。

#### 1. 最初にQwen Codeプロジェクトをクローンします、https://github.com/QwenLM/qwen-code.git

#### 2. ソースコードリポジトリのディレクトリ内で以下の操作を実行してください

```bash
# 1. First, install the dependencies of the project
npm install

# 2. Build the Qwen Code project
npm run build

# 3. Verify that the dist directory has been generated
ls -la packages/cli/dist/

# 4. Create a global link in the CLI package directory
cd packages/cli
npm link

# 5. Verification link (it should now point to the source code)
which qwen
# Expected output: /xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen
# Or similar paths, but it should be a symbolic link

# 6. For details of the symbolic link, you can see the specific source code path
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code
# It should show that this is a symbolic link pointing to your source code directory

# 7.Test the version of qwen
qwen -v
# npm link will overwrite the global qwen. To avoid being unable to distinguish the same version number, you can uninstall the global CLI first

```

#### 3. プロジェクトのルートディレクトリにサンドボックス用Dockerfileを作成します

- パス: `.qwen/sandbox.Dockerfile`

- 公式ミラーイメージアドレス: https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash
# Based on the official Qwen sandbox image (It is recommended to explicitly specify the version)
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43
# Add your extra tools here
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

#### 4. プロジェクトのルートディレクトリで最初のサンドボックスイメージを作成します

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
# Observe whether the sandbox version of the tool you launched is consistent with the version of your custom image. If they are consistent, the startup will be successful
```

これにより、デフォルトのサンドボックスイメージをベースに、プロジェクト固有のイメージがビルドされます。

#### npm linkの削除

- 公式のqwen CLIに戻したい場合は、npm linkを削除してください。

```bash
# Method 1: Unlink globally
npm unlink -g @qwen-code/qwen-code

# Method 2: Remove it in the packages/cli directory
cd packages/cli
npm unlink

# Verification has been lifted
which qwen
# It should display "qwen not found"

# Reinstall the global version if necessary
npm install -g @qwen-code/qwen-code

# Verification Recovery
which qwen
qwen --version
```