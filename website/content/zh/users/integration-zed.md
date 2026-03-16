# Zed 编辑器

> Zed 编辑器通过代理客户端协议（ACP）原生支持 AI 编程助手。该集成使你能够在 Zed 界面内直接使用 Qwen Code，并获得实时代码建议。

![Zed 编辑器概览](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### 功能特性

- **原生代理体验**：在 Zed 界面中集成 AI 助手面板  
- **代理客户端协议（ACP）**：完整支持 ACP，实现高级 IDE 交互能力  
- **文件管理**：使用 `@` 提及文件，将其添加到对话上下文中  
- **对话历史记录**：可在 Zed 内访问过往对话  

### 前置要求

- Zed 编辑器（建议使用最新版本）  
- 已安装 Qwen Code CLI  

### 安装

#### 从 ACP 仓库安装（推荐）

1. 安装 Qwen Code CLI：

```bash
npm install -g @qwen-code/qwen-code
```

2. 下载并安装 [Zed 编辑器](https://zed.dev/)

3. 在 Zed 中，点击右上角的 **设置按钮**，选择 **“添加智能体”**，然后选择 **“从仓库安装”**，找到 **Qwen Code**，点击 **安装**。

   ![ACP 仓库](https://img.alicdn.com/imgextra/i4/O1CN0186ybL61EeG35fHFjy_!!6000000000376-2-tps-3056-1705.png)

   ![Qwen Code ACP 已安装](https://img.alicdn.com/imgextra/i1/O1CN01OXHhoR1J8irAvjs8F_!!6000000000984-2-tps-1247-703.png)

#### 手动安装

1. 安装 Qwen Code CLI：

```bash
npm install -g @qwen-code/qwen-code
```

2. 下载并安装 [Zed 编辑器](https://zed.dev/)

3. 在 Zed 中，点击右上角的**设置按钮**，选择 **“添加代理（Add agent）”**，然后选择 **“创建自定义代理（Create a custom agent）”**，并添加以下配置：

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

### 代理未显示

- 在终端中运行 `qwen --version`，验证是否安装成功  
- 检查 JSON 配置格式是否有效  
- 重启 Zed 编辑器  

### Qwen Code 无响应

- 检查网络连接  
- 在终端中运行 `qwen` 命令，确认 CLI 可正常工作  
- 若问题持续存在，[请在 GitHub 上提交 Issue](https://github.com/qwenlm/qwen-code/issues)