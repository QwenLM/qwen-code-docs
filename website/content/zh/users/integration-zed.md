# Zed Editor

> Zed Editor 通过 Agent Client Protocol (ACP) 为 AI 编程助手提供原生支持。该集成允许你直接在 Zed 界面中使用 Qwen Code，并获取实时代码建议。

![Zed Editor Overview](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### 功能特性

- **原生 Agent 体验**：在 Zed 界面内集成的 AI 助手面板
- **Agent Client Protocol**：完整支持 ACP，实现高级 IDE 交互
- **文件管理**：通过 @ 提及文件将其添加到对话上下文中
- **对话历史**：在 Zed 中访问历史对话记录

### 环境要求

- Zed Editor（推荐使用最新版本）
- 已安装 Qwen Code CLI

### 安装

#### 通过 ACP Registry 安装（推荐）

1. 安装 Qwen Code CLI：

```bash
npm install -g @qwen-code/qwen-code
```

2. 下载并安装 [Zed Editor](https://zed.dev/)

3. 在 Zed 中，点击右上角的 **设置按钮**，选择 **“添加 Agent”**，选择 **“从注册表安装”**，找到 **Qwen Code**，然后点击 **安装**。

   ![ACP Registry](https://img.alicdn.com/imgextra/i4/O1CN0186ybL61EeG35fHFjy_!!6000000000376-2-tps-3056-1705.png)

   ![Qwen Code ACP Installed](https://img.alicdn.com/imgextra/i1/O1CN01OXHhoR1J8irAvjs8F_!!6000000000984-2-tps-1247-703.png)

#### 手动安装

1. 安装 Qwen Code CLI：

```bash
npm install -g @qwen-code/qwen-code
```

2. 下载并安装 [Zed Editor](https://zed.dev/)

3. 在 Zed 中，点击右上角的 **设置按钮**，选择 **“添加 Agent”**，选择 **“创建自定义 Agent”**，并添加以下配置：

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--acp"],
  "env": {}
}
```

![Qwen Code Integration](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## 故障排查

### Agent 未显示

- 在终端中运行 `qwen --version` 验证安装是否成功
- 检查 JSON 配置是否有效
- 重启 Zed Editor

### Qwen Code 无响应

- 检查网络连接
- 在终端中运行 `qwen` 验证 CLI 是否正常工作
- 如果问题仍然存在，请 [在 GitHub 上提交 Issue](https://github.com/qwenlm/qwen-code/issues)