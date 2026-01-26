# 扩展发布

有两种主要方式向用户发布扩展：

- [Git 仓库](#通过-git-仓库发布)
- [Github Releases](#通过-github-releases-发布)

Git 仓库发布通常是最简单和最灵活的方法，而 GitHub releases 在初次安装时可能更高效，因为它们以单个存档的形式分发，而不是需要执行 git clone 来逐个下载文件。如果你需要分发特定平台的二进制文件，Github releases 也可以包含特定平台的存档。

## 通过 Git 仓库发布

这是最灵活且简单的选项。你只需要创建一个公开可访问的 Git 仓库（例如公共的 GitHub 仓库），然后用户就可以使用 `qwen extensions install <your-repo-uri>` 来安装你的扩展，或者对于 GitHub 仓库，他们可以使用简化的格式 `qwen extensions install <org>/<repo>`。他们还可以选择使用 `--ref=<some-ref>` 参数来依赖特定的引用（分支/标签/提交），默认情况下会使用默认分支。

每当有提交推送到用户所依赖的引用时，系统将提示用户更新扩展。请注意，这也允许轻松回滚，无论 `qwen-extension.json` 文件中的实际版本如何，HEAD 提交始终被视为最新版本。

### 使用 Git 仓库管理发布渠道

用户可以依赖你 Git 仓库中的任何引用（ref），例如分支或标签，这允许你管理多个发布渠道。

例如，你可以维护一个 `stable` 分支，用户可以通过这种方式安装：`qwen extensions install <your-repo-uri> --ref=stable`。或者，你可以将默认分支作为稳定发布分支来处理，并在其他分支（例如名为 `dev` 的分支）上进行开发，从而将此设置为默认选项。你可以根据需要维护任意数量的分支或标签，为你和你的用户提供最大的灵活性。

请注意，这些 `ref` 参数可以是标签、分支，甚至是特定的提交，这允许用户依赖你的扩展的特定版本。如何管理你的标签和分支取决于你自己。

### 使用 Git 仓库的示例发布流程

虽然你可以通过多种方式使用 Git 流程来管理发布，但我们建议将默认分支视为你的“稳定”发布分支。这意味着 `qwen extensions install <your-repo-uri>` 的默认行为是在稳定发布分支上。

假设你想维护三个标准发布渠道：`stable`、`preview` 和 `dev`。你将在 `dev` 分支中进行所有常规开发。当你准备进行预览发布时，将该分支合并到 `preview` 分支中。当你准备将预览分支提升为稳定版本时，将 `preview` 合并到稳定分支（可能是你的默认分支或另一个分支）。

你也可以使用 `git cherry-pick` 将更改从一个分支挑选到另一个分支，但请注意，这会导致你的分支彼此之间历史记录略有分歧，除非你在每次发布时强制推送更改以将历史记录恢复到干净状态（根据你的仓库设置，对于默认分支可能无法执行）。如果你计划进行挑选操作，你可能希望避免让默认分支成为稳定分支，以避免强制推送到默认分支，通常应避免这样做。

## 通过 GitHub Releases 发布

Qwen Code 扩展可以通过 [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) 进行分发。这为用户提供了更快、更可靠的初始安装体验，因为它避免了克隆仓库的需要。

每个发布版本至少包含一个归档文件，其中包含与标签关联时仓库的完整内容。如果您的扩展需要某些构建步骤或包含特定平台的二进制文件，则发布版本也可能包括[预构建归档](#custom-pre-built-archives)。

在检查更新时，qwen code 将只查找 github 上的最新发布版本（您在创建发布版本时必须将其标记为最新版本），除非用户通过传递 `--ref=<some-release-tag>` 安装了特定的发布版本。目前我们不支持选择预发布版本或 semver。

### 自定义预构建归档

自定义归档必须直接作为资源附加到 GitHub 发布版本中，并且必须完全自包含。这意味着它们应该包含整个扩展，参见[归档结构](#archive-structure)。

如果你的扩展与平台无关，你可以提供一个单一的通用资源。在这种情况下，发布版本上应该只附加一个资源。

如果你想在更大的仓库中开发扩展，也可以使用自定义归档，你可以构建一个与仓库本身布局不同的归档（例如，它可能只是包含扩展的子目录的归档）。

#### 平台特定的归档文件

为确保 Qwen Code 能够自动找到每个平台的正确发布资源，你必须遵循以下命名约定。CLI 将按以下顺序搜索资源：

1.  **平台和架构特定：** `{platform}.{arch}.{name}.{extension}`
2.  **平台特定：** `{platform}.{name}.{extension}`
3.  **通用：** 如果只提供了一个资源，则将其用作通用备选。

- `{name}`：你的扩展名。
- `{platform}`：操作系统。支持的值包括：
  - `darwin`（macOS）
  - `linux`
  - `win32`（Windows）
- `{arch}`：架构。支持的值包括：
  - `x64`
  - `arm64`
- `{extension}`：归档文件的扩展名（例如 `.tar.gz` 或 `.zip`）。

**示例：**

- `darwin.arm64.my-tool.tar.gz`（特定于 Apple Silicon Mac）
- `darwin.my-tool.tar.gz`（适用于所有 Mac）
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### 归档结构

归档文件必须是完整的扩展，并且具有所有标准要求——具体来说，`qwen-extension.json` 文件必须位于归档的根目录。

其余布局应与典型的扩展完全相同，请参见 [extensions.md](extension.md)。

#### GitHub Actions 工作流示例

以下是一个 GitHub Actions 工作流的示例，它为多个平台构建和发布 Qwen Code 扩展：

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