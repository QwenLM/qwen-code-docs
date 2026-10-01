# Mem0

Mem0 将 Qwen Code 连接到外部记忆服务。它已包含在主 CLI 包中：不要安装 `@qwen-code/external-context-mem0`，也不要为该路径单独注册 MCP 服务器。

## 连接

将其合并到用户设置（`~/.qwen/settings.json`）中，然后在受信任的项目中重启 Qwen Code。与 `modelProviders` 类似，`envKey` 指定凭证变量名，顶层 `env` 字段可以提供其值：

```json
{
  "env": {
    "MEM0_API_KEY": "<your-provider-key>"
  },
  "memory": {
    "mem0": {
      "baseUrl": "https://your-mem0-endpoint.example",
      "protocol": "mem0-v2",
      "envKey": "MEM0_API_KEY"
    }
  }
}
```

这种单文件配置无需在 shell 中导出环境变量。JSON 中的凭证是明文存储的：将它们保留在用户设置中，不要提交到代码仓库，也不要在报告中分享该文件。或者，省略顶层 `env` 字段，在启动 shell 或 `~/.qwen/.env` 中设置该密钥。非空的进程环境变量优先级高于 `.env` 中的值，后者优先级高于 `settings.env`。

使用端点原始地址，可选择加上反向代理前缀；不要附加 `/v2/memories/search` 或其他操作路径。根据服务实际实现的协议进行选择：

- `mem0-v2`（默认）：PolarDB 风格的 `Authorization: Token`，使用 `limit` 的 V2 搜索，V1 写入。
- `mem0-v3`：Mem0 Platform V3，`Authorization: Token`，V3 搜索/添加。
- `mem0-oss-2026-08`：固定的 OSS REST 协议，`X-API-Key`，`/search` 和 `/memories`。

这些是完整的协议，不是通用的版本兼容层。未知的版本和不同的请求/响应格式需要经验证的适配器，而不是简单重命名 URL。历史预设 ID 仍然被接受；`aliyun-polardb-mysql-2026-08` 保留其历史的 `top_k` 搜索字段和原始搜索内容。

受信任的 PolarDB 地址（如 `http://your-endpoint:8080`）还需要 `"allowInsecureHttp": true`。纯 HTTP 会以明文方式发送凭证。此设置不会使私有端点变得可达，也不会绕过 IP 白名单。

Qwen 会自动注册 `external-context` 并发现 `context_search`。让 Qwen 搜索外部记忆；不会在每轮自动召回或发送任何内容。operator 设置、会话配置或 `--mcp-config` 中的同名服务器会产生冲突；切换到内置路径时请移除该手动配置。工作区设置和项目 `.mcp.json` 中的同名条目会被覆盖。现有的 MCP 优先级也会遮蔽同名扩展服务器，因此使用内置路径时请禁用高级 external-context 扩展。同时移除其旧的手动写入确认 Hook 以避免重复确认；具有相同匹配器的用户 Hook 不会替代内置确认。

## 作用域与写入

默认的用户/仓库作用域在重启后仍然保留，从 Git 子目录启动时同样有效。移动仓库或使用其他 checkout 会改变作用域，包括临时的 `--worktree` 和 agent 隔离 worktree。要在 worktree 之间复用已知作用域，为 V2/OSS 设置 `scope.userId`，或为 V3 设置 `scope.appId`；可选的 `scope.agentId` 仅适用于 V2/OSS。作用域标识符不是服务端的访问控制。

搜索默认是只读的。要启用保存功能，在 `memory.mem0` 中添加 `"enableWrites": true`，重启交互式 CLI，并让 Qwen 保存特定内容。自动安装的 Hook 会要求你确认具体内容，即使在 YOLO 模式下也是如此。拒绝则不会发送写入请求。写入使用 `infer: false`。

PolarDB 可以为这些直接导入返回以 JSON 编码的单用户消息数组。当结果标记为 `infer: false` 时，`mem0-v2` 会恢复该消息的原始文本；历史的 `aliyun-polardb-mysql-2026-08` 预设、普通文本和其他协议保持不变。

非交互式/ACP 会话以及禁用了 Hook 的会话仅保留搜索功能。裸模式/安全模式、不受信任/临时文件夹和 SSH 工作区不会激活此本地绑定。工作区设置无法配置该绑定。

`stored` 表示返回了有效的同步 ID。`accepted` 表示异步请求已被接受，并不代表持久化已完成。`failed` 表示明确的拒绝：在重试之前先修复报告的原因。`unknown` 表示写入可能已发生：不要自动重试。

## 选项与故障排除

`envKey` 默认为 `MEM0_API_KEY`；可用它引用另一个凭证变量，并通过上述任何来源定义该值。历史的 `credentialEnv` 字段仍然是兼容的别名。如果两个字段都设置了，它们的名称必须匹配；名称冲突会产生错误，而不是静默选择凭证。`timeoutMs` 默认为 5000，取值范围为 1 到 30000。

检查 MCP 连接状态以排查凭证缺失和服务商错误。超时需要检查端点路由、源 IP 白名单和服务可用性。401/403 需要检查凭证和所选协议。不要将凭证粘贴到日志或 issue 报告中。

对于源码 checkout，构建并打包一次，确保 `dist/mem0/main.js` 和 `dist/mem0/write-confirmation.js` 存在。已安装的主包包含这两个文件。此功能需要包含该改动的主 CLI 版本；无需发布独立的 Mem0 包。