# Zed 编辑器

> Zed 编辑器通过 Agent Control Protocol (ACP) 原生支持 AI 编程助手。此集成允许你直接在 Zed 界面中使用 Qwen Code，并获得实时代码建议。

![Zed 编辑器概览](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### 功能特性

- **原生智能体体验**：Zed 界面内集成的 AI 助手面板  
- **Agent Control Protocol**：全面支持 ACP，实现高级 IDE 交互功能  
- **文件管理**：通过 @ 提及文件将其添加到对话上下文中  
- **对话历史记录**：可在 Zed 中访问过往对话内容  

### 环境要求

- Zed 编辑器（推荐最新版本）  
- 已安装 Qwen Code CLI

### 安装

1. 安装 Qwen Code CLI：

   ```bash
   npm install -g qwen-code
   ```

2. 下载并安装 [Zed Editor](https://zed.dev/)

3. 在 Zed 中，点击右上角的 **设置按钮**，选择 **"Add agent"**，选择 **"Create a custom agent"**，并添加以下配置：

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--experimental-acp"],
  "env": {}
}
```

![Qwen Code 集成](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## 故障排除

### Agent 未显示

- 在终端中运行 `qwen --version` 以验证安装
- 检查 JSON 配置是否有效
- 重启 Zed Editor

### Qwen Code 无响应

- 检查网络连接
- 通过在终端中运行 `qwen` 来验证 CLI 是否正常工作
- 如果问题仍然存在，请[在 GitHub 上提交 issue](https://github.com/qwenlm/qwen-code/issues)