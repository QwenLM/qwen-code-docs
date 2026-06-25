# 扩展发布

向用户发布扩展主要有三种方式：

- [Git 仓库](#releasing-through-a-git-repository)
- [GitHub Releases](#releasing-through-github-releases)
- [npm Registry](#releasing-through-npm-registry)

通过 Git 仓库发布通常是最简单、最灵活的方式。而 GitHub Releases 在首次安装时效率更高，因为它们以单个压缩包的形式分发，无需执行 `git clone` 逐个下载文件。如果你需要分发特定平台的二进制文件，GitHub Releases 还可以包含平台特定的压缩包。对于已经使用 npm 进行包分发的团队（尤其是使用私有 registry 的团队），通过 npm Registry 发布是理想的选择。

## 通过 Git 仓库发布

这是最灵活且简单的选项。你只需创建一个公开可访问的 Git 仓库（例如公开的 GitHub 仓库），用户即可使用 `qwen extensions install <your-repo-uri>` 安装你的扩展。如果是 GitHub 仓库，他们还可以使用简化的 `qwen extensions install <org>/<repo>` 格式。用户可以通过 `--ref=<some-ref>` 参数选择依赖特定的 ref（分支/标签/提交），默认值为默认分支。

每当有提交推送到用户所依赖的 ref 时，系统都会提示用户更新扩展。请注意，这也便于轻松回滚：无论 `qwen-extension.json` 文件中的实际版本号如何，HEAD 提交始终被视为最新版本。

### 使用 Git 仓库管理发布渠道

用户可以依赖你 Git 仓库中的任意 ref（如分支或标签），这使你能够管理多个发布渠道。

例如，你可以维护一个 `stable` 分支，用户可以通过 `qwen extensions install <your-repo-uri> --ref=stable` 进行安装。或者，你可以将默认分支作为稳定发布分支，而在其他分支（例如 `dev`）中进行开发，从而使其成为默认行为。你可以根据需要维护任意数量的分支或标签，为你和用户提供最大的灵活性。

请注意，这些 `ref` 参数可以是标签、分支，甚至是特定的提交，这允许用户依赖你扩展的特定版本。如何管理标签和分支完全由你决定。

### 使用 Git 仓库的发布流程示例

虽然使用 Git 工作流管理发布的方式有很多，但我们建议将默认分支作为“稳定”发布分支。这意味着 `qwen extensions install <your-repo-uri>` 的默认行为就是安装稳定发布分支。

假设你想维护三个标准发布渠道：`stable`、`preview` 和 `dev`。你可以在 `dev` 分支中进行所有常规开发。当你准备发布预览版时，将该分支合并到 `preview` 分支。当你准备将预览版提升为稳定版时，将 `preview` 合并到稳定分支（可能是你的默认分支或其他分支）。

你也可以使用 `git cherry-pick` 将更改从一个分支拣选到另一个分支，但请注意，这会导致各分支的历史记录略有分歧。除非你在每次发布时强制推送更改以重置历史记录（根据仓库设置，默认分支可能无法执行此操作）。如果你计划使用 cherry-pick，建议避免将默认分支作为稳定分支，以免对默认分支执行通常应避免的强制推送。

## 通过 GitHub Releases 发布

Qwen Code 扩展可以通过 [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) 进行分发。这为用户提供了更快、更可靠的初始安装体验，因为它避免了克隆仓库的需要。

每个 Release 至少包含一个归档文件，其中包含关联标签处仓库的完整内容。如果你的扩展需要构建步骤或附带了特定平台的二进制文件，Release 还可以包含[预构建归档](#custom-pre-built-archives)。

在检查更新时，Qwen Code 只会查找 GitHub 上的最新 Release（创建 Release 时必须将其标记为最新），除非用户通过传递 `--ref=<some-release-tag>` 安装了特定 Release。目前我们尚不支持选择加入预发布版本或遵循 semver。

### 自定义预构建归档

自定义归档必须作为资产直接附加到 GitHub Release 中，并且必须是完全自包含的。这意味着它们应包含整个扩展，请参阅[归档结构](#archive-structure)。

如果你的扩展与平台无关，你可以提供单个通用资产。在这种情况下，Release 中应仅附加一个资产。

如果你想在更大的仓库中开发扩展，也可以使用自定义归档。你可以构建一个与仓库本身布局不同的归档（例如，它可能只是包含扩展的子目录的归档）。

#### 平台特定归档

为确保 Qwen Code 能自动为每个平台找到正确的 Release 资产，你必须遵循此命名约定。CLI 将按以下顺序搜索资产：

1.  **平台与架构特定：** `{platform}.{arch}.{name}.{extension}`
2.  **平台特定：** `{platform}.{name}.{extension}`
3.  **通用：** 如果仅提供一个资产，它将作为通用回退选项使用。

- `{name}`：你的扩展名称。
- `{platform}`：操作系统。支持的值为：
  - `darwin`（macOS）
  - `linux`
  - `win32`（Windows）
- `{arch}`：架构。支持的值为：
  - `x64`
  - `arm64`
- `{extension}`：归档文件的扩展名（例如 `.tar.gz` 或 `.zip`）。

**示例：**

- `darwin.arm64.my-tool.tar.gz`（适用于 Apple Silicon Mac）
- `darwin.my-tool.tar.gz`（适用于所有 Mac）
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### 归档结构

归档必须是完全自包含的扩展，并满足所有标准要求——特别是 `qwen-extension.json` 文件必须位于归档的根目录。

其余布局应与典型扩展完全一致，请参阅 [introduction.md](./introduction.md)。

#### GitHub Actions 工作流示例

以下是一个构建并发布适用于多平台的 Qwen Code 扩展的 GitHub Actions 工作流示例：

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

## 通过 npm Registry 发布

你可以将 Qwen Code 扩展发布为带作用域的 npm 包（例如 `@your-org/my-extension`）。在以下场景中，这是一个不错的选择：

- 你的团队已经使用 npm 进行包分发
- 你需要私有 registry 支持，且已有现成的身份验证基础设施
- 你希望由 npm 处理版本解析和访问控制

### 包要求

你的 npm 包必须在包根目录包含 `qwen-extension.json` 文件。这与所有 Qwen Code 扩展使用的配置文件相同——npm tarball 只是另一种分发机制。

最小化的包结构如下：

```
my-extension/
├── package.json
├── qwen-extension.json
├── QWEN.md              # optional context file
├── commands/             # optional custom commands
├── skills/               # optional custom skills
└── agents/               # optional custom subagents
```

确保 `qwen-extension.json` 包含在你发布的包中（即未被 `.npmignore` 或 `package.json` 中的 `files` 字段排除）。

### 发布

使用标准的 npm 发布工具：

```bash
# Publish to the default registry
npm publish

# Publish to a private/custom registry
npm publish --registry https://your-registry.com
```

### 安装

用户使用带作用域的包名安装你的扩展：

```bash
# Install latest version
qwen extensions install @your-org/my-extension

# Install a specific version
qwen extensions install @your-org/my-extension@1.2.0

# Install from a custom registry
qwen extensions install @your-org/my-extension --registry https://your-registry.com
```

### 更新行为

- 未锁定版本安装的扩展（例如 `@scope/pkg`）将跟踪 `latest` dist-tag。
- 使用 dist-tag 安装的扩展（例如 `@scope/pkg@beta`）将跟踪该特定标签。
- 锁定到确切版本的扩展（例如 `@scope/pkg@1.2.0`）始终被视为最新，不会提示更新。

### 私有 Registry 的身份验证

Qwen Code 会自动读取 npm 身份验证凭据：

1. **`NPM_TOKEN` 环境变量** — 优先级最高
2. **`.npmrc` 文件** — 支持主机级和路径作用域的 `_authToken` 条目（例如 `//your-registry.com/:_authToken=TOKEN` 或 `//pkgs.dev.azure.com/org/_packaging/feed/npm/registry/:_authToken=TOKEN`）

系统会从当前目录和用户主目录读取 `.npmrc` 文件。

### 管理发布渠道

你可以使用 npm dist-tags 来管理发布渠道：

```bash
# Publish a beta release
npm publish --tag beta

# Users install beta channel
qwen extensions install @your-org/my-extension@beta
```

其工作原理与基于 Git 分支的发布渠道类似，但使用的是 npm 原生的 dist-tag 机制。