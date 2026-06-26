# 拡張機能のリリース

拡張機能をユーザーにリリースするには、主に3つの方法があります:

- [Git リポジトリ](#releasing-through-a-git-repository)
- [GitHub Releases](#releasing-through-github-releases)
- [npm Registry](#releasing-through-npm-registry)

Git リポジトリによるリリースは最もシンプルで柔軟な方法である傾向があります。一方、GitHub Releases は、各ファイルを個別にダウンロードする git clone を必要とせず、単一のアーカイブとして配信されるため、初回インストール時の効率が良くなります。GitHub Releases には、プラットフォーム固有のバイナリファイルを同梱する必要がある場合に、プラットフォーム固有のアーカイブを含めることもできます。npm Registry によるリリースは、特にプライベートレジストリを使用している場合、既に npm をパッケージ配信に使用しているチームに最適です。

## Git リポジトリによるリリース

これは最も柔軟でシンプルなオプションです。公開された Git リポジトリ（公開 GitHub リポジトリなど）を作成するだけで、ユーザーは `qwen extensions install <your-repo-uri>` を使用して拡張機能をインストールできます。GitHub リポジトリの場合は、簡略化された形式 `qwen extensions install <org>/<repo>` を使用することもできます。また、`--ref=<some-ref>` 引数を使用して特定の ref（ブランチ/タグ/コミット）に依存することもできます（デフォルトはデフォルトブランチです）。

ユーザーが依存している ref にコミットがプッシュされると、拡張機能の更新を促すプロンプトが表示されます。これにより、簡単なロールバックも可能です。HEAD コミットは、`qwen-extension.json` ファイル内の実際のバージョンに関係なく、常に最新バージョンとして扱われます。

### Git リポジトリを使用したリリースチャネルの管理

ユーザーは Git リポジトリの任意の ref（ブランチやタグなど）に依存できるため、複数のリリースチャネルを管理できます。

例えば、`stable` ブランチを維持し、ユーザーは次のようにインストールできます: `qwen extensions install <your-repo-uri> --ref=stable`。または、デフォルトブランチを安定版リリースブランチとして扱い、別のブランチ（例えば `dev`）で開発を行うこともできます。必要に応じて、任意の数のブランチやタグを維持でき、最大限の柔軟性を提供します。

これらの `ref` 引数はタグ、ブランチ、特定のコミットでもよく、ユーザーは拡張機能の特定のバージョンに依存できます。タグとブランチの管理方法はご自身で決めてください。

### Git リポジトリを使用したリリースフローの例

Git フローを使用したリリース管理には多くのオプションがありますが、デフォルトブランチを「安定版」リリースブランチとして扱うことをお勧めします。つまり、`qwen extensions install <your-repo-uri>` のデフォルト動作は安定版リリースブランチを使用することになります。

例えば、3つの標準リリースチャネル（`stable`、`preview`、`dev`）を維持するとします。標準的な開発はすべて `dev` ブランチで行います。プレビューリリースの準備ができたら、そのブランチを `preview` ブランチにマージします。プレビューブランチを安定版に昇格させる準備ができたら、`preview` を安定版ブランチ（デフォルトブランチまたは別のブランチ）にマージします。

`git cherry-pick` を使用して、あるブランチから別のブランチに変更をチェリーピックすることもできますが、これによりブランチの履歴が互いに少し異なるものになります（リリース時にブランチに force push して履歴をクリーンな状態に戻さない限り、デフォルトブランチではリポジトリ設定によってはできない場合があります）。チェリーピックを計画している場合は、デフォルトブランチへの force push を避けるために、デフォルトブランチを安定版ブランチにしないことを検討してください。デフォルトブランチへの force push は通常避けるべきです。

## GitHub Releases によるリリース

Qwen Code 拡張機能は [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) を通じて配布できます。これにより、リポジトリをクローンする必要がなくなるため、ユーザーにとってより高速で信頼性の高い初回インストール体験が提供されます。

各リリースには少なくとも1つのアーカイブファイルが含まれており、リンク先のタグにあるリポジトリの全内容が含まれています。拡張機能にビルドステップが必要な場合や、プラットフォーム固有のバイナリが添付されている場合は、[プリビルドアーカイブ](#custom-pre-built-archives) を含めることもできます。

更新を確認するとき、Qwen Code は GitHub 上の最新リリースを探します（リリース作成時に最新としてマークする必要があります）。ただし、ユーザーが `--ref=<some-release-tag>` を指定して特定のリリースをインストールした場合は除きます。現時点では、プレリリースリリースや semver へのオプトインはサポートしていません。

### カスタムプリビルドアーカイブ

カスタムアーカイブは、GitHub リリースにアセットとして直接添付する必要があり、完全に自己完結型である必要があります。つまり、拡張機能全体を含む必要があります。[アーカイブ構造](#archive-structure) を参照してください。

拡張機能がプラットフォームに依存しない場合は、単一の汎用アセットを提供できます。この場合、リリースに添付されるアセットは1つだけである必要があります。

拡張機能をより大きなリポジトリ内で開発する場合にもカスタムアーカイブを使用できます。リポジトリ自体とは異なるレイアウトのアーカイブをビルドできます（例えば、拡張機能を含むサブディレクトリのみのアーカイブなど）。

#### プラットフォーム固有のアーカイブ

Qwen Code が各プラットフォームに適切なリリースアセットを自動的に見つけられるようにするには、次の命名規則に従う必要があります。CLI は次の順序でアセットを検索します:

1.  **プラットフォームおよびアーキテクチャ固有:** `{platform}.{arch}.{name}.{extension}`
2.  **プラットフォーム固有:** `{platform}.{name}.{extension}`
3.  **汎用:** アセットが1つだけ提供されている場合は、汎用フォールバックとして使用されます。

- `{name}`: 拡張機能の名前。
- `{platform}`: オペレーティングシステム。サポートされる値:
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}`: アーキテクチャ。サポートされる値:
  - `x64`
  - `arm64`
- `{extension}`: アーカイブのファイル拡張子（例: `.tar.gz` または `.zip`）。

**例:**

- `darwin.arm64.my-tool.tar.gz`（Apple Silicon Mac 向け）
- `darwin.my-tool.tar.gz`（すべての Mac 向け）
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### アーカイブ構造

アーカイブは完全に自己完結型の拡張機能である必要があり、すべての標準要件を満たす必要があります。具体的には、`qwen-extension.json` ファイルがアーカイブのルートにある必要があります。

残りのレイアウトは、通常の拡張機能とまったく同じである必要があります。[introduction.md](./introduction.md) を参照してください。

#### GitHub Actions ワークフローの例

以下は、複数のプラットフォーム向けに Qwen Code 拡張機能をビルドしてリリースする GitHub Actions ワークフローの例です:

```yaml
name: Release Extension

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm ci

      - name: Build extension
        run: npm run build

      - name: Create release assets
        run: |
          npm run package -- --platform=darwin --arch=arm64
          npm run package -- --platform=linux --arch=x64
          npm run package -- --platform=win32 --arch=x64

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            release/darwin.arm64.my-tool.tar.gz
            release/linux.arm64.my-tool.tar.gz
            release/win32.arm64.my-tool.zip
```

## npm Registry によるリリース

Qwen Code 拡張機能は、スコープ付き npm パッケージ（例: `@your-org/my-extension`）として公開できます。これは次の場合に適しています:

- チームがすでに npm をパッケージ配信に使用している
- 既存の認証インフラストラクチャでプライベートレジストリをサポートする必要がある
- バージョン解決とアクセス制御を npm に任せたい

### パッケージの要件

npm パッケージのルートには `qwen-extension.json` ファイルを含める必要があります。これはすべての Qwen Code 拡張機能で使用される同じ設定ファイルです。npm の tarball は単なる別の配信メカニズムです。

最小限のパッケージ構造は次のようになります:

```
my-extension/
├── package.json
├── qwen-extension.json
├── QWEN.md              # オプションのコンテキストファイル
├── commands/             # オプションのカスタムコマンド
├── skills/               # オプションのカスタムスキル
└── agents/               # オプションのカスタムサブエージェント
```

公開パッケージに `qwen-extension.json` が含まれていることを確認してください（つまり、`.npmignore` や `package.json` の `files` フィールドで除外されていないこと）。

### 公開

標準的な npm 公開ツールを使用します:

```bash
# デフォルトレジストリに公開
npm publish

# プライベート/カスタムレジストリに公開
npm publish --registry https://your-registry.com
```

### インストール

ユーザーはスコープ付きパッケージ名を使用して拡張機能をインストールします:

```bash
# 最新バージョンをインストール
qwen extensions install @your-org/my-extension

# 特定のバージョンをインストール
qwen extensions install @your-org/my-extension@1.2.0

# カスタムレジストリからインストール
qwen extensions install @your-org/my-extension --registry https://your-registry.com
```

### 更新動作

- バージョンを指定せずにインストールされた拡張機能（例: `@scope/pkg`）は、`latest` dist-tag を追跡します。
- dist-tag を指定してインストールされた拡張機能（例: `@scope/pkg@beta`）は、その特定のタグを追跡します。
- 正確なバージョンに固定された拡張機能（例: `@scope/pkg@1.2.0`）は常に最新とみなされ、更新を促すプロンプトは表示されません。

### プライベートレジストリの認証

Qwen Code は npm 認証情報を自動的に読み取ります:

1. **`NPM_TOKEN` 環境変数** — 最も優先度が高い
2. **`.npmrc` ファイル** — ホストレベルとパススコープの両方の `_authToken` エントリをサポート（例: `//your-registry.com/:_authToken=TOKEN` または `//pkgs.dev.azure.com/org/_packaging/feed/npm/registry/:_authToken=TOKEN`）

`.npmrc` ファイルはカレントディレクトリとユーザーのホームディレクトリから読み取られます。

### リリースチャネルの管理

npm dist-tags を使用してリリースチャネルを管理できます:

```bash
# ベータリリースを公開
npm publish --tag beta

# ユーザーはベータチャネルをインストール
qwen extensions install @your-org/my-extension@beta
```

これは Git ブランチベースのリリースチャネルと同様に機能しますが、npm のネイティブな dist-tag メカニズムを使用します。