# 扩展发布

向用户发布扩展主要有两种方式：

- [Git 仓库](#通过-git-仓库发布)
- [GitHub Releases](#通过-github-releases-发布)

通过 Git 仓库发布通常是**最简单、最灵活**的方式；而 GitHub Releases 在首次安装时可能更高效，因为它们以单个归档文件形式分发，无需执行 `git clone`（后者会逐个下载每个文件）。此外，如果你需要分发特定平台的二进制文件，GitHub Releases 还可包含针对不同平台的归档包。

## 通过 Git 仓库发布

这是最灵活且最简单的发布方式。你只需创建一个公开可访问的 Git 仓库（例如一个公开的 GitHub 仓库），然后用户即可通过 `qwen extensions install <你的仓库 URI>` 命令安装你的扩展；对于 GitHub 仓库，用户还可使用简化的格式 `qwen extensions install <组织名>/<仓库名>`。用户还可选择通过 `--ref=<某个引用>` 参数指定依赖特定的引用（分支、标签或提交），该参数默认为仓库的默认分支。

每当有新提交推送到用户所依赖的引用时，用户将收到更新扩展的提示。请注意，这种方式也便于快速回滚：无论 `qwen-extension.json` 文件中声明的实际版本号为何，HEAD 提交始终被视为最新版本。

### 使用 Git 仓库管理发布渠道

用户可以依赖你 Git 仓库中的任意引用（ref），例如分支或标签，从而让你能够管理多个发布渠道。

例如，你可以维护一个 `stable` 分支，用户可通过如下方式安装：`qwen extensions install <your-repo-uri> --ref=stable`。或者，你也可以将默认分支设为稳定版发布分支（即默认情况下用户无需指定 `--ref` 即可获取稳定版本），并将开发工作放在另一个分支中（例如名为 `dev` 的分支）。你可以按需创建任意数量的分支或标签，为你和用户带来最大程度的灵活性。

请注意，这些 `ref` 参数可以是标签、分支，甚至特定的提交哈希值，从而使用户能够精确依赖你扩展的某个具体版本。如何管理标签和分支完全由你决定。

### 使用 Git 仓库的示例发布流程

尽管你可以采用多种方式通过 Git 工作流管理发布，我们建议将默认分支（default branch）作为你的“稳定版”（stable）发布分支。这意味着执行 `qwen extensions install <your-repo-uri>` 时，默认会从该稳定发布分支安装扩展。

假设你想维护三个标准发布通道：`stable`、`preview` 和 `dev`。你应在 `dev` 分支中进行常规开发。当你准备发布预览版时，将 `dev` 分支合并到 `preview` 分支；当你准备将预览版升级为稳定版时，则将 `preview` 分支合并到 `stable` 分支（该分支可以是你的默认分支，也可以是其他独立分支）。

你还可以使用 `git cherry-pick` 将某一分支的特定提交挑选（cherry pick）到另一分支。但请注意：这种方式会导致各分支的历史记录略有差异，除非你在每次发布后强制推送（force push）变更以重置分支历史（使其恢复为干净状态）——不过，对于默认分支而言，是否允许强制推送取决于你的仓库设置，因此可能无法实现。如果你计划频繁使用 cherry-pick，建议避免将默认分支设为稳定分支，从而规避对默认分支执行强制推送（通常应避免此类操作）。

## 通过 GitHub Releases 发布

Qwen Code 扩展可通过 [GitHub Releases](https://docs.github.com/zh/repositories/releasing-projects-on-github/about-releases) 进行分发。这种方式为用户提供了更快、更可靠的首次安装体验，避免了克隆仓库的需要。

每个发布版本至少包含一个归档文件，其中包含该发布所关联标签（tag）对应时刻仓库的全部内容。如果您的扩展需要构建步骤，或需附带特定平台的二进制文件，则发布版本还可包含[自定义预构建归档](#custom-pre-built-archives)。

在检查更新时，qwen code 默认仅查找 GitHub 上标记为“最新版本”（Latest Release）的最新发布（您在创建发布时必须手动将其标记为 Latest）。但若用户在安装时显式指定了 `--ref=<some-release-tag>`，则会安装指定版本。目前我们**不支持**自动启用预发布（pre-release）版本或语义化版本（semver）匹配机制。

### 自定义预构建归档文件

自定义归档文件必须作为发布资产（assets）直接附加到 GitHub Release 中，且必须完全自包含。这意味着归档中应包含整个扩展，详情请参阅[归档结构](#archive-structure)。

如果您的扩展与平台无关，您可以提供一个通用的单一资产。此时，该 Release 中应仅附加一个资产。

当您希望在更大的代码仓库中开发扩展时，也可使用自定义归档文件：您可以构建一个布局不同于仓库本身结构的归档（例如，它可能仅是包含该扩展的子目录的归档）。

#### 平台专用归档文件

为确保 Qwen Code 能自动为每个平台找到正确的发布资源，你必须遵循以下命名约定。CLI 将按如下顺序搜索资源：

1.  **平台与架构专用**：`{platform}.{arch}.{name}.{extension}`
2.  **平台专用**：`{platform}.{name}.{extension}`
3.  **通用**：若仅提供一个资源，则将其作为通用后备选项使用。

- `{name}`：你的扩展名称。
- `{platform}`：操作系统。支持的取值包括：
  - `darwin`（macOS）
  - `linux`
  - `win32`（Windows）
- `{arch}`：CPU 架构。支持的取值包括：
  - `x64`
  - `arm64`
- `{extension}`：归档文件的扩展名（例如 `.tar.gz` 或 `.zip`）。

**示例：**

- `darwin.arm64.my-tool.tar.gz`（专用于 Apple Silicon Mac）
- `darwin.my-tool.tar.gz`（适用于所有 Mac）
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### 归档结构

归档文件必须是完整的扩展包，并满足所有标准要求——特别是 `qwen-extension.json` 文件必须位于归档的根目录下。

其余目录结构应与典型扩展完全一致，详见 [extensions.md](extension.md)。

#### GitHub Actions 工作流示例

以下是一个 GitHub Actions 工作流示例，用于为多个平台构建并发布 Qwen Code 扩展：

```yaml
name: 发布扩展

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: 设置 Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: 安装依赖
        run: npm ci

      - name: 构建扩展
        run: npm run build

      - name: 创建发布资源
        run: |
          npm run package -- --platform=darwin --arch=arm64
          npm run package -- --platform=linux --arch=x64
          npm run package -- --platform=win32 --arch=x64

      - name: 创建 GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            release/darwin.arm64.my-tool.tar.gz
            release/linux.arm64.my-tool.tar.gz
            release/win32.arm64.my-tool.zip
```