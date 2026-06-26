# JetBrains IDE

> JetBrains IDE 通过 Agent Client Protocol (ACP) 原生支持 AI 编码助手。此集成让你可以直接在 JetBrains IDE 中使用 Qwen Code，并获得实时代码建议。

### 特性

- **原生 Agent 体验**：在 JetBrains IDE 中集成的 AI 助手面板
- **Agent Client Protocol**：完全支持 ACP，实现高级 IDE 交互
- **符号管理**：使用 #-mention 文件将其添加到对话上下文中
- **对话历史**：在 IDE 中访问历史对话

### 要求

- 支持 ACP 的 JetBrains IDE（IntelliJ IDEA、WebStorm、PyCharm 等）
- 已安装 Qwen Code CLI

### 安装

#### 从 ACP 注册表安装（推荐）

1. 安装 Qwen Code CLI：

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. 打开你的 JetBrains IDE，导航至 AI Chat 工具窗口。

3. 点击 **Add ACP Agent**，然后点击 **Install**。

   ![Install](https://img.alicdn.com/imgextra/i4/O1CN01qNdPCW1y8AcqxRgCy_!!6000000006533-2-tps-2490-1788.png)

   对于使用 JetBrains AI Assistant 和/或其他 ACP Agent 的用户，请在 Agent 列表中点击 **Install From ACP Registry**，然后安装 Qwen Code ACP。

   ![Add from Agents List](https://img.alicdn.com/imgextra/i2/O1CN01ZyOugP26BOKzNgZXx_!!6000000007623-2-tps-479-523.png)

4. Qwen Code Agent 现在应该出现在 AI Assistant 面板中。

   ![Qwen Code in JetBrains AI Chat](https://img.alicdn.com/imgextra/i4/O1CN013kAVE41XVzbIZOxyv_!!6000000002930-2-tps-3188-2170.png)

#### 手动安装（适用于较旧版本的 JetBrains IDE）

1. 安装 Qwen Code CLI：

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. 打开你的 JetBrains IDE，导航至 AI Chat 工具窗口。

3. 点击右上角的三个点菜单，选择 **Configure ACP Agent**，然后使用以下设置配置 Qwen Code：

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

4. Qwen Code Agent 现在应该出现在 AI Assistant 面板中。

![Qwen Code in JetBrains AI Chat](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## 故障排除

### Agent 没有出现

- 在终端中运行 `qwen --version` 验证安装
- 确保你的 JetBrains IDE 版本支持 ACP
- 重启你的 JetBrains IDE

### Qwen Code 没有响应

- 检查你的网络连接
- 在终端中运行 `qwen` 验证 CLI 是否正常工作
- 如果问题仍然存在，[在 GitHub 上提交 Issue](https://github.com/qwenlm/qwen-code/issues)