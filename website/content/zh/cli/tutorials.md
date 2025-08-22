# 教程

本页面包含与 Qwen Code 交互的教程。

## 设置 Model Context Protocol (MCP) 服务器

> [!CAUTION]
> 在使用第三方 MCP 服务器之前，请确保你信任其来源并了解它提供的工具。你使用第三方服务器的风险由你自己承担。

本教程演示如何设置 MCP 服务器，以 [GitHub MCP 服务器](https://github.com/github/github-mcp-server) 为例。GitHub MCP 服务器提供了与 GitHub 仓库交互的工具，例如创建 issue 和评论 pull request。

### 前置条件

开始之前，请确保你已安装并配置了以下内容：

- **Docker：** 安装并运行 [Docker]。
- **GitHub Personal Access Token (PAT)：** 创建一个新的 [classic] 或 [fine-grained] PAT，并授予必要的权限。

[Docker]: https://www.docker.com/
[classic]: https://github.com/settings/tokens/new
[fine-grained]: https://github.com/settings/personal-access-tokens/new

### 指南

#### 在 `settings.json` 中配置 MCP server

在你的项目根目录下，创建或打开 [`.qwen/settings.json` 文件](./configuration.md)。在文件中添加 `mcpServers` 配置块，用于指定如何启动 GitHub MCP server。

```json
{
  "mcpServers": {
    "github": {
      "command": "docker",
      "args": [
        "run",
        "i",
        "--rm",
        "-e",
        "GITHUB_PERSONAL_ACCESS_TOKEN",
        "ghcr.io/github/github-mcp-server"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  }
}
```

#### 设置你的 GitHub token

> [!CAUTION]
> 如果使用一个权限范围过大的 personal access token（PAT），并且该 token 可以访问个人或私有仓库，那么可能会导致私有仓库的信息泄露到公共仓库中。我们建议使用细粒度的访问 token，并且不要同时授予对公共和私有仓库的访问权限。

使用环境变量来存储你的 GitHub PAT：

```bash
GITHUB_PERSONAL_ACCESS_TOKEN="pat_YourActualGitHubTokenHere"
```

Qwen Code 会在 `settings.json` 文件中你定义的 `mcpServers` 配置里使用这个值。

#### 启动 Qwen Code 并验证连接

当你启动 Qwen Code 时，它会自动读取你的配置并在后台启动 GitHub MCP server。然后你就可以使用自然语言 prompt 来让 Qwen Code 执行 GitHub 操作。例如：

```bash
"获取 'foo/bar' 仓库中所有分配给我的 open issues 并进行优先级排序"
```