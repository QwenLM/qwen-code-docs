# Qwen Code の実行とデプロイ

本ドキュメントでは、Qwen Code の実行方法と、Qwen Code が採用するデプロイアーキテクチャについて説明します。

## Qwen Code の実行

Qwen Code には複数の実行方法があります。用途に応じて適切な方法を選択してください。

---

### 1. 標準インストール（一般的なユーザー向け推奨）

エンドユーザーが Qwen Code をインストールする際の推奨方法です。NPM レジストリから Qwen Code パッケージをダウンロードして使用します。

- **グローバルインストール:**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  インストール後、任意のディレクトリから CLI を実行できます:

  ```bash
  qwen
  ```

- **NPX での実行:**

  ```bash
  # Execute the latest version from NPM without a global install
  npx @qwen-code/qwen-code
  ```

---

### 2. サンドボックスでの実行（Docker/Podman）

セキュリティと分離性を確保するため、Qwen Code はコンテナ内で実行できます。これは、副作用を伴う可能性のあるツールを CLI が実行する際のデフォルトの動作です。

- **レジストリから直接実行:**
  公開済みのサンドボックスイメージを直接実行できます。Docker のみインストールされており、CLI を実行したい環境で便利です。
  ```bash
  # Run the published sandbox image
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **`--sandbox` フラグの使用:**
  ローカル環境に Qwen Code をインストールしている場合（上記の標準インストールを使用）、サンドボックスコンテナ内で実行するよう指示できます。
  ```bash
  qwen --sandbox -y -p "your prompt here"
  ```

---

### 3. ソースコードからの実行（Qwen Code 貢献者向け推奨）

プロジェクトの貢献者は、ソースコードから直接 CLI を実行することになります。

- **開発モード:**
  この方法ではホットリロードが有効になり、活発な開発作業に便利です。
  ```bash
  # From the root of the repository
  npm run start
  ```
- **本番環境に近いモード（リンク済みパッケージ）:**
  ローカルパッケージをリンクすることで、グローバルインストールをシミュレートします。本番ワークフローでローカルビルドをテストする際に便利です。

  ```bash
  # Link the local cli package to your global node_modules
  npm link packages/cli

  # Now you can run your local version using the `qwen` command
  qwen
  ```

---

### 4. GitHub 上の最新コミットからの実行

GitHub リポジトリから、最も最近コミットされた Qwen Code のバージョンを直接実行できます。開発中の機能をテストする際に便利です。

```bash
# Execute the CLI directly from the main branch on GitHub
npx https://github.com/QwenLM/qwen-code
```

## デプロイアーキテクチャ

上記の実行方法は、以下のアーキテクチャコンポーネントとプロセスによって実現されています:

**NPM パッケージ**

Qwen Code プロジェクトはモノレポ構成であり、コアパッケージを NPM レジストリに公開しています:

- `@qwen-code/qwen-code-core`: バックエンド。ロジックの処理とツールの実行を担当します。
- `@qwen-code/qwen-code`: ユーザー向けフロントエンド。

これらのパッケージは、標準インストール時およびソースコードからの実行時に使用されます。

**ビルドおよびパッケージングプロセス**

配布チャネルに応じて、以下の 2 つの異なるビルドプロセスが使用されます:

- **NPM 公開:** NPM レジストリへの公開にあたり、`@qwen-code/qwen-code-core` および `@qwen-code/qwen-code` の TypeScript ソースコードは、TypeScript Compiler (`tsc`) を使用して標準的な JavaScript にトランスパイルされます。生成された `dist/` ディレクトリの内容が NPM パッケージとして公開されます。これは TypeScript ライブラリにおける標準的なアプローチです。

- **GitHub `npx` 実行:** GitHub から Qwen Code の最新バージョンを直接実行する場合、`package.json` の `prepare` スクリプトによって異なるプロセスがトリガーされます。このスクリプトは `esbuild` を使用し、アプリケーション全体とその依存関係を単一の自己完結型 JavaScript ファイルにバンドルします。このバンドルファイルはユーザーのマシン上で実行時に動的に生成され、リポジトリにはコミットされません。

**Docker サンドボックスイメージ**

Docker ベースの実行方法は、`qwen-code-sandbox` コンテナイメージによってサポートされています。このイメージはコンテナレジストリに公開されており、Qwen Code のグローバルインストール済みバージョンが同梱されています。

## リリースプロセス

リリースプロセスは GitHub Actions によって自動化されています。リリースワークフローでは以下の処理が実行されます:

1.  `tsc` を使用して NPM パッケージをビルドします。
2.  NPM パッケージをアーティファクトレジストリに公開します。
3.  バンドル済みアセットを含む GitHub リリースを作成します。