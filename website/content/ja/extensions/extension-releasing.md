# Extension のリリース

ユーザーに拡張機能をリリースする主な方法は2つあります：

- [Git リポジトリ](#git-リポジトリを通したリリース)
- [GitHub Releases](#github-releases-を通したリリース)

Git リポジトリでのリリースは、最もシンプルで柔軟性のあるアプローチです。一方、GitHub Releases は初期インストール時に効率的です。各ファイルを個別にダウンロードする git clone ではなく、単一のアーカイブとして配布されるためです。また、プラットフォーム固有のバイナリファイルを配布する必要がある場合、GitHub Releases ではプラットフォーム固有のアーカイブを含めることもできます。

## Gitリポジトリを通したリリース

これは最も柔軟でシンプルなオプションです。必要なのは、公開アクセス可能なGitリポジトリ（例：パブリックなGitHubリポジトリ）を作成することだけです。そうすれば、ユーザーは `qwen extensions install <your-repo-uri>` を使ってあなたの拡張機能をインストールできます。GitHubリポジトリの場合は、簡略化された `qwen extensions install <org>/<repo>` 形式も利用可能です。さらに、`--ref=<some-ref>` 引数を使って特定のref（ブランチ／タグ／コミット）に依存関係を指定することもでき、デフォルトではデフォルトブランチが使用されます。

ユーザーが依存しているrefに新しいコミットがプッシュされるたびに、拡張機能の更新を促す通知が表示されます。この方法では簡単にロールバックも可能であり、`qwen-extension.json` ファイル内の実際のバージョンに関わらず、HEADコミットが常に最新バージョンとして扱われることに注意してください。

### git リポジトリを使用したリリースチャネルの管理

ユーザーはあなたの git リポジトリの任意の ref（ブランチやタグなど）に依存できるため、複数のリリースチャネルを管理することが可能です。

例えば、`stable` ブランチを維持し、ユーザーが `qwen extensions install <your-repo-uri> --ref=stable` のようにインストールできるようにできます。あるいは、デフォルトブランチを stable リリース用として扱い、別のブランチ（例：`dev`）で開発を行うことで、これをデフォルトにすることができます。好きなだけブランチやタグを維持でき、あなたとユーザーのために最大限の柔軟性を提供します。

これらの `ref` 引数はタグ、ブランチ、あるいは特定のコミットでもよく、ユーザーが拡張機能の特定バージョンに依存することを可能にします。タグやブランチの管理方法は完全にあなた次第です。

### git repo を使ったリリースフローの例

git flow を使ってリリースを管理する方法は多种多样ありますが、デフォルトブランチを「stable」リリースブランチとして扱うことをおすすめします。つまり、`qwen extensions install <your-repo-uri>` のデフォルトの動作は、stable リリースブランチを指すようにすべきです。

例えば、`stable`、`preview`、`dev` の3つの標準的なリリースチャネルを維持したいとしましょう。この場合、すべての通常の開発作業は `dev` ブランチで行います。preview リリースの準備ができたら、そのブランチを `preview` ブランチにマージします。preview ブランチを stable に昇格させる準備ができたら、`preview` を stable ブランチ（デフォルトブランチかもしれないし、別のブランチかもしれない）にマージします。

また、`git cherry-pick` を使ってあるブランチから別のブランチに変更をピックアップすることもできますが、これにより各ブランチの履歴が若干分岐してしまうことに注意してください。ただし、各リリース時にブランチに変更を force push して履歴をクリーンな状態に戻すことで回避できます（ただし、リポジトリの設定によってはデフォルトブランチでは不可能な場合があります）。cherry-pick を行う予定がある場合は、force push を避けるためにデフォルトブランチを stable ブランチにしないことを検討してもよいでしょう。デフォルトブランチへの force push は一般的に避けるべきです。

## GitHub Releases を通したリリース

Qwen Code 拡張機能は [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) を通して配布できます。これにより、リポジトリをクローンする必要がなくなるため、ユーザーにとってより高速で信頼性の高い初回インストール体験を提供できます。

各リリースには少なくとも1つのアーカイブファイルが含まれており、そのファイルにはタグが付けられた時点でのリポジトリの全コンテンツが格納されています。拡張機能にビルド手順が必要であったり、プラットフォーム固有のバイナリが含まれている場合は、[事前ビルド済みアーカイブ](#custom-pre-built-archives)も含めることができます。

アップデート確認時には、qwen code は GitHub 上の最新リリースを探すだけです（リリース作成時にそのようにマークしておく必要があります）。ただし、ユーザーが `--ref=<some-release-tag>` を指定して特定のリリースをインストールした場合は除きます。現時点では、プレリリースやセマンティックバージョニング（semver）へのオプトインはサポートしていません。

### カスタムの事前ビルドアーカイブ

カスタムアーカイブは、GitHubリリースに直接アセットとして添付する必要があり、完全に自己完結している必要があります。これは、アーカイブに拡張機能全体を含める必要があることを意味します。[アーカイブ構造](#archive-structure)を参照してください。

拡張機能がプラットフォームに依存しない場合は、単一の汎用アセットを提供できます。この場合、リリースに添付するアセットは1つだけであるべきです。

カスタムアーカイブは、より大きなリポジトリ内で拡張機能を開発したい場合にも使用できます。その場合、リポジトリ自体とは異なるレイアウトのアーカイブをビルドできます（例えば、拡張機能を含むサブディレクトリのアーカイブだけかもしれません）。

#### プラットフォーム固有のアーカイブ

Qwen Code が各プラットフォームに適したリリースアセットを自動的に見つけられるようにするため、以下の命名規則に従う必要があります。CLI は次の順序でアセットを検索します：

1. **プラットフォームおよびアーキテクチャ固有:** `{platform}.{arch}.{name}.{extension}`
2. **プラットフォーム固有:** `{platform}.{name}.{extension}`
3. **汎用:** アセットが1つだけ提供されている場合、それが汎用のフォールバックとして使用されます。

- `{name}`: 拡張機能の名前。
- `{platform}`: OS。サポートされる値：
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}`: アーキテクチャ。サポートされる値：
  - `x64`
  - `arm64`
- `{extension}`: アーカイブのファイル拡張子（例：`.tar.gz` や `.zip`）。

**例:**

- `darwin.arm64.my-tool.tar.gz` (Apple Silicon Mac 専用)
- `darwin.my-tool.tar.gz` (すべての Mac 向け)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### アーカイブ構造

アーカイブは完全に自己完結型の拡張機能であり、すべての標準要件を満たしている必要があります。具体的には、`qwen-extension.json` ファイルがアーカイブのルートに配置されている必要があります。

その他のレイアウトは、通常の拡張機能と全く同じようにする必要があります。詳しくは [extensions.md](extension.md) を参照してください。

#### GitHub Actions ワークフローの例

以下は、複数のプラットフォーム向けに Qwen Code 拡張機能をビルドしてリリースする GitHub Actions ワークフローの例です：

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