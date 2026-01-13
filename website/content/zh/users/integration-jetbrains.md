# JetBrains IDE

> JetBrains IDE 通过 Agent Control Protocol (ACP) 为 AI 编程助手提供原生支持。此集成允许你在 JetBrains IDE 中直接使用 Qwen Code，获得实时代码建议。

### 功能特性

- **原生代理体验**：在你的 JetBrains IDE 内集成的 AI 助手面板
- **Agent Control Protocol**：完全支持 ACP，实现高级 IDE 交互
- **符号管理**：使用 #-提及文件将它们添加到对话上下文中
- **对话历史**：在 IDE 内访问过去的对话记录

### 系统要求

- 支持 ACP 的 JetBrains IDE（IntelliJ IDEA、WebStorm、PyCharm 等）
- 已安装 Qwen Code CLI

### 安装

1. 安装 Qwen Code CLI：

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. 打开你的 JetBrains IDE 并导航到 AI Chat 工具窗口。

3. 点击右上角的三点菜单并选择 **Configure ACP Agent**，然后使用以下设置配置 Qwen Code：

```json
{
  "agent_servers": {
    "qwen": {
      "command": "/path/to/qwen",
      "args": ["--acp"],
      "env": {}
    }
  }
}
```

4. Qwen Code 代理现在应该在 AI Assistant 面板中可用

![JetBrains AI Chat 中的 Qwen Code](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## 故障排除

### 代理未出现

- 在终端中运行 `qwen --version` 以验证安装
- 确保你的 JetBrains IDE 版本支持 ACP
- 重启你的 JetBrains IDE

### Qwen Code 无响应

- 检查你的网络连接
- 通过在终端中运行 `qwen` 来验证 CLI 是否正常工作
- 如果问题仍然存在，请[在 GitHub 上提交问题](https://github.com/qwenlm/qwen-code/issues)