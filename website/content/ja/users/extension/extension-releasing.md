# エクステンションのリリース

ユーザーにエクステンションをリリースする主な方法は次の 3 つです：

- [Git リポジトリ](#releasing-through-a-git-repository)
- [GitHub Releases](#releasing-through-github-releases)
- [npm Registry](#releasing-through-npm-registry)

Git リポジトリ経由のリリースは最もシンプルで柔軟な方法です。一方、GitHub Releases は単一のアーカイブとして配布されるため、ファイルを個別にダウンロードする git clone が不要になり、初回インストール時の効率が向上します。プラットフォーム固有のバイナリファイルを提供する必要がある場合、GitHub Releases にはプラットフォーム固有のアーカイブを含めることもできます。npm Registry 経由のリリースは、特にプライベートレジストリを利用している場合など、すでにパッケージ配布に npm を使用しているチームに最適です。

## Git リポジトリ経由でのリリース

これは最も柔軟でシンプルなオプションです。公開可能な Git リポジトリ（公開 GitHub リポジトリなど）を作成するだけで、ユーザーは `qwen extensions install <your-repo-uri>` を使用してエクステンションをインストールできます。GitHub リポジトリの場合は、簡略化された `qwen extensions install <org>/<repo>` 形式も利用できます。`--ref=<some-ref>` 引数を使用すると、特定の ref（ブランチ/タグ/コミット）に依存させることも可能で、デフォルトではデフォルトブランチが使用されます。

ユーザーが依存している ref にコミットがプッシュされると、エクステンションの更新が促されます。なお、これによりロールバックも容易になります。`qwen-extension.json` ファイル内の実際のバージョンに関係なく、HEAD コミットが常に最新バージョンとして扱われます。

### Git リポジトリを使用したリリースチャネルの管理

ユーザーはブランチやタグなど、Git リポジトリ内の任意の ref に依存できるため、複数のリリースチャネルを管理できます。

例えば、`stable` ブランチを維持し、ユーザーに `qwen extensions install <your-repo-uri> --ref=stable` でインストールさせることができます。または、デフォルトブランチを安定版リリースブランチとして扱い、別のブランチ（例：`dev`）で開発を行うことで、これをデフォルトにすることもできます。ブランチやタグは好きなだけ維持でき、開発者とユーザーの両方に最大限の柔軟性を提供します。

これらの `ref` 引数にはタグ、ブランチ、または特定のコミットを指定できるため、ユーザーはエクステンションの特定のバージョンに依存できます。タグやブランチの管理方法は開発者次第です。

### Git リポジトリを使用したリリースフローの例

Git フローを使用したリリース管理には多くの選択肢がありますが、デフォルトブランチを「stable」リリースブランチとして扱うことを推奨します。これにより、`qwen extensions install <your-repo-uri>` のデフォルトの動作は安定版リリースブランチを参照するようになります。

例えば、`stable`、`preview`、`dev` の 3 つの標準リリースチャネルを維持するとします。通常の開発はすべて `dev` ブランチで行います。プレビュー版をリリースする準備ができたら、そのブランチを `preview` ブランチにマージします。プレビュー版を安定版に昇格させる準備ができたら、`preview` を安定版ブランチ（デフォルトブランチまたは別のブランチ）にマージします。

`git cherry-pick` を使用して変更をあるブランチから別のブランチにチェリーピックすることもできますが、これを行うとブランチ間の履歴がわずかに分岐することに注意してください。各リリース時にブランチへ force push を行って履歴をクリーンな状態に戻さない限り分岐したままになります（リポジトリの設定によっては、デフォルトブランチではこれが不可能な場合があります）。チェリーピックを行う予定がある場合は、一般的に避けるべきデフォルトブランチへの force push を回避するため、デフォルトブランチを安定版ブランチにしないことを検討してください。

## GitHub Releases 経由でのリリース

Qwen Code エクステンションは [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) を介して配布できます。リポジトリの clone が不要になるため、ユーザーにとってより高速で信頼性の高い初回インストール体験を提供できます。

各リリースには、リンクされたタグ時点のリポジトリの全内容を含むアーカイブファイルが少なくとも 1 つ含まれます。エクステンションにビルドステップが必要な場合やプラットフォーム固有のバイナリが含まれる場合は、[ビルド済みアーカイブ](#custom-pre-built-archives) をリリースに含めることもできます。

更新を確認する際、ユーザーが `--ref=<some-release-tag>` を渡して特定のリリースをインストールしていない限り、qwen code は GitHub 上の最新リリースを検索します（リリース作成時に最新としてマークする必要があります）。現時点では、プレリリースや semver へのオプトインはサポートしていません。

### カスタムビルド済みアーカイブ

カスタムアーカイブは GitHub リリースにアセットとして直接添付する必要があり、完全に自己完結型である必要があります。つまり、エクステンション全体を含める必要があります（[アーカイブ構造](#archive-structure) を参照）。

エクステンションがプラットフォーム非依存の場合は、単一の汎用アセットを提供できます。この場合、リリースに添付されるアセットは 1 つのみである必要があります。

より大きなリポジトリ内でエクステンションを開発する場合にもカスタムアーカイブを使用できます。リポジトリ自体とは異なるレイアウトのアーカイブをビルドできます（例えば、エクステンションを含むサブディレクトリのみのアーカイブなど）。

#### プラットフォーム固有のアーカイブ

Qwen Code が各プラットフォームに正しいリリースアセットを自動的に検出できるようにするには、次の命名規則に従う必要があります。CLI は以下の順序でアセットを検索します：

1.  **プラットフォームおよびアーキテクチャ固有:** `{platform}.{arch}.{name}.{extension}`
2.  **プラットフォーム固有:** `{platform}.{name}.{extension}`
3.  **汎用:** アセットが 1 つのみ提供されている場合、汎用のフォールバックとして使用されます。

- `{name}`: エクステンションの名前。
- `{platform}`: オペレーティングシステム。サポートされる値は次のとおりです：
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}`: アーキテクチャ。サポートされる値は次のとおりです：
  - `x64`
  - `arm64`
- `{extension}`: アーカイブのファイル拡張子（例：`.tar.gz` または `.zip`）。

**例:**

- `darwin.arm64.my-tool.tar.gz` (Apple Silicon Mac 固有)
- `darwin.my-tool.tar.gz` (すべての Mac 用)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### アーカイブ構造

アーカイブは完全に自己完結型のエクステンションである必要があり、すべての標準要件を満たしている必要があります。具体的には、`qwen-extension.json` ファイルがアーカイブのルートに配置されている必要があります。

残りのレイアウトは通常のエクステンションと完全に同じである必要があります。詳細は [extensions.md](extension.md) を参照してください。

#### GitHub Actions ワークフローの例

以下は、複数のプラットフォーム向けに Qwen Code エクステンションをビルドおよびリリースする GitHub Actions ワークフローの例です：

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
          node-version: '20'

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

## npm Registry 経由でのリリース

Qwen Code エクステンションはスコープ付き npm パッケージ（例：`@your-org/my-extension`）として公開できます。次のような場合に適しています：

- チームがすでにパッケージ配布に npm を使用している
- 既存の認証インフラストラクチャでプライベートレジストリのサポートが必要な場合
- バージョン解決とアクセス制御を npm に任せたい場合

### パッケージの要件

npm パッケージには、パッケージのルートに `qwen-extension.json` ファイルを含める必要があります。これはすべての Qwen Code エクステンションで使用されるのと同じ設定ファイルであり、npm tarball は単なる別の配信メカニズムにすぎません。

最小限のパッケージ構造は次のようになります：

```
my-extension/
├── package.json
├── qwen-extension.json
├── QWEN.md              # optional context file
├── commands/             # optional custom commands
├── skills/               # optional custom skills
└── agents/               # optional custom subagents
```

公開するパッケージに `qwen-extension.json` が含まれていることを確認してください（つまり、`.npmignore` や `package.json` の `files` フィールドで除外されていないこと）。

### 公開

標準的な npm 公開ツールを使用します：

```bash
# Publish to the default registry
npm publish

# Publish to a private/custom registry
npm publish --registry https://your-registry.com
```

### インストール

ユーザーはスコープ付きパッケージ名を使用してエクステンションをインストールします：

```bash
# Install latest version
qwen extensions install @your-org/my-extension

# Install a specific version
qwen extensions install @your-org/my-extension@1.2.0

# Install from a custom registry
qwen extensions install @your-org/my-extension --registry https://your-registry.com
```

### 更新の動作

- バージョン固定なしでインストールされたエクステンション（例：`@scope/pkg`）は `latest` dist-tag を追跡します。
- dist-tag 付きでインストールされたエクステンション（例：`@scope/pkg@beta`）はその特定のタグを追跡します。
- 特定のバージョンに固定されたエクステンション（例：`@scope/pkg@1.2.0`）は常に最新とみなされ、更新は促されません。

### プライベートレジストリの認証

Qwen Code は npm 認証情報を自動的に読み取ります：

1. **`NPM_TOKEN` 環境変数** — 最優先
2. **`.npmrc` ファイル** — ホストレベルとパススコープの `_authToken` エントリの両方をサポートします（例：`//your-registry.com/:_authToken=TOKEN` または `//pkgs.dev.azure.com/org/_packaging/feed/npm/registry/:_authToken=TOKEN`）

`.npmrc` ファイルは、カレントディレクトリとユーザーのホームディレクトリから読み取られます。

### リリースチャネルの管理

npm dist-tags を使用してリリースチャネルを管理できます：

```bash
# Publish a beta release
npm publish --tag beta

# Users install beta channel
qwen extensions install @your-org/my-extension@beta
```

これは Git ブランチベースのリリースチャネルと同様に機能しますが、npm のネイティブな dist-tag メカニズムを使用します。