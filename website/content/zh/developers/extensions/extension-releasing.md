# 扩展发布

向用户发布扩展有两种主要方式：

- [Git 仓库](#通过-git-仓库发布)
- [GitHub Releases](#通过-github-releases 发布)

Git 仓库发布往往是最简单和最灵活的方式，而 GitHub Releases 在初次安装时可能更高效，因为它们以单个归档文件的形式提供，而不是需要 git clone 来逐个下载每个文件。如果你需要提供特定平台的二进制文件，GitHub Releases 还可以包含特定平台的归档文件。

## 通过 Git 仓库发布

这是最灵活且简单的选项。你只需要创建一个公开可访问的 Git 仓库（例如一个公共的 GitHub 仓库），然后用户就可以使用 `qwen extensions install <your-repo-uri>` 来安装你的扩展，或者对于 GitHub 仓库，他们可以使用简化的格式 `qwen extensions install <org>/<repo>`。他们还可以选择依赖特定的引用（分支/标签/提交），使用 `--ref=<some-ref>` 参数，默认为默认分支。

每当有新的提交推送到用户所依赖的引用时，系统会提示用户更新扩展。请注意，这也使得回滚变得非常简单，HEAD 提交始终被视为最新版本，无论 `qwen-extension.json` 文件中的实际版本是什么。

### 使用 Git 仓库管理发布渠道

用户可以依赖你 Git 仓库中的任意引用（ref），例如分支或标签，这使得你可以管理多个发布渠道。

例如，你可以维护一个 `stable` 分支，用户可以通过如下方式安装：`qwen extensions install <your-repo-uri> --ref=stable`。或者，你可以将默认分支作为稳定版发布分支，而在另一个分支（例如名为 `dev`）中进行开发。你可以维护任意数量的分支或标签，为你和你的用户提供最大的灵活性。

请注意，这些 `ref` 参数可以是标签、分支，甚至是特定的提交，这使得用户能够依赖你扩展的特定版本。如何管理你的标签和分支完全由你决定。

### 使用 Git 仓库的示例发布流程

虽然在使用 Git 管理发布时有多种方式可以选择，但我们建议将你的默认分支作为“稳定版”发布分支。这意味着 `qwen extensions install <your-repo-uri>` 的默认行为是安装稳定版分支的内容。

假设你希望维护三个标准的发布渠道：`stable`（稳定版）、`preview`（预览版）和 `dev`（开发版）。你所有的常规开发工作都在 `dev` 分支上进行。当你准备发布预览版本时，将该分支合并到 `preview` 分支中。当你要将预览版提升为稳定版时，则将 `preview` 合并到你的稳定分支中（这个稳定分支可能是你的默认分支，也可能是另一个独立的分支）。

你也可以使用 `git cherry-pick` 命令从一个分支挑选特定提交应用到另一个分支，但请注意这会导致各分支的历史记录略有不同，除非你在每次发布后强制推送更改以重置历史记录（但这可能由于仓库设置的原因无法在默认分支上实现）。如果你计划使用 cherry-pick 操作，建议不要将默认分支用作稳定分支，以避免对默认分支执行强制推送操作——通常应尽量避免这种做法。

## 通过 GitHub 发布版本

Qwen Code 扩展可以通过 [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) 进行分发。这种方式为用户提供了更快、更可靠的初始安装体验，因为它避免了克隆整个仓库的需要。

每个发布版本至少包含一个归档文件，其中包含了与该标签关联的仓库完整内容。如果您的扩展需要构建步骤或附带特定平台的二进制文件，发布版本也可以包括[预构建归档](#custom-pre-built-archives)。

在检查更新时，Qwen Code 会直接查找 GitHub 上的最新发布版本（您在创建发布版本时必须将其标记为最新），除非用户通过传递 `--ref=<some-release-tag>` 参数安装了特定的发布版本。目前我们不支持选择预发布版本或使用语义化版本控制（semver）。

### 自定义预构建归档

自定义归档必须作为资产直接附加到 GitHub 发布中，并且必须是完全自包含的。这意味着它们应该包含整个扩展，参见[归档结构](#archive-structure)。

如果你的扩展是跨平台的，你可以提供一个单一的通用资产。在这种情况下，发布中应该只附加一个资产。

如果你想在更大的仓库中开发你的扩展，也可以使用自定义归档，你可以构建一个与仓库本身布局不同的归档（例如，它可能只是包含扩展的子目录的归档）。

#### 平台特定的归档文件

为确保 Qwen Code 能够自动找到适用于每个平台的正确发布资源，你必须遵循以下命名约定。CLI 将按以下顺序搜索资源：

1.  **平台和架构特定：** `{platform}.{arch}.{name}.{extension}`
2.  **平台特定：** `{platform}.{name}.{extension}`
3.  **通用：** 如果仅提供一个资源，则将其用作通用后备资源。

- `{name}`: 你的扩展名称。
- `{platform}`: 操作系统。支持的值包括：
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}`: 架构。支持的值包括：
  - `x64`
  - `arm64`
- `{extension}`: 归档文件的扩展名（例如 `.tar.gz` 或 `.zip`）。

**示例：**

- `darwin.arm64.my-tool.tar.gz`（专用于 Apple Silicon Mac）
- `darwin.my-tool.tar.gz`（适用于所有 Mac）
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### 归档结构

归档文件必须是完全独立的扩展，并满足所有标准要求——特别是 `qwen-extension.json` 文件必须位于归档文件的根目录下。

其余布局应与典型的扩展完全相同，参见 [extensions.md](extension.md)。

#### 示例 GitHub Actions 工作流

以下是一个 GitHub Actions 工作流的示例，用于为多个平台构建和发布 Qwen Code 扩展：

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