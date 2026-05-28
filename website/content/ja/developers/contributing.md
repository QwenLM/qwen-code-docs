---
description: "Qwen Code への貢献手順を確認し、開発環境、commit ルール、テスト、PR フローを理解して、オープンソース協力をスムーズに進めます。"
---

# 貢献方法

本プロジェクトへのパッチやコントリビューションを歓迎します。

## コントリビューションの流れ

### コードレビュー

プロジェクトメンバーによる提出物を含め、すべての提出物はレビューが必要です。レビューには [GitHub pull requests](https://docs.github.com/articles/about-pull-requests) を使用します。

### Pull Request のガイドライン

PR のレビューとマージを迅速に行うため、以下のガイドラインに従ってください。基準を満たさない PR はクローズされる場合があります。

#### 1. 既存の Issue にリンクする

すべての PR は、トラッカー内の既存の Issue にリンクする必要があります。これにより、コードを記述する前に、すべての変更が議論され、プロジェクトの目標と一致していることが保証されます。

- **バグ修正の場合:** PR はバグレポートの Issue にリンクしてください。
- **新機能の場合:** PR はメンテナーによって承認された機能リクエストまたは提案の Issue にリンクしてください。

変更に対応する Issue が存在しない場合は、コーディングを開始する前に **まず Issue を作成し**、フィードバックを待ってください。

#### 2. 変更を小さく、焦点を絞る

単一の Issue に対応するか、単一の自己完結型機能を追加する、小さくアトミックな PR を推奨します。

- **推奨:** 特定のバグを 1 つ修正する、または特定の新機能を 1 つ追加する PR を作成する。
- **非推奨:** 複数の無関係な変更（例：バグ修正、新機能、リファクタリング）を 1 つの PR にまとめる。

大規模な変更は、独立してレビューおよびマージ可能な、より小さく論理的な PR のシリーズに分割してください。

#### 3. 作業中の場合は Draft PR を使用する

作業に対して早期にフィードバックを得たい場合は、GitHub の **Draft Pull Request** 機能を使用してください。これにより、メンテナーに対して PR が正式なレビューの準備はできていないが、議論や初期フィードバックは受け付けていることを伝えられます。

#### 4. すべてのチェックが通過することを確認する

PR を提出する前に、`npm run preflight` を実行してすべての自動チェックが通過することを確認してください。このコマンドは、すべてのテスト、リンティング、その他のスタイルチェックを実行します。

#### 5. ドキュメントを更新する

PR がユーザー向けの変更（例：新しいコマンド、フラグの変更、動作の変更）を導入する場合は、`/docs` ディレクトリ内の関連ドキュメントも更新する必要があります。

#### 6. 明確なコミットメッセージと適切な PR 説明を記述する

PR には明確で説明的なタイトルと、変更の詳細な説明を含めてください。コミットメッセージには [Conventional Commits](https://www.conventionalcommits.org/) 標準に従ってください。

- **良い PR タイトル:** `feat(cli): Add --json flag to 'config get' command`
- **悪い PR タイトル:** `Made some changes`

PR 説明には、変更の「理由」を記述し、関連する Issue にリンクしてください（例：`Fixes #123`）。

## 開発環境のセットアップとワークフロー

このセクションでは、本プロジェクトの開発環境のビルド、変更、および理解方法についてコントリビューター向けに説明します。

### 開発環境のセットアップ

**前提条件:**

1.  **Node.js**:
    - **開発環境:** Node.js `~20.19.0` を使用してください。依存パッケージの開発依存関係の問題により、この特定のバージョンが必要です。[nvm](https://github.com/nvm-sh/nvm) などのツールを使用して Node.js のバージョンを管理できます。
    - **本番環境:** 本番環境で CLI を実行する場合、Node.js `>=20` の任意のバージョンで問題ありません。
2.  **Git**

### ビルドプロセス

リポジトリをクローンするには:

```bash
git clone https://github.com/QwenLM/qwen-code.git # Or your fork's URL
cd qwen-code
```

`package.json` で定義された依存関係とルート依存関係をインストールするには:

```bash
npm install
```

プロジェクト全体（すべてのパッケージ）をビルドするには:

```bash
npm run build
```

このコマンドは通常、TypeScript を JavaScript にコンパイルし、アセットをバンドルして、パッケージの実行準備を行います。ビルド中に何が行われるかの詳細については、`scripts/build.js` と `package.json` のスクリプトを参照してください。

### Sandboxing の有効化

[Sandboxing](#sandboxing) を強く推奨します。最低限、`~/.env` で `QWEN_SANDBOX=true` を設定し、サンドボックスプロバイダー（例：`macOS Seatbelt`、`docker`、または `podman`）が利用可能であることを確認する必要があります。詳細は [Sandboxing](#sandboxing) を参照してください。

`qwen-code` CLI ユーティリティとサンドボックスコンテナの両方をビルドするには、ルートディレクトリから `build:all` を実行します:

```bash
npm run build:all
```

サンドボックスコンテナのビルドをスキップする場合は、代わりに `npm run build` を使用できます。

### 実行

ソースコードから Qwen Code アプリケーションを起動するには（ビルド後）、ルートディレクトリから次のコマンドを実行します:

```bash
npm start
```

qwen-code フォルダ外でソースビルドを実行したい場合は、`npm link path/to/qwen-code/packages/cli`（参照: [docs](https://docs.npmjs.com/cli/v9/commands/npm-link)）を利用して `qwen-code` として実行できます。

### テストの実行

このプロジェクトには、ユニットテストとインテグレーションテストの 2 種類のテストが含まれています。

#### ユニットテスト

プロジェクトのユニットテストスイートを実行するには:

```bash
npm run test
```

これにより、`packages/core` および `packages/cli` ディレクトリ内のテストが実行されます。変更を提出する前に、テストが通過することを確認してください。より包括的なチェックを行うには、`npm run preflight` の実行を推奨します。

#### インテグレーションテスト

インテグレーションテストは、Qwen Code のエンドツーエンドの機能を検証するために設計されています。デフォルトの `npm run test` コマンドの一部としては実行されません。

インテグレーションテストを実行するには、次のコマンドを使用します:

```bash
npm run test:e2e
```

インテグレーションテストフレームワークの詳細については、[Integration Tests documentation](./docs/integration-tests.md) を参照してください。

### リンティングと Preflight チェック

コード品質とフォーマットの一貫性を確保するには、preflight チェックを実行します:

```bash
npm run preflight
```

このコマンドは、プロジェクトの `package.json` で定義されている ESLint、Prettier、すべてのテスト、およびその他のチェックを実行します。

_ヒント_

クローン後、コミットが常にクリーンな状態を保つように Git pre-commit フックファイルを作成してください。

```bash
echo "
# Run npm build and check for errors
if ! npm run preflight; then
  echo "npm build failed. Commit aborted."
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### フォーマット

このプロジェクトのコードを個別にフォーマットするには、ルートディレクトリから次のコマンドを実行します:

```bash
npm run format
```

このコマンドは Prettier を使用して、プロジェクトのスタイルガイドラインに従ってコードをフォーマットします。

#### リンティング

このプロジェクトのコードを個別にリントするには、ルートディレクトリから次のコマンドを実行します:

```bash
npm run lint
```

### コーディング規約

- 既存のコードベース全体で使用されているコーディングスタイル、パターン、および規約に従ってください。
- **インポート:** インポートパスに特に注意してください。このプロジェクトでは、パッケージ間の相対インポートに対する制限を ESLint で強制しています。

### プロジェクト構成

- `packages/`: プロジェクトの個別のサブパッケージが含まれています。
  - `cli/`: コマンドラインインターフェース。
  - `core/`: Qwen Code のコアバックエンドロジック。
- `docs/`: すべてのプロジェクトドキュメントが含まれています。
- `scripts/`: ビルド、テスト、開発タスク用のユーティリティスクリプト。

詳細なアーキテクチャについては、`docs/architecture.md` を参照してください。

## ドキュメント開発

このセクションでは、ドキュメントをローカルで開発およびプレビューする方法について説明します。

### 前提条件

1. Node.js（バージョン 18 以降）がインストールされていることを確認する
2. npm または yarn が利用可能であること

### ドキュメントサイトをローカルにセットアップする

ドキュメントの作業とローカルでの変更プレビューを行うには:

1. `docs-site` ディレクトリに移動します:

   ```bash
   cd docs-site
   ```

2. 依存関係をインストールします:

   ```bash
   npm install
   ```

3. メインの `docs` ディレクトリからドキュメントコンテンツをリンクします:

   ```bash
   npm run link
   ```

   これにより、docs-site プロジェクト内の `content` に `../docs` からのシンボリックリンクが作成され、Next.js サイトでドキュメントコンテンツが提供されるようになります。

4. 開発サーバーを起動します:

   ```bash
   npm run dev
   ```

5. ブラウザで [http://localhost:3000](http://localhost:3000) を開き、変更を加えながらドキュメントサイトのライブ更新を確認します。

メインの `docs` ディレクトリ内のドキュメントファイルに加えられた変更は、ドキュメントサイトに即座に反映されます。

## デバッグ

### VS Code:

0.  `F5` キーを押して CLI を実行し、VS Code で対話的にデバッグする
1.  ルートディレクトリから CLI をデバッグモードで起動します:
    ```bash
    npm run debug
    ```
    このコマンドは `packages/cli` ディレクトリ内で `node --inspect-brk dist/index.js` を実行し、デバッガーが接続されるまで実行を一時停止します。その後、Chrome ブラウザで `chrome://inspect` を開いてデバッガーに接続できます。
2.  VS Code で「Attach」起動構成（`.vscode/launch.json` にあります）を使用します。

現在開いているファイルを直接起動したい場合は、VS Code の「Launch Program」構成を使用することもできますが、一般的には 'F5' を推奨します。

サンドボックスコンテナ内でブレークポイントにヒットさせるには、次を実行します:

```bash
DEBUG=1 qwen-code
```

**注:** プロジェクトの `.env` ファイルに `DEBUG=true` が設定されている場合、自動除外により qwen-code には影響しません。qwen-code 固有のデバッグ設定には `.qwen-code/.env` ファイルを使用してください。

### React DevTools

CLI の React ベースの UI をデバッグするには、React DevTools を使用できます。CLI のインターフェースに使用されているライブラリである Ink は、React DevTools バージョン 4.x と互換性があります。

1.  **Qwen Code アプリケーションを開発モードで起動します:**

    ```bash
    DEV=true npm start
    ```

2.  **React DevTools バージョン 4.28.5（または最新の互換性のある 4.x バージョン）をインストールして実行します:**

    グローバルにインストールする方法:

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    または npx を使用して直接実行する方法:

    ```bash
    npx react-devtools@4.28.5
    ```

    実行中の CLI アプリケーションが React DevTools に接続されます。

## Sandboxing

> TBD

## 手動での公開

各コミットのアーティファクトは内部レジストリに公開されます。ただし、ローカルビルドを手動で作成する必要がある場合は、次のコマンドを実行してください:

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```