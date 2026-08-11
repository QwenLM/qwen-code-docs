# Agent Plugins v1

Qwen Code 原生加载可移植的 [Agent Plugins v1](https://agent-plugins.org/)
包。包保留其标准的 `plugin.json`、`mcp.json` 和 `SKILL.md` 文件：安装不会生成 `qwen-extension.json`，
也不会重写可移植文件。

使用现有的扩展命令，支持本地目录、链接、归档、
Git 仓库、归档 URL 或 scoped npm 包：

```bash
qwen extensions install ./my-agent-plugin
qwen extensions link ./my-agent-plugin
qwen extensions install owner/my-agent-plugin
```

根清单必须指向规范的 v1 schema：

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-agent-plugin",
  "version": "1.0.0"
}
```

## 支持的能力

| 能力                                       | 支持情况                               |
| ------------------------------------------ | -------------------------------------- |
| 直接子级 `skills/*/SKILL.md`               | 是                                     |
| stdio MCP 服务器                           | 是                                     |
| Streamable HTTP MCP 服务器                 | 是                                     |
| 旧版 HTTP+SSE MCP 服务器                   | 否；该条目会被跳过                     |
| Commands、agents 和 hooks                  | 否；这些目录会被忽略                   |
| Qwen context、settings、channels 和 apps   | 否                                     |
| `extensions.*` 客户端命名空间              | 否；未实现的命名空间会被忽略           |

Skills 遵循 [Agent Skills 规范](https://agentskills.io/specification)。
无效的 skill 会被跳过，但不会影响有效的同级 skills。实验性的 `allowed-tools` 字段会被识别为字符串，但不会授予预批准的 Qwen tools。

对于 stdio MCP 服务器，Qwen Code 在 `args`、环境变量和 `cwd` 中对 `${PLUGIN_ROOT}` 和 `${PLUGIN_DATA}` 进行一次展开。`PLUGIN_DATA` 是一个可写的每个安装独立的目录，其内容在更新和重新安装后持久保留。远程 MCP 端点必须使用 HTTPS，环回 HTTP 端点除外。

Agent Plugins v1 是一种包格式，而非市场集成。通过 Qwen Code 现有的扩展来源安装包。
