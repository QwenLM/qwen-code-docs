# 扩展发布

向用户发布扩展主要有三种方式：

- [Git 仓库](#通过-git-仓库发布)
- [GitHub Releases（GitHub 发布）](#通过-github-releases-发布)
- [npm 注册表](#通过-npm-注册表发布)

Git 仓库发布通常是最简单灵活的方法，而 GitHub Releases 在初始安装时效率更高，因为它以单个归档形式分发，无需执行 git clone 逐个下载文件。如果需要分发平台特定的二进制文件，GitHub Releases 还可以包含平台特定的归档。npm 注册表发布非常适合已使用 npm 进行包分发的团队，尤其是私有注册表场景。

## 通过 Git 仓库发布

这是最灵活且简单的选项。你只需创建一个公开可访问的 Git 仓库（例如公开的 GitHub 仓库），然后用户可以通过 `qwen extensions install <仓库-URI>` 安装你的扩展。如果是 GitHub 仓库，用户还可以使用简化的 `qwen extensions install <组织>/<仓库>` 格式。用户也可以使用 `--ref=<某个-ref>` 参数指定依赖某个特定引用（分支/标签/提交），该参数默认为默认分支。

每当向用户所依赖的 ref 推送提交时，系统会提示用户更新扩展。请注意，这也便于回滚：无论 `qwen-extension.json` 中的实际版本号如何，HEAD 提交始终被视为最新版本。

### 使用 Git 仓库管理发布渠道

用户可以依赖 Git 仓库中的任何 ref（例如分支或标签），这使你可以管理多个发布渠道。

例如，你可以维护一个 `stable` 分支，用户可以这样安装：`qwen extensions install <仓库-URI> --ref=stable`。或者，你也可以将默认分支作为稳定发布分支，而在另一个分支（例如 `dev`）中进行开发。你可以根据需求维护任意数量的分支或标签，为你和用户提供最大的灵活性。

请注意，这些 `ref` 参数可以是标签、分支甚至具体的提交，这允许用户依赖你的扩展的某个特定版本。如何管理标签和分支完全由你决定。

### 使用 Git 仓库的示例发布流程

虽然管理发布的方式有很多种，但我们建议将默认分支作为“稳定”发布分支。这意味着 `qwen extensions install <仓库-URI>` 的默认行为是使用稳定发布分支。

假设你想要维护三个标准发布渠道：`stable`、`preview` 和 `dev`。你可以在 `dev` 分支中进行所有常规开发。当准备发布预览版时，将该分支合并到 `preview` 分支。当准备将预览版升级为稳定版时，将 `preview` 合并到稳定分支（可能是你的默认分支或其他分支）。

你也可以使用 `git cherry-pick` 将更改从一个分支挑选到另一个分支，但请注意，这会导致各分支的历史略有分歧，除非你每次发布时强制推送到各分支以重置历史（但默认分支可能无法强制推送，具体取决于仓库设置）。如果你计划进行 cherry-pick 操作，建议不要将默认分支作为稳定分支，以避免强制推送到默认分支（通常应避免这样做）。

## 通过 GitHub Releases 发布

Qwen Code 扩展可以通过 [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) 分发。这能为用户提供更快、更可靠的初始安装体验，因为它无需克隆仓库。

每个发布包含至少一个归档文件，其中包含链接标签所对应的完整仓库内容。如果扩展需要构建步骤或包含平台特定的二进制文件，发布也可以包含[预构建的归档](#自定义预构建的归档)。

在检查更新时，Qwen Code 会查找 GitHub 上的最新发布（必须在创建发布时将其标记为最新），除非用户通过 `--ref=<某个发布标签>` 安装了特定发布。目前我们不支持选择预发布或遵循 semver。

### 自定义预构建的归档

自定义归档必须作为资产直接附加到 GitHub Release，并且必须完全自包含。这意味着归档应包含整个扩展，参见[归档结构](#归档结构)。

如果你的扩展与平台无关，可以提供单个通用资产。此时，发布只能附加一个资产。

如果你希望在更大的仓库中开发扩展，也可以使用自定义归档构建一个与仓库布局不同的归档（例如仅包含扩展子目录的归档）。

#### 平台特定的归档

为确保 Qwen Code 能够自动找到每个平台的正确发布资产，你必须遵循以下命名约定。CLI 将按以下顺序搜索资产：

1.  **平台和架构特定：** `{platform}.{arch}.{name}.{extension}`
2.  **平台特定：** `{platform}.{name}.{extension}`
3.  **通用：** 如果只提供了一个资产，则将其作为通用后备。

- `{name}`：扩展的名称。
- `{platform}`：操作系统。支持的值有：
  - `darwin`（macOS）
  - `linux`
  - `win32`（Windows）
- `{arch}`：架构。支持的值有：
  - `x64`
  - `arm64`
- `{extension}`：归档文件扩展名（例如 `.tar.gz` 或 `.zip`）。

**示例：**

- `darwin.arm64.my-tool.tar.gz`（适用于 Apple Silicon Mac）
- `darwin.my-tool.tar.gz`（适用于所有 Mac）
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### 归档结构

归档必须是完全自包含的扩展，并满足所有标准要求——特别是 `qwen-extension.json` 文件必须位于归档根目录。

其余布局应与典型扩展完全相同，参见 [introduction.md](./introduction.md)。

#### 示例 GitHub Actions 工作流

以下是一个 GitHub Actions 工作流示例，用于为多个平台构建并发布 Qwen Code 扩展：

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

## 通过 npm 注册表发布

你可以将 Qwen Code 扩展发布为带命名空间的 npm 包（例如 `@your-org/my-extension`）。这适用于以下情况：

- 你的团队已在使用 npm 进行包分发
- 你需要借助现有认证基础设施支持私有注册表
- 你希望由 npm 处理版本解析和访问控制

### 包要求

你的 npm 包必须在包根目录中包含 `qwen-extension.json` 文件。这是所有 Qwen Code 扩展使用的同一配置文件——npm tarball 只是另一种分发机制。

一个最小的包结构如下：

```
my-extension/
├── package.json
├── qwen-extension.json
├── QWEN.md              # 可选的上下文文件
├── commands/             # 可选的自定义命令
├── skills/               # 可选的自定义技能
└── agents/               # 可选的子代理
```

确保 `qwen-extension.json` 包含在你发布的包中（即不要被 `.npmignore` 或 `package.json` 的 `files` 字段排除）。

### 发布

使用标准的 npm 发布工具：

```bash
# 发布到默认注册表
npm publish

# 发布到私有/自定义注册表
npm publish --registry https://your-registry.com
```

### 安装

用户使用带命名空间的包名进行安装：

```bash
# 安装最新版本
qwen extensions install @your-org/my-extension

# 安装特定版本
qwen extensions install @your-org/my-extension@1.2.0

# 从自定义注册表安装
qwen extensions install @your-org/my-extension --registry https://your-registry.com
```

### 更新行为

- 未锁定版本的扩展（例如 `@scope/pkg`）会跟踪 `latest` dist-tag。
- 使用 dist-tag 安装的扩展（例如 `@scope/pkg@beta`）会跟踪该特定标签。
- 锁定到确切版本的扩展（例如 `@scope/pkg@1.2.0`）始终被视为最新，不会提示更新。

### 私有注册表的身份认证

Qwen Code 会自动读取 npm 认证凭据：

1. **`NPM_TOKEN` 环境变量**——优先级最高
2. **`.npmrc` 文件**——支持主机级和路径作用域的 `_authToken` 条目（例如 `//your-registry.com/:_authToken=TOKEN` 或 `//pkgs.dev.azure.com/org/_packaging/feed/npm/registry/:_authToken=TOKEN`）

`.npmrc` 文件会从当前目录和用户主目录读取。

### 管理发布渠道

你可以使用 npm dist-tags 管理发布渠道：

```bash
# 发布 beta 版本
npm publish --tag beta

# 用户安装 beta 渠道
qwen extensions install @your-org/my-extension@beta
```

这与基于 Git 分支的发布渠道类似，但使用了 npm 原生的 dist-tag 机制。