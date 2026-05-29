---
description: "Qwen Code のサンドボックス環境をカスタマイズします。Docker または Podman コンテナを構築し、AI によるコード実行、ファイル変更、プロジェクト固有のツールを安全に分離します。"
---

# サンドボックス環境のカスタマイズ（Docker/Podman）

## 現在、npm パッケージ経由でインストールした場合、`BUILD_SANDBOX` 機能の使用はサポートされていません

1. カスタムサンドボックスをビルドするには、ソースコードリポジトリ内のビルドスクリプト（`scripts/build_sandbox.js`）にアクセスする必要があります。
2. これらのビルドスクリプトは、npm でリリースされるパッケージには含まれていません。
3. コードにはハードコードされたパスチェックが含まれており、ソースコード環境以外からのビルドリクエストは明示的に拒否されます。

コンテナ内に追加のツール（例: `git`、`python`、`rg`）が必要な場合は、カスタム Dockerfile を作成してください。具体的な手順は以下の通りです。

### 1. Qwen Code プロジェクトをクローンします: https://github.com/QwenLM/qwen-code.git

### 2. 以下の操作は必ずソースコードリポジトリのディレクトリ内で実行してください

```bash
# 1. プロジェクトの依存関係をインストールします
npm install

# 2. Qwen Code プロジェクトをビルドします
npm run build

# 3. dist ディレクトリが生成されていることを確認します
ls -la packages/cli/dist/

# 4. CLI パッケージディレクトリでグローバルリンクを作成します
cd packages/cli
npm link

# 5. リンクを確認します（ソースコードを指しているはずです）
which qwen
# 期待される出力: /xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen
# または類似のパスですが、シンボリックリンクである必要があります

# 6. シンボリックリンクの詳細を確認し、ソースコードの具体的なパスを表示します
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code
# ソースコードディレクトリを指すシンボリックリンクであることが表示されるはずです

# 7. qwen のバージョンを確認します
qwen -v
# npm link はグローバルの qwen を上書きします。同じバージョン番号で区別がつかなくなるのを防ぐため、事前にグローバル CLI をアンインストールできます

```

### 3. プロジェクトのルートディレクトリにサンドボックス用の Dockerfile を作成します

- パス: `.qwen/sandbox.Dockerfile`

- 公式イメージのアドレス: https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash
# 公式 Qwen サンドボックスイメージをベースにします（バージョンを明示的に指定することを推奨します）
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43
# ここに追加のツールをインストールします
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

### 4. プロジェクトのルートディレクトリで最初のサンドボックスイメージを作成します

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
# 起動したツールのサンドボックスバージョンがカスタムイメージのバージョンと一致しているか確認します。一致していれば起動成功です
```

これにより、デフォルトのサンドボックスイメージをベースに、プロジェクト固有のイメージがビルドされます。

### npm link の解除

- qwen の公式 CLI に戻す場合は、npm link を解除してください

```bash
# 方法 1: グローバルにリンクを解除します
npm unlink -g @qwen-code/qwen-code

# 方法 2: packages/cli ディレクトリ内で解除します
cd packages/cli
npm unlink

# リンクが解除されたことを確認します
which qwen
# 「qwen not found」と表示されるはずです

# 必要に応じてグローバル版を再インストールします
npm install -g @qwen-code/qwen-code

# 復元されたことを確認します
which qwen
qwen --version
```
