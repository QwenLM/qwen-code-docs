# Extension 发布

有两种主要方式可以将 extensions 发布给用户：

- [Git repository](#releasing-through-a-git-repository)
- [Github Releases](#releasing-through-github-releases)

通过 Git repository 发布往往是最简单且最灵活的方式，而 GitHub releases 在初次安装时可能更高效，因为它们以单个压缩包的形式提供，而不需要 git clone 来逐个下载每个文件。如果你需要提供平台特定的二进制文件，Github releases 还可以包含平台特定的压缩包。

## 通过 git 仓库发布

这是最灵活且简单的选项。你只需要创建一个公开可访问的 git 仓库（例如一个公共的 GitHub 仓库），然后用户就可以使用 `qwen extensions install <your-repo-uri>` 来安装你的扩展，如果是 GitHub 仓库，还可以使用简化格式 `qwen extensions install <org>/<repo>`。用户也可以通过 `--ref=<some-ref>` 参数指定依赖某个特定的 ref（分支/标签/提交），默认情况下会使用仓库的默认分支。

每当有新的 commit 推送到用户所依赖的 ref 时，系统会提示用户更新扩展。需要注意的是，这种方式也支持轻松回滚——HEAD commit 始终被视为最新版本，无论 `qwen-extension.json` 文件中定义的实际版本是什么。

### 使用 git 仓库管理发布渠道

用户可以依赖你 git 仓库中的任意 ref，比如某个 branch 或 tag，这样你可以轻松管理多个发布渠道。

例如，你可以维护一个 `stable` 分支，用户可以通过如下方式安装：`qwen extensions install <your-repo-uri> --ref=stable`。或者，你可以将默认分支作为稳定版发布分支，而在另一个分支（例如叫 `dev`）中进行开发，从而让 stable 成为默认安装版本。你可以根据需要维护任意数量的分支或 tag，为你和你的用户提供最大的灵活性。

需要注意的是，这些 `ref` 参数可以是 tag、branch，甚至是具体的 commit，这使得用户能够依赖你 extension 的特定版本。如何管理你的 tag 和 branch 完全由你自己决定。

### 使用 Git 仓库的发布流程示例

虽然在使用 Git 管理发布时有多种方式可以选择，但我们建议将你的默认分支作为“稳定版”（stable）发布分支。这意味着 `qwen extensions install <your-repo-uri>` 的默认行为就是安装稳定版分支的内容。

假设你希望维护三个标准发布渠道：`stable`、`preview` 和 `dev`。你应该在 `dev` 分支上进行日常开发工作。当你准备发布预览版本时，可以将该分支合并到 `preview` 分支中。当你要把预览版提升为稳定版时，则将 `preview` 合并到 `stable` 分支（这个可能是你的默认分支，也可能是另一个独立的分支）。

你也可以通过 `git cherry-pick` 命令从一个分支挑选特定提交应用到另一个分支，但请注意这会导致各分支的历史记录略有不同，除非你在每次发布后强制推送更改以重置历史记录（但这可能由于仓库设置的原因无法对默认分支执行）。如果你计划频繁使用 cherry-pick 操作，建议不要将默认分支用作 stable 分支，从而避免向默认分支强制推送——这种操作通常应尽量避免。

## 通过 GitHub Releases 发布

Qwen Code 扩展可以通过 [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) 进行分发。这种方式为用户提供了更快、更可靠的初始安装体验，因为它避免了克隆整个仓库的需要。

每个 release 至少包含一个归档文件，其中包含了与该 release 关联的 tag 对应的完整 repo 内容。如果您的扩展需要构建步骤或包含平台特定的二进制文件，release 也可以包含[预构建的归档文件](#custom-pre-built-archives)。

在检查更新时，qwen code 会直接查找 GitHub 上的最新 release（您在创建 release 时必须将其标记为最新版本），除非用户通过传递 `--ref=<some-release-tag>` 参数安装了特定版本。目前我们不支持选择加入预发布版本或使用语义化版本控制(SemVer)。

### 自定义预构建归档文件

自定义归档文件必须作为 assets 直接附加到 GitHub release 中，并且必须是完全自包含的。这意味着它们应该包含整个 extension，参见 [归档文件结构](#archive-structure)。

如果你的 extension 是跨平台的，你可以提供一个通用的 asset。在这种情况下，release 中应该只附加一个 asset。

如果你想在更大的仓库中开发你的 extension，也可以使用自定义归档文件。你可以构建一个与仓库本身布局不同的归档文件（例如，它可能只是包含 extension 的子目录的归档文件）。

#### 平台特定的归档文件

为了确保 Qwen Code 能够自动为每个平台找到正确的 release asset，你必须遵循以下命名约定。CLI 将按以下顺序查找 assets：

1. **平台和架构特定：** `{platform}.{arch}.{name}.{extension}`
2. **仅平台特定：** `{platform}.{name}.{extension}`
3. **通用：** 如果只提供了一个 asset，则将其作为通用 fallback 使用。

- `{name}`: 你的 extension 名称。
- `{platform}`: 操作系统。支持的值包括：
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}`: 架构。支持的值包括：
  - `x64`
  - `arm64`
- `{extension}`: 归档文件的扩展名（例如 `.tar.gz` 或 `.zip`）。

**示例：**

- `darwin.arm64.my-tool.tar.gz` （适用于 Apple Silicon Mac）
- `darwin.my-tool.tar.gz` （适用于所有 Mac）
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### Archive structure

Archives 必须是完全独立的 extensions，并满足所有标准要求 - 特别是 `qwen-extension.json` 文件必须位于 archive 的根目录下。

其余的布局应与典型的 extension 完全相同，参见 [extensions.md](extension.md)。

#### GitHub Actions 工作流示例

以下是一个 GitHub Actions 工作流示例，用于为多个平台构建和发布 Qwen Code 扩展：

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