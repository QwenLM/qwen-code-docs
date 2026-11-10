# 模型与服务商

使用 `/auth` 完成引导式连接，使用 `/model` 选择可用模型。终端命令 `qwen --list-models` 可以列出模型。自定义服务商也可以通过[配置文件](/zh/users/settings/)定义。

## 配置自定义端点

在启动 Qwen Code 前导出凭据。下面是 POSIX shell 示例，其中密钥是占位值：

```sh
export MODEL_API_KEY='replace-with-your-key'
```

将以下内容加入用户配置：

```json
{
  "providers": {
    "gateway": {
      "type": "openai-compatible",
      "protocol": "openai",
      "baseUrl": "https://api.example.com/v1",
      "apiKey": "${MODEL_API_KEY}",
      "models": [
        {
          "model": "your-model-id",
          "displayName": "My coding model"
        }
      ]
    }
  },
  "model": {
    "name": "gateway/your-model-id"
  }
}
```

将端点和模型 ID 替换为服务商提供的实际值。修改服务商定义后重新启动 Qwen Code。用 `/model` 选择模型，或仅在本次运行中覆盖：

```sh
qwen --model gateway/your-model-id
```

模型键的格式为 `<provider-id>/<model-id>`。服务商 ID 必须以字母或数字开头，仅包含字母、数字、点、下划线或短横线。`qoder` 和 `qwen-subscription` 为保留名称。

## 端点与协议字段

| 字段 | 含义 |
| --- | --- |
| `type` | 服务商类型。一般自定义端点使用 `openai-compatible`，也支持 `alibaba`。 |
| `protocol` | API 协议：`openai`、`openai-responses`、`anthropic` 或 `gemini`；省略时使用 `openai`。 |
| `baseUrl` | HTTP 或 HTTPS 基础地址，不可内嵌凭据、查询参数或片段。 |
| `apiKey` | 凭据或环境变量引用；未能解析的变量引用会被拒绝。 |
| `authType` | `bearer`（默认）、`api-key` 或 `google-api-key`，应符合端点要求。 |
| `model` | 可选的服务商默认模型 ID；省略时使用配置中的第一个模型。 |
| `models` | 模型定义列表，每个条目的 `model` 必填且不能重复。 |
| `displayName` | 可选的服务商显示名称。 |

协议和认证头类型是独立配置。选中了某个协议，不代表远端服务实现了编程 Agent 所需的所有 API 能力。

不要求认证的一般自定义端点可以将 `apiKey` 设为空字符串。Alibaba 配置要求非空密钥。不要将凭据放入 `baseUrl`。

## 声明模型限制

每个模型可以配置 `displayName`、`contextWindow`、`maxOutputTokens`、`maxTokensField` 和 `capabilities`。`maxTokensField` 接受 `max_tokens` 或 `max_completion_tokens`。

`capabilities` 声明模型支持的能力：`tools`（默认 `true`）、`vision`（默认 `false`）、`cacheControl` 和 `thinking`。`thinking` 是一个对象，其中 `modes` 列出 `enabled` 和/或 `adaptive`，还可以设置 `preferredMode` 和 `supportsEffort`。未声明 `capabilities.thinking` 的自定义模型不启用思考，下文的思考和推理强度选项对它不生效。

模型条目不接受 `temperature`、`maxTokens` 等生成参数，请在 `model.preferences["<provider>/<model>"]` 下设置。

应按照实际模型服务填写限制。自定义模型未声明上下文窗口时会使用估算的回退值，它不是已经核验的服务限制。填写更大的上下文窗口不会扩大服务端容量。

例如，可以将上面的 `models` 列表替换为：

```json
[
  {
    "model": "your-model-id",
    "contextWindow": 65536,
    "maxOutputTokens": 8192,
    "maxTokensField": "max_tokens"
  }
]
```

这些数字仅用于演示，不是对未指定模型的推荐限制。

## 推理与思考控制

CLI 提供 `--reasoning-effort`、`--thinking`、`--thinking-budget`、`--context-window` 和 `--max-output-tokens`。实际支持取决于所选模型及协议。思考模式包括 `auto`、`adaptive`、`enabled` 和 `disabled`；指定固定思考预算会启用思考。

请使用模型支持的值。参数不能为模型增加其本身不具备的能力。调整这些参数后请求失败时，先恢复模型默认值，再检查是否需要更改端点。

## 模型未出现时

检查 JSON 格式、服务商 ID、端点格式、导出的凭据和模型 ID。同名模型来自不同服务商时，使用完整模型键。修正服务商定义后，重启并重新列出模型。

账号连接见[登录与认证](/zh/users/authentication/)，请求失败见[故障排查](/zh/users/troubleshooting/)。

