# Zed 编辑器

> Zed 编辑器通过 Agent 客户端协议（ACP）为 AI 编程助手提供原生支持。该集成允许你在 Zed 界面中直接使用 Qwen Code，并获得实时代码建议。

![Zed 编辑器概览](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### 特性

- **原生 Agent 体验**：Zed 界面内集成的 AI 助手面板
- **Agent 客户端协议**：完整支持 ACP，可实现高级 IDE 交互
- **文件管理**：通过 @-提及文件将其添加至对话上下文
- **对话历史**：在 Zed 中访问历史对话

### 系统要求

- Zed 编辑器（建议使用最新版本）
- 已安装 Qwen Code CLI

### 安装

#### 从 ACP 注册中心安装（推荐）

1. 安装 Qwen Code CLI：

```bash
npm install -g @qwen-code/qwen-code
```

2. 下载并安装 [Zed 编辑器](https://zed.dev/)

3. 在 Zed 中，点击右上角的 **设置按钮**，选择 **"Add agent"（添加 Agent）**，然后选择 **"Install from Registry"（从注册中心安装）**，找到 **Qwen Code**，点击 **Install（安装）**。

   ![ACP 注册中心](https://img.alicdn.com/imgextra/i4/O1CN0186ybL61EeG35fHFjy_!!6000000000376-2-tps-3056-1705.png)

   ![Qwen Code ACP 已安装](https://img.alicdn.com/imgextra/i1/O1CN01OXHhoR1J8irAvjs8F_!!6000000000984-2-tps-1247-703.png)

#### 手动安装

1. 安装 Qwen Code CLI：

```bash
npm install -g @qwen-code/qwen-code
```

2. 下载并安装 [Zed 编辑器](https://zed.dev/)

3. 在 Zed 中，点击右上角的 **设置按钮**，选择 **"Add agent"（添加 Agent）**，然后选择 **"Create a custom agent"（创建自定义 Agent）**，并添加以下配置：

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--acp"],
  "env": {}
}
```

![Qwen Code 集成](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## 故障排除

### Agent 未显示

- 在终端中运行 `qwen --version` 以验证安装
- 检查 JSON 配置是否有效
- 重启 Zed 编辑器

### Qwen Code 无响应

- 检查你的网络连接
- 在终端中运行 `qwen` 以确认 CLI 正常工作
- 如果问题持续存在，[请在 GitHub 上提交 issue](https://github.com/qwenlm/qwen-code/issues)